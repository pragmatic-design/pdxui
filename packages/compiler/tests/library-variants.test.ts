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

    it('a selector that names another part has no native form', () => {
        expect(expandLibraryVariants('@variant variant(ghost) { [data-part="icon"] { opacity: 1; } }', 'pdx-button', axesOf)).toBe(
            ':where(pdx-button[variant="ghost"]) [data-part="icon"]:not(:where(pdx-button[variant="ghost"] [data-pdx-root] [data-part="icon"])) { opacity: 1; }');
    });

    it('`:scope` is the host itself', () => {
        expect(expandLibraryVariants('@variant size(lg) { :scope, :scope:hover { display: block; } }', 'pdx-button', axesOf)).toBe(
            ':where(pdx-button[size="lg"]), :where(pdx-button[size="lg"]):hover { display: block; }');
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
});
