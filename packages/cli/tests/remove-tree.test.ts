// A test's cleanup that still fails after its retries names the files that are held (#384).
//
// `pdx build`'s tests remove their project in `afterEach`, and on Windows that has failed now and then
// with EBUSY even after five retries. 200 attempts did not reproduce it, so the next failure has to
// bring its cause: removeTree tries to rename each file of the tree, and the one Windows refuses to
// rename is the one something holds. A lock cannot be made on demand on every platform the gate runs
// on, so the cases below hand removeTree a file system that refuses where they say.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeTree, type TreeFs } from './remove-tree';

const busy = (path: string) => Object.assign(new Error(`EBUSY: resource busy or locked, rmdir '${path}'`), { code: 'EBUSY' });

/** A tree of three files, where `held` (if any) refuses a rename and the removal fails. */
function fakeFs(held: string[], removable = held.length === 0) {
    const calls: string[] = [];
    const fs: TreeFs = {
        rm: (path) => { calls.push(`rm ${path}`); if (!removable) throw busy(path); },
        files: () => ['/p/dist/assets/app.js', '/p/dist/index.html', '/p/src/App.pdx'],
        rename: (from, to) => {
            calls.push(`rename ${from} -> ${to}`);
            if (held.includes(from)) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
        },
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

    it('when no file refuses, says the holder is a directory or outside the files', () => {
        const { fs } = fakeFs([], false);
        expect(() => removeTree('/p', fs)).toThrow(/held: no file refused a rename/);
    });
});
