// A dev server whose root is not the process's cwd serves the app it was pointed at.
//
// `vite --root app`, a task runner that starts Vite from the repo root, and the `createServer` API
// all run with cwd ≠ root. An `allow` a plugin provides REPLACES Vite's default (the workspace root
// of `root`), so the plugin's `server.fs.allow` must include the root, not `process.cwd()`: otherwise
// the app's own directory is not allowed, and every request fails with "Failed to load url
// /src/main.js … Does the file exist?". `buildStart` scans project components from the root too, and
// `transform` judges `<template src>` against the root as the project root.
//
// An app started with `npx vite` from its own directory never shows it. This suite
// runs with cwd = packages/compiler and a root in the OS temp directory, outside it.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { pdx } from '../src/plugin';

let root: string;
let server: ViteDevServer;

beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'pdx-root-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'index.html'), '<!doctype html><script type="module" src="/src/main.js"></script>');
    writeFileSync(join(root, 'src', 'main.js'), "import './app.pdx';\n");
    // A component that exists when the server starts, and a page that uses its tag without importing it.
    writeFileSync(join(root, 'src', 'root-card.pdx'), '<template>\n  <em>a card</em>\n</template>\n');
    writeFileSync(join(root, 'src', 'app.pdx'), '<template>\n  <pdx-root-card></pdx-root-card>\n</template>\n');
    // A template in its own file, inside the root.
    writeFileSync(join(root, 'src', 'framed.pdx'), '<template src="./framed.html"></template>\n');
    writeFileSync(join(root, 'src', 'framed.html'), '<section>framed by an external template</section>\n');

    server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [pdx({ devtools: false })],
        server: { port: 0, strictPort: false, hmr: false },
        optimizeDeps: { noDiscovery: true, include: [] },
    });
    await server.listen();   // buildStart runs here
}, 60_000);

afterAll(async () => {
    await server?.close();
    rmSync(root, { recursive: true, force: true });
});

describe('a dev server whose root is not the cwd', () => {
    it('precondition: the root is outside the cwd', () => {
        const rel = relative(process.cwd(), root);
        expect(rel.startsWith('..') || isAbsolute(rel), 'the root sits inside the cwd: the case measures nothing').toBe(true);
    });

    it('loads the app\'s own module', async () => {
        const out = await server.transformRequest('/src/main.js');
        expect(out?.code ?? '').toContain('app.pdx');
    });

    it('keeps what Vite itself allows — the root — next to the @pdxui packages', () => {
        const allow = server.config.server.fs.allow.map((d) => d.replace(/\\/g, '/').toLowerCase());
        const rootPath = root.replace(/\\/g, '/').toLowerCase();
        expect(allow.some((d) => rootPath === d || rootPath.startsWith(d + '/')),
            `the root is under none of the ${allow.length} allowed directories`).toBe(true);
        expect(allow.some((d) => d.endsWith('/packages/core') || d.includes('/packages/core/')),
            'the @pdxui packages are no longer allowed').toBe(true);
    });

    it('auto-imports a component that existed when the server started', async () => {
        const out = await server.transformRequest('/src/app.pdx');
        expect(out?.code ?? '', 'the page uses <pdx-root-card> and does not import it').toMatch(/import ["'][^"']*\/root-card\.pdx(\?[^"']*)?["']/);
    });

    it('reads a <template src> that lies inside the root', async () => {
        const out = await server.transformRequest('/src/framed.pdx');
        expect(out?.code ?? '').toContain('framed by an external template');
    });
});
