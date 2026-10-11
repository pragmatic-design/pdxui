// The `pdx-lsp` command an editor launches (`pdx-lsp --stdio`).
//
// It pointed at `dist/server.cjs`, a build output with no shebang: on Linux and macOS the shell ran
// the JavaScript as a shell script, and on a fresh `pnpm install` — before the build — the file did
// not exist, so pnpm warned «Failed to create bin … pdx-lsp». A committed launcher with a shebang
// exists at install and runs everywhere.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PKG_DIR = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf-8'));
const target: string = pkg.bin['pdx-lsp'];

describe('the pdx-lsp bin', () => {
    it('is a committed file, not a build output, so it exists right after install', () => {
        expect(target.replace(/^\.\//, '').startsWith('dist/')).toBe(false);
        expect(existsSync(join(PKG_DIR, target))).toBe(true);
    });

    it('starts with a node shebang, so it runs on Linux and macOS', () => {
        expect(readFileSync(join(PKG_DIR, target), 'utf-8').startsWith('#!/usr/bin/env node\n')).toBe(true);
    });

    it('loads the bundled server', () => {
        expect(readFileSync(join(PKG_DIR, target), 'utf-8')).toMatch(/require\(['"]\.\.\/dist\/server\.cjs['"]\)/);
    });

    it('is published', () => {
        const dir = target.replace(/^\.\//, '').split('/')[0];
        expect(pkg.files).toContain(dir);
    });
});
