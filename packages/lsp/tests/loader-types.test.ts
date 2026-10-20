// `@loader user: loadUser;` gives the editor `user` typed from what the loader resolves to (#506).
//
// The emitted module is erased of types, so the projection the editor and `pdx check --types` read
// is where the name gets its type: the router's LoaderSource of `Awaited<ReturnType<typeof loadUser>>`.
// A misspelt field of the loader's result is an error in the script and in the template.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { parseTemplate } from '@pdxui/compiler';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';

const ROOT = join(__dirname, '..', '..', '..');
const URI = pathToFileURL(join(ROOT, 'x.pdx')).href;
const svc = new PdxTsService(ROOT);

/** The TS diagnostics of a .pdx made of `script` and `template`, as the server computes them. */
function diagnose(script: string, template = ''): string[] {
    const source = `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
    const scriptStart = source.indexOf('<script>\n') + '<script>\n'.length;
    const vf = buildVirtualFile(script, scriptStart, template ? parseTemplate(template, 1) : [], template || null, template ? '<template>'.length : -1);
    return getTsDiagnostics(svc, URI, vf, source).map(d => d.message.split('\n')[0]);
}

const PAGE = [
    "@page '/users/:id(number)';",
    '@loader user: loadUser;',
    'async function loadUser() { return { name: "Ada", id: 7 }; }',
    '',
].join('\n');

// The language service's cold start, paid here with a timeout of its own.
beforeAll(() => { diagnose('let x = $signal(1);', '<p>{{ x }}</p>'); }, 60_000);

describe('a named @loader in the script', () => {
    it('a misspelt field of what the loader returns is an error', () => {
        const d = diagnose(PAGE + 'function f() { return user.data()?.nmae; }');
        expect(d.some(m => /nmae/.test(m)), `no error for user.data()?.nmae — ${JSON.stringify(d)}`).toBe(true);
    });

    it('control — the right field is not, and the source has the async vocabulary', () => {
        const uses = 'function f() { user.data()?.name; user.state() === "pending"; user.error()?.message; user.pending(); user.stale(); }';
        expect(diagnose(PAGE + uses)).toEqual([]);
    });
});

describe('a named @loader in the template', () => {
    it('a misspelt field is an error there too', () => {
        const d = diagnose(PAGE, '<p>{{ user.data()?.nmae }}</p>');
        expect(d.some(m => /nmae/.test(m)), JSON.stringify(d)).toBe(true);
    });

    it('control — the right field is not, and @await reads the data', () => {
        expect(diagnose(PAGE, '<p>{{ user.data()?.name }}</p>@await (user as u) { <p>{{ u.name }}</p> }')).toEqual([]);
    });
});

describe("PdxLoaderSource follows the router's LoaderSource", () => {
    /** The member names of `interface <name><T…> { … }` in a source text. */
    function members(source: string, name: string): string[] {
        const start = source.indexOf(`interface ${name}<T`);
        expect(start, `interface ${name}<T> not found`).toBeGreaterThanOrEqual(0);
        // Neither interface holds a brace of its own: the first `}` closes it.
        const body = source.slice(source.indexOf('{', start) + 1, source.indexOf('}', start));
        // Match: `readonly data:` at the start of a member line.   Groups: [1]=name
        return [...body.matchAll(/^\s*(?:readonly\s+)?(\w+)\s*[(:<]/gm)].map(m => m[1]);
    }

    it('every member of LoaderSource<T> is declared for the editor', () => {
        const router = members(readFileSync(join(ROOT, 'packages/router/src/state.ts'), 'utf-8'), 'LoaderSource');
        const editor = members(readFileSync(join(ROOT, 'packages/lsp/src/utils/pdx-globals.ts'), 'utf-8'), 'PdxLoaderSource');
        expect(router).toEqual(['data', 'state', 'error', 'pending', 'stale']);
        expect(router.filter(m => !editor.includes(m)), 'members of LoaderSource the editor does not know').toEqual([]);
    });
});
