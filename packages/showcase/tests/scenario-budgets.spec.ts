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
 *
 * Measured again 2026-11-03 (#492): benchmark js 17.9 → 13.1 KB, dashboard js 23.7 → 19.0 KB.
 * `component()` imported the html`` engine for `ctx.slot()`'s default, so every app carried it; with
 * the alpha slots' runtime removed it is not imported, and a bundler drops it from an app that never
 * writes html``. Measured with the import put back: the two came back to 17.9 and 23.7.
 *
 * Raised for value rows (#1237, owner's OK): benchmark js 14.4 → 14.8, crud 52.1 → 52.2, dashboard
 * 20.9 → 21.1. A row that reads its item as a value is an eachStatic row now, updated in place for
 * a new item, so these apps carry list-static.ts and core's collectRowRuns. What it buys, on
 * js-framework-benchmark's script time (median of 3 runs): create 1k 7.8 → 6.2 ms, replace 14.7 →
 * 11.9, update every 10th 4.8 → 3.4, append 7.4 → 6.5.
 *
 * #1246, core's modules that did work at load out of every bundle that does not use them: benchmark
 * js 14.8 → 13.2 KB measured (budget 13.5), dashboard 21.1 → 20.0 (budget 20.3); crud 51.9, its
 * budget kept. And hello 4.2 → 8.3: it never weighed a counter. Its `hello.pdx` had its markup outside
 * `<template>`, which the compiler dropped with no word (#1249), so the app registered no component
 * and its 3.8 KB were those load-time modules alone; with them gone it weighed 0.6 KB and failed "not
 * empty" below. Written as the counter it says it is, it measures 8.0 KB — the floor every app pays.
 *
 * #1246's second part, core's inspector and devtools API out of production bundles: hello 8.0 → 7.8,
 * benchmark 13.2 → 13.0, crud 51.9 → 51.4, dashboard 20.0 → 19.8, each budget the measurement + 0.3.
 *
 * #1246's part 3a, HMR's bookkeeping behind DEV (the setup's signal map, the live-instance registry,
 * the state save and restore): hello 7.8 → 7.6, benchmark 13.0 → 12.8, crud 51.4 → 51.2, dashboard
 * 19.8 → 19.7, each budget the measurement + 0.3.
 *
 * #1246's part 3b, a prop's property the class's accessor instead of one defined on every instance at
 * every mount: hello 7.6 → 7.9, benchmark 12.8 → 13.1, crud 51.2 → 51.4, dashboard 19.7 → 19.9, within
 * the budgets above. The accessor is more code than the closures, once per app; a mount of 1,000
 * components takes 0.73–0.80× the time and their removal 0.54–0.64× (the showcase's bundle budget has
 * the measurements).
 *
 * #1246's part 3c, a compiled component defined with `defineComponent` and the features it declares
 * (`expose`, `host`): an app whose components declare neither carries neither. hello 7.9 → 7.3,
 * dashboard 19.9 → 19.3, benchmark 13.1 as it was; crud 51.4 → 51.5, the cost of the definition's
 * indirection in an app whose components use both. Each budget the measurement + 0.3.
 *
 * #1246's part 3c, the form API (ElementInternals, `form`, `labels`, validity, the form callbacks) in
 * FormPdxElement, the base of a form-associated component only: hello 7.3 → 7.1, benchmark 12.5 →
 * 12.3 (12,824 → 12,571 B), dashboard 19.3 → 19.1, crud 51.5 as it was. The benchmark had read 13.1
 * here: it is built with the compiler's dist, and a stale one emitted the definition every feature
 * carries. Each budget the measurement + 0.3.
 *
 * #1246's part 3c, slot projection in its own module, carried by a component whose template renders
 * a <slot>: hello 7.1 → 6.6, benchmark 12.3 → 11.8, dashboard 19.1 → 18.6; crud 51.5 → 51.6, an app
 * whose library components are defined with component(), which carries every feature. Each budget the
 * measurement + 0.3.
 *
 * #1246's last part, a keyed list's transitions run with the animation its options name instead of a
 * static import in list.ts, and the benchmark's own build with no modulepreload polyfill: benchmark
 * 11.8 → 10.9 (11,212 B), crud 51.6 → 51.2, dashboard 18.6 → 18.2, hello 6.6 as it was. Each budget
 * the measurement + 0.3.
 */
const BUDGET_KB: Record<string, { js: number; css: number }> = {
    hello: { js: 6.9, css: 0 },
    benchmark: { js: 11.2, css: 0 },
    crud: { js: 51.5, css: 1.6 },
    dashboard: { js: 18.5, css: 21.9 },
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

/**
 * Core's modules that did work when they loaded, whatever the app used (#1246): listeners on the window
 * and the document, signals, a localStorage read. Each now starts on its first use, and an app that
 * uses none of them carries none: they left core's `sideEffects`, which kept them in every bundle.
 */
const NOT_IN_A_SMALL_APP = [
    'packages/core/src/component/viewport.ts',
    'packages/core/src/component/adaptive.ts',
    'packages/core/src/browser/online.ts',
    'packages/core/src/i18n/rtl.ts',
    'packages/core/src/component/overlay-stack.ts',
    'packages/core/src/component/context.ts',
    'packages/core/src/browser/splash.ts',
    'packages/core/src/component/style.ts',
];

/**
 * What core's inspector and devtools API leave in a bundle that carries them (#1246, second part):
 * the keys of their registries and summaries, the events their callers pass, their globals. Read in
 * the minified file, not in `modules.json`: Rollup can keep a declaration of theirs whose every caller
 * a folded `DEV` removed, which the minifier then drops, so the module list names them while the file
 * carries none of their code. Every call into them is behind DEV, and these say so where it counts.
 */
const DEBUG_CODE = [
    'subscriberCount', 'cycleDetections', 'signal:change', 'component:mount', 'list:reconcile', '__PDX_DEVTOOLS__', 'pdx.telemetry',
    // HMR's (#1246, part 3a): a component's state saved and restored across a hot update, and the
    // registry of live instances it reaches them by — development only.
    '__pdx_saveState', '__pdx_restoreState',
];

/**
 * The features of a component's definition (#1246, part 3c), each a module a compiled component names
 * when it declares it: `@expose`, `@host` and `@variants`, a form model, a `<slot>`; and a list's
 * transitions, which a `@for` with `@transition` names as its `animate`. The hello and benchmark apps
 * declare none.
 */
const FEATURE_MODULES = [
    'packages/core/src/component/channel.ts',
    'packages/core/src/component/host.ts',
    'packages/core/src/component/host-class-style.ts',
    'packages/core/src/component/form-element.ts',
    'packages/core/src/component/slots.ts',
    'packages/core/src/renderer/transitions.ts',
];

for (const name of ['hello', 'benchmark']) {
    test(`the ${name} bundle carries no feature of a definition its components do not declare (#1246)`, () => {
        const modules = Object.values(chunksOf(name)).flat();
        expect(modules.some((m) => m.includes('packages/core/src/component/element.ts')), 'the bundle defines no component')
            .toBe(true);
        const found = modules.filter((m) => FEATURE_MODULES.some((p) => m.includes(p)));
        expect(found, `features the ${name} app does not declare`).toEqual([]);
    });

    test(`the ${name} bundle carries none of core's modules that worked at load (#1246)`, () => {
        const modules = Object.values(chunksOf(name)).flat();
        expect(modules.some((m) => m.includes('packages/core/src/')), 'modules.json names no module of core\'s sources')
            .toBe(true);
        const found = modules.filter((m) => NOT_IN_A_SMALL_APP.some((p) => m.includes(p)));
        expect(found, `modules the ${name} app does not use`).toEqual([]);
    });

    test(`the ${name} bundle carries no debug code (#1246)`, () => {
        const dir = join(scenarioDist(name), 'assets');
        const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
        // The control: the file is the app, which registers its element with core's `component()`.
        expect(js, `the ${name} bundle is not the app`).toMatch(/customElements/);
        expect(DEBUG_CODE.filter((s) => js.includes(s)), `debug code in the ${name} production bundle`).toEqual([]);
    });
}

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
