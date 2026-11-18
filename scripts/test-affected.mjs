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
 * - A changed file in a folder that another package's config loads a setup file from runs that
 *   package's suite too (#1194): core's slow-test record is loaded by five packages, one of which,
 *   compiler, does not depend on core.
 * - "Changed" is the working tree against the merge base with `origin/main`, untracked files
 *   included: the suites run on the tree, not on the commits. `PDX_TEST_BASE` names another base;
 *   without one that git knows, every vitest suite runs.
 *
 *   node scripts/test-affected.mjs        (the root script `pnpm test:affected`)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A package's own config files: `vite.config.ts`, `vitest.config.ts`, `vitest.<name>.config.ts`. */
const CONFIG = /^(vite|vitest)(\.[\w-]+)?\.config\.[cm]?[jt]s$/;

/** The packages whose suites are browser suites: `test:browser` runs them, CI shards them. */
export const BROWSER = ['@pdxui/design', '@pdxui/builder', '@pdxui/site', '@pdxui/showcase'];
/** The packages that always run: their suites read the whole repository. */
export const ALWAYS = ['@pdxui/core', '@pdxui/cli'];

/**
 * The folders of other packages that a package's vitest suites load setup files from (#1194), as
 * `{ dir, by }`: `dir` relative to the repository root, `by` the package folder whose config names it.
 * Read from every `setupFiles` of every package's own configs, so a config that starts loading one is
 * covered when it does. cli, compiler, lsp, router and ui load core's slow-test record: a change to it
 * reaches their suites, and compiler does not depend on core, so no dependency says so.
 */
export function setupLoads(repo = REPO) {
    const loads = [];
    const packages = join(repo, 'packages');
    for (const by of readdirSync(packages)) {
        const folder = join(packages, by);
        if (!existsSync(join(folder, 'package.json'))) continue;
        for (const file of readdirSync(folder).filter((f) => CONFIG.test(f))) {
            for (const block of readFileSync(join(folder, file), 'utf8').matchAll(/setupFiles\s*:\s*\[([^\]]*)\]/g)) {
                for (const [, entry] of block[1].matchAll(/['"]([^'"]+)['"]/g)) {
                    const resolved = posix.normalize(posix.join('packages', by, entry));
                    const owner = /^packages\/([^/]+)\//.exec(resolved)?.[1];
                    if (owner && owner !== by) loads.push({ dir: posix.dirname(resolved), by });
                }
            }
        }
    }
    // Once per folder and package: router and ui load two files of core's setup folder, ui from two configs.
    const seen = new Set();
    return loads.filter((l) => !seen.has(`${l.dir}\n${l.by}`) && seen.add(`${l.dir}\n${l.by}`));
}

/**
 * What the changed paths (relative to the repository root, forward slashes) ask to run: everything
 * (with the first path that made it so), or the package folders changed, with the packages that load
 * a setup file from a changed folder (`loads`, from `setupLoads()`).
 */
export function selection(changed, loads = setupLoads()) {
    const outside = changed.find((f) => !/^packages\/[^/]+\//.test(f));
    if (outside !== undefined) return { all: true, reason: outside, folders: [] };
    const folders = new Set(changed.map((f) => f.split('/')[1]));
    for (const f of changed) {
        for (const l of loads) if (posix.dirname(f) === l.dir) folders.add(l.by);
    }
    return { all: false, reason: null, folders: [...folders].sort() };
}

/**
 * The pnpm arguments for a selection: the folders and their dependents, core and cli, no browser suite.
 *
 * `--no-bail` (#1181): stopping at the first red left the suites already started running after pnpm
 * exited, a vitest pool loading the machine for the next push. pnpm now waits for every package, and
 * a failed push reports every red at once.
 */
export function pnpmArgs(sel) {
    const exclude = BROWSER.map((p) => `--filter=!${p}`);
    if (sel.all) return ['-r', '--workspace-concurrency=4', '--no-bail', ...exclude, 'run', 'test'];
    const include = [...sel.folders.map((d) => `--filter=...{./packages/${d}}`), ...ALWAYS.map((p) => `--filter=${p}`)];
    return ['-r', '--workspace-concurrency=4', '--no-bail', ...include, ...exclude, 'run', 'test'];
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
