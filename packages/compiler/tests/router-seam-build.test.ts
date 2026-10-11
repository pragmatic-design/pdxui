// The seam, asserted on a real build's output rather than on the intent.
//
// Every other test of the seam checks a hook in isolation: `load` answers for `active.ts` with the
// table installed in front of it, no file in the router package bypasses it. None of them proves
// the thing that matters, which is that after Vite has resolved, bundled and tree-shaken an app, the
// bundle carries the app's route table, installs it, and contains ONE router (#108).
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

    it('ships the route table, compiled from the app\'s own @page declarations', () => {
        expect(code, 'the production bundle carries no route table').toContain('path: "/about"');
        expect(code).toContain('path: "/admin"');
    });

    it('installs it through the seam', () => {
        expect(code, 'the table is in the bundle but nothing installs it').toMatch(/installRouteTable\w*\(/);
    });

    it('ships one router', () => {
        // A string the router's navigation contains once. A string literal rather than an
        // identifier, because a minifier renames identifiers — this has to keep meaning something
        // when `minify` is on. Two would be two routers in one bundle: one navigates, the other is read.
        expect(code.split('Redirect loop detected').length - 1, 'not exactly one router in the bundle').toBe(1);
    });

    it('carries no path of the machine that built it', () => {
        // The table once named each lazy page by `file`, the absolute path the build imported it
        // from, beside the `import()` that already loads it: every app shipped its build machine's
        // folders.
        const slashed = root.replace(/\\/g, '/');
        expect(code.includes(slashed), `the bundle names ${slashed}`).toBe(false);
        expect(code.includes(root), `the bundle names ${root}`).toBe(false);
    });

    it('carries the guard the app declared, as data the router reads', () => {
        expect(code).toContain('guard: "admin.access"');
    });
});
