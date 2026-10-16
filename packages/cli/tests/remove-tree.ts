// Remove a test's project directory, and when that fails, say which files are held (#384).
//
// On Windows the cleanup after `pdx build` has failed now and then with EBUSY, after five retries, and
// 200 attempts did not reproduce it. Retrying more would only hide it. Instead, a failure tries to
// rename each file of the tree: Windows refuses to rename a file something holds open, so the files
// that refuse are named in the error, and the next failure says what to look at.

import { readdirSync, renameSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';

/** What removeTree does to the disk, replaceable so a test can make a file refuse. */
export interface TreeFs {
    rm(path: string): void;
    /** Every file under `root`, as absolute paths. */
    files(root: string): string[];
    rename(from: string, to: string): void;
}

const realFs: TreeFs = {
    // Node retries EBUSY on its own with maxRetries; five is what #165 set.
    rm: (path) => rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
    files: (root) => readdirSync(root, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => join(entry.parentPath, entry.name)),
    rename: renameSync,
};

const PROBE = '.pdx-probe';

/** Remove `root`; if it cannot be, throw its error with the files that refuse a rename named. */
export function removeTree(root: string, fs: TreeFs = realFs): void {
    try {
        fs.rm(root);
    } catch (error) {
        const held: string[] = [];
        let files: string[] = [];
        try { files = fs.files(root); } catch (listing) { held.push(`the tree could not be listed (${codeOf(listing)})`); }
        for (const file of files) {
            try {
                fs.rename(file, file + PROBE);
                fs.rename(file + PROBE, file);
            } catch (refusal) {
                held.push(`${relative(root, file).replace(/\\/g, '/')} (${codeOf(refusal)})`);
            }
        }
        const named = held.length > 0 ? held.join(', ') : 'no file refused a rename, so the holder is a directory or outside these files';
        const err = error as Error & { code?: string };
        throw Object.assign(new Error(`${err.message}\nheld: ${named}`, { cause: error }), { code: err.code });
    }
}

const codeOf = (e: unknown): string => (e as { code?: string }).code ?? String(e);
