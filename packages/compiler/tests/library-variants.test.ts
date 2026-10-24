// `@variant` in the library's stylesheets (#512, specified by #626): the selector a rule compiles to,
// bounded at nested components, and the native selector it also yields where its axis maps one.

import { describe, it, expect } from 'vitest';
import { expandLibraryVariants, libraryVariantTests, type LibraryAxis } from '../src/compiler/variant-css';

const BUTTON: LibraryAxis[] = [
    { name: 'variant', values: ['primary', 'solid', 'ghost'], default: 'primary', native: { primary: '.pdx-primary', solid: '.pdx-primary', ghost: '.pdx-ghost' } },
    { name: 'size', values: ['md', 'sm', 'lg'], default: 'md' },
];
const axesOf = (tag: string): LibraryAxis[] | undefined => (tag === 'pdx-button' ? BUTTON : undefined);

describe('a rule in a component\'s own stylesheet', () => {
    it('is the host test, bounded at nested components, and the native selector of a mapped value', () => {
        expect(expandLibraryVariants('@variant variant(ghost) { [data-part="root"] { color: red; } }', 'pdx-button', axesOf)).toBe(
            ':where(pdx-button[variant="ghost"]) [data-part="root"]:not(:where(pdx-button[variant="ghost"] [data-pdx-root] [data-part="root"])), '
            + '.pdx-ghost { color: red; }');
    });

    it('values that share a native selector share the rule: the host test names them all', () => {
        expect(expandLibraryVariants('@variant variant(primary) { [data-part="root"]:hover { color: red; } }', 'pdx-button', axesOf)).toBe(
            ':where(pdx-button:is([variant="primary"],[variant="solid"])) [data-part="root"]:hover'
            + ':not(:where(pdx-button:is([variant="primary"],[variant="solid"]) [data-pdx-root] [data-part="root"]:hover)), '
            + '.pdx-primary:hover { color: red; }');
    });

    it('an axis with no native selectors yields the host selector alone', () => {
        expect(expandLibraryVariants('@variant size(sm) { [data-part="root"] { padding: 0; } }', 'pdx-button', axesOf)).toBe(
            ':where(pdx-button[size="sm"]) [data-part="root"]:not(:where(pdx-button[size="sm"] [data-pdx-root] [data-part="root"])) { padding: 0; }');
    });

    it('`and` tests both axes, and the native form needs every value mapped', () => {
        expect(expandLibraryVariants('@variant variant(ghost) and size(sm) { [data-part="root"] { padding: 0; } }', 'pdx-button', axesOf)).toBe(
            ':where(pdx-button[variant="ghost"][size="sm"]) [data-part="root"]'
            + ':not(:where(pdx-button[variant="ghost"][size="sm"] [data-pdx-root] [data-part="root"])) { padding: 0; }');
    });

    it('several values test any of them, and their native selectors are one :is()', () => {
        expect(expandLibraryVariants('@variant variant(solid, ghost) { [data-part="root"]:hover { color: red; } }', 'pdx-button', axesOf)).toBe(
            ':where(pdx-button:is([variant="primary"],[variant="solid"],[variant="ghost"])) [data-part="root"]:hover'
            + ':not(:where(pdx-button:is([variant="primary"],[variant="solid"],[variant="ghost"]) [data-pdx-root] [data-part="root"]:hover)), '
            + ':is(.pdx-primary,.pdx-ghost):hover { color: red; }');
    });

    it('several values with one that has no native selector yield the host selector alone', () => {
        expect(expandLibraryVariants('@variant size(sm, lg) { :scope { margin: 0; } }', 'pdx-button', axesOf)).toBe(
            ':where(pdx-button:is([size="sm"],[size="lg"])) { margin: 0; }');
    });

    it('a selector that names another part has no native form', () => {
        expect(expandLibraryVariants('@variant variant(ghost) { [data-part="icon"] { opacity: 1; } }', 'pdx-button', axesOf)).toBe(
            ':where(pdx-button[variant="ghost"]) [data-part="icon"]:not(:where(pdx-button[variant="ghost"] [data-pdx-root] [data-part="icon"])) { opacity: 1; }');
    });

    it('`:scope` is the host itself', () => {
        expect(expandLibraryVariants('@variant size(lg) { :scope, :scope:hover { display: block; } }', 'pdx-button', axesOf)).toBe(
            ':where(pdx-button[size="lg"]), :where(pdx-button[size="lg"]):hover { display: block; }');
    });

    it('a child of the host, `:scope > S`, needs no bound, and its root part yields the native selector', () => {
        expect(expandLibraryVariants('@variant variant(ghost) { :scope > button[data-part="root"]:hover { color: red; } }', 'pdx-button', axesOf)).toBe(
            ':where(pdx-button[variant="ghost"]) > button[data-part="root"]:hover, button.pdx-ghost:hover { color: red; }');
        expect(expandLibraryVariants('@variant size(sm) { :scope > [data-part="root"] { padding: 0; } }', 'pdx-button', axesOf), 'no native selector: the host form alone')
            .toBe(':where(pdx-button[size="sm"]) > [data-part="root"] { padding: 0; }');
    });

    it('a context before the host stays before it, in both forms', () => {
        expect(expandLibraryVariants('@variant pdx-button variant(ghost) { .pdx-toolbar :scope > button[data-part="root"]:hover { color: red; } }', undefined, axesOf)).toBe(
            '.pdx-toolbar :where(pdx-button[variant="ghost"]) > button[data-part="root"]:hover, .pdx-toolbar button.pdx-ghost:hover { color: red; }');
    });

    it('a pseudo-element stays last, after the bound', () => {
        expect(expandLibraryVariants('@variant variant(ghost) { [data-part="root"]::before { content: ""; } }', 'pdx-button', axesOf)).toBe(
            ':where(pdx-button[variant="ghost"]) [data-part="root"]:not(:where(pdx-button[variant="ghost"] [data-pdx-root] [data-part="root"]))::before, '
            + '.pdx-ghost::before { content: ""; }');
    });

    it('inside @media and inside @pdx-theme', () => {
        expect(expandLibraryVariants('@pdx-theme material { @media (hover) { @variant pdx-button size(sm) { :scope { margin: 0 } } } }', undefined, axesOf))
            .toBe('@pdx-theme material { @media (hover) { :where(pdx-button[size="sm"]) { margin: 0 } } }');
    });

    it('a comment before an @variant does not hide it', () => {
        expect(expandLibraryVariants('/* Sizes: @variant size(…) */\n@variant size(lg) { :scope { display: block; } }', 'pdx-button', axesOf))
            .toBe('/* Sizes: @variant size(…) */\n:where(pdx-button[size="lg"]) { display: block; }');
    });

    it('a brace inside a comment is not a block', () => {
        expect(expandLibraryVariants('/* as .pdx-input-{size} */\n@variant size(lg) { /* } */ :scope { display: block; } }', 'pdx-button', axesOf))
            .toBe('/* as .pdx-input-{size} */\n/* } */ :where(pdx-button[size="lg"]) { display: block; }');
    });

    it('control — a stylesheet with no @variant is left exactly as it was', () => {
        const css = '.pdx-primary { color: red; } @media (hover) { .b { color: blue; } }';
        expect(expandLibraryVariants(css, 'pdx-button', axesOf)).toBe(css);
    });
});

