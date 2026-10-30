// Remove a test's project directory, and when that fails, say what holds it (#384, #543).
//
// On Windows the cleanup after `pdx build` has failed now and then with EBUSY, after five retries, and
// 200 attempts did not reproduce it. Retrying more would only hide it. Instead, a failure tries to
// rename each file of the tree, then each directory, the root last: Windows refuses to rename a file
// something holds open, and a directory that is a process's working directory or holds an open handle.
// Those that refuse are named in the error, with the child processes this process runs — a process
// started inside the project, esbuild's service above all, holds its working directory for its whole
// life (#543) — so the next failure says what to look at.
//
// When nothing in the tree refuses — every file and directory, the root included, renames — the handle
// is outside this process tree: on Windows an on-access scan or the indexer opening what a build has just
// written (#699). A test's subject is its output, not its cleanup, so that leftover directory is a
// warning, with the same report, and not a failure. A held file or directory still fails the test.

import { readdirSync, renameSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

/** What removeTree does to the disk and asks of the system, replaceable so a test can make it refuse. */
export interface TreeFs {
    rm(path: string): void;
    /** Every file under `root`, as absolute paths. */
    files(root: string): string[];
    /** Every directory under `root`, deepest first, then `root` itself. */
    dirs(root: string): string[];
    rename(from: string, to: string): void;
    /** This process's child processes, `<pid> <name>` each. */
    children(): string[];
    /** Where a directory left behind by a holder outside the tree is reported. */
    warn(message: string): void;
}

/**
 * The child processes of this one, on Windows, where a working directory blocks a removal. Elsewhere a
 * directory a process sits in can be removed, and none are listed.
 */
function childProcesses(): string[] {
    if (process.platform !== 'win32') return [];
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
        `Get-CimInstance Win32_Process -Filter "ParentProcessId=${process.pid}" | Where-Object { $_.Name -ne 'powershell.exe' } | ForEach-Object { "$($_.ProcessId) $($_.Name)" }`],
    { encoding: 'utf8', windowsHide: true });
    return out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

const realFs: TreeFs = {
    // Node retries EBUSY on its own with maxRetries; five is what #165 set.
    rm: (path) => rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
    files: (root) => readdirSync(root, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => join(entry.parentPath, entry.name)),
    dirs: (root) => [
        ...readdirSync(root, { recursive: true, withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => join(entry.parentPath, entry.name))
            .sort((a, b) => b.length - a.length),
        root,
    ],
    rename: renameSync,
    children: childProcesses,
    warn: (message) => console.warn(message),
};

const PROBE = '.pdx-probe';

/**
 * Remove `root`; if it cannot be, throw its error with what refuses a rename, and the child processes.
 * When nothing in the tree refuses, the same report is a warning that `root` was left behind.
 */
export function removeTree(root: string, fs: TreeFs = realFs): void {
    try {
        fs.rm(root);
    } catch (error) {
        const held: string[] = [];
        const tryRename = (path: string, label: string): void => {
            try {
                fs.rename(path, path + PROBE);
                fs.rename(path + PROBE, path);
            } catch (refusal) {
                held.push(`${label} (${codeOf(refusal)})`);
            }
        };
        const name = (path: string): string => relative(root, path).replace(/\\/g, '/');
        try {
            for (const file of fs.files(root)) tryRename(file, name(file));
            for (const dir of fs.dirs(root)) tryRename(dir, dir === root ? 'the root' : `${name(dir)}/`);
        } catch (listing) {
            held.push(`the tree could not be listed (${codeOf(listing)})`);
        }
        let children: string;
        try { children = fs.children().join(', ') || 'none'; } catch (listing) { children = `not listed (${codeOf(listing)})`; }
        const named = held.length > 0 ? held.join(', ') : 'nothing in the tree refused a rename, so the holder is outside it';
        const err = error as Error & { code?: string };
        const report = `${err.message}\nheld: ${named}\nchildren: ${children}`;
        if (held.length === 0) {
            fs.warn(`[remove-tree] left '${root}' behind: ${report}`);
            return;
        }
        throw Object.assign(new Error(report, { cause: error }), { code: err.code });
    }
}

const codeOf = (e: unknown): string => (e as { code?: string }).code ?? String(e);
