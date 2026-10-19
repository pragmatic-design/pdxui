// The module of a `@loader` on a real dev server (#119): the route table imports it by the id the
// plugin resolves, and what the server answers is the loader with its import resolved from the page's
// folder. The build is `loader-module-build.test.ts`'s.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pdx } from '../src/plugin';

let root: string;
let server: ViteDevServer;

beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'pdx-loader-dev-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'rows.pdx'), [
        '<template><p>{{ title }}</p></template>',
        '<script>',
        "@page '/rows';",
        '@loader loadRows;',
        "import { rowsFrom } from './api';",
        "let title = $signal('Rows');",
        'async function loadRows(): Promise<number[]> { return rowsFrom("/api/rows"); }',
        '</script>',
    ].join('\n'));
    writeFileSync(join(root, 'src', 'api.js'), 'export function rowsFrom(url) { return fetch(url).then(r => r.json()); }\n');
    server = await createServer({
        root, configFile: false, logLevel: 'silent',
        plugins: [pdx({ devtools: false })],
        server: { port: 0, strictPort: false, hmr: false },
        optimizeDeps: { noDiscovery: true, include: [] },
    });
    await server.pluginContainer.buildStart({});
}, 60_000);

afterAll(async () => {
    await server?.close();
    rmSync(root, { recursive: true, force: true });
});

describe('a @loader through the dev server', () => {
    it('the route table imports the loader\'s module, and the server answers for it', async () => {
        const table = (await server.transformRequest('virtual:pdx-routes'))?.code ?? '';
        expect(table, 'the route table names no loader module').toMatch(/virtual:pdx-loader\/app-rows/);

        const loader = (await server.transformRequest('virtual:pdx-loader/app-rows'))?.code ?? '';
        expect(loader, 'the server returned no loader').toContain('async function loadRows()');
        expect(loader).not.toContain('Promise<number[]>');
        // Its relative import, resolved from the page's folder to the URL the server serves.
        expect(loader).toMatch(/from\s+["']\/src\/api\.js["']/);
        expect(loader).toMatch(/export default loadRows/);
    });
});
