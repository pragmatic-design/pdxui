// The server the VS Code extension ships — `packages/vscode-pdx/server/server.cjs`, built by the
// extension's own script — answers over stdio. The other stdio tests bundle the source
// themselves; this one runs what the .vsix would contain, so a packaging step that breaks the
// server, or that produces none, is red here.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pathToFileURL } from 'url';
import { startServer, type StdioServer } from './stdio-harness';

const EXT = join(__dirname, '..', '..', 'vscode-pdx');
const SHIPPED = join(EXT, 'server', 'server.cjs');

const PAGE = '<template>\n<pdx-button ></pdx-button>\n<p>{{ missing }}</p>\n</template>\n<script setup>\nlet count = $signal(0);\n</script>\n';

let root: string;
let server: StdioServer;

beforeAll(async () => {
    execFileSync(process.execPath, [join(EXT, 'scripts', 'bundle-server.mjs')], { stdio: 'pipe' });
    root = join(tmpdir(), `pdx-bundled-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app' }));
    server = await startServer(root, undefined, SHIPPED);
}, 120_000);

afterAll(() => {
    server?.stop();
    if (root) rmSync(root, { recursive: true, force: true });
});

describe('the bundled server', () => {
    it('is the file the extension script produced', () => {
        expect(existsSync(SHIPPED)).toBe(true);
    });

    it('publishes diagnostics for an opened .pdx', async () => {
        const uri = pathToFileURL(join(root, 'src', 'page.pdx')).href;
        const diags = await server.openAndDiagnose(uri, PAGE);
        expect(diags.map(d => d.message).join('\n')).toContain('missing');
    });

    it('completes and hovers', async () => {
        const uri = pathToFileURL(join(root, 'src', 'page.pdx')).href;
        const items = await server.conn.sendRequest('textDocument/completion', { textDocument: { uri }, position: { line: 1, character: 12 } }) as
            { label: string }[] | { items: { label: string }[] };
        const labels = (Array.isArray(items) ? items : items.items).map(i => i.label);
        expect(labels.length, 'no completion inside <pdx-button >').toBeGreaterThan(0);

        const hover = await server.conn.sendRequest('textDocument/hover', { textDocument: { uri }, position: { line: 5, character: 14 } }) as
            { contents: { value: string } } | null;
        expect(hover?.contents.value).toContain('$signal');
    });
});
