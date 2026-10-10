// `@fetch user: 'GET /u' as User` gives the editor a typed resource, not `any`.
//
// The emitted module is erased of types, so the only place `as User` can matter is the projection
// the editor and `pdx check --types` read — and it declared every @fetch name `any`: a misspelt
// field passed in silence, and nothing completed on `User` (#53).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { parseTemplate } from '@pdxui/compiler';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';
import { typecheckPdx } from '../src/typecheck';

const ROOT = join(__dirname, '..', '..', '..');
const URI = pathToFileURL(join(ROOT, 'x.pdx')).href;
const svc = new PdxTsService(ROOT);

/** The TS diagnostics of a .pdx made of `script` and `template`, as the server computes them. */
function diagnose(script: string, template = ''): string[] {
    const source = `<template>${template}</template>\n<script setup>\n${script}\n</script>\n`;
    const scriptStart = source.indexOf('<script setup>\n') + '<script setup>\n'.length;
    const vf = buildVirtualFile(script, scriptStart, template ? parseTemplate(template, 1) : [], template || null, template ? '<template>'.length : -1);
    return getTsDiagnostics(svc, URI, vf, source).map(d => d.message.split('\n')[0]);
}

const USER = "interface User { name: string }\n@fetch user: 'GET /u' as User;\n";

describe('a typed @fetch in the script', () => {
    it('a misspelt field of the declared type is an error', () => {
        const d = diagnose(USER + 'function f() { return user.data()?.nmae; }');
        expect(d.some(m => /nmae/.test(m)), `no error for user.data()?.nmae — ${JSON.stringify(d)}`).toBe(true);
    });

    it('control — the right field is not', () => {
        expect(diagnose(USER + 'function f() { return user.data()?.name; }')).toEqual([]);
    });

    it('and the resource has the surface a page uses', () => {
        const uses = 'function f() { user.loading(); user.error(); user.isPending(); user.state(); user.status().isError; user.refetch(); user.mutate({ name: "x" }); }';
        expect(diagnose(USER + uses)).toEqual([]);
    });

    it('mutate takes the declared type, not anything', () => {
        const d = diagnose(USER + 'function f() { user.mutate({ nmae: "x" }); }');
        expect(d.some(m => /nmae/.test(m))).toBe(true);
    });

    it('with no `as Type` the data is unknown, not any', () => {
        const d = diagnose("@fetch user: 'GET /u';\nfunction f() { return user.data().name; }");
        expect(d.length, 'an untyped @fetch still let anything through').toBeGreaterThan(0);
    });
});

describe('a typed @fetch in the template', () => {
    it('a misspelt field is an error there too', () => {
        const d = diagnose(USER, '<p>{{ user.data()?.nmae }}</p>');
        expect(d.some(m => /nmae/.test(m)), JSON.stringify(d)).toBe(true);
    });

    it('control — the right field is not', () => {
        expect(diagnose(USER, '<p>{{ user.data()?.name }}</p>')).toEqual([]);
    });

    it('the example data.md teaches is clean', () => {
        // The page's own lines, so the documentation cannot teach code the editor marks red.
        const page = readFileSync(join(ROOT, 'packages/site/content/docs/data.md'), 'utf-8').replace(/\r\n/g, '\n');
        const block = /```pdx\n(@if \(users\.loading[\s\S]*?)```/.exec(page);
        expect(block, 'the @fetch example is no longer in data.md').not.toBeNull();
        const script = "interface User { id: number; name: string }\n@fetch users: 'GET /api/users' as User[];\n";
        expect(diagnose(script, block![1])).toEqual([]);
    });
});

describe('pdx check --types', () => {
    it('reports the misspelt field on the .pdx line', () => {
        const content = `<template><p>{{ user.data()?.nmae }}</p></template>\n<script setup>\n${USER}</script>\n`;
        const path = join(ROOT, 'fetch-types-probe.pdx');
        const errors = typecheckPdx(ROOT, [{ path, content }]).get(path) ?? [];
        expect(errors.some(e => /nmae/.test(e.message) && e.line === 1), JSON.stringify(errors)).toBe(true);
    });
});

describe('PdxResource follows core\'s Resource', () => {
    /** The member names of `interface <name><T> { … }` in a source text. */
    function members(source: string, name: string): string[] {
        const start = source.indexOf(`interface ${name}<T>`);
        expect(start, `interface ${name}<T> not found`).toBeGreaterThanOrEqual(0);
        const body = source.slice(source.indexOf('{', start) + 1, source.indexOf('\n}', start));
        // Match: `readonly data:` / `refetch(): …` at the start of a member line.   Groups: [1]=name
        return [...body.matchAll(/^\s*(?:readonly\s+)?(\w+)\s*[(:<]/gm)].map(m => m[1]);
    }

    it('every member of Resource<T> is declared for the editor', () => {
        const core = members(readFileSync(join(ROOT, 'packages/core/src/reactivity/resource.ts'), 'utf-8'), 'Resource');
        const editor = members(readFileSync(join(ROOT, 'packages/lsp/src/utils/pdx-globals.ts'), 'utf-8'), 'PdxResource');
        expect(core.length).toBeGreaterThan(5);
        expect(core.filter(m => !editor.includes(m)), 'members of Resource the editor does not know').toEqual([]);
    });
});
