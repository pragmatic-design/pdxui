// The router's behaviour suite, run against every way an app hands it its routes.
//
// There is one router (`packages/router/src/runtime.ts`). Until #108 a production build ran a
// second one, emitted by the compiler as a string, and this file was the parity table that kept the
// two alike. Now the build emits route DATA (`generateRouteTable`) and the one router reads it, so
// what is compared is the PRODUCERS: the table a build emits, the table the dev server emits, and
// the routes an app passes to `createRouter` itself. A field one producer drops, or a behaviour that
// depends on how the routes arrived, fails here on that producer and not on the others.
//
// Each table is the module the compiler would serve, evaluated the way the site's playground
// evaluates compiled PDX: the export keywords stripped, run through `new Function`. That tests the
// artefact an app actually loads, not a re-implementation of it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as core from '@pdxui/core';
import { generateRouteTable, buildSpecifier, devSpecifier, type ModuleSpecifier } from '../../compiler/src/route-table';
import type { ScannedRoute } from '../../compiler/src/plugin-utils';
import {
    createRouter, createRouterFromTable, configureRouter, destroyRouter, installRouteTable, routeTable,
    toRouteConfig, navigate as rtNavigate,
    currentPath as rtPath, currentParams as rtParams,
    currentRoute as rtRoute, currentSearch as rtSearch,
    currentNavError as rtNavError, currentNavErrorDepth as rtNavErrorDepth,
    registerGuardChecker as rtRegisterGuard,
    onBeforeNavigate as rtOnBefore, onAfterNavigate as rtOnAfter,
    currentQuery as rtQuery, currentMeta as rtMeta, currentState as rtState,
    setQuery as rtSetQuery, setQueryParam as rtSetQueryParam,
    currentLoaderData as rtLoaderData, currentLoaderState as rtLoaderState,
    loaderData as rtLoaderDataFor,
} from '../src/runtime';
import type { RouteTable } from '../src/runtime';

// ─── The router, behind one shape ────────────────────────────────────────────

interface RouterUnderTest {
    navigate(path: string, params?: Record<string, string>, state?: Record<string, unknown>): void;
    path(): string;
    params(): Record<string, string>;
    /** The query string parsed into a record — the shape a component reads. */
    query(): Record<string, string>;
    setQuery(params: Record<string, string>): void;
    /** null removes the param. */
    setQueryParam(key: string, value: string | null): void;
    /** Ephemeral navigation state: passed to navigate(), never in the URL. */
    state(): Record<string, unknown> | undefined;
    /** The matched route's @meta block, or undefined when it declares none. */
    meta(): Record<string, unknown> | undefined;
    /** The matched route's PATTERN, or null when nothing matched. */
    matched(): string | null;
    /** The matched route's `@scroll`, which the router hands to core's restoration. */
    scroll(): string | undefined;
    /** What the route's @loader returned. */
    loaderData(): unknown;
    /** 'idle' | 'pending' | 'success' | 'error'. */
    loaderState(): string;
    /** What a SPECIFIC level's @loader returned, by its route pattern. */
    loaderDataFor(path: string): unknown;
    search(): string;
    /** '403' when a guard denied, '404' when nothing matched, null otherwise. */
    navError(): string | null;
    /** Which nesting level the error belongs to: the outlet at this depth renders it. */
    navErrorDepth(): number;
    /** Install the guard evaluator. Kept OUT of route configuration on purpose. */
    registerGuard(checker: (name: string) => boolean | Promise<boolean>): void;
    /** Returning false cancels the navigation. Returns an unsubscribe. */
    onBefore(hook: (from: string, to: string) => boolean | Promise<boolean>): () => void;
    onAfter(hook: (from: string, to: string) => void): () => void;
    /** Release the navigation listeners. Idempotent. */
    destroy(): void;
}

/** Options a row needs configured before its first navigation. */
interface UnderTestOptions {
    basePath?: string;
    redirects?: { from: string; to: string }[];
}

/**
 * A route as this table declares it.
 *
 * `ScannedRoute.loader` is the loader's NAME — serialisable build-time data, which is all a route
 * table can hold. The FUNCTION lives in the page module, and reaches the router the way it does in
 * an app: the compiled page module publishes it into `globalThis.__pdx_routes` when it is imported,
 * and the table's loader bridge reads it from there. `loaderFn` is this table's stand-in for that
 * module.
 */
type ParityRoute = ScannedRoute & { loaderFn?: () => Promise<unknown> };

/**
 * Publish the live loaders the way a compiled page module does — `globalThis.__pdx_routes`.
 *
 * This is not a shim for the test: `codegen-shared.ts` emits exactly this push, with the loader as a
 * live reference, for every `@page` that declares a `@loader`. Seeding it here is what "the page
 * module has been imported" looks like.
 */
function publishPageModules(routes: ParityRoute[]): void {
    (globalThis as { __pdx_routes?: unknown[] }).__pdx_routes =
        routes.filter(r => r.loaderFn).map(r => ({ path: r.path, tag: r.tag, loader: r.loaderFn }));
}

/**
 * How many times each nested level's loader has run. Reset per row: the table is module-level and
 * a counter carried between rows would make "the parent did not re-run" pass for free.
 */
const loaderRuns = { ticket: 0, note: 0 };

