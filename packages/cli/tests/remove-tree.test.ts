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
import { removeTree, type TreeFs, type Holder } from './remove-tree';

const busy = (path: string) => Object.assign(new Error(`EBUSY: resource busy or locked, rmdir '${path}'`), { code: 'EBUSY' });

/**
 * A tree of three files in three directories, where `held` (if any) refuses a rename and the removal
 * fails. `children` is what the process runs beside it.
 */
function fakeFs(held: string[], removable = held.length === 0, children: string[] = [], holders: Holder[] = []) {
    const calls: string[] = [];
    const warnings: string[] = [];
    const fs: TreeFs = {
        holders: (root, files) => { calls.push(`holders ${root} [${files.join(', ')}]`); return holders; },
        rm: (path) => { calls.push(`rm ${path}`); if (!removable) throw busy(path); },
        files: () => ['/p/dist/assets/app.js', '/p/dist/index.html', '/p/src/App.pdx'],
        dirs: () => ['/p/dist/assets', '/p/dist', '/p/src', '/p'],
        rename: (from, to) => {
            calls.push(`rename ${from} -> ${to}`);
            if (held.includes(from)) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
        },
        children: () => children,
        warn: (message) => { warnings.push(message); },
    };
    return { fs, calls, warnings };
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

    // #699: the gate's failure, where every file and directory, the root included, could be renamed: the
    // handle was outside this process tree, an on-access scan or the indexer. The test's subject is its
    // output, not its cleanup, so the leftover directory is a warning, with the error and the children.
    it('when nothing in the tree refuses a rename, warns with the directory and the error, and does not throw', () => {
        const { fs, warnings } = fakeFs([], false, ['23644 esbuild.exe']);
        expect(() => removeTree('/p', fs)).not.toThrow();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("left '/p' behind");
        expect(warnings[0]).toContain("EBUSY: resource busy or locked, rmdir '/p'");
        expect(warnings[0]).toContain('held: nothing in the tree refused a rename, so the holder is outside it');
        expect(warnings[0]).toContain('children: 23644 esbuild.exe');
    });

    it('control: a held file still throws, and warns nothing', () => {
        const { fs, warnings } = fakeFs(['/p/dist/index.html'], false, ['23644 esbuild.exe']);
        expect(() => removeTree('/p', fs)).toThrow(/held: dist\/index\.html \(EBUSY\)/);
        expect(warnings).toEqual([]);
    });

    it('control: a tree that cannot be listed still throws: nothing says the holder is outside it', () => {
        const { fs, warnings } = fakeFs([], false);
        fs.files = () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); };
        expect(() => removeTree('/p', fs)).toThrow(/the tree could not be listed \(EPERM\)/);
        expect(warnings).toEqual([]);
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

    // #923: the gate's report said the root was held and named one child, esbuild's service, which sat
    // outside the tree. What held the root was not in the report. Any process of the user can hold it,
    // a grandchild or one outside this process tree, so the report asks the system who sits in the
    // tree and who has a refused file open.
    it('names the processes whose working directory is in the tree, and those that hold a refused file', () => {
        const { fs, calls } = fakeFs(['/p/dist/index.html', '/p'], false, [], [
            { pid: 4321, name: 'node', kind: 'cwd', path: '/p/' },
            { pid: 8765, name: 'node', kind: 'cwd', path: '/p/dist/assets/' },
            { pid: 987, name: 'Code', kind: 'file', path: '/p/dist/index.html' },
        ]);
        let error: Error | undefined;
        try { removeTree('/p', fs); } catch (e) { error = e as Error; }
        expect(error?.message).toContain(
            'holders: 4321 node (working directory: the root), 8765 node (working directory: dist/assets/), ' +
            '987 Code (has dist/index.html open)');
        // It is asked about the files that refused a rename, not every file.
        expect(calls).toContain('holders /p [/p/dist/index.html]');
    });

    it('says so when the system names no holder', () => {
        const { fs } = fakeFs(['/p'], false);
        expect(() => removeTree('/p', fs)).toThrow(/holders: none/);
    });

    it('says so when the holders cannot be listed, and still reports the rest', () => {
        const { fs } = fakeFs(['/p'], false, ['38520 esbuild.exe']);
        fs.holders = () => { throw Object.assign(new Error('spawn powershell ENOENT'), { code: 'ENOENT' }); };
        expect(() => removeTree('/p', fs)).toThrow(/held: the root \(EBUSY\)\nchildren: 38520 esbuild\.exe\nholders: not listed \(ENOENT\)/);
    });

    it('a directory left behind by a holder outside the tree carries the holders too', () => {
        const { fs, warnings } = fakeFs([], false, [], [{ pid: 55, name: 'MsMpEng', kind: 'file', path: '/p/dist/index.html' }]);
        removeTree('/p', fs);
        expect(warnings[0]).toContain('holders: 55 MsMpEng (has dist/index.html open)');
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
            expect(error?.message).toContain(`holders: ${child.pid} node (working directory: dist/)`);
        } finally {
            child.kill();
            await new Promise((resolve) => child.once('exit', resolve));
            rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }, 30_000);

    // #923: a process the test did not start itself, here a grandchild, is not among the children. The
    // working directory is read from the process, so it is named all the same.
    it.runIf(process.platform === 'win32')('on Windows, names a process outside the children that sits in the tree', async () => {
        const root = mkdtempSync(join(tmpdir(), 'pdx-remove-grandchild-'));
        mkdirSync(join(root, 'dist'), { recursive: true });
        // On Windows `kill()` ends a process without running its handlers, so the parent is asked to stop
        // through its stdin: it kills the grandchild, waits for it to exit, and exits.
        const grandchild = `require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], ` +
            `{ cwd: ${JSON.stringify(join(root, 'dist'))}, stdio: 'ignore' })`;
        const parent = spawn(process.execPath, ['-e',
            `const c = ${grandchild}; c.on('spawn', () => process.stdout.write(String(c.pid))); ` +
            "process.stdin.once('data', () => { c.once('exit', () => process.exit()); c.kill(); })"],
        { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'ignore'] });
        const pid = await new Promise<string>((resolve) => parent.stdout!.once('data', (d: Buffer) => resolve(String(d))));
        try {
            let error: Error | undefined;
            try { removeTree(root); } catch (e) { error = e as Error; }
            expect(error?.message).toContain('held: dist/ (EBUSY)');
            expect(error?.message).not.toMatch(new RegExp(`children: .*\\b${pid}\\b`));
            expect(error?.message).toContain(`holders: ${pid} node (working directory: dist/)`);
        } finally {
            const exited = new Promise((resolve) => parent.once('exit', resolve));
            parent.stdin!.write('stop\n');
            await exited;
            rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }, 30_000);

    // A file opened without sharing: the file refuses a rename, and the process holding it is named.
    it.runIf(process.platform === 'win32')('on Windows, names the process that holds a refused file open', async () => {
        const root = mkdtempSync(join(tmpdir(), 'pdx-remove-file-'));
        mkdirSync(join(root, 'dist'), { recursive: true });
        const file = join(root, 'dist', 'index.html');
        writeFileSync(file, 'x');
        const holder = spawn('powershell', ['-NoProfile', '-Command',
            `$f = [IO.File]::Open('${file}', 'Open', 'Read', 'None'); [Console]::Out.Write('ready'); [Console]::Out.Flush(); Start-Sleep 60`],
        { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
        await new Promise<void>((resolve) => holder.stdout!.once('data', () => resolve()));
        try {
            let error: Error | undefined;
            try { removeTree(root); } catch (e) { error = e as Error; }
            expect(error?.message).toContain('held: dist/index.html (EBUSY)');
            expect(error?.message).toMatch(new RegExp(`holders: .*${holder.pid} \\S+ \\(has dist/index\\.html open\\)`));
        } finally {
            holder.kill();
            await new Promise((resolve) => holder.once('exit', resolve));
            rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }, 30_000);
});
