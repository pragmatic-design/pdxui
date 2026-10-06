// A route field has to be written in THREE places, and this file checks it.
//
// The three, and what each one costs when it is missed:
//
//   1. `plugin-utils.ts` → `routeEntries`, the scanned table the GENERATED router compiles in.
//      Missed: the field is absent from a production build.
//   2. `codegen-shared.ts` → `routeParts`, the page module's own `__pdx_pushRoute({…})`.
//      Missed: it is there until the page loads, then disappears — the worst of the three, because
//      the manifest in the bundle plainly contains the value.
//   3. `router/src/outlet.ts`, which reads the registration. Missed: it is absent in dev.
//
// A missed field fails silently: a missing `loader` makes `currentLoaderData()` undefined forever;
// `scroll`, `@scroll 'top'` do nothing; `hasOutlet`, every nested route render flat; `label`, the
// breadcrumb empty in production while the route table carries the labels. A rule that every
// field must be copied, repeated in comments, is a design asking for a test.
//
// The lists are read out of the sources rather than imported: `@pdxui/compiler` may not depend
// on `@pdxui/router`, so "one definition" is enforced the way this repository enforces it
// elsewhere (`gen-manifest-fresh`, `skill-catalog-lockstep`, `template-directives-lockstep`) — by
// regenerating the fact and comparing.
//
// ⚠️ "Read by outlet.ts's MAP" is right for place 3 for the four fields above and wrong for the
// rest. The outlet has TWO readers: the runtime router, which
// receives a `RouteConfig` the map builds field by field, and the outlet itself, which keeps the
// whole registration in `routeConfigMap` and reads `keepAlive`, `transition`, `prefetch` and
// `outlets` straight off it. Demanding the map for those would demand they be added to
// `RouteConfig`, where nothing would read them. So place 3 is checked as: the outlet DECLARES the
// field on `RegisteredRoute`, and copies it into the map exactly when `RouteConfig` declares it —
// which is what each of the four failures above is.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

const PLUGIN_UTILS = read('../src/plugin-utils.ts');
const CODEGEN_SHARED = read('../src/compiler/codegen-shared.ts');
const OUTLET = read('../../router/src/outlet.ts');
const RUNTIME = read('../../router/src/runtime.ts');

/**
 * Build-time only: these describe how the build finds and ships the page, not how the route
 * behaves, and demanding them of the runtime would be demanding the wrong thing.
 *
 * `file` and `tag` are how a route is turned into an element and an `import()`; `lazy` is whether
 * the page got its own chunk. None of the three is a declaration the author wrote.
 */
const BUILD_ONLY = new Set(['file', 'tag', 'lazy']);

/**
 * `@redirect '/from' -> '/to'` is a TABLE, not a field of the route that declares it: any file may
 * declare a pair about any path, so the entries are merged across every scanned file. It travels
 * in all three places — as `redirectPairs`, as `globalThis.__pdx_redirects`, and read back from
 * there — just never as a key of one route. Asserted separately below rather than excused.
 */
const TABLE_LEVEL = new Set(['redirects']);

/**
 * Fields a PAGE registers that the scanned table does not carry — the same drift, the other way
 * round. In a production build the compiled table REPLACES the registrations wholesale
 * (`outlet.ts`: `compiled.length > 0 ? compiled : globalThis.__pdx_routes`), so a field emitted
 * only here exists in dev and nowhere else.
 *
 * Each is measured, not assumed — `grep` over `packages/router/src` and `packages/core/src` finds
 * no reader for any of them:
 *
 *   - `paramConstraints` — `:id(number)`, which BOTH routers parse out of the path itself
 *     (`runtime.ts` builds the regex from it; the generated router compiles a matcher). Genuinely
 *     derived from `path`, so the key is redundant rather than lost.
 *   - `paramTypes` — `@params { id: number }`. Nothing in the monorepo reads it.
 *
 * `layouts` is not here: `@layout 'admin'` resolves to the tag at build time, so what the page
 * registers is `layouts` — a field the outlet reads — and it travels through the scan as well, as a
 * `ScannedRoute` field. The NAME does not travel at all.
 *
 * This list is what makes another one impossible to add in silence; an entry leaves it when its
 * field is wired or removed.
 */
const REGISTERED_ONLY = new Set(['paramConstraints', 'paramTypes']);

// ─── Reading each list out of its source ───────────────────────────────────

