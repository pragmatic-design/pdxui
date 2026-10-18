// `@variants` and `@variant` (#153): a component's variants declared once, and the CSS keyed by them.
//
// In the script:
//     @variants {
//       variant: { primary, ghost, danger } = primary;
//       size: { sm, md, lg } = md;
//     }
// Each axis becomes a prop typed with its values (`variant: 'primary' | 'ghost' | 'danger'`) and
// reflected on the host as an attribute (`variant="ghost"`). In a `<style scoped>`:
//     @variant variant(ghost) and size(sm) { [data-part="root"] { padding-inline: 0; } }
// is rewritten, before scoping, into rules on those attributes — `:scope[variant="ghost"][size="sm"]
// [data-part="root"]` — which the scoping then compiles for the target: inside the donut scope under
// baseline-2026, `[data-pdx-H][variant="ghost"]…` under baseline-2024.

import type { HostAttr, PropInfo } from './script-analyzer-types';

/** One axis of `@variants`: its name, its values in order, and the default (always one of them). */
export interface VariantAxis {
    name: string;
    values: string[];
    default: string;
}

/** One `@variant` test, `axis(value)`, with where it was written in the CSS it was read from. */
export interface VariantTest {
    axis: string;
    value: string;
    /** Offset of the test in the CSS. */
    at: number;
}

/** What a `@variants { … }` block declares, and what in it could not be read. */
export interface VariantsBlock {
    axes: VariantAxis[];
    errors: string[];
}

// Match: one axis, `name: { a, b, c } = default;` (the default and the `;` optional).
// Groups: [1]=name [2]=the values [3]=default
const AXIS = /(\w+)\s*:\s*\{([^{}]*)\}\s*(?:=\s*(\w+))?\s*;?/g;

/**
 * The axes a `@variants { … }` block declares. The text is the block from `@variants` to its closing
 * brace. An axis without a default takes its first value; a default that is not one of the values, an
 * axis without values and an axis declared twice are reported, and the axis is skipped.
 */
export function parseVariantsBlock(text: string): VariantsBlock {
    const open = text.indexOf('{');
    const close = text.lastIndexOf('}');
    const inner = open >= 0 && close > open ? text.slice(open + 1, close) : '';
    const axes: VariantAxis[] = [];
    const errors: string[] = [];
    let rest = inner;
    for (const m of inner.matchAll(AXIS)) {
        rest = rest.replace(m[0], '');
        const [, name, list, written] = m;
        const values = list.split(',').map((v) => v.trim()).filter(Boolean);
        if (values.length === 0) { errors.push(`the axis '${name}' declares no value`); continue; }
        const bad = values.find((v) => !/^[\w-]+$/.test(v));
        if (bad) { errors.push(`'${bad}' in the axis '${name}' is not a value: a value is a word`); continue; }
        if (axes.some((a) => a.name === name)) { errors.push(`the axis '${name}' is declared twice`); continue; }
        if (written !== undefined && !values.includes(written)) {
            errors.push(`the default of '${name}', '${written}', is not one of its values (${values.join(', ')})`);
            continue;
        }
        axes.push({ name, values, default: written ?? values[0] });
    }
    if (rest.trim()) errors.push(`'${rest.trim().split('\n')[0].trim()}' is not an axis`);
    return { axes, errors };
}

/** The props the axes generate: one per axis, typed with its values, defaulting to its default. */
export function variantProps(axes: VariantAxis[]): PropInfo[] {
    return axes.map((a) => ({
        name: a.name,
        tsType: a.values.map((v) => `'${v}'`).join(' | '),
        runtimeType: 'String',
        default: `'${a.default}'`,
    }));
}

/** The host attributes that reflect the axes: `:variant="variant"`, written as `@host` would. */
export function variantHostAttrs(axes: VariantAxis[]): HostAttr[] {
    return axes.map((a) => ({ name: `:${a.name}`, value: a.name }));
}

