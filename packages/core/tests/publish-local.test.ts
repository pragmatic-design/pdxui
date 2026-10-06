// Publishing the workspace to the local registry, and the three ways that set can be got wrong.
//
// A test lab hands the framework to a stranger through a package feed, and republishing is its
// first step: a run made against a stale feed measures a framework that no longer exists. A publish
// done by hand, with no script in the repo, is not repeated and leaves the feed hundreds of commits
// behind.
//
// This asserts the part a script can get wrong, on the real workspace and on a synthetic one:
//
//   1. WHO gets published is DERIVED, never a hand-written list: the `@pdxui/` scope, not private.
//      The packages just outside, and a list would have to remember each of them:
//        · `pragmatic-pdx` is not private — but it ships to the VS Code marketplace, not npm (404
//          on the registry), and its name is outside the `@pdxui/` scope;
//        · `@pdxui/site`, `@pdxui/builder` and `@pdxui/showcase` are private apps;
//        · `@pdxui/responsive` is the certification harness, private.
//      Membership is not the version shape `1.0.0-alpha.0.<n>`, which could not publish the first
//      public release, `1.0.0-alpha.0`.
//   2. The set moves TOGETHER. `@pdxui/framework` is a meta-package that pulls the others in, so
//      one package left behind installs a mixed set on the consumer's disk.
//   3. Nothing publishable depends on a private package. Internal deps are `workspace:*` and pnpm
//      resolves them AT PUBLISH TIME into the exact version — so a `workspace:*` onto a private
//      package resolves to a version the registry does not have, and the failure lands on a
//      consumer's `npm i`, never on ours. Nothing does today; the guard is for the day something does.
//
// It runs the script's own command line rather than importing its internals: `--plan-only` is what
// the runbook tells a human to run before publishing, so the test and the procedure exercise the
// same surface.

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(__dirname, '..', '..', '..');
const PACKAGES = join(ROOT, 'packages');
const SCRIPT = join(ROOT, 'scripts', 'publish-local.mjs');


interface Manifest {
    name: string;
    version: string;
    private?: boolean;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
}

function workspace(): Manifest[] {
    return readdirSync(PACKAGES, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => join(PACKAGES, e.name, 'package.json'))
        .filter(existsSync)
        .map(f => JSON.parse(readFileSync(f, 'utf8')) as Manifest);
}

function internalDeps(m: Manifest): [string, string][] {
    return Object.entries({ ...m.dependencies, ...m.devDependencies, ...m.peerDependencies })
        .filter(([name]) => name.startsWith('@pdxui/'));
}

interface Plan {
    publish: string[];
    bump: { name: string; to: string }[];
    gitHead: string | null;
    dirty: string[];
}

/** Plans completed on the real workspace, each one a git status per package — see the last test. */
let realWorkspacePlans = 0;

/** Run the script's planner. Throws — loudly — while the script does not exist. */
function plan(version: string, packagesDir: string): Plan {
    const out = execFileSync(process.execPath,
        [SCRIPT, version, '--packages-dir', packagesDir, '--plan-only', '--json'],
        { encoding: 'utf8' });
    if (packagesDir === PACKAGES) realWorkspacePlans++;
    return JSON.parse(out) as Plan;
}

const git = (cwd: string, ...args: string[]): string =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// The real workspace, planned once for every test that reads it. The budget is a ceiling, not a
// wait: ~400 ms alone, past 5 s under the full gate — a hang still fails, at 60 s.
const REAL_PLAN_BUDGET = 60_000;
// A test that builds a git or synthetic workspace and plans it, one or two child processes each.
const FIXTURE_BUDGET = 30_000;
let real: Plan;
beforeAll(() => {
    real = plan('1.0.0-alpha.0.9999', PACKAGES);
}, REAL_PLAN_BUDGET);

