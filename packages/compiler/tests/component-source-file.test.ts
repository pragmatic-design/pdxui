// A development build registers each component with its .pdx, so a runtime error can name it; a
// production build does not carry it.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { compile, pdx } from '../src/plugin';

const NEW_MODE = '<template><button @click="count++">{{ count }}</button></template>\n<script setup>\nlet count = $signal(0);\n</script>\n';
const NO_SCRIPT = '<template><p>static</p></template>\n';
const FILE = 'src/pages/login.pdx';

describe('compile({ sourceFile })', () => {
    it('a development build passes the file to component()', () => {
        const { code } = compile(NEW_MODE, '/app/src/pages/login.pdx', [], undefined, { sourceFile: FILE });
        expect(code).toContain(`file: "${FILE}"`);
    });

    it('so does a component with no script, which takes the other code path', () => {
        const { code } = compile(NO_SCRIPT, '/app/src/pages/login.pdx', [], undefined, { sourceFile: FILE });
        expect(code).toContain(`file: "${FILE}"`);
    });

    it('a production build does not, even when given one', () => {
        const { code } = compile(NEW_MODE, '/app/src/pages/login.pdx', [], undefined, { sourceFile: FILE, production: true, minify: true });
        expect(code).not.toContain(FILE);
    });

    it('without one, the module is as it was', () => {
        const { code } = compile(NEW_MODE, '/app/src/pages/login.pdx');
        expect(code).not.toMatch(/\bfile:/);
    });
});

describe('the Vite plugin', () => {
    let root: string | null = null;
    afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); root = null; });

    function transformIn(command: 'serve' | 'build'): string {
        root = mkdtempSync(join(tmpdir(), 'pdx-file-'));
        mkdirSync(join(root, 'src', 'pages'), { recursive: true });
        const plugin = pdx();
        (plugin.config as (c: object, e: { command: string }) => void)({}, { command });
        (plugin.configResolved as (c: { root: string; server: { fs: { allow: string[] } } }) => void)(
            { root, server: { fs: { allow: [] } } });
        const transform = plugin.transform as (this: { error(m: string): never }, code: string, id: string) => { code: string };
        const id = join(root, 'src', 'pages', 'login.pdx').replace(/\\/g, '/');
        return transform.call({ error(m: string): never { throw new Error(m); } }, NEW_MODE, id).code;
    }

    it('dev server: the file relative to the Vite root, with forward slashes', () => {
        expect(transformIn('serve')).toContain(`file: "${FILE}"`);
    });

    it('build: no file', () => {
        expect(transformIn('build')).not.toContain('login.pdx"');
    });
});
