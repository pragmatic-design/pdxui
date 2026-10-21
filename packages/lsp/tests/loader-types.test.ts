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
function diagnoseFull(script: string, template = '') {
    const source = `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
    const scriptStart = source.indexOf('<script>\n') + '<script>\n'.length;
    const vf = buildVirtualFile(script, scriptStart, template ? parseTemplate(template, 1) : [], template || null, template ? '<template>'.length : -1);
    return { source, diagnostics: getTsDiagnostics(svc, URI, vf, source) };
}
function diagnose(script: string, template = ''): string[] {
    return diagnoseFull(script, template).diagnostics.map(d => d.message.split('\n')[0]);
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

// The loader's context typed from the page's pattern (#564): `:id(number)` is a number, as the router
// coerces it (#505), every other param a string, and a param the pattern does not declare is no param.
describe("an unannotated loader's params, typed from the pattern", () => {
    const LOADER = (body: string) => [
        "@page '/users/:id(number)/:tab';",
        '@loader user: loadUser;',
        `async function loadUser({ params }) { ${body} return 1; }`,
        '',
    ].join('\n');

    it('a number param read as a string is an error', () => {
        const d = diagnose(LOADER('params.id.toUpperCase();'));
        expect(d.some(m => /toUpperCase/.test(m)), JSON.stringify(d)).toBe(true);
    });

    it('a param the pattern does not declare is an error', () => {
        const d = diagnose(LOADER('params.nmae;'));
        expect(d.some(m => /nmae/.test(m)), JSON.stringify(d)).toBe(true);
    });

    it('control — the number param as a number, the other as a string, the query and the signal', () => {
        expect(diagnose(LOADER('params.id.toFixed(); params.tab.toUpperCase();'))).toEqual([]);
    });

    it('the same for a loader written as a const arrow', () => {
        const arrow = (body: string) => [
            "@page '/users/:id(number)';",
            '@loader user: loadUser;',
            `const loadUser = async ({ params, signal }) => { ${body} return 1; };`,
            '',
        ].join('\n');
        expect(diagnose(arrow('params.id.toUpperCase();')).some(m => /toUpperCase/.test(m))).toBe(true);
        expect(diagnose(arrow('params.id.toFixed(); signal.aborted;'))).toEqual([]);
    });

    it('the error is where it is written: the inserted type moves no position the editor shows', () => {
        const { source, diagnostics } = diagnoseFull(LOADER('params.id.toUpperCase();'));
        const d = diagnostics.find(x => /toUpperCase/.test(x.message));
        expect(d, 'no diagnostic').toBeDefined();
        const lines = source.split('\n');
        const line = lines.findIndex(l => l.includes('toUpperCase'));
        expect(d!.range.start.line).toBe(line);
        expect(d!.range.start.character).toBe(lines[line].indexOf('toUpperCase'));
    });

    it('and what comes after it, the template included, still maps', () => {
        const { source, diagnostics } = diagnoseFull(LOADER(''), '<p>{{ user.data()?.toFixed().nmae }}</p>');
        const d = diagnostics.find(x => /nmae/.test(x.message));
        expect(d, JSON.stringify(diagnostics.map(x => x.message))).toBeDefined();
        expect(d!.range.start.line).toBe(0);
        expect(d!.range.start.character).toBe(source.indexOf('nmae'));
    });

    it('control — a parameter the author annotated is left as written', () => {
        const annotated = [
            "@page '/users/:id(number)';",
            '@loader user: loadUser;',
            'async function loadUser({ params }: { params: { id: string } }) { params.id.toUpperCase(); return 1; }',
            '',
        ].join('\n');
        expect(diagnose(annotated)).toEqual([]);
    });
});

describe("PdxLoaderContext follows the router's LoaderContext", () => {
    it('every member of LoaderContext<P> is declared for the editor', () => {
        const body = (source: string, name: string) => {
            const start = source.indexOf(`interface ${name}<`);
            expect(start, `interface ${name}<…> not found`).toBeGreaterThanOrEqual(0);
            return [...source.slice(source.indexOf('{', start) + 1, source.indexOf('}', start)).matchAll(/^\s*(\w+)\s*:/gm)].map(m => m[1]);
        };
        const router = body(readFileSync(join(ROOT, 'packages/router/src/types.ts'), 'utf-8'), 'LoaderContext');
        const editor = body(readFileSync(join(ROOT, 'packages/lsp/src/utils/pdx-globals.ts'), 'utf-8'), 'PdxLoaderContext');
        expect(router).toEqual(['params', 'query', 'signal']);
        expect(editor).toEqual(router);
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
