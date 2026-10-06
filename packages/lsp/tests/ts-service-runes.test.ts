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

    it('$event.target.value is accepted in a handler', () => {
        expect(diagnose("let name = $signal('');", '<input @input="name = $event.target.value">')).toEqual([]);
    });

    it('effect() hands back its disposer, and $effect takes an async function', () => {
        expect(diagnose('const stop = effect(() => {});\nstop();\n$effect(async () => {});\n')).toEqual([]);
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
