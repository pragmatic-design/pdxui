// A suite nothing runs is a suite that has stopped measuring.
//
// A suite that `pnpm test` runs and no GATE runs looks covered to anyone who types it: they see
// green, while CI and the pre-push hook pass either way. A `coverage` script filtered to a few
// packages is not a stand-in for running the suites.
//
// The builder's `test:static` is the sharpest case: it exists because a static build can be empty
// and answer 200 to everything, and "a 200 is exactly what a missing file looks like there". A
// suite written to catch a shipped defect is worth nothing if nothing calls it.
//
// This asserts the WIRING, which is a claim about configuration and admits it. It cannot prove a CI
// run is green — only a CI run can — but it can stop the wiring from silently coming undone.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');
const PACKAGES = join(REPO, 'packages');

const rootPkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf-8')) as {
    scripts: Record<string, string>;
};

/** Package name → directory under packages/. */
const dirOfName = new Map(readdirSync(PACKAGES)
    .filter(d => existsSync(join(PACKAGES, d, 'package.json')))
    .map(d => [(JSON.parse(readFileSync(join(PACKAGES, d, 'package.json'), 'utf-8')) as { name: string }).name, d]));

/**
 * What `pnpm typecheck` runs tsc over, read from the script. Each `&&` segment is
 * `pnpm --filter A --filter B exec tsc --noEmit [-p file]`: without `-p` each named package's own
 * tsconfig.json, with it that file in the named package (each project runs with the
 * TypeScript of the package that owns it, not a tsc the root does not declare).
 */
function typecheckTargets(script: string): { defaults: string[]; projects: Set<string> } {
    const defaults: string[] = [];
    const projects = new Set<string>();
    for (const seg of script.split('&&')) {
        if (!/\bexec tsc\b/.test(seg)) continue;
        const names = [...seg.matchAll(/--filter (\S+)/g)].map(m => m[1]);
        const project = /\s-p\s+(\S+)/.exec(seg)?.[1];
        if (!project) { defaults.push(...names); continue; }
        for (const n of names) projects.add(`${dirOfName.get(n) ?? n}/${project}`);
    }
    return { defaults, projects };
}

interface Pkg { dir: string; name: string; private: boolean; testScripts: string[] }

const packages: Pkg[] = readdirSync(PACKAGES)
    .filter(d => existsSync(join(PACKAGES, d, 'package.json')))
    .map(d => {
        const p = JSON.parse(readFileSync(join(PACKAGES, d, 'package.json'), 'utf-8')) as {
            name: string; private?: boolean; scripts?: Record<string, string>;
        };
        return {
            dir: d,
            name: p.name,
            private: p.private === true,
            testScripts: Object.keys(p.scripts ?? {}).filter(k => k === 'test' || k.startsWith('test:')),
        };
    });

const withPlainTest = packages.filter(p => p.testScripts.includes('test'));
const workflows = join(REPO, '.github', 'workflows');
const quality = readFileSync(join(workflows, 'quality.yml'), 'utf-8');
const prePush = readFileSync(join(REPO, '.githooks', 'pre-push'), 'utf-8');