/** Route table used by every case here. Static, dynamic, multi-param, and a `:idCard` decoy. */
const ROUTES: ParityRoute[] = [
    { path: '/', file: 'home.pdx', tag: 'pdx-home' },
    { path: '/about', file: 'about.pdx', tag: 'pdx-about', meta: { breadcrumb: 'About', section: 'company' } },
    { path: '/users/:id', file: 'user.pdx', tag: 'pdx-user' },
    { path: '/users/:id/posts/:postId', file: 'post.pdx', tag: 'pdx-post' },
    { path: '/cards/:idCard', file: 'card.pdx', tag: 'pdx-card' },
    { path: '/admin', file: 'admin.pdx', tag: 'pdx-admin', guard: 'admin.access' },
    { path: '/legacy', file: 'legacy.pdx', tag: 'pdx-legacy', redirect: '/about' },
    // A route-level redirect pointing off-origin. Developer-authored, like every redirect source,
    // so this is defence in depth — but the router refuses it.
    { path: '/hostile', file: 'hostile.pdx', tag: 'pdx-hostile', redirect: 'https://evil.example/steal' },
    { path: '/orders/:oid(number)', file: 'order.pdx', tag: 'pdx-order' },
    { path: '/files/*', file: 'files.pdx', tag: 'pdx-files' },
    { path: '/data', file: 'data.pdx', tag: 'pdx-data', loader: 'loadRows', loaderFn: async () => ({ rows: 2 }) },
    // The breadcrumb's trail. Labelled ancestors, and a leaf whose label names a param
    // — the case a hand-written crumb array exists to avoid.
    { path: '/shop', file: 'shop.pdx', tag: 'pdx-shop', label: 'Shop' },
    { path: '/shop/:sku', file: 'sku.pdx', tag: 'pdx-sku', label: 'Item :sku' },
    // Nesting. `hasOutlet` is what makes `/tickets/:id` the PARENT of the route below
    // rather than a route that happens to share a prefix — the same field that keeps `/owners` from
    // being treated as the parent of `/owners/new`.
    {
        path: '/tickets/:id', file: 'ticket.pdx', tag: 'pdx-ticket', hasOutlet: true,
        loader: 'loadTicket',
        loaderFn: async () => { loaderRuns.ticket++; return { ticket: 'T', runs: loaderRuns.ticket }; },
    },
    {
        path: '/tickets/:id/notes/:n', file: 'note.pdx', tag: 'pdx-note',
        loader: 'loadNote',
        loaderFn: async () => { loaderRuns.note++; return { note: 'N', runs: loaderRuns.note }; },
    },
    // A guard on the PARENT and none on the child: the child must be denied by inheritance.
    { path: '/vault', file: 'vault.pdx', tag: 'pdx-vault', hasOutlet: true, guard: 'vault.open' },
    { path: '/vault/secret', file: 'secret.pdx', tag: 'pdx-secret' },
    // And the inverse: an open parent with a guarded CHILD. A refusal here must cost the child and
    // not the page it lives in.
    { path: '/case', file: 'case.pdx', tag: 'pdx-case', hasOutlet: true },
    { path: '/case/sealed', file: 'sealed.pdx', tag: 'pdx-sealed', guard: 'case.sealed' },
    // A param route declared BEFORE its static sibling, as the showcase's `customer.pdx` comes before
    // `import.pdx` in the scan: `/teams/new` is a page, not the team called «new».
    { path: '/teams/:id', file: 'team.pdx', tag: 'pdx-team' },
    { path: '/teams/new', file: 'team-new.pdx', tag: 'pdx-team-new' },
    // Two DYNAMIC routes that both match `/pages/12`: among dynamic routes the declared order holds.
    { path: '/pages/:slug', file: 'page.pdx', tag: 'pdx-page' },
    { path: '/pages/:n(number)', file: 'page-n.pdx', tag: 'pdx-page-n' },
    // The other two named constraints of the grammar (#305).
    { path: '/posts/:id(slug)', file: 'blog-post.pdx', tag: 'pdx-blog-post' },
    { path: '/tags/:t(string)', file: 'tag.pdx', tag: 'pdx-tag' },
    // A static path with a regex metacharacter in it: the dot is a dot.
    { path: '/feed.xml', file: 'feed.pdx', tag: 'pdx-feed' },
    // Two params in ONE segment: not a whole-segment pattern, so the matcher keeps a regex for it.
    { path: '/docs/:name.:ext', file: 'doc.pdx', tag: 'pdx-doc' },
    // `@scroll`, which the router hands to core's restoration from the matched route.
    { path: '/always-top', file: 't.pdx', tag: 'pdx-t', scroll: 'top' },
    { path: '/keep-place', file: 'k.pdx', tag: 'pdx-k', scroll: 'preserve' },
];

/** The router's readers and writers, the same whichever producer started it. */
function underTest(): RouterUnderTest {
    return {
        navigate: (p, params, state) => rtNavigate(p, params, state),
        path: () => rtPath(),
        params: () => rtParams(),
        query: () => rtQuery(),
        setQuery: (params) => rtSetQuery(params),
        setQueryParam: (k, v) => rtSetQueryParam(k, v),
        state: () => rtState(),
        meta: () => rtMeta(),
        matched: () => rtRoute()?.config.path ?? null,
        scroll: () => rtRoute()?.config.scroll,
        loaderData: () => rtLoaderData(),
        loaderState: () => rtLoaderState(),
        loaderDataFor: (path) => rtLoaderDataFor(path),
        search: () => rtSearch(),
        navError: () => rtNavError(),
        navErrorDepth: () => rtNavErrorDepth(),
        registerGuard: (c) => rtRegisterGuard(c),
        onBefore: (h) => rtOnBefore(h),
        onAfter: (h) => rtOnAfter(h),
        destroy: () => destroyRouter(),
    };
}

/** The route-table module the compiler emits, evaluated into the object an import of it gives. */
function evaluateTable(routes: ParityRoute[], specifierOf: ModuleSpecifier): RouteTable {
    const src = generateRouteTable(routes, specifierOf).replace(/^export\s+/gm, '');
    return new Function(`${src}\nreturn { routes, pageModules, redirects };`)() as RouteTable;
}

/** A production build: the seam installs the table, the router starts from it. */
function fromBuildTable(routes: ParityRoute[], options?: UnderTestOptions): RouterUnderTest {
    publishPageModules(routes);
    createRouterFromTable(evaluateTable(routes, buildSpecifier), options);
    return underTest();
}

/**
 * The dev server: the table arrives as `globalThis.__pdx_route_table`, and the router is started
 * the way the outlet starts it — from `routeTable()`, through `toRouteConfig`.
 */
function fromDevTable(routes: ParityRoute[], options?: UnderTestOptions): RouterUnderTest {
    publishPageModules(routes);
    globalThis.__pdx_route_table = evaluateTable(routes, devSpecifier('/app'));
    createRouter(routeTable()!.map(toRouteConfig), options);
    return underTest();
}

/** An app with no plugin: its own RouteConfigs, loaders as functions. */
function fromRoutes(routes: ParityRoute[], options?: UnderTestOptions): RouterUnderTest {
    createRouter(routes.map(r => ({
        path: r.path,
        component: () => document.createElement('div'),
        ...(r.guard ? { guard: r.guard } : {}),
        ...(r.redirect ? { redirect: r.redirect } : {}),
        ...(r.meta ? { meta: r.meta } : {}),
        ...(r.loaderFn ? { loader: r.loaderFn } : {}),
        ...(r.label ? { label: r.label } : {}),
        ...(r.hasOutlet ? { hasOutlet: r.hasOutlet } : {}),
        ...(r.scroll ? { scroll: r.scroll } : {}),
    })), options);
    return underTest();
}