describe('a rule outside the component\'s own stylesheet', () => {
    it('names its tag', () => {
        expect(expandLibraryVariants('@variant pdx-button variant(ghost) { [data-part="root"] { color: red; } }', undefined, axesOf)).toBe(
            ':where(pdx-button[variant="ghost"]) [data-part="root"]:not(:where(pdx-button[variant="ghost"] [data-pdx-root] [data-part="root"])), '
            + '.pdx-ghost { color: red; }');
    });
});

// Several components drawn by one rule (#627): `:is(pdx-a, pdx-b)` names the hosts.
describe('a rule that names several hosts', () => {
    const SIZE = (native?: Record<string, string>): LibraryAxis[] => [{ name: 'size', values: ['md', 'sm', 'lg'], default: 'md', ...(native ? { native } : {}) }];
    const fields = (tag: string): LibraryAxis[] | undefined =>
        tag === 'pdx-input' || tag === 'pdx-textarea' ? SIZE({ md: '.pdx-input-md', sm: '.pdx-input-sm', lg: '.pdx-input-lg' }) : tag === 'pdx-tag-input' ? SIZE() : undefined;

    it('is one selector under :is() of the hosts, and the native form the axis maps', () => {
        expect(expandLibraryVariants('@variant :is(pdx-input, pdx-textarea) size(sm) { :scope > [data-part="root"] { height: 1px; } }', undefined, fields)).toBe(
            ':where(:is(pdx-input,pdx-textarea)[size="sm"]) > [data-part="root"], .pdx-input-sm { height: 1px; }');
        expect(expandLibraryVariants('@variant :is(pdx-input, pdx-textarea) size(sm) { :scope > .pdx-input-wrap[data-part="root"] { height: 1px; } }', undefined, fields)).toBe(
            ':where(:is(pdx-input,pdx-textarea)[size="sm"]) > .pdx-input-wrap[data-part="root"], .pdx-input-wrap.pdx-input-sm { height: 1px; }');
    });

    it('a descendant is bounded at nested components under every host', () => {
        expect(expandLibraryVariants('@variant :is(pdx-input, pdx-textarea) size(lg) { .pdx-x { color: red; } }', undefined, fields)).toBe(
            ':where(:is(pdx-input,pdx-textarea)[size="lg"]) .pdx-x:not(:where(:is(pdx-input,pdx-textarea)[size="lg"] [data-pdx-root] .pdx-x)) { color: red; }');
    });

    it('has a native form only where every host maps the value alike', () => {
        expect(expandLibraryVariants('@variant :is(pdx-input, pdx-tag-input) size(sm) { :scope > [data-part="root"] { height: 1px; } }', undefined, fields)).toBe(
            ':where(:is(pdx-input,pdx-tag-input)[size="sm"]) > [data-part="root"] { height: 1px; }');
    });

    it('one host in :is() is that host', () => {
        expect(expandLibraryVariants('@variant :is(pdx-input) size(sm) { :scope { margin: 0; } }', undefined, fields)).toBe(
            ':where(pdx-input[size="sm"]) { margin: 0; }');
    });

    it('its tests are read once per host, for the manifest check of each', () => {
        const css = '@variant :is(pdx-input, pdx-tag-input) size(sm, lg) { :scope { margin: 0 } }';
        const tests = libraryVariantTests(css, 'pdx-button');
        expect(tests.map(({ tag, axis, value }) => `${tag} ${axis}(${value})`)).toEqual(
            ['pdx-input size(sm)', 'pdx-input size(lg)', 'pdx-tag-input size(sm)', 'pdx-tag-input size(lg)']);
        expect(css.slice(tests[2].at, tests[2].at + 'size('.length)).toBe('size(');
    });
});

