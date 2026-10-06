// The seam, asserted on a real build's output rather than on the intent.
//
// Every other test of the seam checks a hook in isolation: `load` answers for `active.ts`, the
// generated module exports the right names, no file in the router package bypasses it. None of them
// proves the thing that matters, which is that after Vite has resolved, bundled and tree-shaken an
// app, the code that ships is the generated router and the interpreted one is GONE. A seam that
// swaps the module but leaves the old one in the graph is two routers in one bundle.
//
// So this runs an actual production build of a minimal app and reads the chunk — on a fixture
// instead of on packages/site, so it can live in a suite.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pdx } from '../src/plugin';

const PAGE = `<template><div class="p">{{ title }}</div></template>
<script setup>
@page '/about';
let title = $signal('About');
</script>`;

const GUARDED = `<template><div class="a">{{ n }}</div></template>
<script setup>
@page '/admin';
@guard 'admin.access';
let n = $signal(1);
</script>`;

const ENTRY = `import { navigate, currentPath } from '@pdxui/router';
navigate('/about');
document.title = currentPath();
`;

let root: string;
let code: string;

beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'pdx-seam-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'about.pdx'), PAGE, 'utf-8');
    writeFileSync(join(root, 'src', 'admin.pdx'), GUARDED, 'utf-8');
    writeFileSync(join(root, 'src', 'main.js'), ENTRY, 'utf-8');

    const result = await build({
        root,
        logLevel: 'silent',
        plugins: [pdx({ devtools: false })],
        build: {
            write: false,
            minify: false,
            lib: { entry: join(root, 'src', 'main.js'), formats: ['es'], fileName: 'app' },
        },
    });
    const chunks = (Array.isArray(result) ? result[0] : result) as { output: { type: string; code?: string }[] };
    code = chunks.output.filter(o => o.type === 'chunk').map(o => o.code ?? '').join('\n');
}, 120_000);

afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
});

describe('what a production build actually ships', () => {
    it('built something', () => {
        // Without this every assertion below passes on an empty string.
        expect(code.length).toBeGreaterThan(1000);
    });

    it('ships the generated switch, compiled from the app\'s own @page declarations', () => {
        expect(code, 'the production bundle is not running the generated router')
            .toContain('case "/about"');
        expect(code).toContain('case "/admin"');
    });

    it('does not ship the interpreted router beside it', () => {
        // A string only `packages/router/src/runtime.ts` contains. Chosen over an identifier because
        // identifiers are renamed by a minifier and a string literal is not — this assertion has to
        // keep meaning something when `minify` is on.
        expect(code, 'both routers are in the bundle: one navigates, the other is read')
            .not.toContain('Refused a redirect from');
    });

    it('carries the guard the app declared, as data the generated matcher reads', () => {
        // A production build evaluates @guard with the generated matcher, not the dev one; otherwise
        // the generated router's guard is inert data nobody reads.
        expect(code).toContain('guard: "admin.access"');
    });
});
