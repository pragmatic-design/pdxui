// Tags that are legitimate with nothing to import — the evidence behind
// ComponentResolver.knownWithoutImport: element selectors the design system styles, and
// custom elements another @pdxui package defines (pdx-router-outlet, from @pdxui/router).
//
// The scanner of scripts/gen-no-import-tags.mjs, which writes its answer to
// no-import-tags.generated.ts: the resolver reads that list and walks nothing (#991). So the walk
// runs in the monorepo only — an installed app gets the list inside the compiler it installed.

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Walk the sibling @pdxui packages, from `start` (a directory inside the monorepo) up to its
 * `packages/` folder, collecting tags that need no import: element selectors in any CSS, and
 * `component('pdx-x')` / `define('pdx-x')` in any source.
 *
 * A package that cannot be read contributes nothing; the drift test compares the generated list
 * with this walk, so a package the walk misses is missed by both, and a warning is all it costs.
 */
export function scanNoImportTags(start: string): Set<string> {
    const found = new Set<string>();
    let dir = start;
    for (let i = 0; i < 6; i++) {
        const root = join(dir, 'packages');
        if (existsSync(root)) {
            for (const entry of safeReaddir(root)) {
                const src = join(root, entry, 'src');
                if (existsSync(src)) collectNoImportTags(src, found, 0);
            }
            break;
        }
        dir = dirname(dir);
    }
    return found;
}

function safeReaddir(dir: string): string[] {
    try { return readdirSync(dir); } catch { return []; }
}

/** Recurse a source tree, at most a few levels, harvesting tag declarations. */
function collectNoImportTags(dir: string, out: Set<string>, depth: number): void {
    if (depth > 4) return;
    for (const name of safeReaddir(dir)) {
        const full = join(dir, name);
        // Declared without an initial value on purpose: every path that does not assign it
        // leaves the iteration, so a placeholder would be a value nothing can read.
        let isDir: boolean;
        try { isDir = statSync(full).isDirectory(); } catch { continue; }
        if (isDir) {
            if (name === 'node_modules' || name === 'dist') continue;
            collectNoImportTags(full, out, depth + 1);
            continue;
        }
        let text: string;
        try { text = readFileSync(full, 'utf-8'); } catch { continue; }

        if (name.endsWith('.css')) {
            // An ELEMENT selector — `pdx-split {`, or inside `:is(pdx-split, …)`. A tag that
            // merely APPEARS in a comment or a value is not a declaration, so the match must
            // be anchored to a selector position: start of line, or after `(`/`,` in :is().
            for (const m of text.matchAll(/(?:^|[(,])\s*(pdx-[a-z0-9-]+)\s*(?=[{,)[:.]|$)/gmi)) {
                out.add(m[1].toLowerCase());
            }
        } else if (name.endsWith('.ts') || name.endsWith('.js')) {
            for (const m of text.matchAll(/\b(?:component|define)\(\s*['"`](pdx-[a-z0-9-]+)['"`]/gi)) {
                out.add(m[1].toLowerCase());
            }
        }
    }
}
