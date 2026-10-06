// PDX_UNDECLARED_REF and PDX_INVALID_ENUM_VALUE are validate()'s.
//
// Not the editor's alone, as a regex over the template text, nor the Vite plugin's alone, printed
// after compile(): `pdx check` — the tool an agent runs — has to say something about
// `{{ missingThing }}`, `@click="incremnt"` and `:size="'huge'"`. The editor's cases are here with
// the check, including that an arrow function's parameter is not undeclared.

import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '../src/plugin';
import { parseSFC } from '../src/parser/sfc';
import { parseTemplate } from '../src/parser/template';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { validate, type ValidationWarning } from '../src/compiler/validate';
import { ComponentResolver } from '../src/component-resolver';

const pdx = (template: string, script: string): string =>
    `<template>\n  ${template}\n</template>\n<script setup>\n${script}\n</script>\n`;

const BUTTON_ENUMS: Record<string, string[]> = { size: ['sm', 'md', 'lg'], variant: ['primary', 'secondary'] };
const enumValues = (tag: string, prop: string) => (tag === 'pdx-button' ? BUTTON_ENUMS[prop] ?? null : null);

const refs = (src: string): ValidationWarning[] =>
    compile(src, 'x.pdx').warnings.filter((w) => w.code === 'PDX_UNDECLARED_REF');

/** validate() alone, as `pdx check` and the editor call it. */
function validated(src: string): ValidationWarning[] {
    const d = parseSFC(src);
    const ast = parseTemplate(d.template!.content, src.slice(0, d.template!.start).split('\n').length);
    return validate(analyzeScript(d.script!.content, 'x.pdx', { setup: d.script!.setup }), ast, 'x.pdx', { enumValues });
}

const applied = (src: string, w: ValidationWarning): string =>
    [...w.fix!.edits].sort((a, b) => b.start - a.start).reduce((s, e) => s.slice(0, e.start) + e.newText + s.slice(e.end), src);

describe('PDX_UNDECLARED_REF', () => {
    it('{{ missingThing }} is an error, at its line', () => {
        const d = refs(pdx('<p>{{ missingThing }}</p>', 'let count = $signal(0);'));
        expect(d.map((w) => [w.message, w.severity, w.line])).toEqual([
            ["'missingThing' is used in the template but is not declared in <script setup>.", 'error', 2],
        ]);
    });

    it('a misspelt handler names the function it meant, and the fix renames the read', () => {
        const src = pdx('<button @click="incremnt">+</button>', 'let count = $signal(0);\nfunction increment() { count++; }');
        const [w] = refs(src);
        expect(w.message).toContain("Did you mean 'increment'?");
        const fixed = applied(src, w);
        expect(fixed).toContain('<button @click="increment">+</button>');
        expect(refs(fixed)).toEqual([]);
    });

    it('two declared names equally near: named neither, no fix', () => {
        const [w] = refs(pdx('<p>{{ cat }}</p>', 'let cap = $signal(0);\nlet car = $signal(0);'));
        expect(w.message).not.toContain('Did you mean');
        expect(w.fix).toBeUndefined();
    });

    it('does not flag a declared signal, prop, function, event or import', () => {
        expect(refs(pdx('<div @click="inc">{{ count }} {{ title }} {{ fmt(1) }}</div>',
            "import { fmt } from './fmt';\n@prop title: string = 'x';\n@event saved: number;\nlet count = $signal(0);\nfunction inc() { count++; saved(count); }"))).toEqual([]);
    });

    it('does not flag @for loop variables, @catch variables or slot scope', () => {
        expect(refs(pdx('@for (rows as row, i; track row.id) { <span>{{ row.name }} {{ i }}</span> }', 'let rows = $signal([]);'))).toEqual([]);
        expect(refs(pdx('@try { <p>x</p> } @catch (err) { <div>{{ err.message }}</div> }', 'let _k = $signal(0);'))).toEqual([]);
    });

    // `e => count = e.detail.value` is a documented handler form.
    it('does not flag the parameters of an arrow function in a binding', () => {
        const src = pdx([
            '<x-a @pdx-change="e => count = e.detail.value"></x-a>',
            '<x-b @pdx-pick="(item, i) => pick(item, i)"></x-b>',
            '<x-c @pdx-go="async ev => { await go(ev.detail) }"></x-c>',
        ].join('\n  '), 'let count = $signal(0);\nfunction pick() {}\nasync function go() {}');
        expect(refs(src).map((d) => d.message)).toEqual([]);
    });

    it('the control: an undeclared name in an arrow function body is still flagged', () => {
        const d = refs(pdx('<x-a @pdx-change="e => cuont = e.detail.value"></x-a>', 'let count = $signal(0);'));
        expect(d.map((x) => x.message)).toEqual(["'cuont' is used in the template but is not declared in <script setup>. Did you mean 'count'?"]);
    });

    it('an object key in a binding is not a read; a ternary branch is', () => {
        expect(refs(pdx('<x-a :opts="{ size: count, label: \'x\' }"></x-a>', 'let count = $signal(0);'))).toEqual([]);
        expect(refs(pdx('<p>{{ count ? yes : no }}</p>', 'let count = $signal(0);')).map((w) => w.message.split("'")[1])).toEqual(['yes', 'no']);
    });

    it('code shown on the page is text: an escaped binding reads nothing', () => {
        expect(refs(pdx('<pre><code>&lt;pdx-x :items="items" @pick="e =&gt; go(e)"&gt;</code></pre>', 'let a = $signal(0);'))).toEqual([]);
    });

    // The editor's regex masked <pre>/<code> blocks whole. A `{{ }}` there is compiled like any other —
    // so a name it reads that the script does not declare reads `undefined` on the page.
    it('a {{ }} inside <pre> is an interpolation the page renders, and is checked', () => {
        const src = pdx('<pre><code>{{ ghostVar }}</code></pre>', 'let a = $signal(0);');
        expect(compile(src, 'x.pdx').code).toContain('ghostVar');
        expect(refs(src).map((w) => w.message.split("'")[1])).toEqual(['ghostVar']);
    });

    it('a namespaced attribute is not a binding: xlink:href="#x" reads nothing', () => {
        expect(refs(pdx('<svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#icon"></use></svg>', 'let a = $signal(0);'))).toEqual([]);
    });
});

