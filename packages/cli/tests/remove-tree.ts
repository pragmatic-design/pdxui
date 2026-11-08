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
//
// The children are not enough to name a holder (#923): a grandchild, or a process outside this tree, can
// sit in the project too. So the report also asks the system, through `holders.ps1`, which processes of
// this user have their working directory in the tree, and which have a refused file open.

import { readdirSync, renameSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

/** A process that holds part of the tree: it sits in a directory of it, or has a file of it open. */
export interface Holder {
    pid: number;
    name: string;
    kind: 'cwd' | 'file';
    /** The directory it sits in, or the file it has open, as an absolute path. */
    path: string;
}

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
    /** The processes whose working directory is in `root`, and those that have one of `files` open. */
    holders(root: string, files: string[]): Holder[];
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

/**
 * On Windows, what `holders.ps1` names in `root`. Elsewhere neither a working directory nor an open file
 * blocks a removal, and none are listed.
 */
function systemHolders(root: string, files: string[]): Holder[] {
    if (process.platform !== 'win32') return [];
    const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', join(__dirname, 'holders.ps1'), root, ...files],
    { encoding: 'utf8', windowsHide: true });
    return out.split(/\r?\n/).filter(Boolean).map((line) => {
        const [pid, name, kind, path] = line.split('\t');
        return { pid: Number(pid), name, kind: kind as Holder['kind'], path };
    });
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
    holders: systemHolders,
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
        const refusedFiles: string[] = [];
        const allFiles: string[] = [];
        const tryRename = (path: string, label: string): boolean => {
            try {
                fs.rename(path, path + PROBE);
                fs.rename(path + PROBE, path);
                return true;
            } catch (refusal) {
                held.push(`${label} (${codeOf(refusal)})`);
                return false;
            }
        };
        const name = (path: string): string => relative(root, path).replace(/\\/g, '/');
        try {
            for (const file of fs.files(root)) {
                allFiles.push(file);
                if (!tryRename(file, name(file))) refusedFiles.push(file);
            }
            for (const dir of fs.dirs(root)) tryRename(dir, dir === root ? 'the root' : `${name(dir)}/`);
        } catch (listing) {
            held.push(`the tree could not be listed (${codeOf(listing)})`);
        }
        let children: string;
        try { children = fs.children().join(', ') || 'none'; } catch (listing) { children = `not listed (${codeOf(listing)})`; }
        // The files to ask about: those that refused, or, when none did, every file — a holder outside
        // the tree may have let go of the root and still have one open.
        let holders: string;
        try {
            holders = fs.holders(root, refusedFiles.length > 0 ? refusedFiles : allFiles)
                .map(h => `${h.pid} ${h.name} (${h.kind === 'cwd' ? `working directory: ${dirLabel(root, h.path)}` : `has ${name(h.path)} open`})`)
                .join(', ') || 'none';
        } catch (listing) {
            holders = `not listed (${codeOf(listing)})`;
        }
        const named = held.length > 0 ? held.join(', ') : 'nothing in the tree refused a rename, so the holder is outside it';
        const err = error as Error & { code?: string };
        const report = `${err.message}\nheld: ${named}\nchildren: ${children}\nholders: ${holders}`;
        if (held.length === 0) {
            fs.warn(`[remove-tree] left '${root}' behind: ${report}`);
            return;
        }
        throw Object.assign(new Error(report, { cause: error }), { code: err.code });
    }
}

/** A directory of the tree as the report names it: `the root`, or its path with a trailing slash. */
function dirLabel(root: string, dir: string): string {
    const rel = relative(root, dir).replace(/\\/g, '/').replace(/\/$/, '');
    return rel === '' ? 'the root' : `${rel}/`;
}

const codeOf = (e: unknown): string => (e as { code?: string }).code ?? String(e);
