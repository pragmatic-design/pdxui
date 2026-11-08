// A test that builds in-process leaves its project removable, without a warm-up of its own (#923).
//
// esbuild fixes the directory of its service process when its module is first evaluated, and keeps that
// service for the life of the process. `pdx build` imports Vite, and through it esbuild, only when it
// runs: a test file whose first build runs from inside its project would start the service there, and on
// Windows a process's working directory cannot be removed. `tests/setup-esbuild.ts`, a setup file of this
// package's vitest config, evaluates esbuild first, from the package. This file has no warm-up: it is the
// test that the setup file does that for every file. On Linux a working directory does not block a
// removal, so there the test passes either way.

import { describe, it, expect, vi } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import buildCmd from '../src/commands/build';
import { removeTree } from './remove-tree';

describe('an in-process pdx build', () => {
    it('leaves no process sitting in the project once it returns', async () => {
        const root = join(tmpdir(), `pdx-build-cwd-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
        mkdirSync(root, { recursive: true });
        writeFileSync(join(root, 'index.html'),
            '<!doctype html><html><body><script type="module" src="/main.js"></script></body></html>\n');
        writeFileSync(join(root, 'main.js'), 'document.body.append("x");\n');
        const prevCwd = process.cwd();
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        process.chdir(root);
        try {
            await (buildCmd as any).run({ args: { standalone: false, minify: true } });
        } finally {
            process.chdir(prevCwd);
            exitSpy.mockRestore();
        }
        expect(existsSync(join(root, 'dist', 'index.html'))).toBe(true);
        // Throws, naming the holder, if a process sits in the project.
        removeTree(root);
        expect(existsSync(root)).toBe(false);
    }, 60_000);
});