/** The member names of a TypeScript interface, top level only. */
function interfaceFields(src: string, name: string): string[] {
    const start = src.indexOf(`interface ${name} {`);
    expect(start, `interface ${name} has moved or been renamed — this lockstep is reading nothing`)
        .toBeGreaterThan(-1);
    const end = src.indexOf('\n}', start);
    const body = src.slice(start, end)
        .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments, which mention other fields by name
        .replace(/\/\/.*$/gm, '');
    return [...body.matchAll(/^ {4}(\w+)\??:/gm)].map(m => m[1]).sort();
}

/** The keys a generated object literal emits, from the source that builds it. */
function emittedKeys(src: string, from: string, to: string, pattern: RegExp): string[] {
    const start = src.indexOf(from);
    expect(start, `"${from}" has moved — this lockstep is reading nothing`).toBeGreaterThan(-1);
    const end = src.indexOf(to, start);
    expect(end, `"${to}" no longer follows "${from}"`).toBeGreaterThan(start);
    const body = src.slice(start, end);
    return [...new Set([...body.matchAll(pattern)].map(m => m[1]))].sort();
}

/** `ScannedRoute` — the shape the scan produces and the generated router compiles in. */
const scannedFields = () => interfaceFields(PLUGIN_UTILS, 'ScannedRoute');