const PRODUCERS = [
    { name: 'build table', make: fromBuildTable },
    { name: 'dev table', make: fromDevTable },
    { name: 'createRouter(routes)', make: fromRoutes },
] as const;

/** Guards and loaders may be async; give a navigation time to settle. */
const settle = () => new Promise(r => setTimeout(r, 20));

/** Scroll restoration runs inside requestAnimationFrame. */
const raf = () => new Promise(r => requestAnimationFrame(() => r(null)));

/**
 * The browser's back button, simulated by the event the browser actually fires. The router has no
 * `back()` of its own — it listens for `popstate` — so this belongs to the harness rather than to
 * `RouterUnderTest`, and it exercises the same code path a real back press does.
 */
function popTo(path: string, state: Record<string, unknown> | null = null): void {
    history.replaceState(state, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state }));
}

// ─── The table ───────────────────────────────────────────────────────────────

interface Row {
    name: string;
    /** Configured before the first navigation — createRouter options. */
    options?: UnderTestOptions;
    run(r: RouterUnderTest): Promise<void> | void;
}

/**
 * The four shapes a router target must refuse — a redirect is not an `<a href>`
 * and `history.replaceState` cannot leave the origin at all. Written once here and run against every
 * producer: a redirect table entry arrives through the options, the build's table and the page
 * modules, and each is a place a decision like this can get quietly dropped.
 */
const HOSTILE_TARGETS = [
    ['a protocol-relative target', '//evil.example'],
    ['an absolute https target', 'https://evil.example/steal'],
    ['a javascript: target', 'javascript:alert(1)'],
    ['a backslash-smuggled target', '/\\evil.example'],
] as const;

const HOSTILE_ROWS: Row[] = HOSTILE_TARGETS.map(([label, target]) => ({
    name: `refuses a redirect table entry pointing at ${label}`,
    options: { redirects: [{ from: '/go', to: target }] },
    run: async (r: RouterUnderTest) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        r.navigate('/about');
        await settle();
        r.navigate('/go');
        await settle();
        // The REFUSAL is the assertion, not merely the absence of movement. Removing the check
        // does not move currentPath either: `history.replaceState` to another origin throws a
        // SecurityError inside an async handler, the rejection goes unhandled, and the router just
        // stops — which is what the runtime's own comment records happening. A row that only
        // asserts "did not go there" is green in both worlds and measures nothing.
        const refusals = warn.mock.calls.map(c => String(c[0]))
            .filter(m => m.includes('Refused') && m.includes(target));
        warn.mockRestore();
        expect(refusals.length, `no refusal was reported for ${target}`).toBeGreaterThan(0);
        expect(r.path(), `followed the redirect to ${target}`).not.toContain('evil.example');
        expect(r.path()).not.toContain('javascript:');
    },
}));