describe('the suites exist and are reachable in one command', () => {
    it('found the packages that carry a suite', () => {
        // A zero here would make everything below pass by checking nothing.
        expect(withPlainTest.length).toBeGreaterThanOrEqual(6);
    });

    it('the root `test` script runs every package, not a filtered subset', () => {
        // `coverage` filters to four packages on purpose — it is a coverage goal, not a run goal.
        // If `test` ever grows a filter that DROPS a package, the same substitution happens again.
        //
        // The property is: one command, no package left out. The run is split in two — the vitest
        // projects in parallel, then the three browser suites one at a time — because twelve
        // projects at once made the aggregate fail one run in two while every suite passed alone.
        // A literal string such as `pnpm -r run test` would only be a proxy for the property, so the
        // property is asserted directly, which is the stronger check: a literal string cannot catch a
        // --filter that drops a package, it can only catch any --filter at all.
        const { test, 'test:unit': unit, 'test:browser': browser } = rootPkg.scripts;

        expect(test, 'the root gate must run both halves').toContain('test:unit');
        expect(test, 'the root gate must run both halves').toContain('test:browser');

        // The unit half may only EXCLUDE (`--filter=!x`): an inclusion list would silently drop the
        // next package somebody adds, and its tests would go unrun.
        const inclusions = [...unit.matchAll(/--filter[= ](?!!)(\S+)/g)].map(m => m[1]);
        expect(inclusions, 'the unit half names packages to INCLUDE, so a new one joins no gate')
            .toEqual([]);

        // Everything the unit half excludes, the browser half must run.
        const excluded = [...unit.matchAll(/--filter=!(\S+)/g)].map(m => m[1]);
        const inBrowser = [...browser.matchAll(/--filter[= ](\S+)/g)].map(m => m[1]);
        expect(excluded.length, 'nothing is excluded, so the split has come undone').toBeGreaterThan(0);
        expect([...excluded].sort(), 'these are excluded from one half and run by neither')
            .toEqual([...inBrowser].sort());

        // Serial is the point of the split, not an accident of it.
        expect(browser, 'the browser suites run concurrently again').toContain('--workspace-concurrency=1');
    });
});

describe('a gate runs them', () => {
    it('CI runs `pnpm test`, not only `pnpm coverage`', () => {
        expect(quality, 'no workflow step runs the suites').toMatch(/run:\s*pnpm test\b/);
    });

    it('the pre-push hook runs them too, and before the slower certify', () => {
        expect(prePush).toContain('pnpm test');
        expect(
            prePush.indexOf('pnpm test'),
            'certify takes minutes; the cheaper gate must fail first',
        ).toBeLessThan(prePush.indexOf('pnpm certify'));
    });

    // Dim 5 in CI only, and in no local gate, lets a change move dozens of screenshots with no red
    // seen. It runs before a push when Docker answers, and says so and carries on when it does
    // not — a machine without Docker still pushes.
    it('the pre-push runs the visual certification, last and only with Docker', () => {
        expect(prePush, 'the visual dimension is in no local gate').toContain('pnpm certify:visual');
        const certify = prePush.search(/^\s*pnpm certify\s*$/m);
        expect(certify, 'no line runs `pnpm certify` on its own').toBeGreaterThan(-1);
        expect(prePush.indexOf('pnpm certify:visual'), 'the slowest phase runs last').toBeGreaterThan(certify);
        expect(prePush, 'no way to skip a Docker phase').toContain('PDX_SKIP_VISUAL');
        expect(prePush, 'nothing asks whether Docker answers').toMatch(/docker info/);
    });
});

