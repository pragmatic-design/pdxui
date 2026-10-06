#!/usr/bin/env node
/**
 * publish-local.mjs — put the workspace on the local npm registry, as one set.
 *
 *   node scripts/publish-local.mjs 1.0.0-alpha.0.1400            bump, build, publish
 *   node scripts/publish-local.mjs 1.0.0-alpha.0.1400 --plan-only --json     say what it would do
 *   node scripts/publish-local.mjs 1.0.0-alpha.0.1400 --no-publish           bump and build, stop
 *
 * A test lab hands the framework to a stranger through a package feed, and republishing is its
 * first step, because a run made against a stale feed measures a framework that no longer exists.
 * A feed published by hand drifts behind the repository with nothing saying how to bring it back;
 * this file is that procedure, written down.
 *
 * ## Who gets published is DERIVED
 *
 * Never a hand-written list: the next package added to the repo would be silently left out of the
 * feed. A member of the set is a package whose name is under the `@pdxui/` scope AND that is not
 * private. The packages just outside fall out of that rule without being named:
 *
 *   · `pragmatic-pdx` — not private, but it ships to the VS Code marketplace (404 on the registry);
 *     out of the scope.
 *   · `@pdxui/site`, `@pdxui/builder`, `@pdxui/showcase` — apps, private, with versioning of
 *     their own.
 *   · `@pdxui/responsive` — the certification harness, private.
 *
 * Membership is decided by `private`, not by the shape of the version: a rule on the version
 * shape (say, four parts, `1.0.0-alpha.0.<n>`) could not publish `1.0.0-alpha.0`, and an app
 * would have to carry a particular version just to stay out of the set.
 *
 * ## The version is chosen by hand
 *
 * Like `MinVerVersionOverride` on the .NET side. There is no tag to count from, and a computed
 * version would make two runs of the lab indistinguishable. Every member moves to the SAME version —
 * a package that has fallen behind catches up rather than receiving a delta, which is how a set
 * drifts apart one release at a time.
 *
 * ## Internal dependencies are `workspace:*` and are NOT rewritten
 *
 * pnpm resolves them into the exact version at publish time. Rewriting them here would produce a
 * repo that no longer links its own packages.
 *
 * ## Two traps, the same here as on the .NET side
 *
 *   1. **Publishing does not rebuild.** `pnpm publish` ships whatever is in `dist/`, which can be
 *      older than the fix that is the reason for republishing. So the build is a separate,
 *      explicit step, and it runs AFTER the bump.
 *   2. **An exit code proves nothing.** The only proof is a consumer: install from the registry into
 *      an empty folder and compile something. The script says so at the end; it does not claim
 *      success.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REGISTRY = 'http://localhost:4873';

/** A version the set may move to: semver, with an optional prerelease (`1.0.0-alpha.0`, `1.0.0`). */
export const SET_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function readWorkspace(packagesDir) {
    return readdirSync(packagesDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => join(packagesDir, e.name, 'package.json'))
        .filter(existsSync)
        .map(file => ({ file, manifest: JSON.parse(readFileSync(file, 'utf8')) }));
}

/** A member of the set: our scope, and not private. */
const inSet = m => typeof m.name === 'string' && m.name.startsWith('@pdxui/') && m.private !== true;

/** `git …` in `cwd`, or null when that fails (not a repository, no git). */
function gitIn(cwd, args) {
    try {
        return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return null;
    }
}

/**
 * Uncommitted work inside a published package, which `gitHead` would not describe. Its own
 * package.json is left out: the bump rewrites it before the publish and is committed after.
 */
function dirtyPaths(entries) {
    const dirty = [];
    for (const e of entries) {
        const dir = dirname(e.file);
        const status = gitIn(dir, ['status', '--porcelain', '--', '.']);
        if (status === null) { dirty.push(`${e.manifest.name}: not inside a git repository`); continue; }
        for (const line of status.split('\n').filter(Boolean)) {
            if (!/(^|\/)package\.json$/.test(line.slice(3).trim())) dirty.push(`${e.manifest.name}: ${line.trim()}`);
        }
    }
    return dirty;
}

function buildPlan(entries, version, packagesDir) {
    const members = entries.filter(e => inSet(e.manifest));
    const published = members;
    return {
        bump: members.map(e => ({
            name: e.manifest.name, from: e.manifest.version, to: version, file: e.file,
        })),
        publish: published.map(e => e.manifest.name),
        // The commit the published content comes from. A version is chosen by hand and proves
        // nothing about content: a registry can serve the repo's own version many commits after
        // it was published, and a check on the version alone calls that fresh.
        gitHead: gitIn(packagesDir, ['rev-parse', 'HEAD']),
        dirty: dirtyPaths(published),
    };
}