describe('the local publish set is derived, not listed', () => {
    const pkgs = workspace();

    it('finds the workspace', () => {
        // Without this, every filter below could be filtering an empty list and still look green.
        expect(pkgs.length, 'no packages found').toBeGreaterThan(8);
    });

    it('plans exactly the eight packages the registry carries', () => {
        const p = real;
        expect([...p.publish].sort()).toEqual([
            '@pdxui/cli',
            '@pdxui/compiler',
            '@pdxui/core',
            '@pdxui/design',
            '@pdxui/framework',
            '@pdxui/lsp',
            '@pdxui/router',
            '@pdxui/ui',
        ]);
    });

    it('keeps the near-misses out, each for its own reason', () => {
        const p = real;
        // Not private, and still not ours to publish here: wrong scope, wrong marketplace.
        expect(p.publish, 'pragmatic-pdx goes to the VS Code marketplace').not.toContain('pragmatic-pdx');
        // Private: the certification harness is neither published nor bumped.
        expect(p.publish, 'responsive went private on 2026-07-30').not.toContain('@pdxui/responsive');
        expect(p.bump.map(b => b.name), 'a private package is not dragged along').not.toContain('@pdxui/responsive');
        // Apps: their versions are their own and must not be dragged along.
        expect(p.bump.map(b => b.name)).not.toContain('@pdxui/site');
        expect(p.bump.map(b => b.name)).not.toContain('@pdxui/builder');
        expect(p.bump.map(b => b.name)).not.toContain('@pdxui/showcase');
    });

    it('bumps every member to the version it was given', () => {
        const p = real;
        expect(p.bump.length).toBeGreaterThan(0);
        expect(p.bump.every(b => b.to === '1.0.0-alpha.0.9999'), 'a member was left behind').toBe(true);
    });

    it('refuses a version that is not semver', () => {
        // `2.0` or `latest` is not a version npm can publish.
        expect(() => plan('2.0', PACKAGES)).toThrow();
    });
});

describe('the workspace invariants a publish depends on', () => {
    const pkgs = workspace();
    const inSet = pkgs.filter(m => m.name.startsWith('@pdxui/') && m.private !== true);

    it('has a set to check', () => {
        expect(inSet.length, 'no public package under the scope').toBeGreaterThan(5);
    });

    it('moves as one version', () => {
        expect([...new Set(inSet.map(m => m.version))],
            'the set is split across versions: a consumer would install a mix').toHaveLength(1);
    });

    it('pins internal dependencies with workspace:*, never a fixed version', () => {
        // A fixed pin survives the bump and publishes a set that points at the previous one.
        const fixed = pkgs.flatMap(m => internalDeps(m)
            .filter(([, range]) => !range.startsWith('workspace:'))
            .map(([dep, range]) => `${m.name} → ${dep}@${range}`));
        expect(fixed, 'an internal dependency is pinned instead of linked').toEqual([]);
    });

    it('never lets a publishable package depend on a private one', () => {
        // pnpm resolves workspace:* into an exact version at publish time; onto a private package
        // that version is never on the registry, and the consumer's npm i is where it shows up.
        const priv = new Set(pkgs.filter(m => m.private === true).map(m => m.name));
        const bad = pkgs
            .filter(m => m.private !== true && m.name.startsWith('@pdxui/'))
            .flatMap(m => internalDeps(m).filter(([dep]) => priv.has(dep)).map(([dep]) => `${m.name} → ${dep}`));
        expect(bad, 'a published package would resolve to a version the registry does not have').toEqual([]);
    });
});

