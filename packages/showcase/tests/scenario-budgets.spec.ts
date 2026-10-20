/**
 * What the smallest PDX apps weigh, as a ratchet (#244).
 *
 * The showcase's and the site's budgets hold two large apps. Nothing held the size of a small one, so
 * a change that pulled the router or the data layer into every component's bundle passed every gate.
 * Two scenario apps, each built by `scenarios-build.ts` before this runs:
 *
 *   - `hello` — one component, one `$signal`, one button: the first thing someone comparing frameworks
 *     builds, and the floor every PDX app pays;
 *   - `benchmark` — the js-framework-benchmark app, `scripts/bench-jfb/`, built with its own config.
 *
 * Gzipped JS and CSS of each, against a budget held the way `bundle-budget.spec.ts` holds the
 * showcase's: it may be raised only in the change that needs it, with the reason beside it, and
 * `SLACK_SHARE` fails a budget left too far above the measurement.
 *
 * And for `hello`, what is in it: the build writes `modules.json`, and no module of the router, the
 * forms or the async data layer may be there. A size that stays under its budget can still hide a
 * module that has no business in a counter.
 *
 * Two more (#245): `crud`, one routed page with a named `@loader`, a `@form`, an `@action` and a
 * `@for` of 100 rows; `dashboard`, four `@defer` panels, a `@virtual` list of 10,000 rows and one
 * theme. Their `modules.json` says that the crud page carries what it is there to weigh, and that
 * each deferred panel is out of the dashboard's entry (L5).
 */
import { test, expect } from './fixture';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { scenarioDist } from './scenarios-build';

/**
 * Each budget is its measurement + 10%, to a tenth of a kilobyte, measured 2026-10-15:
 *
 *   hello       js 3.8 KB    css 0     — the counter ships no stylesheet
 *   benchmark   js 16.5 KB   css 0     — its stylesheet is the benchmark's own, linked at runtime
 *
 * A CSS budget of 0 is a budget: the first stylesheet either app ships is a change to argue for.
 *
 * The two scenarios a team evaluating PDX for an application builds (#245), measured 2026-10-21:
 *
 *   crud        js 47.3 KB   css 1.4 KB  — a routed page: the router, a named @loader and its cache,
 *                                          a @form in <pdx-form> with three <pdx-input>, an @action
 *   dashboard   js 23.4 KB   css 19.9 KB — four @defer panels, a @virtual list, the design system's
 *                                          base and one theme, which is all of its CSS
 *
 * hello measured 4.0 KB before this file existed: core's form registry registered its built-in
 * controls at load, so every app carried it whether or not it had a form. Its controls are the
 * registry's initial value now, and a bundler drops it from an app that never asks (#244).
 */
const BUDGET_KB: Record<string, { js: number; css: number }> = {
    hello: { js: 4.2, css: 0 },
    benchmark: { js: 18.2, css: 0 },
    crud: { js: 52.1, css: 1.6 },
    dashboard: { js: 25.8, css: 21.9 },
};
/**
 * How much headroom a budget may keep before it stops measuring anything, as a share of the
 * measurement: these bundles are a few kilobytes, and the showcase's fixed 4 KB would be its whole
 * size here. 15% leaves the 10% a budget is set with, and the rounding.
 */
const SLACK_SHARE = 0.15;

function gzippedKb(name: string, ext: '.js' | '.css'): number {
    const dir = join(scenarioDist(name), 'assets');
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(ext)) : [];
    const bytes = files.reduce((sum, f) => sum + gzipSync(readFileSync(join(dir, f))).length, 0);
    return Math.round((bytes / 1024) * 10) / 10;
}

