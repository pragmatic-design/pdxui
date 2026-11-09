// `@variants` and `@variant` (#153): a component's variants declared once, and the CSS keyed by them.
//
// In the script:
//     @variants {
//       variant: { primary, ghost, danger } = primary;
//       size: { sm, md, lg } = md;
//     }
// Each axis becomes a prop typed with its values (`variant: 'primary' | 'ghost' | 'danger'`) and
// reflected on the host as an attribute (`variant="ghost"`): the descriptor declares the axes under
// `variants`, as a TypeScript component does, and core does both (#986). A library component may map
// each value to its native selector, `size: { sm: '.pdx-input-sm', … }`. In a `<style scoped>`:
//     @variant variant(ghost) and size(sm) { [data-part="root"] { padding-inline: 0; } }
// is rewritten, before scoping, into rules on those attributes — `:scope[variant="ghost"][size="sm"]
// [data-part="root"]` — which the scoping then compiles for the target: inside the donut scope under
// baseline-2026, `[data-pdx-H][variant="ghost"]…` under baseline-2024. Several values of one axis,
// `variant(ghost, danger)`, test any of them: `:is([variant="ghost"],[variant="danger"])`.

import type { PropInfo } from './script-analyzer-types';
import { attributeTest, expandVariantBlocks, testValues, VARIANT_TEST } from './variant-css';

/**
 * One axis of `@variants`: its name, its values in order, and the default (always one of them). A
 * library component may map each value to the selector that draws the same look on native HTML
 * (#986), as the TypeScript descriptor's record form does: `size: { sm: '.pdx-input-sm', … }`.
 */
export interface VariantAxis {
    name: string;
    values: string[];
    default: string;
    native?: Record<string, string>;
}

/** One value of a `@variant` test, `axis(value)` or one of `axis(a, b)`, with where it was written. */
export interface VariantTest {
    axis: string;
    value: string;
    /** Offset of the test in the CSS — the same for every value of a list. */
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

// Match: one value of an axis, `sm`, or `sm: '.pdx-input-sm'` with its native selector, up to the `,`
// that ends it. A selector may hold commas, `:is(.a, .b)`, so the list is not split on them.
// Groups: [1]=the value [2]=the quote [3]=the selector
const VALUE = /\s*([^\s,:'"]+)\s*(?::\s*(['"])((?:(?!\2).)*)\2)?\s*(?:,|$)/gy;

/** The values of an axis as written, each with its selector when it names one; null when unreadable. */
function readValues(list: string): { value: string; native?: string }[] | null {
    const out: { value: string; native?: string }[] = [];
    VALUE.lastIndex = 0;
    const text = list.trim();
    while (VALUE.lastIndex < text.length) {
        const m = VALUE.exec(text);
        if (!m) return null;
        out.push(m[3] === undefined ? { value: m[1] } : { value: m[1], native: m[3] });
    }
    return out;
}

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
        const entries = readValues(list);
        if (entries === null) { errors.push(`the values of the axis '${name}' cannot be read: a value is a word, with its selector in quotes after a ':'`); continue; }
        const values = entries.map((e) => e.value);
        if (values.length === 0) { errors.push(`the axis '${name}' declares no value`); continue; }
        const bad = values.find((v) => !/^[\w-]+$/.test(v));
        if (bad) { errors.push(`'${bad}' in the axis '${name}' is not a value: a value is a word`); continue; }
        if (axes.some((a) => a.name === name)) { errors.push(`the axis '${name}' is declared twice`); continue; }
        if (written !== undefined && !values.includes(written)) {
            errors.push(`the default of '${name}', '${written}', is not one of its values (${values.join(', ')})`);
            continue;
        }
        // A record names every value's selector or none: the descriptor's record form has a selector
        // per value, and a value without one would have no native form to share with another.
        const named = entries.filter((e) => e.native !== undefined);
        if (named.length > 0 && named.length < entries.length) {
            const missing = entries.filter((e) => e.native === undefined).map((e) => e.value);
            errors.push(`in the axis '${name}', ${missing.join(', ')} ${missing.length === 1 ? 'names' : 'name'} no selector: either every value names one, or none does`);
            continue;
        }
        const native = named.length > 0 ? Object.fromEntries(entries.map((e) => [e.value, e.native!])) : undefined;
        axes.push({ name, values, default: written ?? values[0], ...(native ? { native } : {}) });
    }
    if (rest.trim()) errors.push(`'${rest.trim().split('\n')[0].trim()}' is not an axis`);
    return { axes, errors };
}

/**
 * The props the axes generate, for the types: one per axis, typed with its values, defaulting to its
 * default. Marked `variant`: the descriptor declares them under `variants`, not `props` (#986).
 */
export function variantProps(axes: VariantAxis[]): PropInfo[] {
    return axes.map((a) => ({
        name: a.name,
        tsType: a.values.map((v) => `'${v}'`).join(' | '),
        runtimeType: 'String',
        default: `'${a.default}'`,
        variant: true,
    }));
}

/**
 * The descriptor's `variants` (#986), the form a TypeScript component writes: per axis, its values as
 * a list, or as a record from each value to its native selector. Core makes each a String prop and
 * reflects it on the host under its kebab attribute (#834), with a value outside the axis reflected as
 * the default; it takes the first value as the default, so the default is written first.
 */
export function variantsDescriptor(axes: VariantAxis[]): string {
    const entries = axes.map((a) => {
        const values = [a.default, ...a.values.filter((v) => v !== a.default)];
        const key = /^[A-Za-z_$][\w$]*$/.test(a.name) ? a.name : JSON.stringify(a.name);
        if (!a.native) return `${key}: [${values.map((v) => JSON.stringify(v)).join(', ')}]`;
        return `${key}: { ${values.map((v) => `${JSON.stringify(v)}: ${JSON.stringify(a.native![v])}`).join(', ')} }`;
    });
    return `{ ${entries.join(', ')} }`;
}

/** One selector under the variant's host test: `S` → `HOST S`, `:scope…` → `HOST…`. */
function underHost(sel: string, host: string): string {
    // Match: a leading `:scope` that is the whole compound's start. Groups: none
    if (/^:scope(?![\w-])/.test(sel)) return host + sel.slice(':scope'.length);
    return `${host} ${sel}`;
}

/**
 * The CSS with every `@variant tests { rules }` rewritten into its rules under the host's attributes.
 * `hostOf` builds the host test from the attribute selectors: `:scope[variant="ghost"]` in a scoped
 * block, `:host([variant="ghost"])` under shadow. Where `@variant` is found is `expandVariantBlocks`'s.
 */
export function expandVariantRules(css: string, hostOf: (attrs: string) => string = (attrs) => `:scope${attrs}`): string {
    return expandVariantBlocks(css, (tests, sel) =>
        underHost(sel, hostOf([...tests.matchAll(VARIANT_TEST)].map((t) => attributeTest(t[1], testValues(t[2]))).join(''))));
}

/** Every test of every `@variant` prelude in the CSS, in order, with its offset. Comments ignored. */
export function variantTests(css: string): VariantTest[] {
    const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    const tests: VariantTest[] = [];
    // Match: a `@variant` prelude up to its `{`. Groups: [1]=the tests
    for (const m of text.matchAll(/@variant\s+([^{};]+)\{/g)) {
        const base = m.index + m[0].indexOf(m[1]);
        for (const t of m[1].matchAll(VARIANT_TEST)) for (const value of testValues(t[2])) tests.push({ axis: t[1], value, at: base + t.index });
    }
    return tests;
}
