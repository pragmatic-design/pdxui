// The Vite plugin compiles a module Vite loads for the server with `ssr` (#160): its render returns
// html``, which core renders to a string, and it carries no hot-replacement code; the client's copy of
// the same file is compiled as before. What the server's render writes is measured in core
// (render-string-pdx.test.ts), where it runs.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pdx } from '../src/plugin';

const SOURCE = '<template><button @click="count++">{{ count }}</button></template>\n<script>\nlet count = $signal(0);\n</script>\n';

describe('the Vite plugin and a module loaded for the server', () => {
    let root: string | null = null;
    afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); root = null; });

    /** The plugin's transform of one .pdx, in a dev server, with the options Vite passes. */
    function transformIn(options?: { ssr?: boolean }): string {
        root = mkdtempSync(join(tmpdir(), 'pdx-ssr-'));
        mkdirSync(join(root, 'src', 'pages'), { recursive: true });
        const [plugin] = pdx();
        (plugin.config as (c: object, e: { command: string }) => void)({}, { command: 'serve' });
        (plugin.configResolved as (c: { root: string; server: { fs: { allow: string[] } } }) => void)(
            { root, server: { fs: { allow: [] } } });
        const transform = plugin.transform as (this: { error(m: string): never }, code: string, id: string, options?: { ssr?: boolean }) => { code: string };
        const id = join(root, 'src', 'pages', 'counter.pdx').replace(/\\/g, '/');
        return transform.call({ error(m: string): never { throw new Error(m); } }, SOURCE, id, options).code;
    }

    it('with ssr: the render returns html``, with no listener and no hot replacement', () => {
        const code = transformIn({ ssr: true });
        expect(code).toMatch(/return html`<button>\$\{/);
        expect(code).not.toContain('addEventListener');
        expect(code).not.toContain('staticBlock');
        expect(code).not.toContain('import.meta.hot');
    });

    it('without it: the client\'s module, as before', () => {
        const code = transformIn();
        expect(code).toContain('staticBlock');
        expect(code).toContain('import.meta.hot');
        expect(code).not.toMatch(/return html`/);
    });
});