for (const name of Object.keys(BUDGET_KB)) {
    test.describe(`the ${name} scenario`, () => {
        test('was built, and its JavaScript is not empty', () => {
            const dir = join(scenarioDist(name), 'assets');
            expect(existsSync(dir), `no build of ${name} in ${dir}`).toBe(true);
            // An empty module gzips to a few dozen bytes and would pass every budget below.
            expect(gzippedKb(name, '.js'), `the ${name} bundle is empty`).toBeGreaterThan(1);
        });

        for (const key of ['js', 'css'] as const) {
            test(`its ${key} is within its budget, and the budget is not stale`, () => {
                const kb = gzippedKb(name, key === 'js' ? '.js' : '.css');
                const budget = BUDGET_KB[name][key];
                console.log(`[scenario] ${name} ${key} ${kb} KB gzipped (budget ${budget})`);
                expect(kb, `the ${name} ${key} is ${kb} KB gzipped, the budget is ${budget} KB — say in the commit why it grew`)
                    .toBeLessThanOrEqual(budget);
                // To a tenth, as the measurement is: 1.6 - 1.4 is 0.20000000000000018 in floating point.
                expect(Math.round((budget - kb) * 10) / 10, `the ${name} ${key} budget is ${budget} KB and the build is ${kb} KB — lower the budget`)
                    .toBeLessThanOrEqual(Math.round(kb * SLACK_SHARE * 10) / 10);
            });
        }
    });
}

/** Modules a counter has no use for: the router, the forms, the async data layer. */
const NOT_IN_HELLO = [
    'packages/router/src/',
    'packages/core/src/form/',
    'packages/core/src/reactivity/resource.ts',
    'packages/core/src/reactivity/http-resource.ts',
    'packages/core/src/reactivity/use-query.ts',
];

test('the hello bundle carries no router, no forms and no resource code', () => {
    const chunks = JSON.parse(readFileSync(join(scenarioDist('hello'), 'modules.json'), 'utf8')) as Record<string, string[]>;
    const modules = Object.values(chunks).flat().map((m) => m.replaceAll('\\', '/'));
    // The control: the list names core's sources. A list of dist files, or an empty one, would let
    // the assertion below pass without looking at anything.
    expect(modules.some((m) => m.includes('packages/core/src/')), 'modules.json names no module of core\'s sources')
        .toBe(true);
    const found = modules.filter((m) => NOT_IN_HELLO.some((p) => m.includes(p)));
    expect(found, 'modules a one-signal counter should not carry').toEqual([]);
});

/** A scenario's chunks, by file name, each with the modules in it, separators normalised. */
function chunksOf(name: string): Record<string, string[]> {
    const chunks = JSON.parse(readFileSync(join(scenarioDist(name), 'modules.json'), 'utf8')) as Record<string, string[]>;
    return Object.fromEntries(Object.entries(chunks).map(([file, mods]) => [file, mods.map((m) => m.replaceAll('\\', '/'))]));
}

/**
 * What the crud budget weighs (#245): the constructs the page is made of. A build that lost one of
 * them — a scenario that stopped declaring its loader, say — would weigh less and pass its budget
 * while no longer measuring what it says.
 */
const IN_CRUD = [
    'packages/router/src/loaders.ts',
    'packages/router/src/loader-cache.ts',
    'packages/core/src/form/',
    'packages/core/src/reactivity/mutation.ts',
    'scenarios/crud/src/crud-people.pdx',
];

test('the crud bundle carries the loader, the form and the action it is there to weigh', () => {
    const modules = Object.values(chunksOf('crud')).flat();
    const missing = IN_CRUD.filter((p) => !modules.some((m) => m.includes(p)));
    expect(missing, 'constructs the crud page is made of, absent from its build').toEqual([]);
});

/** Each deferred panel of the dashboard, by the module of its component. */
const DEFERRED_PANELS = ['dash-sales.pdx', 'dash-traffic.pdx', 'dash-alerts.pdx', 'dash-team.pdx'];

test('each @defer panel of the dashboard is in a chunk of its own, not in the entry (L5)', () => {
    const chunks = chunksOf('dashboard');
    const entry = Object.entries(chunks).filter(([, mods]) => mods.some((m) => m.endsWith('scenarios/dashboard/src/dash-board.pdx')));
    // The control: the board is found, in one chunk. Without it every panel would be "not in the entry".
    expect(entry.map(([file]) => file), 'no single chunk holds the board').toHaveLength(1);
    const [entryFile, entryModules] = entry[0];
    for (const panel of DEFERRED_PANELS) {
        const holders = Object.entries(chunks).filter(([, mods]) => mods.some((m) => m.endsWith(`scenarios/dashboard/src/${panel}`)));
        expect(holders.length, `${panel} is in no chunk at all`).toBeGreaterThan(0);
        expect(entryModules.some((m) => m.endsWith(panel)), `${panel} is in the entry, ${entryFile}`).toBe(false);
    }
});
