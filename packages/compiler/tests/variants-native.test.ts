// `@variants` values with their native selector, and a library component's values styled by
// @pdxui/design (#986).
//
// A library component is drawn by the design package: `pdx-select`'s sizes are `@variant` rules in
// variant-sources, not in its `<style scoped>`. The TypeScript descriptor maps each value to the class
// that draws it on a native field, `size: { sm: '.pdx-input-sm', … }`; a `.pdx` now writes the same,
// and its descriptor declares the axes under `variants`, as the TypeScript one does.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '../src/plugin';
import { parseVariantsBlock } from '../src/compiler/variants';

const UI = join(__dirname, '..', '..', 'ui');
const SIZES = "@variants { size: { md: '.pdx-input-md', xs: '.pdx-input-xs', sm: '.pdx-input-sm', lg: '.pdx-input-lg', xl: '.pdx-input-xl' } = md; }";
const page = (script: string) => `<template><div data-part="root"></div></template>\n<script>\n${script}\n@part root;\n</script>\n`;
const unstyled = (src: string, prefix?: string) =>
    compile(src, 'select.pdx', undefined, undefined, prefix ? { prefix } : undefined).warnings.filter((w) => w.code === 'PDX_VARIANT_UNSTYLED');

describe('an axis whose values name their native selector', () => {
    it('reads each value and its selector, as the descriptor\'s record form', () => {
        expect(parseVariantsBlock(SIZES)).toEqual({
            axes: [{
                name: 'size', values: ['md', 'xs', 'sm', 'lg', 'xl'], default: 'md',
                native: { md: '.pdx-input-md', xs: '.pdx-input-xs', sm: '.pdx-input-sm', lg: '.pdx-input-lg', xl: '.pdx-input-xl' },
            }],
            errors: [],
        });
    });

    it('a selector may hold a comma', () => {
        expect(parseVariantsBlock("@variants { tone: { calm: ':is(.a, .b)', loud: '.c' }; }").axes[0].native).toEqual({ calm: ':is(.a, .b)', loud: '.c' });
    });

    it('every value names one, or none does', () => {
        expect(parseVariantsBlock("@variants { size: { md: '.pdx-input-md', sm } = md; }").errors)
            .toEqual(["in the axis 'size', sm names no selector: either every value names one, or none does"]);
    });
});

describe('the descriptor declares the axes under variants', () => {
    it('as a record when the values name selectors, the default first', () => {
        const { code } = compile(page("@variants { size: { xs: '.x', md: '.m' } = md; }"), 'btn.pdx');
        expect(code).toContain('variants: { size: { "md": ".m", "xs": ".x" } },');
    });

    it('as a list otherwise, the default first; with no prop and no host attribute of its own', () => {
        const { code } = compile(page('@variants { variant: { primary, ghost, danger } = ghost; }'), 'btn.pdx');
        expect(code).toContain('variants: { variant: ["ghost", "primary", "danger"] },');
        // Core makes the prop and reflects it: a second copy in `props` and `host` is what it warns of.
        expect(code).not.toMatch(/props: \{[^}]*variant:/);
        expect(code).not.toContain("':variant'");
    });

    // The select moved to .pdx (#1210): its TypeScript version is gone, and the sizes it declared are
    // in the declaration recorded from it before the move (packages/ui/tests/fixtures/ts-declarations).
    it('the select compiled from .pdx declares its sizes as its TypeScript version did', () => {
        const file = join(UI, 'src', 'select', 'pdx-select.pdx');
        const compiled = compile(readFileSync(file, 'utf8'), file, undefined, undefined, { prefix: 'pdx' }).code;
        const written = /variants: (\{ size: \{[^}]*\} \}),/.exec(compiled)?.[1];
        expect(written, 'the select declares no size axis with selectors').toBeDefined();
        const recorded = JSON.parse(readFileSync(join(UI, 'tests', 'fixtures', 'ts-declarations', 'pdx-select.json'), 'utf8')) as
            { variants: { name: string; native: Record<string, string> }[] };
        const tsSizes = recorded.variants.find((v) => v.name === 'size')!.native;
        const pdxSizes = JSON.parse(written!.replace(/^\{ size: /, '').replace(/ \}$/, ''));
        expect(pdxSizes).toEqual(tsSizes);
        expect(Object.keys(pdxSizes)[0], 'the default first, as core reads it').toBe(Object.keys(tsSizes)[0]);
    });
});

describe('a library component\'s values are styled by @pdxui/design', () => {
    it('pdx-select\'s sizes, drawn in variant-sources, are not PDX_VARIANT_UNSTYLED', () => {
        expect(unstyled(page(SIZES), 'pdx')).toEqual([]);
    });

    it('control — a value no design rule styles still is', () => {
        const src = page("@variants { size: { md: '.pdx-input-md', sm: '.pdx-input-sm', huge: '.pdx-input-huge' } = md; }");
        expect(unstyled(src, 'pdx').map((w) => w.message)).toEqual([
            '@variants declares size: huge, and no @variant rule of the <style scoped> or of @pdxui/design styles it.',
        ]);
    });

    it('control — an application component is checked against its own styles only', () => {
        expect(unstyled(page(SIZES)).map((w) => w.message.split(',')[0])).toEqual([
            '@variants declares size: xs', '@variants declares size: sm', '@variants declares size: lg', '@variants declares size: xl',
        ]);
    });
});
