// `pdx({ hydrate: true })` on a dev server (#160, part 5b): the page loads hydration first, from a
// module the server answers, and an app with no `@page` routes does not import the router for it.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pdx } from '../src/plugin';
import { HYDRATE_ENTRY_URL } from '../src/hydrate-entry';

const INDEX = '<!doctype html><html><head><title>x</title></head><body>'
    + '<script type="module" src="/src/main.js"></script></body></html>';

let root: string;
let server: ViteDevServer;

beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'pdx-hydrate-dev-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'index.html'), INDEX, 'utf-8');
    writeFileSync(join(root, 'src', 'main.js'), "import './card.pdx';\n", 'utf-8');
    writeFileSync(join(root, 'src', 'card.pdx'), '<template><p>{{ label }}</p></template>\n<script>\n@prop label: string = \'card\';\n</script>\n', 'utf-8');
    server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [pdx({ devtools: false, splash: false, hydrate: true })],
        server: { port: 0, strictPort: false, hmr: false },
        optimizeDeps: { noDiscovery: true, include: [] },
    });
    await server.listen();
}, 60_000);

afterAll(async () => {
    await server?.close();
    rmSync(root, { recursive: true, force: true });
});

describe('a dev server with hydrate', () => {
    it('puts hydration in the head, before the app\'s own script', async () => {
        const html = await server.transformIndexHtml('/', INDEX);
        const at = html.indexOf(HYDRATE_ENTRY_URL);
        expect(at, 'the page does not load hydration').toBeGreaterThan(-1);
        expect(at).toBeLessThan(html.indexOf('</head>'));
        expect(at).toBeLessThan(html.indexOf('/src/main.js'));
    });

    it('serves the module the page points at, with its imports resolved', async () => {
        const out = await server.transformRequest(HYDRATE_ENTRY_URL);
        const code = out?.code ?? '';
        expect(code).toContain('installHydration()');
        expect(code, 'a bare specifier left for the browser').not.toMatch(/from\s+["']@pdxui\//);
        expect(code, 'an app with no routes imports the router for nothing').not.toContain('installRouteAdoption');
    });

    it('compiles each .pdx to take over the markup it is handed, as a build does', async () => {
        const out = await server.transformRequest('/src/card.pdx');
        expect(out?.code ?? '').toContain('hydrationRange(');
    });
});
