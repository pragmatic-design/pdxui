// A .pdx whose script is typed is served as JavaScript by a real dev server.
//
// Vite's esbuild does not strip what the compiler leaves in a .pdx — its filter is
// `.ts`/`.tsx`/`.jsx` — so an interface, an `as` or a parameter annotation the compiler kept would
// reach the module the browser loads. Measured through `transformRequest`, as a test: the module the
// server answers with parses as JavaScript.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import ts from 'typescript';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pdx } from '../src/plugin';

let root: string;
let server: ViteDevServer;

beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'pdx-ts-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'typed.pdx'), [
        '<template><p>{{ n }}</p></template>',
        '<script setup>',
        "import type { Thing } from './thing';",
        'interface User { id: number }',
        'let n = $signal<number>(1);',
        'const o = {} as Record<string, string>;',
        'function f(a: string): string { return a; }',
        '</script>',
    ].join('\n'));
    server = await createServer({
        root, configFile: false, logLevel: 'silent',
        plugins: [pdx({ devtools: false })],
        server: { port: 0, strictPort: false, hmr: false },
        optimizeDeps: { noDiscovery: true, include: [] },
    });
}, 60_000);

afterAll(async () => {
    await server?.close();
    rmSync(root, { recursive: true, force: true });
});

describe('a typed .pdx through the dev server', () => {
    it('is served as JavaScript: no type syntax, and it parses as a JS module', async () => {
        const code = (await server.transformRequest('/src/typed.pdx'))?.code ?? '';
        expect(code, 'the server returned nothing').toContain('component(');
        expect(code).not.toMatch(/interface User|as Record|a: string|<number>|import type/);
        // And it parses: the module as the browser gets it, read by the TypeScript parser.
        const sf = ts.createSourceFile('typed.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        const syntax = (sf as unknown as { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
        expect(syntax.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
    });
});
