// A @store module served by the dev server prepares its own HMR (#1468).
//
// Re-executed after an edit, the module's createGlobalStore('name', …) found the name in the registry
// and returned the OLD store: the edited factory never ran, and the old effects kept running until a
// full reload. In dev the plugin puts `__pdx_store_hot('name', import.meta.hot)` before the call; core
// disposes the previous store there and carries its signals' values to the new one
// (core/tests/global-store-hmr.test.ts). Measured through `transformRequest`, as the browser gets it.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import ts from 'typescript';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pdx, compile } from '../src/plugin';

const STORE = ['<script>', '@store cart;', 'let items = $signal([] as string[]);', '</script>'].join('\n');

let root: string;
let server: ViteDevServer;

beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'pdx-store-hmr-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'cart.pdx'), STORE);
    writeFileSync(join(root, 'src', 'shop.pdx'), '<template><p>{{ cart.items.length }}</p></template>\n<script>\nconst cart = useCart();\n</script>');
    server = await createServer({
        root, configFile: false, logLevel: 'silent',
        plugins: [pdx({ devtools: false })],
        server: { port: 0, strictPort: false, hmr: false, fs: { allow: [root] } },
        optimizeDeps: { noDiscovery: true, include: [] },
    });
}, 60_000);

afterAll(async () => {
    await server?.close();
    rmSync(root, { recursive: true, force: true });
});

describe('a @store module through the dev server', () => {
    it('calls __pdx_store_hot with import.meta.hot before it creates its store, and parses', async () => {
        const code = (await server.transformRequest('/src/cart.pdx'))?.code ?? '';
        expect(code, 'the server returned nothing').toContain("createGlobalStore('cart'");
        const hot = code.indexOf("__pdx_store_hot('cart', import.meta.hot)");
        expect(hot, 'no HMR call for the store').toBeGreaterThan(-1);
        expect(hot).toBeLessThan(code.indexOf("createGlobalStore('cart'"));
        // Imported with the module's core names, wherever Vite resolves `@pdxui/core` to.
        expect(code).toMatch(/import \{[^}]*\b__pdx_store_hot\b[^}]*\} from /);
        const sf = ts.createSourceFile('cart.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        const syntax = (sf as unknown as { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
        expect(syntax.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
    });

    it('a component module gets its own HMR, not the store\'s', async () => {
        const code = (await server.transformRequest('/src/shop.pdx'))?.code ?? '';
        expect(code).toContain('__pdx_hmr_swap');
        expect(code).not.toContain('__pdx_store_hot');
    });
});

describe('outside the dev server', () => {
    it('compile() — a build — writes no HMR call', () => {
        expect(compile(STORE, 'cart.pdx', [], undefined, { production: true }).code).not.toContain('__pdx_store_hot');
        expect(compile(STORE, 'cart.pdx').code).not.toContain('__pdx_store_hot');
    });
});