// A package whose code ships and that no `tsc` reads is a package where a type error is a runtime
// error. vitest strips types, so a suite can run code nobody type-checks, and a type error goes
// through `pnpm test`, `typecheck`, `lint` and `certify`. So `packages/design/src/engine`
// (createTheme, validateTokenContrast, parseColorToken) and the CLI are in the type gate, and the
// CLI is in lint too.
describe('the type gate reads the code that ships', () => {
    const typecheck = rootPkg.scripts.typecheck;
    const lint = rootPkg.scripts.lint;

    it('type-checks the CLI', () => {
        expect(typecheck, 'nothing runs tsc over packages/cli/src').toContain('@pdxui/cli');
    });

    it('type-checks the design engine, which has a project file and no package `typecheck`', () => {
        // @pdxui/design has no tsconfig.json, only tsconfig.engine.json: a --filter would find
        // no project there, so the script names the project explicitly.
        expect(existsSync(join(PACKAGES, 'design', 'tsconfig.engine.json')),
            'the engine project file is gone; the script below points at nothing').toBe(true);
        expect(typecheckTargets(typecheck).projects.has('design/tsconfig.engine.json'),
            'the engine is checked by hand or not at all').toBe(true);
    });

    // The rule, rather than another name added to a list by hand. A package with a tsconfig.json,
    // no `typecheck` script and no mention in this one is compiled by nothing — for
    // `@pdxui/responsive` that is the whole certification harness, the manifests and the specs.
    //
    // What that costs is not hypothetical: uncompiled code lets a rule against a type with no such
    // property drop a regression guard in silence, and lets a Playwright test written with Vitest's
    // `(title, fn, timeout)` signature never apply its deadline.
    it('names every package that has a tsconfig.json', () => {
        const withProject = readdirSync(PACKAGES)
            .filter(d => existsSync(join(PACKAGES, d, 'tsconfig.json'))
                && existsSync(join(PACKAGES, d, 'package.json')))
            .map(d => ({
                dir: d,
                name: (JSON.parse(readFileSync(join(PACKAGES, d, 'package.json'), 'utf-8')) as { name: string }).name,
            }));
        expect(withProject.length, 'no package has a tsconfig.json — this test is measuring nothing')
            .toBeGreaterThan(5);

        // Either its own tsconfig.json runs, or one of its explicit projects does (design's engine).
        const { defaults, projects } = typecheckTargets(typecheck);
        const missing = withProject
            .filter(p => !defaults.includes(p.name)
                && ![...projects].some(proj => proj.startsWith(`${p.dir}/`)))
            .map(p => p.name);
        expect(missing, 'these packages have a TypeScript project that `pnpm typecheck` never opens')
            .toEqual([]);
    });

    it('does not name a package that has no project for tsc to find', () => {
        // The other direction: a --filter whose package has no tsconfig.json makes `tsc --noEmit`
        // fall back to whatever it finds upwards, or to nothing — green either way, and green for
        // the wrong reason.
        // Only where no `-p` says which project: an explicit project names its own file.
        const { defaults, projects } = typecheckTargets(typecheck);
        expect(defaults.length, 'the typecheck script names no package at all').toBeGreaterThan(5);
        const projectless = defaults.filter(name => {
            const dir = dirOfName.get(name);
            return !dir || !existsSync(join(PACKAGES, dir, 'tsconfig.json'));
        });
        expect(projectless, 'named by --filter, but tsc has no project to read there').toEqual([]);
        const missingFiles = [...projects].filter(p => !existsSync(join(PACKAGES, p)));
        expect(missingFiles, 'an explicit project that does not exist').toEqual([]);
    });

    it('lints the CLI', () => {
        expect(lint, 'packages/cli/src is linted by nobody').toContain('packages/cli/src');
    });

    it('`lint:fix` covers what `lint` covers', () => {
        // The two drift apart silently, and then `lint:fix` leaves errors `lint` reports.
        const dirs = (script: string) => [...script.matchAll(/packages\/[a-z-]+\/src/g)].map(m => m[0]).sort();
        expect(dirs(rootPkg.scripts['lint:fix'])).toEqual(dirs(lint));
    });
});

describe('a failing package cannot hide behind another', () => {
    // `pnpm coverage` runs four packages. Without --no-bail it stops at the first failure, so the
    // other three are never measured: the first package's error is the one everyone reads, and
    // the others can miss their thresholds behind it. Broken gates behind one visible error.
    it('coverage runs every package even when one fails', () => {
        expect(rootPkg.scripts.coverage, 'without --no-bail only the first failure is ever seen')
            .toContain('--no-bail');
    });
});

describe('the gate is triggered by every change', () => {
    // A step that runs `pnpm test` is worth nothing on a change the workflow does not react to, and
    // Quality is a REQUIRED check on `main`: a required check that a path filter skips never reports,
    // and the pull request waits on "Expected" forever. So no path filter, on a pull request or on a
    // push — which also covers every package with a suite, including one added tomorrow.
    it('has no path filter on pull_request or push', () => {
        const triggers = quality.slice(quality.indexOf('\non:'), quality.indexOf('\npermissions:'));
        expect(triggers, 'quality.yml has no `on:` block before `permissions:`').toContain('pull_request');
        expect(triggers, 'a path filter skips the required check on the changes it does not name')
            .not.toMatch(/^\s+paths(-ignore)?:/m);
    });
});

