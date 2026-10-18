// `@variants` and `@variant` (#153): the variants declared once in the script, compiled into typed
// props reflected on the host, and the CSS keyed by them compiled for each target. The behaviour in a
// browser is packages/showcase/tests/scoped-styles.spec.ts.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { generateDts } from '../src/compiler/dts-generator';
import { hash } from '../src/compiler/codegen-styles';
import { parseVariantsBlock, expandVariantRules } from '../src/compiler/variants';

const VARIANTS = '@variants {\n  variant: { primary, ghost, danger } = primary;\n  size: { sm, md, lg } = md;\n}';
const file = (script: string, css: string) =>
    `<template><button data-part="root"><slot></slot></button></template>\n<script setup>\n${script}\n@part root;\n</script>\n<style scoped>\n${css}\n</style>\n`;
const STYLED = [
    '[data-part="root"] { border-radius: 4px; }',
    '@variant variant(ghost) { [data-part="root"] { background: transparent; } }',
    '@variant variant(danger) { [data-part="root"] { background: var(--pdx-color-danger); } }',
    '@variant size(sm) { [data-part="root"] { padding: 0; } }',
    '@variant size(lg) { :scope { display: block; } }',
    '@variant variant(ghost) and size(sm) { [data-part="root"] { padding-inline: 0; } }',
].join('\n');
const codes = (src: string, code: string) => compile(src, 'btn.pdx').warnings.filter((w) => w.code === code);

describe('@variants in the script', () => {
    it('reads each axis, its values and its default; an axis without a default takes its first value', () => {
        expect(parseVariantsBlock('@variants {\n  variant: { primary, ghost } = ghost;\n  tone: { a, b }\n}')).toEqual({
            axes: [{ name: 'variant', values: ['primary', 'ghost'], default: 'ghost' }, { name: 'tone', values: ['a', 'b'], default: 'a' }],
            errors: [],
        });
    });

    it('says what it cannot read: a default that is not a value, an axis twice, a line that is not an axis', () => {
        expect(parseVariantsBlock('@variants { size: { sm, md } = xl; }').errors).toEqual(["the default of 'size', 'xl', is not one of its values (sm, md)"]);
        expect(parseVariantsBlock('@variants { a: { x }; a: { y }; }').errors).toEqual(["the axis 'a' is declared twice"]);
        expect(parseVariantsBlock('@variants { size = big; }').errors).toEqual(["'size = big;' is not an axis"]);
    });

    it('generates a prop per axis, typed with its values and defaulting to its default', () => {
        const analysis = analyzeScript(VARIANTS, 'btn.pdx', { setup: true });
        expect(analysis.mode).toBe('new');
        expect(analysis.props).toEqual([
            { name: 'variant', tsType: "'primary' | 'ghost' | 'danger'", runtimeType: 'String', default: "'primary'" },
            { name: 'size', tsType: "'sm' | 'md' | 'lg'", runtimeType: 'String', default: "'md'" },
        ]);
        expect(generateDts({ tag: 'app-btn', props: analysis.props, events: [], slots: [] })).toContain("variant?: 'primary' | 'ghost' | 'danger';");
    });

    it('reflects each axis on the host as an attribute', () => {
        const { code } = compile(file(VARIANTS, STYLED), 'btn.pdx');
        expect(code).toContain(`':variant': (ctx) => ctx.variant()`);
        expect(code).toContain(`':size': (ctx) => ctx.size()`);
    });

    it('a malformed block is PDX_VARIANTS_MALFORMED, naming what it could not read', () => {
        const found = codes(file('@variants { size: { sm, md } = xl; }', ''), 'PDX_VARIANTS_MALFORMED');
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain("the default of 'size', 'xl', is not one of its values");
    });
});

describe('@variant in a scoped style', () => {
    const id = `data-pdx-${hash('btn.pdx')}`;

    it('under baseline-2026 is a selector on the host\'s attributes inside the donut scope', () => {
        const { code } = compile(file(VARIANTS, STYLED), 'btn.pdx');
        expect(code).toContain(`:where(:scope)[${id}][variant=\\"ghost\\"] [data-part=\\"root\\"] { background: transparent; }`);
        expect(code, 'compound variants AND their tests').toContain(`:where(:scope)[${id}][variant=\\"ghost\\"][size=\\"sm\\"] [data-part=\\"root\\"]`);
        expect(code, 'a rule for the host itself').toContain(`:where(:scope)[${id}][size=\\"lg\\"] { display: block; }`);
        expect(code).not.toContain('@variant');
    });

    it('under baseline-2024 is the host attribute selector, the ancestor form', () => {
        const { code } = compile(file(VARIANTS, STYLED), 'btn.pdx', undefined, undefined, { target: 'baseline-2024' });
        expect(code).toContain(`[${id}][variant=\\"ghost\\"] [data-part=\\"root\\"] { background: transparent; }`);
        expect(code).toContain(`[${id}][size=\\"lg\\"] { display: block; }`);
        expect(code).not.toContain('@variant');
    });

    it('inside @media, and with a selector list, each selector goes under the host test', () => {
        expect(expandVariantRules('@media (min-width: 1px) { @variant size(sm) { .a, .b { margin: 0 } } }'))
            .toBe('@media (min-width: 1px) { :scope[size="sm"] .a, :scope[size="sm"] .b { margin: 0 } }');
    });

    it('control — a style with no @variant is left exactly as it was', () => {
        const css = '.a { color: red; } @media (min-width: 1px) { .b { color: blue; } }';
        expect(expandVariantRules(css)).toBe(css);
    });
});

describe('the two diagnostics', () => {
    it('PDX_VARIANT_UNKNOWN: a @variant naming an undeclared axis or value', () => {
        const src = file(VARIANTS, `${STYLED}\n@variant variant(primay) { .x { color: red; } }\n@variant tone(dark) { .x { color: red; } }`);
        const found = codes(src, 'PDX_VARIANT_UNKNOWN');
        expect(found.map((w) => w.message)).toEqual([
            "@variant variant(primay): 'primay' is not a value of the axis 'variant' (primary, ghost, danger).",
            "@variant tone(dark): 'tone' is not an axis of @variants (variant, size).",
        ]);
        expect(found.every((w) => w.severity === 'error')).toBe(true);
        expect(found[0].line, 'the line of the style it was written on').toBe(src.split('\n').findIndex((l) => l.includes('primay')) + 1);
    });

    it('PDX_VARIANT_UNKNOWN: any @variant in a component that declares no @variants', () => {
        expect(codes(file('', '@variant size(sm) { .x { color: red; } }'), 'PDX_VARIANT_UNKNOWN')).toHaveLength(1);
    });

    it('PDX_VARIANT_UNSTYLED: a declared value, other than the default, with no @variant rule', () => {
        const found = codes(file(VARIANTS, '@variant variant(ghost) { .x { color: red; } }'), 'PDX_VARIANT_UNSTYLED');
        expect(found.map((w) => w.message)).toEqual([
            "@variants declares variant: danger, and no @variant rule styles it.",
            "@variants declares size: sm, and no @variant rule styles it.",
            "@variants declares size: lg, and no @variant rule styles it.",
        ]);
        expect(found.every((w) => w.severity === 'warn')).toBe(true);
    });

    it('control — every value styled, or the default unstyled, reports nothing', () => {
        expect(codes(file(VARIANTS, STYLED), 'PDX_VARIANT_UNSTYLED')).toEqual([]);
        expect(codes(file(VARIANTS, STYLED), 'PDX_VARIANT_UNKNOWN')).toEqual([]);
    });
});
