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

// A part's name taken by the script (#999): the script's name wins, and the part stays the
// template's and the theme's. Only a `$signal` the script declares receives the element.
describe('a part named like another script name', () => {
    it('a @prop keeps its meaning: the template reads the prop, not the element', () => {
        const { code } = compile(pdx('@if (label) { <span data-part="label">{{ label }}</span> }', "@prop label: string = '';\n@part label;"), 'test.pdx');
        expect(code).not.toContain('const __label = signal(null');
        expect(code).not.toMatch(/bind(Ref|Parts)\(__el\d+,ctx\.label\)/);
        expect(markup(code).join('')).toContain('data-part="label"');
        expect(code).toContain(`parts: ['label'],`);
    });

    it('a @model keeps its meaning', () => {
        const { code } = compile(pdx('<input data-part="checked" :checked="checked" />', '@model checked: boolean = false;\n@part checked;'), 'test.pdx');
        expect(code).not.toMatch(/bind(Ref|Parts)\(__el\d+,ctx\.checked\)/);
    });

    it('a function keeps its meaning, and the element is not handed to it', () => {
        const { code } = compile(pdx('<button data-part="clear" @click="clear">x</button>', '@part clear;\nfunction clear() {}'), 'test.pdx');
        expect(code).not.toMatch(/bind(Ref|Parts)\(__el\d+,ctx\.clear\)/);
    });

    it('PDX_PART_NAME_TAKEN (info): a part the script cannot read by its name', () => {
        const scripts = [
            "@prop label: string = '';\n@part label;",
            '@model label: boolean = false;\n@part label;',
            '@part label;\nfunction label() {}',
            '@part label;\nconst label = 1;',
            '@part label;\nlet n = $signal(1);\nconst label = $derived(n * 2);',
        ];
        for (const script of scripts) {
            const found = codes('<span data-part="label">x</span>', script, 'PDX_PART_NAME_TAKEN');
            expect(found, script).toHaveLength(1);
            expect(found[0].severity, script).toBe('info');
            expect(found[0].message, script).toContain(`'label'`);
            expect(found[0].hint, script).toContain(':ref');
        }
    });

    it('the control: a :ref on the element reaches it, and PDX_PART_NAME_TAKEN is not raised', () => {
        const template = '<span data-part="label" :ref="labelEl">{{ label }}</span>';
        const script = "@prop label: string = '';\n@part label;\nlet labelEl = $signal<HTMLElement | null>(null);";
        expect(codes(template, script, 'PDX_PART_NAME_TAKEN')).toHaveLength(0);
        const { code } = compile(pdx(template, script), 'test.pdx');
        expect(code).toMatch(/bindRef\(__el\d+,ctx\.labelEl\)/);
        expect(code).not.toMatch(/bind(Ref|Parts)\(__el\d+,ctx\.label\)/);
    });

    it('the control: a $signal the script declares receives the element, with no diagnostic', () => {
        const script = '@part label;\nlet label = $signal<HTMLElement | null>(null);';
        const { code } = compile(pdx('<span data-part="label">x</span>', script), 'test.pdx');
        expect(code).toMatch(/bindRef\(__el\d+,ctx\.label\)/);
        expect(codes('<span data-part="label">x</span>', script, 'PDX_PART_NAME_TAKEN')).toHaveLength(0);
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