describe('every package with a suite is reachable from `pnpm test`', () => {
    // `pnpm -r run test` runs the `test` script of every package. A package that has test:* scripts
    // and NO `test` script is invisible to it by construction.
    //
    // A workflow is not enough. A change to a THEME can break a package's assertions while
    // `pnpm test` stays green, because it never runs them; CI catches it only on a push, and a gate
    // that only fires at the end of the week is not the gate you develop against.
    //
    // So the builder has a `test` script that runs both its suites, and the rule is general:
    // carrying test:* scripts without a `test` script puts them outside the command everyone types.
    const unreachable = packages.filter(p => p.testScripts.length > 0 && !p.testScripts.includes('test'));

    it('leaves no package outside it', () => {
        expect(unreachable.map(p => p.dir),
            'these carry tests that `pnpm test` cannot reach').toEqual([]);
    });

    it('still finds packages to check, so the assertion above is not vacuous', () => {
        const withAnyTests = packages.filter(p => p.testScripts.length > 0);
        expect(withAnyTests.length).toBeGreaterThanOrEqual(6);
    });

    // Deliberately not asserted: that every test:* script is named by a workflow. `responsive` has
    // test:certify and test:docker, and certify.yml runs those suites by invoking playwright
    // directly rather than through the script name, so a name-matching rule would report covered
    // suites as orphans.
    it('runs the builder through both of its suites, not just the dev one', () => {
        // test:static exists because a static build can be empty and
        // answer 200 to everything, and "a 200 is exactly what a missing file looks like there".
        const builder = packages.find(p => p.dir === 'builder');
        expect(builder, 'the builder package is gone').toBeDefined();
        const script = builderTestScript();
        expect(script, 'the builder has no test script again').toBeTruthy();
        expect(script, 'the dev suite is not run by `pnpm test`').toContain('test:e2e');
        expect(script, 'the deployed build is not certified by `pnpm test`').toContain('test:static');
    });
});

/** The builder's `test` script body, read from its package.json. */
function builderTestScript(): string {
    const pkg = JSON.parse(
        readFileSync(join(PACKAGES, 'builder', 'package.json'), 'utf-8'),
    ) as { scripts?: Record<string, string> };
    return pkg.scripts?.test ?? '';
}

// ─── the TYPE gate, which can have the same hole as the test gate ─────────────────────────────
//
// A package's `tsconfig.json` is a BUILD project: `rootDir: src`, `outDir: dist`, `exclude: tests`.
// Run alone, the command that is supposed to say "the types are sound" compiles the source and not
// a single test file — and untyped tests hide real defects: assertions passing an argument a
// function no longer takes, a fixture missing fields of the type it claims to be, a `waitFor`
// handed an assertion instead of a predicate so it never waits, a `@ts-expect-error` hiding a
// stale JSDoc.
//
// Packages with tests carry a second project, `tsconfig.test.json`, that emits nothing and includes
// the tests. What follows keeps the wiring: that those projects are RUN, and that no package
// quietly grows TypeScript nothing compiles.

/** `tsconfig` files are JSONC: `//` line comments, and a `"//"` KEY used as a note. */
function readJsonc(path: string): Record<string, unknown> {
    const src = readFileSync(path, 'utf-8');
    let out = '';
    let inString = false;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (inString) {
            out += c;
            if (c === '\\') { out += src[++i] ?? ''; continue; }
            if (c === '"') inString = false;
            continue;
        }
        if (c === '"') { inString = true; out += c; continue; }
        if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; continue; }
        out += c;
    }
    return JSON.parse(out) as Record<string, unknown>;
}

/** The `include` patterns of every `tsconfig*.json` a package holds, flattened. */
function includesOf(dir: string): string[] {
    return readdirSync(join(PACKAGES, dir))
        .filter(f => /^tsconfig.*\.json$/.test(f))
        .flatMap(f => (readJsonc(join(PACKAGES, dir, f)).include as string[]) ?? []);
}

