// The design CSS for the app's browser target (#156): the second plugin pdx() returns.
//
// `@pdxui/design` is written in the baseline-2024 form — rules on the behaviour attributes core's
// `setTheme` mirrors on <html>. Under baseline-2026 this plugin rewrites each stylesheet of the package
// into container style queries (./compiler/behaviour-queries), and core, told the target through
// `__PDX_TARGET__`, stops mirroring. Two stylesheets, one per target, and the plugin picks.
//
// It has to be a plugin of its own, with no `enforce`: Vite inlines a stylesheet's `@import`s in
// `vite:css`, reading the files from disk, and turns the result into a module in `vite:css-post`. A
// plugin without `enforce` runs between the two, the one place the whole of the package's CSS is in
// one piece and still CSS. pdx()'s own plugin is `enforce: 'pre'`, where a stylesheet has its imports
// still unread.

import type { Plugin } from 'vite';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { behaviourQueries } from './compiler/behaviour-queries';
import type { BrowserTarget } from './compiler/compile-context';

// Match: a stylesheet module id, its query aside. Groups: [1]=path
const CSS_ID = /^([^?]+\.css)(?:\?.*)?$/;

/** The package a file belongs to, read from the nearest package.json; cached per directory. */
function packageNameOf(file: string, cache: Map<string, string | null>): string | null {
    const seen: string[] = [];
    let dir = dirname(file);
    let name: string | null = null;
    for (;;) {
        const known = cache.get(dir);
        if (known !== undefined) { name = known; break; }
        seen.push(dir);
        const pkg = join(dir, 'package.json');
        if (existsSync(pkg)) {
            name = (JSON.parse(readFileSync(pkg, 'utf-8')) as { name?: string }).name ?? null;
            break;
        }
        const up = dirname(dir);
        if (up === dir) break;
        dir = up;
    }
    for (const d of seen) cache.set(d, name);
    return name;
}

/**
 * The plugin that gives `@pdxui/design`'s stylesheets the form of the target: rewritten into style
 * queries under baseline-2026, as written under baseline-2024.
 */
export function designTargetPlugin(target: BrowserTarget): Plugin {
    const packages = new Map<string, string | null>();
    return {
        name: 'pragmatic-pdx-design-target',
        transform(code: string, id: string) {
            if (target === 'baseline-2024') return;
            const file = CSS_ID.exec(id)?.[1];
            if (!file || packageNameOf(file, packages) !== '@pdxui/design') return;
            return { code: behaviourQueries(code), map: null };
        },
    };
}
