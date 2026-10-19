// A test's cleanup that still fails after its retries names the files that are held (#384).
//
// `pdx build`'s tests remove their project in `afterEach`, and on Windows that has failed now and then
// with EBUSY even after five retries. 200 attempts did not reproduce it, so the next failure has to
// bring its cause: removeTree tries to rename each file of the tree, and the one Windows refuses to
// rename is the one something holds. A lock cannot be made on demand on every platform the gate runs
// on, so the cases below hand removeTree a file system that refuses where they say.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { removeTree, type TreeFs } from './remove-tree';

const busy = (path: string) => Object.assign(new Error(`EBUSY: resource busy or locked, rmdir '${path}'`), { code: 'EBUSY' });

/**
 * A tree of three files in three directories, where `held` (if any) refuses a rename and the removal
 * fails. `children` is what the process runs beside it.
 */
function fakeFs(held: string[], removable = held.length === 0, children: string[] = []) {
    const calls: string[] = [];
    const fs: TreeFs = {
        rm: (path) => { calls.push(`rm ${path}`); if (!removable) throw busy(path); },
        files: () => ['/p/dist/assets/app.js', '/p/dist/index.html', '/p/src/App.pdx'],
        dirs: () => ['/p/dist/assets', '/p/dist', '/p/src', '/p'],
        rename: (from, to) => {
            calls.push(`rename ${from} -> ${to}`);
            if (held.includes(from)) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
        },
        children: () => children,
    };
    return { fs, calls };
}

describe('removeTree', () => {
    it('removes a real tree', () => {
        const root = mkdtempSync(join(tmpdir(), 'pdx-remove-'));
        mkdirSync(join(root, 'a', 'b'), { recursive: true });
        writeFileSync(join(root, 'a', 'b', 'c.txt'), 'x');
        removeTree(root);
        expect(existsSync(root)).toBe(false);
    });

    it('with nothing held, removes once and renames nothing', () => {
        const { fs, calls } = fakeFs([]);
        removeTree('/p', fs);
        expect(calls).toEqual(['rm /p']);
    });

    it('when the removal fails, names the file that refuses a rename, with the original error', () => {
        const { fs } = fakeFs(['/p/dist/assets/app.js']);
        let error: Error | undefined;
        try { removeTree('/p', fs); } catch (e) { error = e as Error; }
        expect(error?.message).toContain("EBUSY: resource busy or locked, rmdir '/p'");
        expect(error?.message).toContain('held: dist/assets/app.js (EBUSY)');
        expect(error?.message).not.toContain('index.html');
        expect((error as Error & { code?: string }).code).toBe('EBUSY');
    });

    it('puts back every file it could rename', () => {
        const { fs, calls } = fakeFs(['/p/dist/assets/app.js']);
        expect(() => removeTree('/p', fs)).toThrow();
        const renames = calls.filter(c => c.startsWith('rename'));
        expect(renames).toContain('rename /p/dist/index.html -> /p/dist/index.html.pdx-probe');
        expect(renames).toContain('rename /p/dist/index.html.pdx-probe -> /p/dist/index.html');
    });

    it('when no file refuses, says the holder is outside the tree', () => {
        const { fs } = fakeFs([], false);
        expect(() => removeTree('/p', fs)).toThrow(/held: nothing in the tree refused a rename/);
    });

    // #543: the gate's failure said no file was held. The directories are tried too, the root last.
    it('names the directory that refuses a rename, the root included', () => {
        const { fs, calls } = fakeFs(['/p/dist', '/p'], false);
        let error: Error | undefined;
        try { removeTree('/p', fs); } catch (e) { error = e as Error; }
        expect(error?.message).toContain('held: dist/ (EBUSY), the root (EBUSY)');
        // The control: a directory that renames is put back and not named.
        expect(calls).toContain('rename /p/src.pdx-probe -> /p/src');
        expect(error?.message).not.toContain('src/');
    });

    it('names the child processes the test process runs, which may hold the tree as their directory', () => {
        const { fs } = fakeFs(['/p'], false, ['38520 esbuild.exe']);
        expect(() => removeTree('/p', fs)).toThrow(/children: 38520 esbuild\.exe/);
    });

    it('says so when it has no child process', () => {
        const { fs } = fakeFs(['/p'], false);
        expect(() => removeTree('/p', fs)).toThrow(/children: none/);
    });

    // A process whose working directory is in the tree: what esbuild's service does when it is first
    // loaded from inside a test's project. Windows refuses to remove that directory; Linux does not.
    it.runIf(process.platform === 'win32')('on Windows, names the directory a process sits in, and the process', async () => {
        const root = mkdtempSync(join(tmpdir(), 'pdx-remove-held-'));
        mkdirSync(join(root, 'dist'), { recursive: true });
        // It says when it is running, in its directory: `spawn` fires before the process has started.
        const child = spawn(process.execPath, ['-e', "process.stdout.write('ready'); setInterval(() => {}, 1000)"], { cwd: join(root, 'dist'), stdio: ['ignore', 'pipe', 'ignore'] });
        await new Promise<void>((resolve) => child.stdout!.once('data', () => resolve()));
        try {
            let error: Error | undefined;
            try { removeTree(root); } catch (e) { error = e as Error; }
            expect(error?.message).toContain('held: dist/ (EBUSY)');
            expect(error?.message).toContain(`${child.pid} node.exe`);
        } finally {
            child.kill();
            await new Promise((resolve) => child.once('exit', resolve));
            rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }, 30_000);
});