/** Every `.ts` file a package holds, as paths relative to it, forward slashes. */
function tsFilesOf(dir: string): string[] {
    const out: string[] = [];
    const walk = (abs: string, rel: string): void => {
        for (const entry of readdirSync(abs, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (['node_modules', 'dist', 'coverage', '.turbo'].includes(entry.name)) continue;
                walk(join(abs, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
            } else if (entry.name.endsWith('.ts')) {
                out.push(rel ? `${rel}/${entry.name}` : entry.name);
            }
        }
    };
    walk(join(PACKAGES, dir), '');
    return out;
}

// Does an `include` pattern reach this file? Only the three forms this repository writes: a bare
// directory, a glob rooted at one, and a single named file. A pattern that climbs out of the
// package belongs to another package and is ignored here.
function reaches(pattern: string, file: string): boolean {
    if (pattern.startsWith('..')) return false;
    if (pattern === '*.ts') return !file.includes('/');
    const star = pattern.indexOf('*');
    if (star === -1) return pattern.endsWith('.ts') ? pattern === file : file.startsWith(`${pattern}/`);
    return file.startsWith(pattern.slice(0, star));
}

/** `pkg/dir` → how many `.ts` files under it no project compiles. */
function orphanGroups(): Map<string, number> {
    const out = new Map<string, number>();
    for (const dir of readdirSync(PACKAGES).filter(d => existsSync(join(PACKAGES, d, 'package.json')))) {
        const patterns = includesOf(dir);
        if (patterns.length === 0) continue;
        for (const file of tsFilesOf(dir)) {
            if (patterns.some(p => reaches(p, file))) continue;
            const key = `${dir}/${file.includes('/') ? file.split('/')[0] : '.'}`;
            out.set(key, (out.get(key) ?? 0) + 1);
        }
    }
    return out;
}

/**
 * TypeScript that NO project compiles, with the reason it is still out. This list may only shrink:
 * adding to it is a decision, and it is checked below for entries that have stopped being true.
 *
 * `design`'s suites and generator have a project of their own, and the build configs at
 * package roots — `vite.config.ts`, `vitest.perf.config.ts`, `build.config.ts` — are in the
 * projects of the packages that hold them. That matters: a config that declares a `test` block
 * through Vite's `defineConfig`, which has no such key, leaves the block untyped, and a misspelt
 * option in it would be silent.
 */
const UNCHECKED: Record<string, string> = {
    // Fixtures the compiler tests read. They are inputs, not code this repository runs, and the
    // suites that read them read them as TEXT.
    'compiler/demo': 'demo fixtures are test DATA',
};

describe('the type gate reaches the code each package holds', () => {
    const withTsconfig = readdirSync(PACKAGES).filter(d => existsSync(join(PACKAGES, d, 'tsconfig.json')));

    it('found the packages to check, so the assertions below are not vacuous', () => {
        expect(withTsconfig.length, 'no package has a tsconfig.json any more').toBeGreaterThanOrEqual(10);
    });

    it('runs every test project that exists on disk', () => {
        // A `tsconfig.test.json` nobody runs is the hole this test exists to keep shut: it would
        // look exactly like coverage while compiling nothing.
        const onDisk = withTsconfig.filter(d => existsSync(join(PACKAGES, d, 'tsconfig.test.json')));
        expect(onDisk.length, 'no package carries a test project any more').toBeGreaterThanOrEqual(6);
        const { projects } = typecheckTargets(rootPkg.scripts.typecheck);
        const missing = onDisk.filter(d => !projects.has(`${d}/tsconfig.test.json`));
        expect(missing, 'these test projects exist and `pnpm typecheck` never runs them').toEqual([]);
    });

    it('leaves no TypeScript outside every project but what is written down', () => {
        const unexplained = [...orphanGroups()]
            .filter(([key]) => !(key in UNCHECKED))
            .map(([key, n]) => `${key} (${n} files)`);
        expect(unexplained.sort(), 'these hold TypeScript that no tsconfig compiles').toEqual([]);
    });

    it('the written-down exceptions are still real, so the list cannot rot into a lie', () => {
        // An entry whose files a project has since taken in — or which no longer exist — must be
        // deleted, not carried: a stale exception is how a hole reopens without anyone noticing.
        const groups = orphanGroups();
        const stale = Object.keys(UNCHECKED).filter(key => !groups.has(key));
        expect(stale.sort(), 'these are compiled now, or gone: drop them from UNCHECKED').toEqual([]);
    });
});