const PARITY: Row[] = [
    {
        name: 'matches a static route',
        run: async (r) => {
            r.navigate('/about');
            await settle();
            expect(r.matched()).toBe('/about');
            expect(r.path()).toBe('/about');
        },
    },
    {
        // Written here rather than in a file of its own because the labels reach the router through
        // the table: a producer that dropped them would give a production build an empty trail
        // while the route table plainly carries the labels.
        name: 'publishes the breadcrumb trail: labelled ancestors, params filled in, leaf marked',
        run: async (r) => {
            r.navigate('/shop/abc123');
            await settle();

            const trail = core.routeTrail();
            expect(trail.map(c => c.label)).toEqual(['Shop', 'Item abc123']);
            expect(trail.map(c => c.href)).toEqual(['/shop', '/shop/abc123']);
            expect(trail.map(c => c.current)).toEqual([false, true]);
        },
    },
    {
        // The same lesson as the row above: `@page { label: ticketLabel }` names a
        // function, which cannot be written into a route table built by SCANNING the sources — it
        // lives in the page's module, imported lazily, after the router has read that table. So
        // the table carries no label for such a route and the module announces itself when it
        // loads (`__pdx_routeRegistered`), which is what makes the router draw the trail again.
        //
        // The ORDER is the one a build actually has: navigate first, register second.
        name: 'takes a label function a page module registers AFTER the navigation',
        run: async (r) => {
            r.navigate('/users/42');
            await settle();
            expect(core.routeTrail(), 'this route has no label in the table — the premise')
                .toEqual([]);

            // What the compiled page does when the outlet imports it.
            const reg = ((globalThis as { __pdx_routes?: unknown[] }).__pdx_routes ??= []);
            reg.push({ path: '/users/:id', tag: 'pdx-user', label: (p: Record<string, string>) => `User ${p.id}` });
            (globalThis as { __pdx_routeRegistered?: (p: string) => void })
                .__pdx_routeRegistered?.('/users/:id');

            const trail = core.routeTrail();
            expect(trail.map(c => c.label),
                'the label the module registered never reached the trail')
                .toEqual(['User 42']);
            expect(trail.map(c => c.href)).toEqual(['/users/42']);

            // Left as it was found: the rows after this one read the same table.
            reg.pop();
        },
    },
    {
        name: 'a route with no label contributes no crumb',
        run: async (r) => {
            // The control: every other route in this table is unlabelled, so a trail that grew
            // from the path would light up here.
            r.navigate('/users/42');
            await settle();

            expect(core.routeTrail()).toEqual([]);
        },
    },
    {
        name: 'matches the root route',
        run: async (r) => {
            r.navigate('/');
            await settle();
            expect(r.matched()).toBe('/');
        },
    },
    {
        name: 'matches a dynamic route and extracts its param',
        run: async (r) => {
            r.navigate('/users/42');
            await settle();
            expect(r.matched()).toBe('/users/:id');
            expect(r.params()).toEqual({ id: '42' });
        },
    },
    {
        name: 'extracts every param of a multi-param route',
        run: async (r) => {
            r.navigate('/users/7/posts/99');
            await settle();
            expect(r.matched()).toBe('/users/:id/posts/:postId');
            expect(r.params()).toEqual({ id: '7', postId: '99' });
        },
    },
    {
        name: 'percent-decodes a param value',
        run: async (r) => {
            r.navigate('/users/a%20b');
            await settle();
            expect(r.params().id).toBe('a b');
        },
    },
    {
        name: 'reports no match rather than guessing',
        run: async (r) => {
            r.navigate('/nope/nowhere');
            await settle();
            expect(r.matched()).toBeNull();
            expect(r.params()).toEqual({});
        },
    },
    {
        name: 'treats a trailing slash as the same route',
        // Both routers normalise. A pathToRegex that compiles /about to ^\/about$ makes the same
        // URL a 404 in dev and a page in a production build: not a missing capability, a
        // disagreement between the two.
        run: async (r) => {
            r.navigate('/about/');
            await settle();
            expect(r.matched()).toBe('/about');
        },
    },
    {
        // pathToRegex escaped only the slashes of a pattern's literal text, so `.` stayed a regex
        // wildcard: `/feed.xml` matched `/feedXxml` in dev and nothing in a build (#67).
        name: 'a dot in a route path is a dot, not any character',
        run: async (r) => {
            r.navigate('/feedXxml');
            await settle();
            expect(r.matched(), 'the dot matched another character').toBeNull();
        },
    },
    {
        name: 'control — the path with its dot still matches',
        run: async (r) => {
            r.navigate('/feed.xml');
            await settle();
            expect(r.matched()).toBe('/feed.xml');
        },
    },
    {
        // A static route is a key of the matcher's map, tried before any dynamic one. A router that
        // took the FIRST registered route that matched would mount `/customers/import` as the page
        // for a customer called «import», because the scan lists `customer.pdx` first.
        name: 'a static route wins over a param route declared before it',
        run: async (r) => {
            r.navigate('/teams/new');
            await settle();
            expect(r.matched(), 'the param route caught its static sibling').toBe('/teams/new');
            expect(r.params()).toEqual({});
        },
    },
    {
        name: 'control — the param route still takes every other value',
        run: async (r) => {
            r.navigate('/teams/42');
            await settle();
            expect(r.matched()).toBe('/teams/:id');
            expect(r.params()).toEqual({ id: '42' });
        },
    },
    {
        name: 'control — among dynamic routes, the declared order holds',
        run: async (r) => {
            r.navigate('/pages/12');
            await settle();
            expect(r.matched(), 'the ranking reordered two dynamic routes').toBe('/pages/:slug');
        },
    },
    {
        name: 'builds the path from a params object',
        run: async (r) => {
            r.navigate('/users/:id', { id: '5' });
            await settle();
            expect(r.path()).toBe('/users/5');
            expect(r.params()).toEqual({ id: '5' });
        },
    },
    {
        name: 'encodes a param value that needs it',
        run: async (r) => {
            r.navigate('/users/:id', { id: 'a b' });
            await settle();
            expect(r.path()).toBe('/users/a%20b');
            expect(r.params().id).toBe('a b');
        },
    },
    {
        name: 'does not substitute :id inside :idCard',
        // The decoy: a naive replace of ':id' turns '/cards/:idCard' into '/cards/5Card'.
        run: async (r) => {
            r.navigate('/cards/:idCard', { idCard: 'X1' });
            await settle();
            expect(r.path()).toBe('/cards/X1');
            expect(r.matched()).toBe('/cards/:idCard');
        },
    },
    {
        name: 'keeps the query string out of the match and in currentSearch',
        run: async (r) => {
            r.navigate('/users/3?tab=posts');
            await settle();
            expect(r.matched()).toBe('/users/:id');
            expect(r.params().id).toBe('3');
            expect(r.search()).toBe('?tab=posts');
        },
    },

    // ── Guards, nesting, errors, loaders and hooks. ──
    {
        name: 'denies a guarded route and reports 403',
        run: async (r) => {
            r.registerGuard(() => false);
            r.navigate('/admin');
            await settle();
            expect(r.matched(), 'a denied route must not activate').toBeNull();
            expect(r.navError()).toBe('403');
        },
    },
    {
        name: 'allows a guarded route the checker permits',
        // The control: a guard that denies everything satisfies the row above and nothing else.
        run: async (r) => {
            r.registerGuard(() => true);
            r.navigate('/admin');
            await settle();
            expect(r.matched()).toBe('/admin');
            expect(r.navError()).toBeNull();
        },
    },
    {
        name: 'a denied CHILD leaves its parent as the active route',
        // The refusal belongs to the level that was denied, and the
        // levels above it were allowed. Both routers say so the same way — the active route is the
        // parent, and the error carries the depth the outlet needs to know where to draw it.
        run: async (r) => {
            r.registerGuard((name) => name !== 'case.sealed');
            r.navigate('/case/sealed');
            await settle();
            expect(r.matched(), 'the parent went down with the denied child').toBe('/case');
            expect(r.navError(), 'the refusal was not reported').toBe('403');
            expect(r.navErrorDepth(), 'the refusal did not say which level it belongs to').toBe(1);
        },
    },
    {
        name: 'a denial at the TOP of the chain still activates nothing',
        // The control for the row above: "keep the parent" must not become "never refuse a page".
        run: async (r) => {
            r.registerGuard(() => false);
            r.navigate('/vault/secret');
            await settle();
            expect(r.matched(), 'a denial with nothing allowed above it kept a route active').toBeNull();
            expect(r.navError()).toBe('403');
            expect(r.navErrorDepth(), 'a top-level denial belongs to the root outlet').toBe(0);
        },
    },
    {
        name: 'awaits an async guard before deciding',
        run: async (r) => {
            r.registerGuard(async () => { await Promise.resolve(); return false; });
            r.navigate('/admin');
            await settle();
            expect(r.matched()).toBeNull();
            expect(r.navError()).toBe('403');
        },
    },
    // ── Nesting: every level, not only the matched one ──
    {
        name: "a parent's guard denies the child that renders inside it",
        run: async (r) => {
            // `/vault/secret` declares no guard of its own. Its parent does, and the whole reason
            // to put a guard on a parent is that it covers what renders inside it. A router that
            // reads `config.guard` and nothing else passes this in `pdx dev` and opens the route
            // in a production build.
            r.registerGuard(() => false);
            r.navigate('/vault/secret');
            await settle();
            expect(r.matched(), "the parent's guard did not reach the child").toBeNull();
            expect(r.navError()).toBe('403');
        },
    },
    {
        name: "a parent's guard lets the child through when it allows",
        // The control: denying everything satisfies the row above and nothing else.
        run: async (r) => {
            r.registerGuard(() => true);
            r.navigate('/vault/secret');
            await settle();
            expect(r.matched()).toBe('/vault/secret');
            expect(r.navError()).toBeNull();
        },
    },
    {
        name: "a parent's loader runs too, and its data is readable by path",
        run: async (r) => {
            r.navigate('/tickets/7/notes/1');
            await settle();
            expect(r.matched()).toBe('/tickets/:id/notes/:n');
            // The matched level's data is still what `currentLoaderData()` means.
            expect(r.loaderData()).toEqual({ note: 'N', runs: 1 });
            // And the parent's is readable, which is the whole point of loading it.
            expect(r.loaderDataFor('/tickets/:id'), "the parent's loader never ran")
                .toEqual({ ticket: 'T', runs: 1 });
        },
    },
    {
        name: 'moving between siblings re-runs the child and leaves the parent alone',
        run: async (r) => {
            r.navigate('/tickets/7/notes/1');
            await settle();
            r.navigate('/tickets/7/notes/2');
            await settle();
            expect(r.matched()).toBe('/tickets/:id/notes/:n');
            // The child ran twice — the control, so "the parent ran once" is not both standing still.
            expect(r.loaderData()).toEqual({ note: 'N', runs: 2 });
            expect(r.loaderDataFor('/tickets/:id'), 'the parent refetched for a sibling move')
                .toEqual({ ticket: 'T', runs: 1 });
        },
    },
    {
        name: 'a parent whose own params changed does run again',
        run: async (r) => {
            r.navigate('/tickets/7/notes/1');
            await settle();
            r.navigate('/tickets/9/notes/1');
            await settle();
            // Different ticket: keeping the first one's data would show note 1 of ticket 9 beside
            // ticket 7's header.
            expect(r.loaderDataFor('/tickets/:id'), 'the parent kept a different ticket\'s data')
                .toEqual({ ticket: 'T', runs: 2 });
        },
    },
    {
        name: 'leaving the branch forgets it',
        run: async (r) => {
            r.navigate('/tickets/7/notes/1');
            await settle();
            r.navigate('/about');
            await settle();
            expect(r.loaderDataFor('/tickets/:id'), 'a page off the branch can still read its data')
                .toBeUndefined();
            expect(r.loaderData()).toBeUndefined();
        },
    },
    {

        name: 'reports 404 for an unmatched path through currentNavError',
        run: async (r) => {
            r.navigate('/nope/nowhere');
            await settle();
            expect(r.navError()).toBe('404');
        },
    },
    {
        name: 'clears the nav error once a route matches again',
        // A sticky error is how a 403 page outlives the denial that caused it.
        run: async (r) => {
            r.navigate('/nope');
            await settle();
            expect(r.navError()).toBe('404');
            r.navigate('/about');
            await settle();
            expect(r.navError()).toBeNull();
        },
    },
    {
        name: 'runs a route loader and exposes its data and state',
        // The route table must not import the page modules statically, so a function declared in
        // one cannot be written into it: the table carries a bridge that reads the loader from
        // `globalThis.__pdx_routes`, which the compiled page module publishes (see
        // `publishPageModules`). `createRouter(routes)` gets the function itself.
        run: async (r) => {
            r.navigate('/data');
            await settle();
            expect(r.loaderState()).toBe('success');
            expect(r.loaderData()).toEqual({ rows: 2 });
        },
    },
    {
        name: 'runs an after-navigation hook with the from and to paths',
        run: async (r) => {
            const seen: [string, string][] = [];
            r.navigate('/about');
            await settle();
            const off = r.onAfter((from, to) => seen.push([from, to]));
            r.navigate('/users/9');
            await settle();
            off();
            expect(seen).toEqual([['/about', '/users/9']]);
        },
    },
    {
        name: 'lets a before-navigation hook cancel by returning false',
        run: async (r) => {
            r.navigate('/about');
            await settle();
            const off = r.onBefore(() => false);
            r.navigate('/users/9');
            await settle();
            off();
            expect(r.matched(), 'a cancelled navigation must leave the route alone').toBe('/about');
        },
    },
    {
        name: 'runs before hooks before after hooks, and not at all when cancelled',
        run: async (r) => {
            r.navigate('/about');
            await settle();
            const order: string[] = [];
            const offB = r.onBefore(() => { order.push('before'); return false; });
            const offA = r.onAfter(() => order.push('after'));
            r.navigate('/users/9');
            await settle();
            offB(); offA();
            expect(order, 'a cancelled navigation must not reach the after hooks').toEqual(['before']);
        },
    },
    {
        name: 'awaits an async before hook',
        run: async (r) => {
            r.navigate('/about');
            await settle();
            const off = r.onBefore(async () => { await Promise.resolve(); return false; });
            r.navigate('/users/9');
            await settle();
            off();
            expect(r.matched()).toBe('/about');
        },
    },
    // ── A refused navigation leaves the ADDRESS BAR alone too. A router that writes the URL first
    // and runs the hooks after makes "cancel" keep the screen and move the URL: a reload then opens
    // the screen the hook refused, past the very hook protecting unsaved work. ──
    {
        name: 'a refused navigation leaves the address bar where it was',
        run: async (r) => {
            r.navigate('/about');
            await settle();
            const off = r.onBefore(() => false);
            r.navigate('/users/9?tab=posts');
            await settle();
            off();
            expect(r.matched()).toBe('/about');
            expect(location.pathname, 'the URL points at a screen that was never reached').toBe('/about');
            expect(location.search).toBe('');
            expect(r.search(), 'the refused query leaked into currentSearch').toBe('');
        },
    },
    {
        name: 'a refused navigation adds no history entry',
        run: async (r) => {
            r.navigate('/about');
            await settle();
            const before = history.length;
            const off = r.onBefore(() => false);
            r.navigate('/users/9');
            await settle();
            off();
            expect(history.length, 'Back would now lead to the same screen').toBe(before);
        },
    },
    {
        name: 'an accepted navigation writes the address bar and one history entry — the control',
        run: async (r) => {
            r.navigate('/about');
            await settle();
            const before = history.length;
            const off = r.onBefore(() => true);
            r.navigate('/users/9?tab=posts');
            await settle();
            off();
            expect(r.matched()).toBe('/users/:id');
            expect(location.pathname).toBe('/users/9');
            expect(r.search()).toBe('?tab=posts');
            expect(history.length).toBe(before + 1);
        },
    },
    {
        name: 'a refused back navigation puts the address bar back on the screen shown',
        // The URL has already moved when popstate fires; the only honest answer is to put it back.
        run: async (r) => {
            r.navigate('/about');
            await settle();
            r.navigate('/users/9');
            await settle();
            const off = r.onBefore(() => false);
            popTo('/about');
            await settle();
            off();
            expect(r.matched()).toBe('/users/:id');
            expect(location.pathname, 'Back was refused and the URL says /about anyway').toBe('/users/9');
        },
    },
    {
        name: 'a refused navigation through a redirect leaves the address bar alone',
        options: { redirects: [{ from: '/old', to: '/about' }] },
        run: async (r) => {
            r.navigate('/users/1');
            await settle();
            const off = r.onBefore(() => false);
            r.navigate('/old');
            await settle();
            off();
            expect(r.matched()).toBe('/users/:id');
            expect(location.pathname).toBe('/users/1');
        },
    },
    {
        name: 'an accepted redirect writes its target once, as one entry',
        options: { redirects: [{ from: '/old', to: '/about' }] },
        run: async (r) => {
            r.navigate('/users/1');
            await settle();
            const before = history.length;
            r.navigate('/old');
            await settle();
            expect(r.matched()).toBe('/about');
            expect(location.pathname).toBe('/about');
            expect(history.length, 'the redirect added an entry of its own').toBe(before + 1);
        },
    },
    {
        name: 'unsubscribes a hook when its returned function is called',
        // A hook you cannot remove is a leak: an outlet that re-registers on every mount would
        // accumulate them.
        run: async (r) => {
            let calls = 0;
            const off = r.onAfter(() => { calls++; });
            r.navigate('/about');
            await settle();
            off();
            r.navigate('/users/1');
            await settle();
            expect(calls).toBe(1);
        },
    },
    // `lets onBeforeLeave cancel a navigation` is not a row here: it is not a router behaviour.
    // Neither router exports onBeforeLeave — `outlet.ts:266` reads `_beforeLeaveCallbacks` off the
    // outgoing element and navigates back if one refuses. A row that no implementation can ever
    // satisfy is not a parity gap, it is a row in the wrong file. Its home is
    // `tests/outlet-before-leave.test.ts`, where the behaviour is measured against the thing that
    // actually implements it.
    {
        name: 'follows a redirect table entry',
        options: { redirects: [{ from: '/old', to: '/about' }] },
        run: async (r) => {
            r.navigate('/old');
            await settle();
            expect(r.matched(), 'the redirect target is the route that matched').toBe('/about');
            expect(r.path()).toBe('/about');
        },
    },
    {
        name: 'follows a route-level redirect',
        run: async (r) => {
            r.navigate('/legacy');
            await settle();
            expect(r.matched()).toBe('/about');
            expect(r.path()).toBe('/about');
            // The ADDRESS, not only the resolved route: comparing only what the router publishes
            // stays green while the address keeps the path that redirected.
            expect(location.pathname, 'the address stayed on the path that redirects').toBe('/about');
        },
    },
    {
        name: 'stops a redirect loop instead of recursing',
        // Two entries pointing at each other. Without a depth limit this is a stack overflow, and
        // the failure lands nowhere near the configuration that caused it.
        options: { redirects: [{ from: '/ping', to: '/pong' }, { from: '/pong', to: '/ping' }] },
        run: async (r) => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            r.navigate('/ping');
            await settle();
            expect(warn.mock.calls.some(c => String(c[0]).includes('loop')),
                'a redirect loop must be reported, not survived in silence').toBe(true);
            warn.mockRestore();
        },
    },
    {
        name: 'resolves paths under a configured base path',
        options: { basePath: '/app' },
        run: async (r) => {
            r.navigate('/about');
            await settle();
            // The route pattern never carries the base: matching is on the app's own paths…
            expect(r.matched()).toBe('/about');
            expect(r.path()).toBe('/about');
            // …while the address bar does. Both halves matter — a router that prepends the base to
            // the match, or omits it from the URL, satisfies one of these and breaks the app.
            expect(location.pathname).toBe('/app/about');
        },
    },
    {
        name: 'rejects a param that fails its constraint',
        run: async (r) => {
            r.navigate('/orders/abc');
            await settle();
            expect(r.matched(), ':oid(number) must not match letters').toBeNull();
            expect(r.navError()).toBe('404');

            // The control: a constraint that rejects everything would pass the assertions above.
            r.navigate('/orders/12');
            await settle();
            expect(r.matched()).toBe('/orders/:oid(number)');
            // And the param is named `oid`, not `oid(number)` — the constraint is a rule about the
            // value, never part of the name a component reads.
            expect(r.params()).toEqual({ oid: '12' });
        },
    },
    {
        name: 'matches a slug param, and nothing that is not a slug',
        run: async (r) => {
            r.navigate('/posts/hello-world');
            await settle();
            expect(r.matched()).toBe('/posts/:id(slug)');
            expect(r.params()).toEqual({ id: 'hello-world' });

            r.navigate('/posts/Hello_World');
            await settle();
            expect(r.matched(), ':id(slug) must not match capitals or underscores').toBeNull();
            expect(r.navError()).toBe('404');
        },
    },
    {
        name: 'matches a string param as any one segment',
        run: async (r) => {
            r.navigate('/tags/Any_Thing.v2');
            await settle();
            expect(r.matched()).toBe('/tags/:t(string)');
            expect(r.params()).toEqual({ t: 'Any_Thing.v2' });
        },
    },
    {
        name: 'exposes parsed query params and lets them be set',
        run: async (r) => {
            r.navigate('/about?tab=2&sort=asc');
            await settle();
            expect(r.query()).toEqual({ tab: '2', sort: 'asc' });
            expect(r.search(), 'the raw string and the record must agree').toBe('?tab=2&sort=asc');

            r.setQueryParam('tab', '3');
            expect(r.query()).toEqual({ tab: '3', sort: 'asc' });
            expect(location.search, 'the URL is what the browser shares and reloads').toBe('?tab=3&sort=asc');

            // null REMOVES. A writer that can only set leaves a filter nobody can clear.
            r.setQueryParam('sort', null);
            expect(r.query()).toEqual({ tab: '3' });
            expect(r.search()).toBe('?tab=3');

            r.setQuery({ page: '2' });
            expect(r.query()).toEqual({ page: '2' });
            expect(r.search()).toBe('?page=2');
        },
    },
    {
        // Writing the value a parameter already HAS must notify nobody — the law the rest of the
        // reactivity obeys. A writer that rebuilds the query as a fresh object breaks it:
        // the identity check inside the signal then never suppresses anything. A page that
        // closes a circle — filter builder → source → handler → `setQueryParam` → query → the
        // builder's `:value` — then hits the flush guard, which breaks the loop at 100 cycles by
        // DROPPING the pending effects, leaving computeds marked dirty with no reader left. The
        // screen freezes in silence. Here for BOTH routers because each is an implementation of
        // its own.
        name: 'writing the value a param already has notifies nobody',
        run: async (r) => {
            r.navigate('/about?tab=2');
            await settle();

            let runs = 0;
            const stop = core.effect(() => { r.query(); runs++; });
            expect(runs).toBe(1);

            r.setQueryParam('tab', '2');
            expect(runs, 'setQueryParam re-ran every reader for a value that did not change').toBe(1);

            r.setQuery({ tab: '2' });
            expect(runs, 'setQuery re-ran every reader for a query that did not change').toBe(1);

            r.setQueryParam('missing', null);
            expect(runs, 'removing a key that was not there is not a change either').toBe(1);

            r.setQueryParam('tab', '3');
            expect(runs, 'and a REAL change still arrives — the guard must not silence it').toBe(2);
            stop();
        },
    },
    {
        name: 'restores scroll position on back navigation',
        run: async (r) => {
            r.navigate('/about');
            await settle();
            window.scrollTo(0, 250);

            r.navigate('/users/1');
            await settle();
            // The control: a forward navigation goes to the TOP. A router that never scrolls
            // satisfies the restoration assertion below and fails this one.
            expect(window.scrollY, 'a forward navigation starts at the top').toBe(0);

            popTo('/about');
            await settle();
            await raf();
            expect(window.scrollY, 'back must land where the page was left').toBe(250);
        },
    },
    {
        // pdx-app-layout scrolls the page inside `.pdx-app-main`, not the window. A restoration
        // that knows only the window opens the next route at the previous page's offset: at
        // 390 px, a page opens at 472 with its first choices above the screen.
        name: 'resets and restores the scroll of the container the outlet scrolls in',
        run: async (r) => {
            const box = document.createElement('div');
            box.style.overflowY = 'auto';
            box.style.height = '200px';
            box.appendChild(document.createElement('pdx-router-outlet'));
            document.body.appendChild(box);
            try {
                r.navigate('/about');
                await settle();
                box.scrollTop = 300;

                r.navigate('/users/1');
                await settle();
                expect(box.scrollTop, "the new page opened at the previous page's offset").toBe(0);

                popTo('/about');
                await settle();
                await raf();
                expect(box.scrollTop, 'back must land where the page was left, in the container').toBe(300);
            } finally {
                box.remove();
            }
        },
    },
    {
        name: 'an outlet with no scrolling ancestor still restores the window',
        run: async (r) => {
            // The control for the row above: a container is used only when it can scroll.
            const box = document.createElement('div');
            box.appendChild(document.createElement('pdx-router-outlet'));
            document.body.appendChild(box);
            try {
                r.navigate('/about');
                await settle();
                window.scrollTo(0, 180);

                r.navigate('/users/1');
                await settle();
                expect(window.scrollY).toBe(0);

                popTo('/about');
                await settle();
                await raf();
                expect(window.scrollY).toBe(180);
            } finally {
                box.remove();
            }
        },
    },
    {
        name: 'carries history state through a navigation',
        run: async (r) => {
            r.navigate('/about', undefined, { from: 'the-parity-table' });
            await settle();
            expect(r.state()).toEqual({ from: 'the-parity-table' });

            // Ephemeral: the next navigation carries none, so none is what it must report. A state
            // that survives is a banner explaining a navigation that already happened.
            r.navigate('/users/1');
            await settle();
            expect(r.state()).toBeUndefined();
        },
    },
    {
        name: 'exposes the matched route meta',
        run: async (r) => {
            r.navigate('/about');
            await settle();
            expect(r.meta()).toEqual({ breadcrumb: 'About', section: 'company' });

            r.navigate('/users/1');
            await settle();
            expect(r.meta(), 'a route with no meta must clear the previous one').toBeUndefined();
        },
    },
    {
        name: 'can be torn down, releasing its listeners',
        run: async (r) => {
            r.navigate('/about');
            await settle();

            r.destroy();
            popTo('/users/1');
            await settle();
            expect(r.path(), 'a torn-down router must not answer popstate').toBe('/about');

            // Idempotent: the outlet calls this on disconnect, and a disconnect can happen twice
            // (a move in the DOM is a disconnect followed by a connect).
            r.destroy();
        },
    },
    {
        name: 'matches a catch-all wildcard route',
        // A matcher whose "is this route static?" test only looks for ':' emits '/files/*' as a
        // literal switch case, matching nothing but the string '/files/*'.
        run: async (r) => {
            r.navigate('/files/a/b.txt');
            await settle();
            expect(r.matched()).toBe('/files/*');
            expect(r.params()).toEqual({ $rest: 'a/b.txt' });
        },
    },
    {
        name: 'a wildcard takes one segment as readily as many',
        run: async (r) => {
            r.navigate('/files/readme.md');
            await settle();
            expect(r.matched()).toBe('/files/*');
            expect(r.params()).toEqual({ $rest: 'readme.md' });
        },
    },
    {
        name: 'a wildcard needs at least one segment after its prefix',
        // A trailing `*` takes a NON-EMPTY rest, so the bare prefix is a 404 rather than the
        // catch-all with an empty tail. Written down because "at least one" is the difference
        // between `(.+)` and `(.*)`, and a matcher could pick either.
        run: async (r) => {
            r.navigate('/files');
            await settle();
            expect(r.matched()).toBeNull();
            expect(r.navError()).toBe('404');
        },
    },
    {
        name: 'a wildcard does not match a path that lacks its prefix',
        run: async (r) => {
            r.navigate('/filesystem/a');
            await settle();
            expect(r.matched()).toBeNull();
        },
    },
    {
        name: 'refuses a route-level redirect that leaves the origin',
        run: async (r) => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            r.navigate('/about');
            await settle();
            r.navigate('/hostile');
            await settle();
            const refusals = warn.mock.calls.map(c => String(c[0]))
                .filter(m => m.includes('Refused') && m.includes('evil.example'));
            warn.mockRestore();
            expect(refusals.length, 'no refusal was reported').toBeGreaterThan(0);
            expect(r.path(), 'followed a route redirect off-origin').not.toContain('evil.example');
        },
    },
    {
        // The hash is the page's, not the route's: `/about#team` is `/about`, scrolled. A router
        // that matched the whole string answered 404 for any link to an anchor on another page.
        name: 'matches a target with a hash on its path, without the hash',
        run: async (r) => {
            r.navigate('/about#team');
            await settle();
            expect(r.matched(), 'the hash was matched as part of the path').toBe('/about');
            expect(r.navError()).toBeNull();
        },
    },
    {
        // Two params in one segment: the one pattern shape the segment matcher hands to a regex.
        // It must keep matching, with both params named — not a param called `name.:ext`.
        name: 'matches two params in one segment and names both',
        run: async (r) => {
            r.navigate('/docs/guide.pdf');
            await settle();
            expect(r.matched()).toBe('/docs/:name.:ext');
            expect(r.params()).toEqual({ name: 'guide', ext: 'pdf' });
        },
    },
    {
        // `@scroll` is one field, read off the matched route and handed to core's restoration
        // (`restoreScrollPosition(path, isBack, outlet, route.scroll)`). A producer that drops it
        // makes the declaration do nothing — 'top' restores on Back, 'preserve' does not restore.
        name: "carries @scroll 'top' to the matched route",
        run: async (r) => {
            r.navigate('/always-top');
            await settle();
            expect(r.scroll(), 'the declaration stopped at the route table').toBe('top');
        },
    },
    {
        name: "carries @scroll 'preserve' to the matched route",
        run: async (r) => {
            r.navigate('/keep-place');
            await settle();
            expect(r.scroll()).toBe('preserve');
        },
    },
    {
        name: 'and no @scroll for a route that declares none',
        // The control: a producer that put 'top' on everything would satisfy the two above.
        run: async (r) => {
            r.navigate('/about');
            await settle();
            expect(r.scroll()).toBeUndefined();
        },
    },
    ...HOSTILE_ROWS,
];

