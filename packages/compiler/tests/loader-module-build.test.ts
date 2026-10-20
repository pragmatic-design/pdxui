// A `@loader` ships in a chunk of its own, apart from its page's (#119) — asserted on a real build.
//
// `loader-module.test.ts` checks the module the plugin writes; this checks that Vite resolves the
// id the route table imports, and that the bundler gives it a chunk the router can fetch beside the
// page's instead of after it. A loader that went back into the page's chunk would pass every unit
// test and still make a navigation wait for the page's code before its data.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pdx } from '../src/plugin';

const PAGE = `<template><div class="rows">{{ title }}</div></template>
<script>
@page '/rows';
@loader rowData: loadRows;
import { rowsFrom } from './api';
let title = $signal('Rows');
async function loadRows(): Promise<number[]> {
  return rowsFrom('/api/rows-marker');
}
</script>`;

const API = `export function rowsFrom(url) { return fetch(url).then(r => r.json()); }\n`;

const ENTRY = `import { navigate } from '@pdxui/router';\nnavigate('/rows');\n`;

let root: string;
let chunks: { fileName: string; code: string }[] = [];

beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'pdx-loader-build-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'rows.pdx'), PAGE, 'utf-8');
    writeFileSync(join(root, 'src', 'api.js'), API, 'utf-8');
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
    const output = (Array.isArray(result) ? result[0] : result) as { output: { type: string; fileName: string; code?: string }[] };
    chunks = output.output.filter(o => o.type === 'chunk').map(o => ({ fileName: o.fileName, code: o.code ?? '' }));
}, 120_000);

afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
});

describe('a production build with a @loader', () => {
    it('built something', () => {
        expect(chunks.length, 'no chunk was built').toBeGreaterThan(1);
    });

    it('puts the loader in a chunk without its page', () => {
        const withLoader = chunks.filter(c => c.code.includes('/api/rows-marker'));
        expect(withLoader.length, 'the loader is not in the bundle').toBeGreaterThan(0);
        const own = withLoader.find(c => !c.code.includes("component('app-rows'") && !c.code.includes('component("app-rows"'));
        expect(own, `every chunk with the loader also holds the page: ${withLoader.map(c => c.fileName).join(', ')}`).toBeDefined();
        // Its types are gone, and its import came with it.
        expect(own!.code).not.toContain('Promise<number[]>');
        expect(own!.code).toMatch(/rowsFrom/);
    });

    it('the page still has its own chunk', () => {
        expect(chunks.some(c => c.code.includes('app-rows') && c.code.includes('component(')),
            'the page component is not in the bundle').toBe(true);
    });

    it('carries no path of the machine that built it', () => {
        // The loader's module names its imports by absolute path, from the page's folder; the bundle
        // must carry the chunks they became, not the paths.
        const all = chunks.map(c => c.code).join('\n');
        expect(all.includes(root.replace(/\\/g, '/')), 'the bundle names the build folder').toBe(false);
        expect(all.includes(root), 'the bundle names the build folder').toBe(false);
    });

    it('resolves the id the route table imports', () => {
        expect(chunks.some(c => c.code.includes('virtual:pdx-loader/')),
            'an import of the loader module was left unresolved').toBe(false);
    });
});
