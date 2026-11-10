// The modules @pdxui/ui builds (#1004): read from its package.json "exports", one place for the two
// steps that need them — the Vite library build (library-config.ts) and the declarations of its .pdx
// components (gen-pdx-dts.mjs).

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';

// Match: a source target of an export, `./src/button/pdx-button.ts` or `./src/x/pdx-x.pdx`.
const SOURCE_TARGET = /^\.\/src\/.*\.(ts|pdx)$/;

/**
 * The rollup inputs of the package at `root`: name (`button/pdx-button`, the path under dist without
 * its extension) → its source file. A pattern (`./icons/*` → ./src/icon/pragmatic/*.ts) is one entry
 * per file it matches.
 *
 * @param {string} root
 * @returns {Record<string, string>}
 */
export function libraryEntries(root) {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    const entries = {};
    for (const entry of Object.values(pkg.exports)) {
        const targets = typeof entry === 'string' ? [entry] : Object.values(entry);
        for (const t of targets) {
            if (typeof t !== 'string' || !SOURCE_TARGET.test(t)) continue;
            const files = t.includes('*')
                ? readdirSync(resolve(root, dirname(t.slice(2)))).filter(f => f.endsWith('.ts')).map(f => `${dirname(t)}/${f}`)
                : [t];
            for (const f of files) {
                const rel = f.replace(/^\.\/src\//, '').replace(/\.(ts|pdx)$/, ''); // e.g. button/pdx-button
                entries[rel] = resolve(root, f.slice(2));
            }
        }
    }
    return entries;
}