describe('PDX_INVALID_ENUM_VALUE, from validate()', () => {
    it("a bound literal: :size=\"'huge'\" on pdx-button", () => {
        const w = validated(pdx(`<pdx-button :size="'huge'">b</pdx-button>`, 'let a = $signal(0);')).filter((x) => x.code === 'PDX_INVALID_ENUM_VALUE');
        expect(w.map((x) => x.message)).toEqual(['<pdx-button> size="huge" is not a declared value for "size".']);
        expect(w[0].hint).toBe('Allowed: "sm", "md", "lg".');
    });

    it('a static value, as the plugin checked it', () => {
        expect(validated(pdx('<pdx-button variant="solidish">b</pdx-button>', 'let a = $signal(0);')).map((x) => x.code)).toContain('PDX_INVALID_ENUM_VALUE');
    });

    it('an allowed value, a bound expression, an unknown tag, a non-enum attribute, a comment: nothing', () => {
        const codes = validated(pdx([
            '<pdx-button size="md" :variant="v" id="save">a</pdx-button>',
            '<pdx-nope size="huge"></pdx-nope>',
            '<!-- <pdx-button size="huge"></pdx-button> -->',
        ].join('\n  '), "let v = $signal('primary');")).map((x) => x.code);
        expect(codes).not.toContain('PDX_INVALID_ENUM_VALUE');
    });

    it('reaches compile(), which the dev server logs, when the plugin gives the lookup', () => {
        const ws = compile(pdx('<pdx-button size="huge">b</pdx-button>', 'let a = $signal(0);'), 'x.pdx', [], undefined, { enumValues }).warnings;
        expect(ws.find((w) => w.code === 'PDX_INVALID_ENUM_VALUE')?.line).toBe(2);
    });

    it('in the real UI manifest, pdx-button declares a size the check knows', () => {
        const r = new ComponentResolver();
        expect(r.registerUiManifest()).toBe(true);
        expect(r.enumValues('pdx-button', 'size'), 'no enum for pdx-button size: the check would check nothing').toBeTruthy();
    });
});

// Zero false positives on the real pages: a check an agent trusts is one that does not cry wolf.
// The sources only — `site/src/demos` holds copies the site build ports.
describe('the real .pdx corpus', () => {
    const SHOWCASE = join(__dirname, '../demo/showcase-new/pages');
    const AUTHORED = join(__dirname, '../../site/src/demos-authored');
    const APP = join(__dirname, '../../showcase/src');
    const pdxIn = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? pdxIn(join(dir, e.name)) : e.name.endsWith('.pdx') ? [join(dir, e.name)] : []));
    let files: string[] = [];
    const offenders: string[] = [];

    beforeAll(() => {
        const r = new ComponentResolver();
        r.registerUiManifest();
        files = [SHOWCASE, AUTHORED, APP].filter(existsSync).flatMap(pdxIn);
        for (const file of files) {
            const { warnings } = compile(readFileSync(file, 'utf-8'), file, [], undefined, {
                propsOf: (t) => r.propsOf(t), enumValues: (t, p) => r.enumValues(t, p),
            });
            for (const w of warnings.filter((x) => x.code === 'PDX_UNDECLARED_REF' || x.code === 'PDX_INVALID_ENUM_VALUE')) {
                offenders.push(`${file.split(/[\\/]/).pop()}:${w.line} ${w.message}`);
            }
        }
    }, 120_000);

    it('reads the sources', () => {
        expect(files.filter((f) => f.startsWith(SHOWCASE)).length).toBeGreaterThanOrEqual(100);
        expect(files.filter((f) => f.startsWith(APP)).length).toBeGreaterThanOrEqual(9);
    });

    it('produces no false positives', () => {
        expect(offenders).toEqual([]);
    });
});