/** Where a block that starts at `open` (a `{`) closes. */
function blockEnd(css: string, open: number): number {
    let depth = 0;
    for (let i = open; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) return i;
    }
    return css.length - 1;
}

// Match: one test of a `@variant` prelude. Groups: [1]=axis [2]=value
const TEST = /(\w+)\s*\(\s*([\w-]+)\s*\)/g;

/** The selectors of a list, split at its top-level commas. */
function splitList(list: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (c === ',' && depth === 0) { parts.push(list.slice(start, i)); start = i + 1; }
    }
    parts.push(list.slice(start));
    return parts.map((s) => s.trim()).filter(Boolean);
}

/** One selector under the variant's host test: `S` → `HOST S`, `:scope…` → `HOST…`. */
function underHost(sel: string, host: string): string {
    // Match: a leading `:scope` that is the whole compound's start. Groups: none
    if (/^:scope(?![\w-])/.test(sel)) return host + sel.slice(':scope'.length);
    return `${host} ${sel}`;
}

/** The rules of a `@variant` body, each selector put under the host test. */
function rewriteBody(body: string, host: string): string {
    let out = '';
    let pos = 0;
    while (pos < body.length) {
        const open = body.indexOf('{', pos);
        if (open === -1) { out += body.slice(pos); break; }
        const end = blockEnd(body, open);
        const prelude = body.slice(pos, open);
        const lead = prelude.match(/^\s*/)?.[0] ?? '';
        const head = prelude.trim();
        if (head.startsWith('@')) {
            // An at-rule inside a variant (`@media`): its rules go under the host test too.
            out += `${lead}${head} {${rewriteBody(body.slice(open + 1, end), host)}}`;
        } else {
            out += `${lead}${splitList(head).map((s) => underHost(s, host)).join(', ')} {${body.slice(open + 1, end)}}`;
        }
        pos = end + 1;
    }
    return out;
}

/**
 * The CSS with every `@variant tests { rules }` rewritten into its rules under the host's attributes.
 * `hostOf` builds the host test from the attribute selectors: `:scope[variant="ghost"]` in a scoped
 * block, `:host([variant="ghost"])` under shadow. `@variant` is found at the top level and inside
 * `@media`, `@supports`, `@layer`, `@container`; elsewhere it is copied as written.
 */
export function expandVariantRules(css: string, hostOf: (attrs: string) => string = (attrs) => `:scope${attrs}`): string {
    if (!css.includes('@variant')) return css;
    let out = '';
    let pos = 0;
    while (pos < css.length) {
        const open = css.indexOf('{', pos);
        if (open === -1) { out += css.slice(pos); break; }
        const end = blockEnd(css, open);
        const prelude = css.slice(pos, open);
        const head = prelude.trim();
        const lead = prelude.slice(0, prelude.length - prelude.trimStart().length);
        // Match: `@variant` followed by its tests. Groups: [1]=the tests
        const variant = /^@variant\s+(.+)$/s.exec(head);
        if (variant) {
            const attrs = [...variant[1].matchAll(TEST)].map((t) => `[${t[1]}="${t[2]}"]`).join('');
            out += lead + rewriteBody(css.slice(open + 1, end), hostOf(attrs)).trim();
        } else if (/^@(media|supports|layer|container)\b/i.test(head)) {
            out += `${prelude}{${expandVariantRules(css.slice(open + 1, end), hostOf)}}`;
        } else {
            out += css.slice(pos, end + 1);
        }
        pos = end + 1;
    }
    return out;
}

/** Every test of every `@variant` prelude in the CSS, in order, with its offset. Comments ignored. */
export function variantTests(css: string): VariantTest[] {
    const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    const tests: VariantTest[] = [];
    // Match: a `@variant` prelude up to its `{`. Groups: [1]=the tests
    for (const m of text.matchAll(/@variant\s+([^{};]+)\{/g)) {
        const base = m.index + m[0].indexOf(m[1]);
        for (const t of m[1].matchAll(TEST)) tests.push({ axis: t[1], value: t[2], at: base + t.index });
    }
    return tests;
}
