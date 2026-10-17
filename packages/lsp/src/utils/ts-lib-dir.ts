// Where TypeScript's lib.*.d.ts files are, for the language service (./ts-service). Moved out of it
// as it is (#467): finding a folder on disk is its own job.

import ts from 'typescript';
import { existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';

const libDirs = new Map<string, string | null>(); // root → typescript's lib folder, null = not found

const hasLib = (dir: string): boolean => existsSync(join(dir, 'lib.es2022.d.ts'));

/**
 * Finds typescript's lib folder for the lib.*.d.ts files: the one the client points at (VS Code's
 * own TypeScript), then the project's — looked for in every node_modules from `rootDir` UP, pnpm's
 * store included — then the one next to this module when it is not bundled.
 *
 * Not only `<root>/node_modules`: the server ships no lib files, so a folder whose TypeScript sits
 * higher up (an app in a monorepo) or nowhere would get no lib at all — `String`, `JSON` and
 * `document` unknown, and hundreds of false errors.
 */
export function findTsLibDir(rootDir: string, hint?: string): string | null {
    const key = `${rootDir}|${hint ?? ''}`;
    if (libDirs.has(key)) return libDirs.get(key)!;
    let found: string | null = hint && hasLib(hint) ? hint : null;
    for (let dir = rootDir; !found && dir; ) {
        const direct = join(dir, 'node_modules', 'typescript', 'lib');
        if (hasLib(direct)) { found = direct; break; }
        const pnpm = join(dir, 'node_modules', '.pnpm');
        if (existsSync(pnpm)) {
            // Several versions can coexist (typescript@5.8.x, 5.9.x): pick the one
            // whose lib is actually there.
            for (const d of readdirSync(pnpm)) {
                const cand = join(pnpm, d, 'node_modules', 'typescript', 'lib');
                if (d.startsWith('typescript@') && hasLib(cand)) { found = cand; break; }
            }
        }
        const parent = dirname(dir);
        dir = parent === dir ? '' : parent;
    }
    if (!found) {
        const own = dirname(ts.getDefaultLibFilePath({}));
        if (hasLib(own)) found = own;
    }
    libDirs.set(key, found);
    return found;
}