describe('the tests of every rule, for the diagnostics', () => {
    it('reads the tag, written or implied, and each axis and value with its offset', () => {
        const css = '/* @variant pdx-x a(b) { */\n@variant pdx-button variant(ghost) and size(sm) { :scope { margin: 0 } }\n@variant size(lg) { :scope { margin: 0 } }';
        const tests = libraryVariantTests(css, undefined);
        expect(tests.map(({ tag, axis, value }) => ({ tag, axis, value }))).toEqual([
            { tag: 'pdx-button', axis: 'variant', value: 'ghost' },
            { tag: 'pdx-button', axis: 'size', value: 'sm' },
            { tag: undefined, axis: 'size', value: 'lg' },
        ]);
        expect(css.slice(tests[1].at, tests[1].at + 'size(sm)'.length)).toBe('size(sm)');
        expect(libraryVariantTests(css, 'pdx-button')[2].tag, 'the implied tag').toBe('pdx-button');
    });

    it('reads a list of values as one test per value, at the offset of their axis', () => {
        const css = '@variant pdx-button variant(ghost, solid) { :scope { margin: 0 } }';
        const tests = libraryVariantTests(css, undefined);
        expect(tests.map(({ axis, value }) => `${axis}(${value})`)).toEqual(['variant(ghost)', 'variant(solid)']);
        expect(css.slice(tests[1].at, tests[1].at + 'variant('.length)).toBe('variant(');
    });
});
