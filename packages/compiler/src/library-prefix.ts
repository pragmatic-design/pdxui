// The prefix a .pdx file's tag is derived with, by the package the file belongs to (#1009).
//
// `pdx-` is the published @pdxui packages' (#136). An app compiles its own components with its prefix,
// `app` by default, but it also compiles a library's .pdx when it resolves the library's `development`
// condition (the workspace does, #1004): that file keeps its `pdx-` tag, or `pdx-switch.pdx` would
// register <app-switch> and <pdx-switch> would never be defined.
//
// A file is the library's when the nearest package.json above it is a published @pdxui package's
// (named `@pdxui/…`, not `private`) AND the app being compiled is not inside that package. Both halves
// were learnt from the gate:
// - the showcase, the site, the builder and the certification harness are @pdxui/* packages marked
//   `private`: apps, whose components keep the app's prefix;
// - an app with no package.json of its own inside a published package — the compiler's demo apps, a
//   test's project under packages/cli/tests — has that package as its nearest, and is still the app.
//
// Node only: it reads package.json files. The pure compiler (src/compiler/) never calls it; the plugin
// and the resolver do, with the absolute paths Vite and the scans give them.

import { existsSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join, relative, resolve } from 'path';
import { RESERVED_TAG_PREFIX } from './compiler/tag-prefix';

/** The prefix the @pdxui packages own, without its dash: what `deriveTag` takes. */
const LIBRARY_PREFIX = RESERVED_TAG_PREFIX.slice(0, -1);

/** Directory → the directory of the nearest package.json at or above it (null: none). */
const nearestPackage = new Map<string, string | null>();
/** Package directory → whether it is a published @pdxui package. */
const publishedLibrary = new Map<string, boolean>();

/** The directory of the nearest package.json at or above `dir`, cached per directory walked. */
function packageDirAbove(dir: string): string | null {
    const cached = nearestPackage.get(dir);
    if (cached !== undefined) return cached;
    const parent = dirname(dir);
    const found = existsSync(join(dir, 'package.json')) ? dir : parent === dir ? null : packageDirAbove(parent);
    nearestPackage.set(dir, found);
    return found;
}

/** Whether the package at `dir` is a published @pdxui package: named `@pdxui/…` and not `private`. */
function isPublishedLibrary(dir: string): boolean {
    const cached = publishedLibrary.get(dir);
    if (cached !== undefined) return cached;
    // A package.json that does not parse is no library's: the file is the app's, as before.
    let pkg: { name?: unknown; private?: unknown } = {};
    try { pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as typeof pkg; }
    catch { pkg = {}; }
    const found = typeof pkg.name === 'string' && pkg.name.startsWith('@pdxui/') && pkg.private !== true;
    publishedLibrary.set(dir, found);
    return found;
}

/** Whether `inner` is `outer` or a directory inside it. */
function isWithin(inner: string, outer: string): boolean {
    const rel = relative(outer, inner);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * The prefix to derive the tag of `file` with: `pdx` when the file belongs to a published `@pdxui/*`
 * package that does not hold `appRoot`, the app being compiled; `appPrefix` otherwise. Without an
 * `appRoot` only the package decides. A path that is not absolute (a virtual id, a test's made-up
 * name) has no package to read, and takes `appPrefix`.
 */
export function tagPrefixFor(file: string, appPrefix: string, appRoot?: string): string {
    const path = file.split('?')[0];
    if (!isAbsolute(path)) return appPrefix;
    const pkg = packageDirAbove(dirname(path));
    if (!pkg || !isPublishedLibrary(pkg)) return appPrefix;
    if (appRoot && isWithin(resolve(appRoot), pkg)) return appPrefix;
    return LIBRARY_PREFIX;
}
