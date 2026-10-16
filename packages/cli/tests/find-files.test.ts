// The CLI finds a project's files with Node's own fs.glob, not fast-glob (#442).
//
// fast-glob brought `braces` into the published CLI (fast-glob → micromatch → braces), and `braces`
// has a stack-exhaustion advisory with no patched release. fs.glob (stable since Node 22.17.0) is in
// Node, but it differs from fast-glob where the callers would notice: it yields directories too, and
// on Windows its paths use `\`. Each case below builds a project where that difference shows, and
// asks the three callers what they found.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { scanPdxFiles } from '../src/manifest/scanner';
import { scanUsedKeys, loadDictionaries } from '../src/i18n/keys';

let root: string;
const posix = (p: string) => p.replace(/\\/g, '/');

function put(path: string, content = ''): void {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
}

beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'pdx-glob-'));
    put('src/app.pdx', `<template>{{ $t('app.title') }}</template>`);
    put('src/pages/home.pdx');
    put('src/util.ts', `$t('util.label')`);
    put('src/view.tsx', `$t('view.label')`);
    put('src/types.d.ts', `$t('declared.only')`);
    // A directory named like a match: a folder, not a file to read.
    put('src/legacy.pdx/notes.txt');
    put('src/keys.ts/readme.md');
    put('node_modules/lib/x.pdx', `$t('dependency.key')`);
    put('dist/out.pdx');
    put('.cache/hidden.pdx');
    put('translations/en.json', '{"app":{"title":"Hi"}}');
    put('translations/template.json', '{}');
    put('translations/it.json/oops.txt');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('the CLI finds files with fs.glob', () => {
    it('scanPdxFiles: the .pdx files, not a directory named like one, with / in their paths', async () => {
        const files = await scanPdxFiles(root);
        expect(files.map(f => posix(f).slice(posix(root).length)).sort()).toEqual(['/src/app.pdx', '/src/pages/home.pdx']);
        for (const f of files) expect(f, 'a path the CLI reports keeps the separator fast-glob gave it').not.toContain('\\');
    });

    it('scanPdxFiles: the patterns it is given', async () => {
        const files = await scanPdxFiles(root, ['src/pages/**/*.pdx']);
        expect(files.map(f => f.slice(posix(root).length))).toEqual(['/src/pages/home.pdx']);
    });

    it('scanUsedKeys: .pdx, .ts and .tsx, leaving out declarations, dependencies and directories', async () => {
        const { keys } = await scanUsedKeys(root);
        expect([...keys.keys()].sort()).toEqual(['app.title', 'util.label', 'view.label']);
    });

    it('loadDictionaries: the dictionaries, not template.json and not a directory named like one', async () => {
        const { dictionaries, malformed } = await loadDictionaries(root);
        expect(dictionaries.map(d => d.locale)).toEqual(['en']);
        expect(posix(dictionaries[0].file)).toBe(`${posix(root)}/translations/en.json`);
        expect(dictionaries[0].file).not.toContain('\\');
        expect(malformed).toEqual([]);
    });

    it('the published CLI does not depend on fast-glob, and asks for the Node that has fs.glob', () => {
        const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as {
            dependencies?: Record<string, string>; engines?: Record<string, string>;
        };
        expect(Object.keys(pkg.dependencies ?? {})).not.toContain('fast-glob');
        expect(pkg.engines?.node).toBe('>=22.17.0');
    });
});
