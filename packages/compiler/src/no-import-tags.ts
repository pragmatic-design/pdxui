// Tags that are legitimate with nothing to import — the evidence behind
// ComponentResolver.knownWithoutImport: element selectors the design system styles, and
// custom elements another @pdxui package defines (pdx-router-outlet, from @pdxui/router).

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';

/**
 * Walk the sibling @pdxui packages once, starting from `start` (the compiler's own directory),
 * collecting tags that need no import: element selectors in any CSS, and `component('pdx-x')` /
 * `define('pdx-x')` in any source.
 *
 * Best-effort by design: a package that cannot be read contributes nothing, which leaves the
 * diagnostic exactly as loud as without the scan. Failing to find a tag can only produce a
 * warning, never a broken build.
 */
export function scanNoImportTags(start: string): Set<string> {
    const found = new Set<string>();
    let dir = start;
    for (let i = 0; i < 6; i++) {
        // Where the sibling packages live: `packages/` in the monorepo, or — in an app that
        // INSTALLED them — the `@pdxui` scope folder the compiler itself sits in
        // (node_modules/@pdxui/compiler/dist → node_modules/@pdxui). With only the first, an
        // installed app would find nothing, and <pdx-router-outlet> would be reported
        // "will not be registered" while it renders. Published packages ship src/.
        const packagesDir = join(dir, 'packages');
        const root = existsSync(packagesDir) ? packagesDir : basename(dir) === '@pdxui' ? dir : null;
        if (root) {
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
