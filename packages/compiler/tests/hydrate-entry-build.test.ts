// `pdx({ hydrate: true })` on a real build (#160, part 5b): the page installs hydration — and, with
// routes, the outlet's adoption — before the app's own code runs, and every .pdx is compiled to take
// over a pre-rendered markup. Without the option, the bundle carries none of it.
//
// The order matters: a component whose definition ran before `installHydration()` would render over
// the server's markup. Rollup writes the modules in the order they run, so the bundle's text says it.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pdx } from '../src/plugin';
import { HYDRATE_ENTRY_URL } from '../src/hydrate-entry';

const CARD = `<template><p class="card">{{ label }}</p></template>
<script>
@prop label: string = 'card';
</script>`;

const PAGE = `<template><app-card label="home"></app-card></template>
<script>
@page '/';
</script>`;

const INDEX = '<!doctype html><html><head><title>x</title></head><body><pdx-router-outlet></pdx-router-outlet>'
    + '<script type="module" src="/src/main.js"></script></body></html>';

const ENTRY = `import '@pdxui/router';\nimport './card.pdx';\nconsole.log('app entry ran');\n`;

interface Output { type: string; fileName: string; code?: string; source?: string | Uint8Array }

async function buildApp(hydrate: boolean): Promise<{ html: string; js: string; root: string }> {
    const root = mkdtempSync(join(tmpdir(), 'pdx-hydrate-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'index.html'), INDEX, 'utf-8');
    writeFileSync(join(root, 'src', 'main.js'), ENTRY, 'utf-8');
    writeFileSync(join(root, 'src', 'card.pdx'), CARD, 'utf-8');
    writeFileSync(join(root, 'src', 'home.pdx'), PAGE, 'utf-8');
    const result = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [pdx({ devtools: false, splash: false, hydrate })],
        build: { write: false, minify: false, modulePreload: false },
    });
    const output = ((Array.isArray(result) ? result[0] : result) as { output: Output[] }).output;
    const html = String(output.find((o) => o.fileName === 'index.html')?.source ?? '');
    const js = output.filter((o) => o.type === 'chunk').map((o) => o.code ?? '').join('\n');
    return { html, js, root };
}

let on: { html: string; js: string; root: string };
let off: { html: string; js: string; root: string };

beforeAll(async () => {
    on = await buildApp(true);
    off = await buildApp(false);
}, 180_000);

afterAll(() => {
    for (const b of [on, off]) if (b?.root) rmSync(b.root, { recursive: true, force: true });
});

describe('a build with hydrate', () => {
    it('built an app', () => {
        expect(on.js, 'the entry did not run into the bundle').toContain('app entry ran');
        expect(on.html).toContain('<script type="module"');
    });

    it('installs hydration and the outlet\'s adoption, bundled — no URL left for the browser to fetch', () => {
        expect(on.html.includes(HYDRATE_ENTRY_URL), 'the page still points at the plugin\'s module').toBe(false);
        expect(on.js).toMatch(/\binstallHydration\(\);/);
        expect(on.js).toMatch(/\binstallRouteAdoption\(\);/);
    });

    it('installs them before the app\'s own code runs', () => {
        const installed = on.js.search(/\binstallHydration\(\);/);
        expect(installed, 'not installed').toBeGreaterThan(-1);
        expect(installed, 'a component is defined before hydration is installed').toBeLessThan(on.js.indexOf('component("app-card"'));
        expect(installed).toBeLessThan(on.js.indexOf('app entry ran'));
    });

    it('compiles each .pdx to take over the markup it is handed', () => {
        expect(on.js).toContain('hydrationRange(');
    });
});

describe('a build without it', () => {
    it('carries none of it', () => {
        expect(off.js, 'the entry did not run into the bundle').toContain('app entry ran');
        expect(off.js).not.toMatch(/\binstallHydration\(/);
        expect(off.js).not.toMatch(/\binstallRouteAdoption\(/);
        expect(off.js).not.toContain('hydrationRange(');
    });
});
