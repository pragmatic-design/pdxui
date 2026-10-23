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
// baseline-2026, `[data-pdx-H][variant="ghost"]…` under baseline-2024. Several values of one axis,
// `variant(ghost, danger)`, test any of them: `:is([variant="ghost"],[variant="danger"])`.

import type { HostAttr, PropInfo } from './script-analyzer-types';
import { attributeTest, expandVariantBlocks, testValues, VARIANT_TEST } from './variant-css';

/** One axis of `@variants`: its name, its values in order, and the default (always one of them). */
export interface VariantAxis {
    name: string;
    values: string[];
    default: string;
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
