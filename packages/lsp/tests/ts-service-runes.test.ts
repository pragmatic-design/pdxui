// The editor's TypeScript sees a .pdx as the compiler does: the rune declarations it
// projects, the project's tsconfig paths, and `$event` in a handler.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pathToFileURL } from 'url';
import { parseTemplate } from '@pdxui/compiler';
import { PdxTsService, projectScript } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';
import { tsHover } from '../src/capabilities/ts-features';

const ROOT = join(__dirname, '..', '..', '..');
const URI = pathToFileURL(join(ROOT, 'x.pdx')).href;
const svc = new PdxTsService(ROOT);

/** The TS diagnostics of a .pdx made of `script` and `template`, as the server computes them. */
function diagnose(script: string, template = '', resolveType?: (tag: string, attr: string) => string | null, service = svc, uri = URI): string[] {
    const source = `<template>${template}</template>\n<script setup>\n${script}\n</script>\n`;
    const scriptStart = source.indexOf('<script setup>\n') + '<script setup>\n'.length;
    const tmplStart = '<template>'.length;
    const vf = buildVirtualFile(script, scriptStart, template ? parseTemplate(template, 1) : [], template || null, template ? tmplStart : -1, resolveType);
    return getTsDiagnostics(service, uri, vf, source).map(d => `${d.code} ${d.message.split('\n')[0]}`);
}

describe('the rune declarations', () => {
    it('$derived takes a value: $derived(a > b) is a boolean', () => {
        const script = 'let a = $signal(1);\nlet b = $signal(2);\nconst bigger = $derived(a > b);\nbigger;\n';
        expect(diagnose(script)).toEqual([]);
        const off = script.lastIndexOf('bigger');
        const vf = buildVirtualFile(script, 0, [], '', -1);
        const hover = tsHover(svc, URI, vf, off) as { contents: { value: string } } | null;
        expect(hover?.contents.value).toMatch(/boolean/);
    });

    it('@variants declares each axis as its prop, typed with its values (#153)', () => {
        const script = [
            '@variants {',
            '  variant: { primary, ghost } = primary;',
            '  size: { sm, md } = md;',
            '}',
            "const loud: boolean = variant === 'ghost' && size !== 'sm';",
            'loud;',
        ].join('\n');
        expect(diagnose(script)).toEqual([]);
        // The control: a value the axis does not have is TypeScript's comparison error.
        expect(diagnose(`${script}\nconst bad = variant === 'danger';\nbad;`).some((d) => d.startsWith('ts(2367)'))).toBe(true);
    });

    it('@host and @state reach TypeScript blanked, on one line or several (#133, #132)', () => {
        const script = [
            'let open = $signal(false);',
            '@host {',
            '  role="combobox"',
            '  :aria-expanded="open"',
            '  @keydown.enter="open = !open"',
            '}',
            '@state expanded = open;',
            'open;',
        ].join('\n');
        expect(diagnose(script)).toEqual([]);
        expect(projectScript(script)).not.toMatch(/role|aria-expanded|expanded =/);
    });

    it('a @model is a typed name the script reads and writes (#124)', () => {
        const script = "@model value: string = '';\nfunction clear() { value = ''; }\nfunction len() { return value.length; }\nclear; len;\n";
        expect(diagnose(script)).toEqual([]);
        expect(projectScript(script)).toHaveLength(script.length);
        const wrong = "@model value: string = '';\nfunction set() { value = 3; }\nset;\n";
        expect(diagnose(wrong).some(d => /number.*not assignable.*string/.test(d)), JSON.stringify(diagnose(wrong))).toBe(true);
    });

    it('a @part is its element in the script (#134)', () => {
        const script = '@part trigger, popup;\nfunction f() { trigger?.focus(); popup?.remove(); }\nf;\n';
        expect(diagnose(script)).toEqual([]);
        const vf = buildVirtualFile(script, 0, [], '', -1);
        const hover = tsHover(svc, URI, vf, script.indexOf('trigger?')) as { contents: { value: string } } | null;
        // Declared `HTMLElement | null`; the editor's service runs without strictNullChecks, so the
        // hover shows the element type alone.
        expect(hover?.contents.value).toMatch(/var trigger: HTMLElement\b/);
    });

    it('$event.target.value is accepted in a handler', () => {
        expect(diagnose("let name = $signal('');", '<input @input="name = $event.target.value">')).toEqual([]);
    });

    it('effect() hands back its disposer, and $effect takes an async function', () => {
        expect(diagnose('const stop = effect(() => {});\nstop();\n$effect(async () => {});\n')).toEqual([]);
    });

    it('a $derived that reads a const declared below it is no use before the declaration (#467)', () => {
        // The compiler emits computed(() => …): the expression is read later, not where it is written.
        const script = "let section = $signal('a');\nconst current = $derived(section === 'a' ? first : second);\nconst first = [1];\nconst second = [2];\ncurrent;\n";
        expect(diagnose(script)).toEqual([]);
        // An object literal is still an object, not an arrow's body.
        expect(diagnose("let a = $signal(1);\nconst pair = $derived({ a, b: 2 });\nconst n: number = pair.b;\nn;\n")).toEqual([]);
        // Still the value's type: a number is not a string.
        expect(diagnose("const n = $derived(list.length);\nconst list = [1];\nconst s: string = n;\ns;\n").map((d) => d.split(' ')[0])).toEqual(['ts(2322)']);
    });

    it('a rune declared below its first use is not "used before its declaration"', () => {
        // The compiler places signals where every use sees them.
        // At the top level: a use inside a function body is never reported, whatever the keyword.
        expect(diagnose('const next = $derived(later + 1);\nlet later = $signal(1);\nnext;\n')).toEqual([]);
    });
});