describe('the planner on a synthetic workspace', () => {
    // The real workspace happens to be consistent today, so on its own it cannot show that the rules
    // are applied rather than merely satisfied. This one is deliberately inconsistent.
    function fixture(): string {
        const dir = mkdtempSync(join(tmpdir(), 'pdx-publish-'));
        const write = (folder: string, manifest: object): void => {
            mkdirSync(join(dir, folder), { recursive: true });
            writeFileSync(join(dir, folder, 'package.json'), JSON.stringify(manifest, null, 2));
        };
        write('alpha', { name: '@pdxui/alpha', version: '1.0.0-alpha.0.1334' });
        write('beta', { name: '@pdxui/beta', version: '1.0.0-alpha.0.1200' });         // behind
        write('secret', { name: '@pdxui/secret', version: '1.0.0-alpha.0.1334', private: true });
        write('app', { name: '@pdxui/app', version: '0.1.0', private: true });         // an app, private
        write('ext', { name: 'other-scope', version: '1.0.0-alpha.0.1334' });              // outside the scope
        return dir;
    }

    it('publishes and bumps the public scope, and leaves the rest alone', () => {
        const p = plan('1.0.0-alpha.0.1400', fixture());
        expect([...p.publish].sort()).toEqual(['@pdxui/alpha', '@pdxui/beta']);
        expect([...p.bump.map(b => b.name)].sort()).toEqual(['@pdxui/alpha', '@pdxui/beta']);
        expect(p.bump.every(b => b.to === '1.0.0-alpha.0.1400')).toBe(true);
    }, FIXTURE_BUDGET);

    it('moves the set to the first public release, 1.0.0-alpha.0', () => {
        // The version a version-shape rule could not express.
        const p = plan('1.0.0-alpha.0', fixture());
        expect([...p.publish].sort()).toEqual(['@pdxui/alpha', '@pdxui/beta']);
        expect(p.bump.every(b => b.to === '1.0.0-alpha.0')).toBe(true);
    }, FIXTURE_BUDGET);

    it('catches up a package that had fallen behind', () => {
        // `beta` sat at 1200. The plan must move it to the new version like everything else, not
        // apply a delta — that is how a set drifts apart one release at a time.
        const p = plan('1.0.0-alpha.0.1400', fixture());
        expect(p.bump.find(b => b.name === '@pdxui/beta')?.to).toBe('1.0.0-alpha.0.1400');
    }, FIXTURE_BUDGET);
});

// A version number says nothing about what was published: it is chosen by hand, and a registry can
// serve the repo's own version 52 commits after that version was published — a check that compares
// the two strings says "fresh". So the publish records
// the commit it ships (`gitHead`, npm's own field for it), and refuses to ship what no commit holds.
describe('what a publish records about its content', () => {
    it('names the commit it publishes', () => {
        expect(real.gitHead).toBe(git(ROOT, 'rev-parse', 'HEAD'));
    });

    function repoFixture(): string {
        const dir = mkdtempSync(join(tmpdir(), 'pdx-publish-git-'));
        mkdirSync(join(dir, 'packages', 'alpha', 'src'), { recursive: true });
        writeFileSync(join(dir, 'packages', 'alpha', 'package.json'),
            JSON.stringify({ name: '@pdxui/alpha', version: '1.0.0-alpha.0.1334' }, null, 2));
        writeFileSync(join(dir, 'packages', 'alpha', 'src', 'index.js'), 'export {};\n');
        git(dir, 'init', '-q');
        git(dir, 'config', 'core.autocrlf', 'false');
        git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.');
        git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'one');
        return dir;
    }

    it('calls a published package with uncommitted work dirty — its gitHead would be a lie', () => {
        const dir = repoFixture();
        expect(plan('1.0.0-alpha.0.1400', join(dir, 'packages')).dirty, 'control: a clean tree').toEqual([]);
        writeFileSync(join(dir, 'packages', 'alpha', 'src', 'late.js'), 'export const late = 1;\n');
        expect(plan('1.0.0-alpha.0.1400', join(dir, 'packages')).dirty.join('\n')).toContain('late.js');
    }, FIXTURE_BUDGET);

    it('does not call the version bump itself dirty', () => {
        // The bump rewrites package.json before the publish and is committed after it.
        const dir = repoFixture();
        writeFileSync(join(dir, 'packages', 'alpha', 'package.json'),
            JSON.stringify({ name: '@pdxui/alpha', version: '1.0.0-alpha.0.1400' }, null, 2));
        expect(plan('1.0.0-alpha.0.1400', join(dir, 'packages')).dirty).toEqual([]);
    }, FIXTURE_BUDGET);
});

// On the real workspace the planner runs `git status` once per package, while in a full gate the
// site build and three Playwright suites write under packages/. About 400 ms alone, it crosses
// vitest's 5 s default there, so a plan per test asking the same question would too. So it runs
// once, and this says so. `refuses a version that is not semver` is not counted: it
// throws on the version before any git runs.
describe('this file', () => {
    it('plans the real workspace once, not once per test', () => {
        expect(realWorkspacePlans).toBe(1);
    });
});
