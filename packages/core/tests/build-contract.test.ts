// What a package promises to ship, checked against how it builds it.
//
// A build of `tsc && vite build` loses its declarations: tsc emits them into dist/ and vite, whose
// `emptyOutDir` defaults to true for an outDir inside the root, deletes every one of them on the
// next command. Nobody notices while `types` points at `src/index.ts` and `files` ships `src`, so
// consumers take their types from raw source and never ask for the declarations. The second half
// of the same defect is a bundler build that emits no declarations at all.
//
// Two invariants, asserted on the packages each one can apply to:
//   1. a build that runs both a bundler and a declaration emitter runs the BUNDLER FIRST;
//   2. a package that has a build names a declaration file in `types`, not a TypeScript source.
//
// Deliberately structural: it reads package.json rather than shelling out to the builds. Running
// them would cost seconds on every suite run, and the defect it guards is an ordering mistake in a
// script, which is visible in the script.
//
// No assertion here is conditional at run time. A package the invariant cannot apply to is filtered
// out when the cases are built, so the suite never reports a green that compared nothing.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES = join(__dirname, '..', '..');

interface Pkg { name: string; build: string; types: string | undefined; exports?: Record<string, unknown> }

/** Every workspace package that is not marked private — i.e. everything that can be published. */
function publishable(): Pkg[] {
    return readdirSync(PACKAGES, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => join(PACKAGES, e.name, 'package.json'))
        .filter(existsSync)
        .map(p => JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>)
        .filter(pkg => pkg.private !== true)
        .map(pkg => ({
            name: String(pkg.name),
            build: String(((pkg.scripts ?? {}) as Record<string, string>).build ?? ''),
            types: pkg.types === undefined ? undefined : String(pkg.types),
            exports: pkg.exports as Record<string, unknown> | undefined,
        }));
}

const BUNDLERS = ['vite build', 'unbuild'];
const bundlerIndex = (build: string) =>
    Math.max(...BUNDLERS.map(b => build.indexOf(b)));

describe('build contract', () => {
    const pkgs = publishable();

    it('finds the publishable packages', () => {
        // A zero here would make every case below pass by iterating nothing.
        expect(pkgs.length).toBeGreaterThan(3);
    });

    // Invariant 1 — only packages that run both tools can get the order wrong.
    const ordered = pkgs.filter(p => p.build.includes('tsc') && bundlerIndex(p.build) !== -1);
    it('has packages that run both a bundler and tsc', () => {
        expect(ordered.length).toBeGreaterThan(0);
    });
    for (const p of ordered) {
        it(`${p.name}: the bundler runs before the declaration emitter`, () => {
            expect(
                bundlerIndex(p.build),
                `"${p.build}" runs tsc first; the bundler empties outDir and deletes what tsc emitted`,
            ).toBeLessThan(p.build.indexOf('tsc'));
        });
    }

    // Invariant 1-bis — condition ORDER. `types` pointing at `dist/*.d.ts` is right for a consumer
    // installing from npm, and wrong for this repository if it comes first: TypeScript picks the
    // first matching condition, so the monorepo silently starts needing a build to typecheck: with
    // no `development` condition on `@pdxui/compiler`, the CLI typechecks against whatever compiler
    // bundle is lying in dist, however many source files behind.
    const withDev = pkgs.filter(p => JSON.stringify(p.exports ?? {}).includes('"development"'));
    it('has packages declaring a development condition', () => {
        expect(withDev.length).toBeGreaterThan(0);
    });
    for (const p of withDev) {
        it(`${p.name}: "development" comes before "types" in every export entry`, () => {
            const wrong: string[] = [];
            for (const [subpath, def] of Object.entries(p.exports ?? {})) {
                if (!def || typeof def !== 'object') continue;
                const keys = Object.keys(def as Record<string, unknown>);
                const dev = keys.indexOf('development');
                const types = keys.indexOf('types');
                if (dev !== -1 && types !== -1 && types < dev) wrong.push(subpath);
            }
            expect(wrong, `${p.name} resolves these to dist/ in-repo: ${wrong.join(', ')}`).toEqual([]);
        });
    }

    // Invariant 1-ter — an `exports` entry that resolves ONLY to dist. The order check above assumes
    // a `development` condition exists; a package that declares none is invisible to it, and can
    // send consumers to a stylesheet built from source files older than the ones in the tree.
    //
    // Inside this repository the PDX Vite plugin aliases `@pdxui/design` to its `main` field, which
    // points at src, so nothing here serves the stale file. But that is an ACCIDENT of a legacy
    // field no modern resolver reads — `exports` wins for everyone else, and deleting `main` would
    // move the site onto the stale build with nothing to notice.
    //
    // The rule: if an entry names a dist path, it must also offer a source condition.
    const distOnly: string[] = [];
    for (const p of pkgs) {
        for (const [subpath, def] of Object.entries(p.exports ?? {})) {
            const targets = typeof def === 'string' ? { default: def } : (def as Record<string, string> | null);
            if (!targets) continue;
            const values = Object.values(targets).filter(v => typeof v === 'string');
            const hitsDist = values.some(v => v.includes('/dist/'));
            const hasSource = 'development' in targets || values.some(v => v.includes('/src/'));
            if (hitsDist && !hasSource) distOnly.push(`${p.name} ${subpath}`);
        }
    }
    it('no export entry resolves to dist with no source condition beside it', () => {
        expect(
            distOnly,
            'these send an in-repo consumer to a build that may be older than the source it was built from',
        ).toEqual([]);
    });

    // Invariant 2 — a package with no build has nothing to point `types` at, and whether it should
    // have a build is a separate question. A package with a
    // build and no `types` field is not making a promise to break.
    const typed = pkgs.filter(p => p.build !== '' && p.types !== undefined);
    it('has built packages that declare types', () => {
        expect(typed.length).toBeGreaterThan(0);
    });
    for (const p of typed) {
        it(`${p.name}: "types" names a declaration file`, () => {
            expect(
                p.types!,
                `"types": "${p.types}" ships TypeScript source instead of declarations`,
            ).toMatch(/\.d\.ts$/);
        });
    }
});