/**
 * Write `gitHead` into each published package.json for the length of `fn` — the publish — and put
 * the file back after. npm records `gitHead` by itself; `pnpm publish` does not, and it ships
 * package.json as it finds it. Restored so the commit after the publish carries the bump alone.
 */
function withGitHead(plan, fn) {
    const files = plan.bump.filter(b => plan.publish.includes(b.name)).map(b => b.file);
    const originals = files.map(f => readFileSync(f, 'utf8'));
    try {
        files.forEach((f, i) => {
            const stamped = originals[i].replace(/("version"\s*:\s*"[^"]+",)(\r?\n)(\s*)/, `$1$2$3"gitHead": "${plan.gitHead}",$2$3`);
            if (stamped === originals[i]) throw new Error(`could not write gitHead into ${f}`);
            writeFileSync(f, stamped);
        });
        fn();
    } finally {
        files.forEach((f, i) => writeFileSync(f, originals[i]));
    }
}

function applyBump(plan) {
    for (const b of plan.bump) {
        // Rewrite the version field alone. Re-serialising the parsed object would reorder keys and
        // drop the file's own formatting, turning every publish into a diff nobody can read.
        const text = readFileSync(b.file, 'utf8');
        const next = text.replace(/("version"\s*:\s*")[^"]+(")/, `$1${b.to}$2`);
        if (next === text && b.from !== b.to) throw new Error(`could not rewrite the version in ${b.file}`);
        writeFileSync(b.file, next);
    }
}

function run(cmd, args, label) {
    process.stdout.write(`\n→ ${label}\n  ${cmd} ${args.join(' ')}\n`);
    execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
}

function main(argv) {
    const flag = name => argv.includes(name);
    const value = (name, fallback) => {
        const i = argv.indexOf(name);
        return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
    };
    const version = argv.find(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1]?.startsWith('--') !== true)
        ?? argv.find(a => !a.startsWith('--'));

    if (!version) {
        console.error('usage: node scripts/publish-local.mjs <version> [--plan-only] [--json] [--no-publish]');
        process.exit(1);
    }
    if (!SET_VERSION.test(version)) {
        // `2.0` or `latest` is not a version npm can publish, and the set has to move to one.
        console.error(`"${version}" is not a semver version (expected 1.0.0-alpha.0, 1.0.0, …)`);
        process.exit(1);
    }

    const packagesDir = value('--packages-dir', join(ROOT, 'packages'));
    const registry = value('--registry', DEFAULT_REGISTRY);
    const plan = buildPlan(readWorkspace(packagesDir), version, packagesDir);

    if (flag('--json')) {
        process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
        if (flag('--plan-only')) return;
    } else {
        process.stdout.write(`\n${plan.bump.length} packages move to ${version}:\n`);
        for (const b of plan.bump) process.stdout.write(`  ${b.name.padEnd(24)} ${b.from} → ${b.to}\n`);
        process.stdout.write(`\n  from commit ${plan.gitHead ?? '(none: not a git repository)'}\n`);
        for (const d of plan.dirty) process.stdout.write(`  dirty  ${d}\n`);
        if (flag('--plan-only')) return;
    }

    // A publish ships a commit, or it cannot say what it shipped: refused before anything moves.
    if (!plan.gitHead || plan.dirty.length > 0) {
        console.error('\nrefused: the published packages must be exactly a commit — commit or stash the work above.');
        process.exit(1);
    }

    applyBump(plan);

    const filters = plan.publish.flatMap(name => ['--filter', name]);

    // Explicit, and before the publish: `pnpm publish` ships whatever dist/ already holds. Scoped to
    // what is actually being published — the apps (site, builder) are not in the set, and building
    // them here would make a republish wait on work no consumer receives. pnpm keeps the topological
    // order across several --filter, so the dependencies build first.
    run('pnpm', [...filters, 'run', 'build'], 'build (publishing does NOT rebuild)');

    if (flag('--no-publish')) {
        process.stdout.write('\n--no-publish: stopped after the build.\n');
        return;
    }

    // --no-git-checks is pnpm's branch/tag guard, not git's own hook chain: this is a local feed and
    // the versions are chosen by hand, so there is no tag for it to check against.
    withGitHead(plan, () => run('pnpm', [...filters, 'publish', '--registry', registry, '--no-git-checks', '--access', 'public'],
        `publish ${plan.publish.length} packages to ${registry}, gitHead ${plan.gitHead}`));

    process.stdout.write(`
Published ${plan.publish.length} packages at ${version}, from commit ${plan.gitHead}.

An exit code is not the proof. Install from the registry into an empty folder and compile something:

  npm cache clean --force
  mkdir /c/tmp/feed-check && cd /c/tmp/feed-check
  npm init -y && npm i @pdxui/framework --registry ${registry}

If that build needs a single file from this repo, the package is incomplete.
`);
}

main(process.argv.slice(2));
