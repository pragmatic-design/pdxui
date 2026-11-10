// `@part trigger, popup;` (#134): named, public elements of a component. Each is `data-part="name"`
// on exactly one element, the script reads the name as the element, and the descriptor lists them.
// The mounted half is packages/ui/tests/unit/part-rune-runtime.test.ts.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { markup } from './static-markup-of';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { validate } from '../src/compiler/validate';
import { parseTemplate } from '../src/parser/template';

const pdx = (template: string, script: string) => `<template>${template}</template>\n<script>\n${script}\n</script>`;

function codes(template: string, script: string, code: string) {
    const analysis = analyzeScript(script, 'test.pdx');
    const found = [...analysis.warnings, ...validate(analysis, parseTemplate(template), 'test.pdx')];
    return found.filter(w => w.code === code);
}

describe('@part compiles into a ref and the descriptor', () => {
    it('the element is the part\'s ref, and keeps its data-part', () => {
        const { code } = compile(pdx('<button data-part="trigger">x</button>', '@part trigger;'), 'test.pdx');
        // Kept in the block's static markup, written as HTML (#369).
        expect(markup(code).join('')).toContain('<button data-part="trigger">x</button>');
        expect(code).toMatch(/bindRef\(__el\d+,ctx\.trigger\)/);
        expect(code).toContain(`const __trigger = signal(null`);
        expect(code).toContain(`parts: ['trigger'],`);
    });

    it('a component whose only declaration is a part imports the signal its ref is', () => {
        // The ref is `signal(null)`: without the import the setup throws, and the component mounts
        // with no scope attribute and no host bindings.
        const { code } = compile(pdx('<button data-part="trigger">x</button>', '@part trigger;'), 'test.pdx');
        expect(code).toMatch(/^import \{[^}]*\bsignal\b[^}]*\} from '@pdxui\/core';/m);
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
});

// A part is every element that carries it (#988). When the template can render at most one at a
// time, the name is that element; otherwise it is the array of the rendered elements.
describe('a part on several elements', () => {
    const SCRIPT = '@part x;\nlet a = $signal(true);\nlet b = $signal(true);\nlet items = $signal([1, 2]);';
    const many = (template: string) => {
        const { code } = compile(pdx(template, SCRIPT), 'test.pdx');
        return code;
    };

    it('on an @for row: the name is an array, each row\'s element bound into it', () => {
        const code = many('@for (items as it; track it) { <b data-part="x">{{ it }}</b> }');
        expect(code).toContain('const __x = signal([]');
        expect(code).toMatch(/bindParts\(__el\d+,ctx\.x\)/);
        expect(code).not.toMatch(/bindRef\(__el\d+,ctx\.x\)/);
    });

    it('on two siblings: an array', () => {
        const code = many('<b data-part="x">1</b><i data-part="x">2</i>');
        expect(code).toContain('const __x = signal([]');
        expect(code.match(/bindParts\(__el\d+,ctx\.x\)/g)).toHaveLength(2);
    });

    it('beside an @for: an array', () => {
        const code = many('@for (items as it; track it) { <b data-part="x">{{ it }}</b> }<i data-part="x">+</i>');
        expect(code.match(/bindParts\(__el\d+,ctx\.x\)/g)).toHaveLength(2);
    });

    it('in two separate @if blocks: an array', () => {
        const code = many('@if (a) { <b data-part="x">1</b> } @if (b) { <i data-part="x">2</i> }');
        expect(code).toContain('const __x = signal([]');
    });

    it('in a @snippet body, which the child may render any number of times: an array', () => {
        const code = many('<app-list>@snippet row(it) { <b data-part="x">{{ it }}</b> }</app-list>');
        expect(code).toContain('const __x = signal([]');
    });

    it('the control: on alternative branches of one chain, the element or null', () => {
        const chains = [
            '@if (a) { <b data-part="x">1</b> } @else if (b) { <i data-part="x">2</i> } @else { <u data-part="x">3</u> }',
            '@switch (a) { @case (true) { <b data-part="x">1</b> } @default { <i data-part="x">2</i> } }',
            '@if (a) { <b data-part="x">1</b> } @else { @if (b) { <i data-part="x">2</i> } }',
        ];
        for (const template of chains) {
            const code = many(template);
            expect(code, template).toContain('const __x = signal(null');
            expect(code, template).not.toContain('bindParts');
        }
    });

    it('the control: the same chain, one branch carrying it twice, is an array', () => {
        const code = many('@if (a) { <b data-part="x">1</b><b data-part="x">2</b> } @else { <i data-part="x">3</i> }');
        expect(code).toContain('const __x = signal([]');
    });
});

describe('the part diagnostics', () => {
    it('PDX_PART_MISSING: a declared part on no element', () => {
        const found = codes('<button>x</button>', '@part trigger;', 'PDX_PART_MISSING');
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain(`'trigger'`);
    });

    it('a part on several elements is no error: a part is every element that carries it (#988)', () => {
        const templates = [
            '<b data-part="x">1</b><i data-part="x">2</i>',
            '@for (items as it; track it) { <b data-part="x">{{ it }}</b> }',
            '@if (a) { <b data-part="x">1</b> } @else { <i data-part="x">2</i> }',
        ];
        for (const template of templates) {
            const found = codes(template, '@part x;\nlet a = $signal(true);\nlet items = $signal([1]);', 'PDX_PART_DUPLICATE');
            expect(found, template).toHaveLength(0);
        }
    });

    it('PDX_PART_UNDECLARED: a data-part the script does not declare', () => {
        const found = codes('<div data-part="popup">x</div>', 'let a = $signal(1);', 'PDX_PART_UNDECLARED');
        expect(found).toHaveLength(1);
        expect(found[0].hint).toContain('@part popup;');
    });

    it('the control: one element per declared part raises none', () => {
        const template = '<button data-part="trigger">x</button><div data-part="popup">y</div>';
        for (const code of ['PDX_PART_MISSING', 'PDX_PART_UNDECLARED']) {
            expect(codes(template, '@part trigger, popup;', code), code).toHaveLength(0);
        }
    });

    it('a data-part inside @raw is text, not a part', () => {
        expect(codes('@raw { <div data-part="shown">x</div> }', 'let a = $signal(1);', 'PDX_PART_UNDECLARED')).toHaveLength(0);
    });
});