/** `routeEntries` — the same fields, as the text of the generated route table. */
const routeEntriesFields = () => emittedKeys(
    PLUGIN_UTILS, 'const routeEntries = routes.map', ').join(\',\\n\');', /[,{]\s*(\w+):\s/g);

/**
 * `routeParts` — what the page module pushes into `globalThis.__pdx_routes` when imported.
 *
 * Both quote styles: most entries are template literals, `hasOutlet` is a plain string, and a
 * regex that only knew about backticks reported it missing when it is emitted three lines above.
 */
const routePartsFields = () => emittedKeys(
    CODEGEN_SHARED, 'const routeParts: string[] =', '__pdx_pushRoute({${routeParts', /[`'](\w+):/g);

/** `RegisteredRoute` — what the outlet knows a registration can carry. */
const registeredFields = () => interfaceFields(OUTLET, 'RegisteredRoute');

/** `RouteConfig` — what the interpreted router reads, and therefore what the map must build. */
const routeConfigFields = () => interfaceFields(RUNTIME, 'RouteConfig');

/** The outlet's `registered.map(r => ({…}))` — the field-by-field copy that dropped four fields. */
const outletMapFields = () => emittedKeys(
    OUTLET, 'const routes: RouteConfig[] = registered.map', '}));', /^\s*(\w+):\s/gm);

// ─── The check ─────────────────────────────────────────────────────────────

/**
 * The fields a route's BEHAVIOUR is made of: everything the author can declare, minus the two
 * named exclusions. Both exclusions are lists rather than predicates on purpose — a field that is
 * deliberately build-only has to be named as one, in this file, by whoever adds it.
 */
function behaviourFields(): string[] {
    return scannedFields().filter(f => !BUILD_ONLY.has(f) && !TABLE_LEVEL.has(f));
}

/** Every place a behaviour field is missing from, named. Empty means the three lists agree. */
export function drift(field: string, lists: {
    routeEntries: string[]; routeParts: string[]; registered: string[];
    routeConfig: string[]; outletMap: string[];
}): string[] {
    const missing: string[] = [];
    if (!lists.routeEntries.includes(field))
        missing.push('the scanned table (plugin-utils.ts → routeEntries): absent from a production build');
    if (!lists.routeParts.includes(field))
        missing.push("the page's own registration (codegen-shared.ts → routeParts): present until the page loads, then gone");
    if (!lists.registered.includes(field))
        missing.push('the outlet\'s RegisteredRoute (router/src/outlet.ts): the outlet cannot read it');
    if (lists.routeConfig.includes(field) && !lists.outletMap.includes(field))
        missing.push('the outlet\'s map into RouteConfig (router/src/outlet.ts): RouteConfig declares it, so the interpreted router expects it and gets undefined');
    return missing;
}

describe('a route field is written in three places, and the three agree', () => {
    it('reads a real list out of each of the three sources', () => {
        // Without this, every assertion below passes on an empty list — the failure mode of every
        // grep-based check, and the reason this one states its zero.
        expect(behaviourFields().length, 'ScannedRoute has no behaviour fields left').toBeGreaterThan(8);
        expect(routeEntriesFields().length, 'routeEntries emitted nothing').toBeGreaterThan(8);
        expect(routePartsFields().length, 'routeParts emitted nothing').toBeGreaterThan(8);
        expect(registeredFields().length, 'RegisteredRoute declares nothing').toBeGreaterThan(8);
        expect(outletMapFields().length, 'the outlet map copies nothing').toBeGreaterThan(5);
        expect(routeConfigFields(), 'RouteConfig no longer declares the four fields that were dropped')
            .toEqual(expect.arrayContaining(['loader', 'scroll', 'hasOutlet', 'label']));
    });

    it('every behaviour field of ScannedRoute reaches all three', () => {
        const lists = {
            routeEntries: routeEntriesFields(), routeParts: routePartsFields(),
            registered: registeredFields(), routeConfig: routeConfigFields(),
            outletMap: outletMapFields(),
        };
        const report = behaviourFields()
            .map(f => ({ f, missing: drift(f, lists) }))
            .filter(r => r.missing.length > 0)
            .map(r => `  ${r.f} — missing from:\n${r.missing.map(m => `      ${m}`).join('\n')}`);
        expect(report.join('\n'),
            'a route field does not reach every place that has to carry it; each line below is a '
            + 'declaration that silently does nothing in one of the two modes').toBe('');
    });

    it('and nothing is registered by a page that the scanned table never heard of', () => {
        // The other direction. A field added to `routeParts` alone works in dev and is absent from
        // every production build, because the compiled table replaces the registrations there.
        const unknown = routePartsFields()
            .filter(f => !scannedFields().includes(f) && !REGISTERED_ONLY.has(f));
        expect(unknown,
            'these are pushed into globalThis.__pdx_routes by a page module and are not fields of '
            + 'ScannedRoute, so a production build drops them: add them to the scan, or name them '
            + 'in REGISTERED_ONLY with the reason').toEqual([]);
    });

    it('and the redirect TABLE travels through all three too', () => {
        // `redirects` is excluded above as table-level, so this is the assertion that replaces it
        // rather than the hole the exclusion would otherwise leave.
        expect(PLUGIN_UTILS, 'the generated router no longer compiles the redirect table')
            .toContain('const redirectPairs = routes.flatMap(r => r.redirects');
        expect(CODEGEN_SHARED, 'a page no longer publishes its @redirect pairs')
            .toContain('globalThis.__pdx_redirects.push');
        expect(OUTLET, 'the outlet no longer reads the redirect table')
            .toContain('globalThis.__pdx_redirects');
    });
});

describe('the check itself fails when a field is dropped', () => {
    // The control. Reading five lists and comparing them is exactly the kind of test that passes
    // because a regex stopped matching, so the comparison is proved to report each of the three
    // places — on lists built here, so the real sources stay untouched.
    const full = {
        routeEntries: ['path', 'scroll'], routeParts: ['path', 'scroll'],
        registered: ['path', 'scroll'], routeConfig: ['path', 'scroll'], outletMap: ['path', 'scroll'],
    };

    it('says nothing when they agree', () => {
        expect(drift('scroll', full)).toEqual([]);
    });

    it('names the scanned table', () => {
        expect(drift('scroll', { ...full, routeEntries: ['path'] }).join())
            .toContain('production build');
    });

    it("names the page's own registration", () => {
        expect(drift('scroll', { ...full, routeParts: ['path'] }).join())
            .toContain('until the page loads');
    });

    it('names the outlet — both the interface and the map', () => {
        expect(drift('scroll', { ...full, registered: ['path'] }).join())
            .toContain('cannot read it');
        expect(drift('scroll', { ...full, outletMap: ['path'] }).join())
            .toContain('RouteConfig declares it');
    });

    it('and does not demand the map for a field the interpreted router never reads', () => {
        // `keepAlive` is the real case: the outlet reads it off `routeConfigMap` itself, and
        // adding it to `RouteConfig` would add a field nothing reads. Without this, the fix for
        // the test above is to widen RouteConfig until it is red again.
        expect(drift('keepAlive', {
            ...full, routeEntries: ['path', 'keepAlive'], routeParts: ['path', 'keepAlive'],
            registered: ['path', 'keepAlive'], routeConfig: ['path'], outletMap: ['path'],
        })).toEqual([]);
    });
});

