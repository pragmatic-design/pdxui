// The fixes for the common mistakes: each one rewrites the file so that compiling it
// again no longer gives the code — and where the right text is not determined, there is no fix.
// The catalog's examples are fixed into their good form in diagnostics-catalog.test.ts; these are
// the other shapes.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { parseSFC } from '../src/parser/sfc';
import { parseTemplate } from '../src/parser/template';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { validate, type ValidationWarning, type ValidateOptions } from '../src/compiler/validate';
import { positionWarnings } from '../src/compiler/position-warnings';

const pdx = (template: string, script: string): string =>
    `<template>\n  ${template}\n</template>\n<script setup>\n${script}\n</script>\n`;

const BUTTON_PROPS = new Set(['variant', 'size', 'disabled', 'maxItems']);
const propsOf = (tag: string) => (tag === 'pdx-button' ? BUTTON_PROPS : tag === 'pdx-tie' ? new Set(['size', 'side']) : null);

const compiled = (source: string): ValidationWarning[] => compile(source, 'x.pdx', [], undefined, { propsOf }).warnings;

/** validate() as `pdx check` runs it, with a resolver. */
function validated(source: string, options: ValidateOptions): ValidationWarning[] {
    const d = parseSFC(source);
    const ast = parseTemplate(d.template!.content, source.slice(0, d.template!.start).split('\n').length);
    const analysis = analyzeScript(d.script!.content, 'x.pdx', { setup: d.script!.setup });
    return positionWarnings(source, validate(analysis, ast, 'x.pdx', options), analysis.body);
}

function applied(source: string, w: ValidationWarning | undefined): string {
    expect(w?.fix, `${w?.code ?? 'the code'} carries no fix`).toBeDefined();
    let out = source;
    for (const e of [...w!.fix!.edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.newText + out.slice(e.end);
    return out;
}

const find = (ws: ValidationWarning[], code: string) => ws.find((w) => w.code === code);

describe('PDX_RAW_INTERPOLATION', () => {
    it('in text: ${n} → {{ n }}', () => {
        const src = pdx('<p>${n}</p>', 'let n = $signal(1);');
        const out = applied(src, find(compiled(src), 'PDX_RAW_INTERPOLATION'));
        expect(out).toContain('<p>{{ n }}</p>');
        expect(compiled(out).map((w) => w.code)).not.toContain('PDX_RAW_INTERPOLATION');
    });

    it('a value that mixes text and ${} gets no fix — it has more than one right answer', () => {
        const w = find(compiled(pdx('<p class="a ${n}">x</p>', 'let n = $signal(1);')), 'PDX_RAW_INTERPOLATION');
        expect(w, 'the finding itself is still reported').toBeDefined();
        expect(w!.fix).toBeUndefined();
    });
});

describe('PDX_RAW_INTERPOLATION_IN_BINDING', () => {
    it('on an event handler: @click="${go}" → @click="go"', () => {
        const src = pdx('<button @click="${go}">x</button>', 'function go() {}');
        const out = applied(src, find(validated(src, {}), 'PDX_RAW_INTERPOLATION_IN_BINDING'));
        expect(out).toContain('<button @click="go">x</button>');
        expect(() => compile(out, 'x.pdx')).not.toThrow();
    });
});

describe('PDX_UNKNOWN_PROP', () => {
    it('one declared prop within 2 edits: :variantt → :variant', () => {
        const src = pdx('<pdx-button :variantt="v">b</pdx-button>', "let v = $signal('a');");
        const out = applied(src, find(compiled(src), 'PDX_UNKNOWN_PROP'));
        expect(out).toContain('<pdx-button :variant="v">');
        expect(compiled(out).map((w) => w.code)).not.toContain('PDX_UNKNOWN_PROP');
    });

    it('two declared props equally near: no fix, the hint still guides', () => {
        const w = find(compiled(pdx('<pdx-tie :sise="v">b</pdx-tie>', "let v = $signal('a');")), 'PDX_UNKNOWN_PROP');
        expect(w).toBeDefined();
        expect(w!.fix).toBeUndefined();
    });

    it('nothing within 2 edits: no fix', () => {
        const w = find(compiled(pdx('<pdx-button :colourScheme="v">b</pdx-button>', "let v = $signal('a');")), 'PDX_UNKNOWN_PROP');
        expect(w!.fix).toBeUndefined();
    });
});

describe('PDX_PROP_NAME_CASE', () => {
    it(':maxitems → :maxItems', () => {
        const src = pdx('<pdx-button :maxitems="v">b</pdx-button>', 'let v = $signal(1);');
        const out = applied(src, find(compiled(src), 'PDX_PROP_NAME_CASE'));
        expect(out).toContain('<pdx-button :maxItems="v">');
        expect(compiled(out).map((w) => w.code)).not.toContain('PDX_PROP_NAME_CASE');
    });
});

describe('PDX_EVENT_NAME_CASE', () => {
    it('renames the declaration and every call of the emitter in the script', () => {
        const src = pdx('<button @click="save">x</button>', '@event savedItem: number;\nfunction save() { savedItem(1); }\n// savedItem in a comment stays');
        const out = applied(src, find(compiled(src), 'PDX_EVENT_NAME_CASE'));
        expect(out).toContain('@event saveditem: number;');
        expect(out).toContain('function save() { saveditem(1); }');
        expect(out, 'a comment is not code').toContain('// savedItem in a comment stays');
        expect(compiled(out).map((w) => w.code)).not.toContain('PDX_EVENT_NAME_CASE');
    });

    it('when the template uses the name, no rename is offered', () => {
        const w = find(compiled(pdx('<button @click="savedItem(1)">x</button>', '@event savedItem: number;')), 'PDX_EVENT_NAME_CASE');
        expect(w).toBeDefined();
        expect(w!.fix).toBeUndefined();
    });
});

describe('PDX_UNRESOLVED_COMPONENT', () => {
    const known = (...tags: string[]): ValidateOptions => ({ isKnownTag: (t) => tags.includes(t), knownTags: () => tags });

    it('one known tag within 2 edits: the message names it, the fix renames opening and closing tags', () => {
        const src = pdx('<pdx-buton>a</pdx-buton><pdx-buton>b</pdx-buton>', 'let a = $signal(1);');
        const w = find(validated(src, known('pdx-button', 'pdx-badge')), 'PDX_UNRESOLVED_COMPONENT');
        expect(w!.message).toContain('Did you mean <pdx-button>?');
        const out = applied(src, w);
        expect(out).toContain('<pdx-button>a</pdx-button><pdx-button>b</pdx-button>');
        expect(validated(out, known('pdx-button', 'pdx-badge')).map((x) => x.code)).not.toContain('PDX_UNRESOLVED_COMPONENT');
    });

    it('two known tags equally near: no name, no fix', () => {
        const w = find(validated(pdx('<pdx-bage></pdx-bage>', 'let a = $signal(1);'), known('pdx-badge', 'pdx-page')), 'PDX_UNRESOLVED_COMPONENT');
        expect(w!.message).not.toContain('Did you mean');
        expect(w!.fix).toBeUndefined();
    });
});
