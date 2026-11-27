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

describe('a @part nothing reads has no ref (#1268)', () => {
    const template = '<div data-part="root"><span data-part="label">x</span></div>';

    it('a part the script never names gets no signal and no bindRef, and keeps its data-part', () => {
        const { code } = compile(pdx(template, '@part root, label;\n// the root, the label: names in a comment\nconst s = \'root\';\nfunction f() { label?.focus(); }'), 'test.pdx');
        expect(code).not.toMatch(/const __root = signal/);
        expect(code).not.toMatch(/bindRef\(__el\d+,ctx\.root\)/);
        expect(markup(code).join('')).toContain('data-part="root"');
        expect(code).toContain(`parts: ['root', 'label'],`);
        // The control beside it: the part the script reads keeps its ref.
        expect(code).toMatch(/const __label = signal\(null/);
        expect(code).toMatch(/bindRef\(__el\d+,ctx\.label\)/);
    });

    it('a part a template expression reads keeps its ref', () => {
        const { code } = compile(pdx(`${template}<p :title="root?.id">t</p>`, '@part root, label;'), 'test.pdx');
        expect(code).toMatch(/bindRef\(__el\d+,ctx\.root\)/);
        expect(code).not.toMatch(/bindRef\(__el\d+,ctx\.label\)/);
    });

    it('a part read inside a template literal of the script keeps its ref', () => {
        const { code } = compile(pdx(template, '@part root, label;\nfunction f() { return `${root?.id}`; }'), 'test.pdx');
        expect(code).toMatch(/bindRef\(__el\d+,ctx\.root\)/);
    });

    it("a template literal's text is no read, nor what follows it (#1210, pdx-field-group)", () => {
        // `${…}-root` is a string ending in the part's name, and the comment after the literal names the
        // other: read as one more literal running to the end of the script, both kept a ref.
        const script = '@part root, label;\nconst id = `${Math.random()}-root`;\n// the label, in a comment after the literal\nconst t = `a ${`b ${1}`} c`;';
        const { code } = compile(pdx(template, script), 'test.pdx');
        expect(code).not.toMatch(/bindRef\(__el\d+,ctx\.(root|label)\)/);
    });

    it('a name only as a key, a property, a type member or a slot parameter is no read (#1332, pdx-file-upload)', () => {
        const script = [
            '@part root, label;',
            '@slot row?: (item: unknown, label: string);',
            'interface Entry { root: number; label?: string }',
            'const e = { root: 0, label: "x" };',
            'function f(o: { label: string }, root: number) { return e.root + o?.label; }',
        ].join('\n');
        const { code } = compile(pdx(template, script), 'test.pdx');
        expect(code).not.toMatch(/const __(root|label) = signal/);
        expect(code).not.toMatch(/bind(Ref|Parts)\(__el\d+,ctx\.(root|label)\)/);
    });

    it('control — a ternary branch, a shorthand property and a plain read each keep the ref (#1332)', () => {
        for (const read of ['function f(c) { return c ? root : null; }', 'const o = { root };', 'function f() { root?.focus(); }']) {
            const { code } = compile(pdx(template, `@part root, label;\n${read}`), 'test.pdx');
            expect(code, read).toMatch(/bindRef\(__el\d+,ctx\.root\)/);
        }
    });

    it('a part @host or @expose reads keeps its ref', () => {
        const host = compile(pdx(template, '@part root, label;\n@host { :title="root?.id" }'), 'test.pdx').code;
        expect(host).toMatch(/bindRef\(__el\d+,ctx\.root\)/);
        const exposed = compile(pdx(template, '@part root, label;\n@expose root;'), 'test.pdx').code;
        expect(exposed).toMatch(/bindRef\(__el\d+,ctx\.root\)/);
    });
});

describe('@part(external): a part the script writes outside the template (#1284)', () => {
    const script = (more: string) => `@part trigger;\n@part(external) panel, step;\nfunction f() { trigger?.focus(); }\n${more}`;
    const writes = "function mark(el, b) { el.setAttribute('data-part', 'panel'); b.dataset.part = \"step\"; }";

    it('is declared, and on no element of the template is not PDX_PART_MISSING', () => {
        expect(codes('<button data-part="trigger">x</button><slot></slot>', script(writes), 'PDX_PART_MISSING')).toEqual([]);
        // The control: the same parts declared plainly are missing.
        const plain = `@part trigger, panel, step;\nfunction f() { trigger?.focus(); }\n${writes}`;
        expect(codes('<button data-part="trigger">x</button><slot></slot>', plain, 'PDX_PART_MISSING').map(w => w.message))
            .toEqual(["@part 'panel' is on no element of the template.", "@part 'step' is on no element of the template."]);
    });

    it('is in the descriptor and the analysis with the other parts, and has no ref', () => {
        const analysis = analyzeScript(script(writes), 'test.pdx');
        expect(analysis.parts).toEqual(['trigger', 'panel', 'step']);
        expect(analysis.externalParts).toEqual(['panel', 'step']);
        const { code } = compile(pdx('<button data-part="trigger">x</button><slot></slot>', script(`${writes}\nfunction g() { return panel; }`)), 'test.pdx');
        expect(code).toContain(`parts: ['trigger', 'panel', 'step'],`);
        expect(code).not.toMatch(/const __(panel|step) = signal/);
    });

    it('written by nothing in the script is PDX_PART_EXTERNAL_UNWRITTEN', () => {
        // A comment and an unrelated string name it: neither writes it.
        const found = codes('<button data-part="trigger">x</button>', script("// el.setAttribute('data-part', 'step')\nconst s = 'panel';\nfunction m(el) { el.dataset.part = 'step'; }"), 'PDX_PART_EXTERNAL_UNWRITTEN');
        expect(found.map(w => w.message)).toEqual(["@part(external) 'panel' is written by nothing in the script: no setAttribute('data-part', 'panel'), no .dataset.part = 'panel'."]);
        expect(found[0].severity).toBe('error');
    });

    it('drawn by the template is PDX_PART_EXTERNAL_DRAWN', () => {
        const found = codes('<button data-part="trigger">x</button><div data-part="panel"></div>', script(writes), 'PDX_PART_EXTERNAL_DRAWN');
        expect(found.map(w => w.message)).toEqual(["@part(external) 'panel' is on an element of the template: an external part is one the template does not draw."]);
        expect(found[0].severity).toBe('error');
    });

    it('a data-part the template draws still needs a declaration', () => {
        expect(codes('<i data-part="other"></i>', script(writes), 'PDX_PART_UNDECLARED')).toHaveLength(1);
    });
});

describe('a @part with a hyphenated name (#1299)', () => {
    const template = '<div data-part="root"><span data-part="word-count">3</span></div>';

    it('is declared, with no diagnostic, and listed in the descriptor', () => {
        const all = [...analyzeScript('@part root, word-count;', 'test.pdx').warnings,
            ...validate(analyzeScript('@part root, word-count;', 'test.pdx'), parseTemplate(template), 'test.pdx')];
        // No diagnostic of any severity: a hyphenated name cannot be a script declaration, so it is not
        // PDX_PART_NAME_TAKEN either (which once suggested `:ref="word-countEl"`).
        expect(all.map(w => w.code)).toEqual([]);
        const { code } = compile(pdx(template, '@part root, word-count;'), 'test.pdx');
        expect(code).toContain(`parts: ['root', 'word-count'],`);
    });

    it('is a styling name only: no signal and no ref, the script cannot name it', () => {
        const { code } = compile(pdx(template, '@part root, word-count;\nfunction f() { root?.focus(); }'), 'test.pdx');
        expect(code).not.toMatch(/word-count = signal|__word|ctx\.word/);
        expect(markup(code).join('')).toContain('data-part="word-count"');
        // The control: the identifier beside it keeps its ref.
        expect(code).toMatch(/bindRef\(__el\d+,ctx\.root\)/);
    });

    it('the control: an undeclared hyphenated data-part is still PDX_PART_UNDECLARED', () => {
        expect(codes(template, '@part root;', 'PDX_PART_UNDECLARED').map(w => w.message)).toEqual(["data-part 'word-count' names no part the script declares."]);
    });

    it('@part(external) takes one too', () => {
        expect(analyzeScript("@part(external) row-head;\nfunction m(el) { el.dataset.part = 'row-head'; }", 'test.pdx').externalParts).toEqual(['row-head']);
    });
});

describe('@part compiles into a ref and the descriptor', () => {
    // A part's ref is for what reads it (#1268): these read it.
    it('the element is the part\'s ref, and keeps its data-part', () => {
        const { code } = compile(pdx('<button data-part="trigger">x</button>', '@part trigger;\nfunction f() { trigger?.focus(); }'), 'test.pdx');
        // Kept in the block's static markup, written as HTML (#369).
        expect(markup(code).join('')).toContain('<button data-part="trigger">x</button>');
        expect(code).toMatch(/bindRef\(__el\d+,ctx\.trigger\)/);
        expect(code).toContain(`const __trigger = signal(null`);
        expect(code).toContain(`parts: ['trigger'],`);
    });

    it('a component whose only declaration is a part imports the signal its ref is', () => {
        // The ref is `signal(null)`: without the import the setup throws, and the component mounts
        // with no scope attribute and no host bindings.
        const { code } = compile(pdx('<button data-part="trigger">x</button>', '@part trigger;\nfunction f() { trigger?.focus(); }'), 'test.pdx');
        expect(code).toMatch(/^import \{[^}]*\bsignal\b[^}]*\} from '@pdxui\/core';/m);
    });

    it('a part inside a block is bound when the block renders', () => {
        const { code } = compile(pdx('<p>x</p>@if (open) { <div data-part="popup">y</div> }', '@part popup;\nlet open = $signal(false);\nfunction f() { popup?.focus(); }'), 'test.pdx');
        expect(code).toMatch(/whenBlock\([\s\S]*bindRef\(__el\d+,ctx\.popup\)/);
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
    const SCRIPT = '@part x;\nlet a = $signal(true);\nlet b = $signal(true);\nlet items = $signal([1, 2]);\nfunction f() { return x; }';
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

describe('a part drawn in a script @snippet (#1412)', () => {
    // A script `@snippet` is a template the component renders with `@render`: its elements are the
    // component's, and so are their parts.
    const template = '<div role="listbox">@for (rows as r; track r) { @render optionRow(r) }</div>';
    const snippet = '@snippet optionRow(r: string) { <div role="option" data-part="option">{{ r }}</div> }';

    it('is on an element: no PDX_PART_MISSING', () => {
        expect(codes(template, `@part option;\n@prop rows: string[] = [];\n${snippet}`, 'PDX_PART_MISSING')).toHaveLength(0);
        // The control: with no snippet drawing it, the part is missing.
        expect(codes(template.replace('@render optionRow(r)', ''), '@part option;\n@prop rows: string[] = [];', 'PDX_PART_MISSING')).toHaveLength(1);
    });

    it('a data-part in a snippet that names no part is PDX_PART_UNDECLARED', () => {
        const found = codes(template, `@prop rows: string[] = [];\n${snippet}`, 'PDX_PART_UNDECLARED');
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain(`'option'`);
    });

    it('drawn by a snippet, it can be there any number of times: the script reads the array', () => {
        const { code } = compile(pdx(template, `@part option;\n@prop rows: string[] = [];\n${snippet}\nfunction first() { return option[0]; }`), 'test.pdx');
        expect(code).toContain('const __option = signal([]');
    });
});