// ─── The suite ───────────────────────────────────────────────────────────────

beforeEach(() => {
    destroyRouter();
    history.replaceState(null, '', '/');
    loaderRuns.ticket = 0;
    loaderRuns.note = 0;
});
afterEach(() => {
    destroyRouter();
    // The stand-ins for the imported page modules and for the installed table are global state, and
    // one left behind would let a later row find a loader, or a redirect, no route in it declares.
    delete (globalThis as { __pdx_routes?: unknown[] }).__pdx_routes;
    delete globalThis.__pdx_route_table;
    installRouteTable(null);
});

for (const producer of PRODUCERS) {
    describe(`the router, from the ${producer.name}`, () => {
        for (const row of PARITY) {
            it(row.name, async () => {
                await row.run(producer.make(ROUTES, row.options));
            });
        }
    });
}

describe('the behaviour table itself', () => {
    it('covers every producer', () => {
        // A suite fed by one producer would let a field the other drops pass unseen.
        expect(PRODUCERS.map(p => p.name)).toEqual(['build table', 'dev table', 'createRouter(routes)']);
    });

    it('is a table worth calling one', () => {
        expect(PARITY.length).toBeGreaterThan(20);
    });
});

// ─── Where a denied guard goes, set with configureRouter ─────────────────────
//
// `guardFailRedirect` is an option the routes cannot carry. createRouter takes it, and
// configureRouter changes it on a running router — what an app does once its session is known.

