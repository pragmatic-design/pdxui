// `@part trigger, popup;` (#134): named, public elements of a component. Each is `data-part="name"`
// on exactly one element, the script reads the name as the element, and the descriptor lists them.
// The mounted half is packages/ui/tests/unit/part-rune-runtime.test.ts.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { validate } from '../src/compiler/validate';
import { parseTemplate } from '../src/parser/template';

const pdx = (template: string, script: string) => `<template>${template}</template>\n<script setup>\n${script}\n</script>`;

function codes(template: string, script: string, code: string) {
    const analysis = analyzeScript(script, 'test.pdx');
    const found = [...analysis.warnings, ...validate(analysis, parseTemplate(template), 'test.pdx')];
    return found.filter(w => w.code === code);
}

describe('@part compiles into a ref and the descriptor', () => {
    it('the element is the part\'s ref, and keeps its data-part', () => {
        const { code } = compile(pdx('<button data-part="trigger">x</button>', '@part trigger;'), 'test.pdx');
        expect(code).toContain(`setAttribute("data-part", "trigger")`);
        expect(code).toMatch(/bindRef\(__el\d+,ctx\.trigger\)/);
        expect(code).toContain(`const __trigger = signal(null`);
        expect(code).toContain(`parts: ['trigger'],`);
    });

    it('a part inside a block is bound when the block renders', () => {
        const { code } = compile(pdx('<p>x</p>@if (open) { <div data-part="popup">y</div> }', '@part popup;\nlet open = $signal(false);'), 'test.pdx');
        expect(code).toMatch(/when\([\s\S]*bindRef\(__el\d+,ctx\.popup\)/);
    });

    it('the script reads the part as the element', () => {
        const { code } = compile(pdx('<button data-part="trigger">x</button>', '@part trigger;\nfunction f() { trigger?.focus(); }'), 'test.pdx');
        expect(code).toContain('__trigger()?.focus()');
    });

    it('the control: a data-part with no @part is not bound', () => {
        const { code } = compile(pdx('<div data-part="free">x</div>', 'let a = $signal(1);'), 'test.pdx');
        expect(code).not.toContain('bindRef');
        expect(code).not.toContain('parts:');
    });

    it('a part is not PDX_UNUSED_REACTIVE: its element is the use', () => {
        expect(codes('<div data-part="popup">x</div>', '@part popup;', 'PDX_UNUSED_REACTIVE')).toHaveLength(0);
    });

    it('@part alone marks the script as the new mode', () => {
        expect(analyzeScript('@part popup;', 'test.pdx').mode).toBe('new');
    });
});

describe('the part diagnostics', () => {
    it('PDX_PART_MISSING: a declared part on no element', () => {
        const found = codes('<button>x</button>', '@part trigger;', 'PDX_PART_MISSING');
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain(`'trigger'`);
    });

    it('PDX_PART_DUPLICATE: a part on two elements', () => {
        const found = codes('<b data-part="x">1</b><i data-part="x">2</i>', '@part x;', 'PDX_PART_DUPLICATE');
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain('2 elements');
    });

    it('PDX_PART_UNDECLARED: a data-part the script does not declare', () => {
        const found = codes('<div data-part="popup">x</div>', 'let a = $signal(1);', 'PDX_PART_UNDECLARED');
        expect(found).toHaveLength(1);
        expect(found[0].hint).toContain('@part popup;');
    });

    it('the control: one element per declared part raises none', () => {
        const template = '<button data-part="trigger">x</button><div data-part="popup">y</div>';
        for (const code of ['PDX_PART_MISSING', 'PDX_PART_DUPLICATE', 'PDX_PART_UNDECLARED']) {
            expect(codes(template, '@part trigger, popup;', code), code).toHaveLength(0);
        }
    });

    it('a data-part inside @raw is text, not a part', () => {
        expect(codes('@raw { <div data-part="shown">x</div> }', 'let a = $signal(1);', 'PDX_PART_UNDECLARED')).toHaveLength(0);
    });
});
