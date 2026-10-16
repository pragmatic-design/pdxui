// Find a project's files by glob, with Node's own fs.glob (#442).
//
// fast-glob brought `braces` into the CLI, and `braces` has an advisory with no patched release.
// fs.glob is stable since Node 22.17.0 and expands braces itself; what it does differently is kept
// here: it yields directories too, so a folder named `x.pdx` would be read as a file, and on Windows
// its paths use `\`, where the callers have always had `/`.

import { glob } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { join } from 'node:path';

export interface FindFilesOptions {
    /** The folder the patterns are relative to. */
    cwd: string;
    /** Globs whose matches are left out; a matching folder is not walked. */
    ignore?: string[];
}

/** The files matching `patterns` under `cwd`, as absolute paths with `/` separators. */
export async function findFiles(patterns: string[], options: FindFilesOptions): Promise<string[]> {
    // Two patterns can match one file; fast-glob gave it once.
    const files = new Set<string>();
    for await (const entry of glob(patterns, { cwd: options.cwd, exclude: options.ignore, withFileTypes: true })) {
        const path = join(entry.parentPath, entry.name);
        // A link counts as what it points to, as it did with fast-glob.
        const isFile = entry.isFile() || (entry.isSymbolicLink() && statSync(path, { throwIfNoEntry: false })?.isFile() === true);
        if (isFile) files.add(path.replace(/\\/g, '/'));
    }
    return [...files];
}
