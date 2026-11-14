#!/usr/bin/env node
/**
 * test-affected — the suites the pre-push runs (#1074): the vitest suites of the packages a push
 * changes and of every package that depends on them, plus core and cli. The browser suites (design,
 * builder, site, showcase) are left to CI, which shards them and runs everything on every pull
 * request. `pnpm test` stays the complete run, and `PDX_TEST_ALL=1` makes the hook run it.
 *
 * - core and cli always run: their suites read files across the repository (the docs, the showcase,
 *   the skill, the workflows, the hook itself), so a change anywhere can turn them red.
 * - A changed file outside `packages/` (a root config, `.github/`, `scripts/`, `docs/`, the
 *   lockfile, the skill) runs every vitest suite: it can reach any of them.
 * - "Changed" is the working tree against the merge base with `origin/main`, untracked files
 *   included: the suites run on the tree, not on the commits. `PDX_TEST_BASE` names another base;
 *   without one that git knows, every vitest suite runs.
 *
 *   node scripts/test-affected.mjs        (the root script `pnpm test:affected`)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** The packages whose suites are browser suites: `test:browser` runs them, CI shards them. */
export const BROWSER = ['@pdxui/design', '@pdxui/builder', '@pdxui/site', '@pdxui/showcase'];
/** The packages that always run: their suites read the whole repository. */
export const ALWAYS = ['@pdxui/core', '@pdxui/cli'];

/**
 * What the changed paths (relative to the repository root, forward slashes) ask to run: everything
 * (with the first path that made it so), or the package folders changed.
 */
export function selection(changed) {
    const outside = changed.find((f) => !/^packages\/[^/]+\//.test(f));
    if (outside !== undefined) return { all: true, reason: outside, folders: [] };
    return { all: false, reason: null, folders: [...new Set(changed.map((f) => f.split('/')[1]))].sort() };
}

/** The pnpm arguments for a selection: the folders and their dependents, core and cli, no browser suite. */
export function pnpmArgs(sel) {
    const exclude = BROWSER.map((p) => `--filter=!${p}`);
    if (sel.all) return ['-r', '--workspace-concurrency=4', ...exclude, 'run', 'test'];
    const include = [...sel.folders.map((d) => `--filter=...{./packages/${d}}`), ...ALWAYS.map((p) => `--filter=${p}`)];
    return ['-r', '--workspace-concurrency=4', ...include, ...exclude, 'run', 'test'];
}

function git(args) {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

/** The changed paths, or null when the base is unknown. */
function changedPaths(base) {
    try {
        git(['rev-parse', '--verify', '--quiet', base]);
    } catch {
        return null;
    }
    const mergeBase = git(['merge-base', 'HEAD', base]);
    const lines = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean);
    return [...new Set([...lines(git(['diff', '--name-only', mergeBase])), ...lines(git(['ls-files', '--others', '--exclude-standard']))])];
}

function main() {
    const base = process.env.PDX_TEST_BASE || 'origin/main';
    const changed = changedPaths(base);
    const sel = changed === null ? { all: true, reason: `no base ${base}`, folders: [] } : selection(changed);
    console.log(sel.all
        ? `[test-affected] every vitest suite (${sel.reason}); the browser suites are CI's`
        : `[test-affected] changed: ${sel.folders.join(', ') || 'nothing'} — their suites, their dependents', core and cli; the browser suites are CI's`);
    const run = spawnSync('pnpm', pnpmArgs(sel), { stdio: 'inherit', shell: process.platform === 'win32' });
    process.exit(run.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