describe('projectScript', () => {
    it('blanks @form with its options block, and declares the form', () => {
        const src = "@form details: { name: string } {\n  save: onChange;\n  validate: rule\n};\nconst v = details.getValues();\n";
        const out = projectScript(src);
        expect(out.slice(0, src.length).length).toBe(src.length);
        expect(out).not.toContain('onChange');
        expect(diagnose(src)).toEqual([]);
    });

    it('declares the name @inject introduces, and blanks @provide', () => {
        const src = '@inject docs;\n@provide theme = { mode: 1 };\nconst n = docs.count;\n';
        expect(projectScript(src)).not.toContain('@provide');
        expect(diagnose(src)).toEqual([]);
    });

    it('declares each @params field under its type, as the compiler does (#185)', () => {
        const src = "@page '/t/:id/:slug';\n@params { id: number, slug: string, open: boolean }\nconst next = $derived(id + 1);\n";
        expect(diagnose(src, '<p>{{ next }} {{ slug.length }} {{ open ? 1 : 0 }}</p>')).toEqual([]);
        expect(diagnose(src + 'const wrong: string = id;\n').join('\n'), 'a number param must be a number')
            .toContain("Type 'number' is not assignable to type 'string'");
    });

    it('declares a @snippet as a function of its parameters, and $emit (#206)', () => {
        const src = "@snippet row(name) {\n  <li>${name}</li>\n}\nfunction pick(v: string) { $emit('pdx-change', v); }\n$watch(() => 1, () => {}, { once: true });\n";
        expect(diagnose(src, "<ul>{{ row('Ada') }}</ul>")).toEqual([]);
        expect(diagnose(src + 'const n: number = row;\n').join('\n'), 'a snippet is a function')
            .toContain("is not assignable to type 'number'");
    });

    it('declares @search\'s searchParams with its fields\' types, as the compiler does (#204)', () => {
        const src = "@page '/list';\n@search { page: number = 1, q?: string, open: boolean }\nconst next = $derived(searchParams.page + 1);\n";
        expect(diagnose(src, '<p>{{ next }} {{ searchParams.q ?? \'\' }} {{ searchParams.open ? 1 : 0 }}</p>')).toEqual([]);
        expect(diagnose(src + 'const wrong: string = searchParams.page;\n').join('\n'), 'a number field must be a number')
            .toContain("Type 'number' is not assignable to type 'string'");
    });
});

describe('$event narrowed to the event a component declares', () => {
    const resolve = (tag: string, attr: string) => (tag === 'pdx-picker' && attr === '@picked' ? 'CustomEvent<{ id: number }>' : null);

    it('reads the payload it declares', () => {
        expect(diagnose('let picked = $signal(0);', '<pdx-picker @picked="picked = $event.detail.id"></pdx-picker>', resolve)).toEqual([]);
    });

    it('reports a field the payload does not have', () => {
        const found = diagnose('let picked = $signal(0);', '<pdx-picker @picked="picked = $event.detail.nope"></pdx-picker>', resolve);
        expect(found.join('\n')).toContain("Property 'nope' does not exist");
    });
});

describe('the project tsconfig.json', () => {
    let root: string;
    beforeAll(() => {
        root = join(tmpdir(), `pdx-ts-paths-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
        mkdirSync(join(root, 'lib'), { recursive: true });
        mkdirSync(join(root, 'src'), { recursive: true });
        writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@lib/*': ['lib/*'] } } }));
        writeFileSync(join(root, 'lib', 'util.ts'), 'export const answer = 42;\n');
    });
    afterAll(() => rmSync(root, { recursive: true, force: true }));

    it('resolves a paths alias it declares', () => {
        // Resolved, `answer` is a number and assigning it to a string is an error; unresolved, the
        // import is ignored (2307 is not reported) and `answer` would be `any` — no error at all.
        const service = new PdxTsService(root);
        const uri = pathToFileURL(join(root, 'src', 'x.pdx')).href;
        const found = diagnose("import { answer } from '@lib/util';\nconst n: string = answer;\n", '', undefined, service, uri);
        expect(found.join('\n')).toContain("Type 'number' is not assignable to type 'string'");
    });
});