for (const producer of PRODUCERS) {
    describe(`configureRouter on the router from the ${producer.name}`, () => {
        it('sends a denied navigation to guardFailRedirect', async () => {
            const r = producer.make(ROUTES);
            r.registerGuard(() => false);
            configureRouter({ guardFailRedirect: '/about' });
            r.navigate('/admin');
            await settle();

            // The redirect target wins over the 403: the app said where a denial should land.
            expect(r.matched()).toBe('/about');
            expect(r.navError()).toBeNull();
            // And the ADDRESS goes with it. Asserting the resolved route alone lets a missing write
            // through: the page rendered is the redirect target while the URL is still the route
            // that was refused, so a reload goes back to the denial.
            expect(location.pathname).toBe('/about');
        });

        it('asks a FUNCTION which way a denial goes, and takes null for "refuse here"', async () => {
            // A denial has two causes: no session wants the login, a session without the permission
            // wants the 403 where it happened. The router cannot tell them apart — the checker
            // answers a boolean — so the app answers, per denied permission.
            const r = producer.make(ROUTES);
            const asked: string[] = [];
            r.registerGuard(() => false);
            configureRouter({ guardFailRedirect: (permission) => { asked.push(permission); return null; } });
            r.navigate('/admin');
            await settle();

            expect(asked, 'the function was never called').toEqual(['admin.access']);
            expect(r.navError(), 'null means refuse here, and it redirected instead').toBe('403');
            expect(location.pathname, 'a 403 that moves the address bar cannot be reloaded or linked')
                .toBe('/admin');
        });

        it('and takes a path from that same function', async () => {
            // The control for the row above: a function that answers a path is a redirect, so "null
            // refuses" is not satisfied by a router that ignores functions altogether.
            const r = producer.make(ROUTES);
            r.registerGuard(() => false);
            configureRouter({ guardFailRedirect: () => '/about' });
            r.navigate('/admin');
            await settle();

            expect(r.matched()).toBe('/about');
            expect(r.navError()).toBeNull();
            expect(location.pathname).toBe('/about');
        });

        it('does not loop when the redirect target is itself denied', async () => {
            // Loop-safety: redirecting to the path we are already on would recurse forever.
            const r = producer.make([
                { path: '/', file: 'h.pdx', tag: 'pdx-h' },
                { path: '/denied', file: 'd.pdx', tag: 'pdx-d', guard: 'nope' },
            ]);
            r.registerGuard(() => false);
            configureRouter({ guardFailRedirect: '/denied' });
            r.navigate('/denied');
            await settle();

            expect(r.navError(), 'redirecting to the denied path itself must fall through to 403').toBe('403');
        });
    });
}

describe('a table route reaches the router with every field', () => {
    // `toRouteConfig` is the one place a table route becomes a RouteConfig. A field it dropped
    // would fail in silence on the two table producers and pass on `createRouter(routes)`.
    it('keeps what the router reads', () => {
        const table = evaluateTable([{
            path: '/x/:id', file: 'x.pdx', tag: 'pdx-x', guard: 'g', meta: { a: 1 }, hasOutlet: true,
            scroll: 'top', label: 'X :id', labelKey: 'x.title', loader: 'loadX',
        }], buildSpecifier);
        const config = toRouteConfig(table.routes[0]);
        expect(config).toMatchObject({
            path: '/x/:id', guard: 'g', meta: { a: 1 }, hasOutlet: true, scroll: 'top',
            label: 'X :id', labelKey: 'x.title',
        });
        expect(typeof config.loader, 'the loader bridge was dropped').toBe('function');
        expect((config.component() as Element).tagName.toLowerCase()).toBe('pdx-x');
    });
});
