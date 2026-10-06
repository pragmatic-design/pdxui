// The signal the generated router is measured against.
//
// PDX has TWO routers. `packages/router/src/runtime.ts` is the interpreted one, used in dev;
// `generateOptimizedRouter` in the compiler emits a second implementation — a switch statement with
// no regex and no loop — that replaces it in production builds.
//
// Without a shared table, each change would invent its own assertions and "parity" would mean
// whatever the last author happened to test. So: one behaviour, written once, run against both. A
// row the generated router cannot satisfy is skipped WITH ITS OWNER IN ITS NAME — never silently
// omitted, because a row nobody has claimed is a row that will be forgotten. The last case in this
// file asserts that count is zero.
//
// The generated module is a string. It is evaluated the way the site's playground evaluates compiled
// PDX: rewrite the `@pdxui/core` import to an injected namespace, strip the export keywords, and
// run it through `new Function`. That is the only way to test the artefact a production build would
// actually ship, rather than a re-implementation of it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as core from '@pdxui/core';
import { generateOptimizedRouter, type ScannedRoute } from '../../compiler/src/plugin-utils';
import {
    createRouter, destroyRouter, navigate as rtNavigate,
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

// ─── The two implementations, behind one shape ───────────────────────────────

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
    /** What the route's @loader returned. undefined in a router that cannot run one. */
    loaderData(): unknown;
    /** 'idle' | 'loading' | 'done' | 'error' — 'idle' in a router that cannot run one. */
    loaderState(): string;
    /** What a SPECIFIC level's @loader returned, by its route pattern. */
    loaderDataFor(path: string): unknown;
    search(): string;
    /** '403' when a guard denied, '404' when nothing matched, null otherwise. */
    navError(): string | null;
    /** Which nesting level the error belongs to: the outlet at this depth renders it. */
    navErrorDepth(): number;
    /** Install the guard evaluator. Both routers keep this OUT of route configuration on purpose. */
    registerGuard(checker: (name: string) => boolean | Promise<boolean>): void;
    /** Returning false cancels the navigation. Returns an unsubscribe. */
    onBefore(hook: (from: string, to: string) => boolean | Promise<boolean>): () => void;
    onAfter(hook: (from: string, to: string) => void): () => void;
    /** Release the navigation listeners. Idempotent in both. */
    destroy(): void;
}

/** Options a row needs configured before its first navigation. Both routers take them differently. */
interface UnderTestOptions {
    basePath?: string;
    redirects?: { from: string; to: string }[];
}

/**
 * A route as this table declares it.
 *
 * `ScannedRoute.loader` is the loader's NAME — serialisable build-time data, which is all the
 * generated module can hold. The FUNCTION lives in the page module, and reaches both routers the
 * same way it does in production: the compiled page module publishes it into `globalThis.__pdx_routes`
 * when it is imported. `loaderFn` is this table's stand-in for that module.
 */
type ParityRoute = ScannedRoute & { loaderFn?: () => Promise<unknown> };

/**
 * Publish the live loaders the way a compiled page module does — `globalThis.__pdx_routes`, the same
 * table the generated router already consults for late-registered redirects.
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
    // so this is defence in depth — but the router refuses it, and a
    // second implementation of redirects is exactly where that decision gets lost.
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
];

/**
 * Evaluate the generated module into a live object.
 *
 * ESM cannot be `new Function`'d, so the import becomes a destructure of an injected namespace and
 * the export keywords are removed — the same transformation `packages/site/src/lib/playground-compile.ts`
 * applies to compiled PDX, for the same reason.
 */
function evaluateGenerated(routes: ParityRoute[], options?: UnderTestOptions): RouterUnderTest {
    // Before the module is evaluated: it resolves location.pathname at import, so a loader for the
    // landing path runs during that resolution and has to be findable already.
    publishPageModules(routes);
    const src = generateOptimizedRouter(routes)
        .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;')
        .replace(/^export\s+/gm, '');

    // The tail asks for a fixed set of names and lets the ones this module does not export yet come
    // back undefined. Without that, a `return { …, onBeforeNavigate }` for a symbol the module does
    // not export throws a ReferenceError that fails every unrelated row. `typeof`
    // is the only expression that is safe on an undeclared binding, hence the eval.
    const factory = new Function('__core', `${src}\nconst OPTIONAL = 'currentNavError currentNavErrorDepth registerGuardChecker configureRouter onBeforeNavigate onAfterNavigate currentQuery currentMeta currentState setQuery setQueryParam destroyRouter currentLoaderData currentLoaderState loaderData loaderState';
return { routes, currentPath, currentSearch, currentParams, currentRoute, navigate,
  ...Object.fromEntries(OPTIONAL.split(' ').map(n => [n, eval('typeof ' + n + " !== 'undefined' ? " + n + ' : undefined')])) };`);
    const m = factory(core) as {
        currentPath: () => string;
        currentSearch: () => string;
        currentParams: () => Record<string, string>;
        currentRoute: () => { path: string } | null;
        currentNavError?: () => string | null;
        currentNavErrorDepth?: () => number;
        currentQuery?: () => Record<string, string>;
        currentMeta?: () => Record<string, unknown> | undefined;
        currentState?: () => Record<string, unknown> | undefined;
        setQuery?: (params: Record<string, string>) => void;
        setQueryParam?: (key: string, value: string | null) => void;
        navigate: (path: string, params?: Record<string, string>, state?: Record<string, unknown>) => void;
        registerGuardChecker?: (c: (n: string) => boolean | Promise<boolean>) => void;
        configureRouter?: (o: { guardFailRedirect?: string } & UnderTestOptions) => void;
        onBeforeNavigate?: (h: (f: string, t: string) => boolean | Promise<boolean>) => () => void;
        onAfterNavigate?: (h: (f: string, t: string) => void) => () => void;
        destroyRouter?: () => void;
        currentLoaderData?: () => unknown;
        currentLoaderState?: () => string;
        loaderData?: (path: string) => unknown;
        loaderState?: (path: string) => string;
    };

    // The generated module resolves location.pathname at import; options arrive after. That is a
    // real difference from createRouter(routes, options) and configureRouter() is what closes it.
    if (options) m.configureRouter?.(options);

    return {
        navigate: (p, params, state) => m.navigate(p, params, state),
        path: () => m.currentPath(),
        params: () => m.currentParams(),
        query: () => m.currentQuery?.() ?? {},
        setQuery: (params) => m.setQuery?.(params),
        setQueryParam: (k, v) => m.setQueryParam?.(k, v),
        state: () => m.currentState?.(),
        meta: () => m.currentMeta?.(),
        matched: () => m.currentRoute()?.path ?? null,
        search: () => m.currentSearch(),
        navError: () => m.currentNavError?.() ?? null,
        navErrorDepth: () => m.currentNavErrorDepth?.() ?? 0,
        loaderData: () => m.currentLoaderData?.(),
        loaderState: () => m.currentLoaderState?.() ?? 'idle',
        registerGuard: (c) => m.registerGuardChecker?.(c),
        onBefore: (h) => m.onBeforeNavigate?.(h) ?? (() => {}),
        onAfter: (h) => m.onAfterNavigate?.(h) ?? (() => {}),
        loaderDataFor: (path) => m.loaderData?.(path),
        destroy: () => m.destroyRouter?.(),
    };
}

function useRuntime(routes: ParityRoute[], options?: UnderTestOptions): RouterUnderTest {
    // `guard` has to travel: without it the runtime router has nothing to deny and the guard rows
    // pass for the wrong reason. Same for `redirect`.
    createRouter(routes.map(r => ({
        path: r.path,
        component: () => document.createElement('div'),
        ...(r.guard ? { guard: r.guard } : {}),
        ...(r.redirect ? { redirect: r.redirect } : {}),
        ...(r.meta ? { meta: r.meta } : {}),
        ...(r.loaderFn ? { loader: r.loaderFn } : {}),
        // And `label`, for the same reason: without it the trail rows fail on the interpreted
        // router while passing on the generated one, because the crumb's name never reaches the
        // table this builds.
        ...(r.label ? { label: r.label } : {}),
        // And `hasOutlet`. Without it `chainFor` sees no parents and every nested row passes for
        // the wrong reason, on the router that implements nesting.
        ...(r.hasOutlet ? { hasOutlet: r.hasOutlet } : {}),
    })), options);
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

const IMPLEMENTATIONS = [
    { name: 'runtime', make: useRuntime },
    { name: 'generated', make: evaluateGenerated },
] as const;

/** The runtime router settles asynchronously (guards may be async); the generated one is sync. */
const settle = () => new Promise(r => setTimeout(r, 20));

/** Scroll restoration runs inside requestAnimationFrame, in both routers. */
const raf = () => new Promise(r => requestAnimationFrame(() => r(null)));

/**
 * The browser's back button, simulated by the event the browser actually fires. Neither router has
 * a `back()` of its own — both listen for `popstate` — so this belongs to the harness rather than
 * to `RouterUnderTest`, and it exercises the same code path a real back press does.
 */
function popTo(path: string, state: Record<string, unknown> | null = null): void {
    history.replaceState(state, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state }));
}

// ─── The table ───────────────────────────────────────────────────────────────
//
// `owner` names the issue that will make the generated router satisfy the row. A row with no owner
// must pass on BOTH today.

interface Row {
    name: string;
    /** The issue of this repository (`#123`) that owns making this row pass. Undefined = it must pass on both TODAY. */
    owner?: string;
    /**
     * Which implementation cannot satisfy it yet. 'generated' is the expected direction — the
     * sequence is about capabilities it lacks. 'runtime' means the table found the two DISAGREEING,
     * which is the finding this file exists to make possible and which nothing else compares.
     */
    failsOn?: 'generated' | 'runtime';
    /** Configured before the first navigation — createRouter options / configureRouter(). */
    options?: UnderTestOptions;
    run(r: RouterUnderTest): Promise<void> | void;
}

/**
 * The four shapes a router target must refuse — a redirect is not an `<a href>`
 * and `history.replaceState` cannot leave the origin at all. Written once here and run against both
 * routers, because a second implementation of redirects is precisely where a decision like this gets
 * quietly dropped.
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
        // Written here rather than in a file of its own because a capability that lives in one
        // implementation is half a capability: present in the interpreted router and absent from
        // a production build, the breadcrumb reads an empty trail while the route table plainly
        // carries the labels.
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
        // The generated router puts a static route in a `switch` case, tried before any dynamic
        // one. An interpreted router that took the FIRST registered route that matched would mount
        // `/customers/import` as the page for a customer called «import», because the scan lists
        // `customer.pdx` first: the same URL one page in dev and another in a build.
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
        // The generated module is `virtual:pdx-router` and does not import the page modules, so a
        // function declared in one cannot be referenced from it: `ScannedRoute` carries only
        // serialisable fields. The loader reaches both routers through `globalThis.__pdx_routes`,
        // which the compiled page module publishes (see `publishPageModules`).
        run: async (r) => {
            r.navigate('/data');
            await settle();
            expect(r.loaderState()).toBe('done');
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
            // The ADDRESS, not only the resolved route. Comparing only what the two routers publish
            // stays green while one writes the address and the other does not.
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
        // The runtime compiles `*` to `(.+)`, which cannot match nothing, so the bare prefix is a
        // 404 rather than the catch-all with an empty tail. Written down because "at least one" is
        // the difference between `(.+)` and `(.*)`, and a generated matcher could pick either.
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
    // The stand-in for the imported page modules is global state, and a table left behind would let
    // a later row find a loader no route in it declares.
    delete (globalThis as { __pdx_routes?: unknown[] }).__pdx_routes;
});

for (const impl of IMPLEMENTATIONS) {
    describe(`${impl.name} router`, () => {
        for (const row of PARITY) {
            // A row this implementation cannot satisfy yet is SKIPPED BY NAME, with its owner in the
            // title, so `vitest --reporter=verbose` reads as a to-do list rather than a silence.
            const skip = row.owner !== undefined && (row.failsOn ?? 'generated') === impl.name;
            const title = skip ? `${row.name} — not yet: ${row.owner}` : row.name;
            (skip ? it.skip : it)(title, async () => {
                await row.run(impl.make(ROUTES, row.options));
            });
        }
    });
}

describe('the parity table itself', () => {
    it('covers both implementations', () => {
        // A one-implementation table would let "parity" mean nothing.
        expect(IMPLEMENTATIONS.map(i => i.name)).toEqual(['runtime', 'generated']);
    });

    it('is a table worth calling one', () => {
        expect(PARITY.length).toBeGreaterThan(20);
    });

    it('names the implementation each pending row fails on', () => {
        // Without this, a row could be marked pending and skipped on neither side — claimed on
        // paper and asserted nowhere.
        const bad = PARITY.filter(r => r.owner !== undefined
            && r.failsOn !== undefined
            && !IMPLEMENTATIONS.some(i => i.name === r.failsOn));
        expect(bad.map(r => r.name)).toEqual([]);
    });

    it('records the disagreements separately from the missing capabilities', () => {
        // A row failing on the RUNTIME is a different kind of finding: the two routers behave
        // differently on the same input, which is what this table is uniquely able to see. The list
        // is empty, and the assertion stays: a disagreement has to be marked as one, not filed as a
        // missing capability.
        const disagreements = PARITY.filter(r => r.failsOn === 'runtime').map(r => r.name);
        expect(disagreements).toEqual([]);
    });

    it('has no unclaimed row', () => {
        // The rule this file exists to enforce: every behaviour the generated router does not have
        // yet names the issue that will give it one. A row with no owner must already pass on both,
        // and the suite above is what proves it does.
        const unclaimed = PARITY.filter(r => r.owner !== undefined && !/^#\d+$/.test(r.owner));
        expect(unclaimed.map(r => r.name), 'these are marked pending with no issue behind them').toEqual([]);
    });

    it('claims every row that the generated router cannot satisfy', () => {
        // Stated as a number so a row losing its owner is visible.
        const claimed = PARITY.filter(r => r.owner !== undefined);
        // Zero: both routers satisfy every row. A rise is a finding stated rather than smoothed over.
        expect(claimed.length).toBe(0);
        expect([...new Set(claimed.map(r => r.owner))].sort()).toEqual([]);
    });
});

// ─── Guard decisions the shared table cannot express ─────────────────────────
//
// Both belong to the GENERATED router only, for a reason worth stating: the runtime router keeps its
// guard checker in a module-level variable with no way to clear it, so "no checker is registered" is
// a state a shared row cannot reach once any earlier row has registered one. The runtime's own
// version of the first case is packages/router/tests/guard-unregistered.test.ts; the second has no
// runtime equivalent because `guardFailRedirect` is a createRouter option there and a
// configureRouter() call here.

describe('the generated router, on guards it decides alone', () => {
    it('denies a guarded route when NO checker is registered', () => {
        // A declared guard that cannot be evaluated is denied, never
        // allowed. An app that forgets to register a checker must not get its admin routes opened by
        // the omission — and it is warned, once, rather than silently refused forever.
        const r = evaluateGenerated(ROUTES);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        r.navigate('/admin');
        return new Promise<void>(resolve => setTimeout(() => {
            expect(r.matched(), 'a guard nothing can evaluate must not open the route').toBeNull();
            expect(r.navError()).toBe('403');
            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0][0])).toContain('denied, never allowed');
            warn.mockRestore();
            resolve();
        }, 20));
    });

    it('sends a denied navigation to guardFailRedirect when one is configured', async () => {
        const src = generateOptimizedRouter(ROUTES)
            .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;')
            .replace(/^export\s+/gm, '');
        const m = new Function('__core', `${src}
return { currentRoute, currentNavError, navigate, registerGuardChecker, configureRouter };`)(core) as {
            currentRoute: () => { path: string } | null;
            currentNavError: () => string | null;
            navigate: (p: string) => void;
            registerGuardChecker: (c: () => boolean) => void;
            configureRouter: (o: { guardFailRedirect?: string }) => void;
        };

        m.registerGuardChecker(() => false);
        m.configureRouter({ guardFailRedirect: '/about' });
        m.navigate('/admin');
        await settle();

        // The redirect target wins over the 403: the app said where a denial should land.
        expect(m.currentRoute()?.path).toBe('/about');
        expect(m.currentNavError()).toBeNull();
        // And the ADDRESS goes with it. Asserting the resolved route alone lets a missing write
        // through: the page rendered is the redirect target while the URL is still the route that
        // was refused, so a reload goes back to the denial. The runtime router's half is
        // guard-redirect-boot.test.ts.
        expect(location.pathname).toBe('/about');
    });

    it('asks a FUNCTION which way a denial goes, and takes null for "refuse here"', async () => {
        // A denial has two causes: no session wants the login, a session without the permission
        // wants the 403 where it happened. The router cannot tell them apart — the checker answers
        // a boolean — so the app answers, per denied permission.
        //
        // Here as a parity row because a generated router that ignores anything that is not a
        // string would show the 403 in dev and go to the login in a production build, which is
        // the mode difference this file exists to make impossible.
        const src = generateOptimizedRouter(ROUTES)
            .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;')
            .replace(/^export\s+/gm, '');
        const m = new Function('__core', `${src}
return { currentRoute, currentNavError, navigate, registerGuardChecker, configureRouter };`)(core) as {
            currentRoute: () => { path: string } | null;
            currentNavError: () => string | null;
            navigate: (p: string) => void;
            registerGuardChecker: (c: () => boolean) => void;
            configureRouter: (o: { guardFailRedirect?: string | ((p: string) => string | null) }) => void;
        };

        const asked: string[] = [];
        m.registerGuardChecker(() => false);
        m.configureRouter({ guardFailRedirect: (permission) => { asked.push(permission); return null; } });
        m.navigate('/admin');
        await settle();

        expect(asked, 'the generated router never called the function').toEqual(['admin.access']);
        expect(m.currentNavError(), 'null means refuse here, and it redirected instead').toBe('403');
        expect(location.pathname, 'a 403 that moves the address bar cannot be reloaded or linked')
            .toBe('/admin');
    });

    it('and takes a path from that same function', async () => {
        // The control for the row above: a function that answers a path is a redirect, so "null
        // refuses" is not satisfied by a build that ignores functions altogether.
        const src = generateOptimizedRouter(ROUTES)
            .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;')
            .replace(/^export\s+/gm, '');
        const m = new Function('__core', `${src}
return { currentRoute, currentNavError, navigate, registerGuardChecker, configureRouter };`)(core) as {
            currentRoute: () => { path: string } | null;
            currentNavError: () => string | null;
            navigate: (p: string) => void;
            registerGuardChecker: (c: () => boolean) => void;
            configureRouter: (o: { guardFailRedirect?: string | ((p: string) => string | null) }) => void;
        };

        m.registerGuardChecker(() => false);
        m.configureRouter({ guardFailRedirect: () => '/about' });
        m.navigate('/admin');
        await settle();

        expect(m.currentRoute()?.path).toBe('/about');
        expect(m.currentNavError()).toBeNull();
        expect(location.pathname).toBe('/about');
    });

    it('does not loop when the redirect target is itself denied', async () => {
        // Loop-safety: redirecting to the path we are already on would recurse forever.
        const routes = [
            { path: '/', file: 'h.pdx', tag: 'pdx-h' },
            { path: '/denied', file: 'd.pdx', tag: 'pdx-d', guard: 'nope' },
        ];
        const src = generateOptimizedRouter(routes)
            .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;')
            .replace(/^export\s+/gm, '');
        const m = new Function('__core', `${src}
return { currentNavError, navigate, registerGuardChecker, configureRouter };`)(core) as {
            currentNavError: () => string | null;
            navigate: (p: string) => void;
            registerGuardChecker: (c: () => boolean) => void;
            configureRouter: (o: { guardFailRedirect?: string }) => void;
        };

        m.registerGuardChecker(() => false);
        m.configureRouter({ guardFailRedirect: '/denied' });
        m.navigate('/denied');
        await settle();

        expect(m.currentNavError(), 'redirecting to the denied path itself must fall through to 403').toBe('403');
    });
});

// ─── What each router HANDS to the shared core ───────────────────────────────
//
// One missing argument is enough to make `@scroll 'top'` do nothing in a production build: the
// interpreted router calls `restoreScroll(path, isBack, outlet, config.scroll)`, and a generated
// `restoreScrollPosition(pathname, isBack, _primaryOutlet())` drops the last one. Inside core, an
// absent `behavior` collapses the decision to `restoring = isBack`, so BOTH declarations become
// no-ops — `'top'` restores on Back and `'preserve'` does not restore on a forward navigation.
//
// The rows above cannot see it: they compare what the two routers PUBLISH — the path, the params,
// the matched route — and this is about what they CALL. So the comparison is on the calls
// themselves, and it is general rather than about scrolling: for every core function both routers
// use, the generated one must pass at least as many arguments as the interpreted one. A dropped
// argument is the shape this family of defect takes (`loader`, `scroll`, `hasOutlet`, `label`).

const RUNTIME_SRC = readFileSync(join(__dirname, '..', 'src', 'runtime.ts'), 'utf-8');

/** `import { a as b, c } from '@pdxui/core'` → { a: 'b', c: 'c' }: the LOCAL name of each. */
function coreLocalNames(src: string): Map<string, string> {
    const names = new Map<string, string>();
    // EVERY such statement, not the first: `runtime.ts` has three, and the scroll pair is in the
    // second — reading only one of them misses the defect this guard exists for.
    // `import type` is skipped: a type is not a call.
    for (const m of src.matchAll(/import\s+(?!type\s)\{([^}]*)\}\s*from\s*'@pdxui\/core'/g)) {
        for (const part of m[1].split(',')) {
            const [imported, local] = part.trim().split(/\s+as\s+/);
            if (imported) names.set(imported.trim(), (local ?? imported).trim());
        }
    }
    return names;
}

/** How many arguments the widest call to `fn` passes. 0 when it is never called. */
function maxArity(src: string, fn: string): number {
    let widest = 0;
    const call = new RegExp(`\\b${fn}\\s*\\(`, 'g');
    let hit: RegExpExecArray | null;
    while ((hit = call.exec(src)) !== null) {
        let depth = 1, args = 0, seen = false;
        for (let i = hit.index + hit[0].length; i < src.length && depth > 0; i++) {
            const ch = src[i];
            if (ch === '(' || ch === '[' || ch === '{') depth++;
            else if (ch === ')' || ch === ']' || ch === '}') depth--;
            else if (ch === ',' && depth === 1) args++;
            if (depth === 1 && !/\s/.test(ch) && ch !== ',') seen = true;
        }
        widest = Math.max(widest, seen ? args + 1 : 0);
    }
    return widest;
}

describe('the two routers hand the same things to core', () => {
    const generatedSrc = generateOptimizedRouter(ROUTES);
    const runtimeNames = coreLocalNames(RUNTIME_SRC);
    const generatedNames = coreLocalNames(generatedSrc);

    it('read both sources, and they do import core', () => {
        // Without this the comparison below is two empty lists agreeing.
        expect(runtimeNames.size, 'runtime.ts imports nothing from core').toBeGreaterThan(2);
        expect(generatedNames.size, 'the generated router imports nothing from core').toBeGreaterThan(2);
    });

    it('passes every argument the interpreted one passes', () => {
        const shared = [...runtimeNames.keys()].filter((fn) => generatedNames.has(fn));
        expect(shared.length, 'the two routers share no core function at all').toBeGreaterThan(1);

        const thinner = shared
            .map((fn) => ({
                fn,
                runtime: maxArity(RUNTIME_SRC, runtimeNames.get(fn)!),
                generated: maxArity(generatedSrc, generatedNames.get(fn)!),
            }))
            .filter((r) => r.generated < r.runtime);

        expect(thinner,
            'the generated router calls these with fewer arguments than the interpreted one, so '
            + 'whatever the last argument decides is decided by its default in a production build',
        ).toEqual([]);
    });
});

describe('the generated router carries @scroll to the restoration', () => {
    // The behaviour behind the rule above, measured rather than inferred — and the mirror of
    // `outlet-scroll-behavior.test.ts`, which asserts exactly this for the interpreted router.
    function behavioursSeen(routes: ParityRoute[], path: string): (string | undefined)[] {
        const seen: (string | undefined)[] = [];
        const spyCore = {
            ...core,
            restoreScrollPosition: (_p: string, _b: boolean, _el?: Element | null, behavior?: string) => {
                seen.push(behavior);
            },
        };
        const src = generateOptimizedRouter(routes)
            .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;')
            .replace(/^export\s+/gm, '');
        const m = new Function('__core', `${src}\nreturn { navigate };`)(spyCore) as
            { navigate: (p: string) => void };
        seen.length = 0;
        m.navigate(path);
        return seen;
    }

    const SCROLL_ROUTES: ParityRoute[] = [
        { path: '/', file: 'h.pdx', tag: 'pdx-h' },
        { path: '/always-top', file: 't.pdx', tag: 'pdx-t', scroll: 'top' },
        { path: '/keep-place', file: 'k.pdx', tag: 'pdx-k', scroll: 'preserve' },
        { path: '/plain', file: 'p.pdx', tag: 'pdx-p' },
    ];

    it("passes 'top' through", () => {
        expect(behavioursSeen(SCROLL_ROUTES, '/always-top'),
            'the declaration stopped at the route table: a production build ignores @scroll')
            .toEqual(['top']);
    });

    it("passes 'preserve' through", () => {
        expect(behavioursSeen(SCROLL_ROUTES, '/keep-place')).toEqual(['preserve']);
    });

    it('and nothing for a route that declares nothing', () => {
        // The control: a router that passed 'top' to everything would satisfy the two above.
        expect(behavioursSeen(SCROLL_ROUTES, '/plain'),
            'a route with no @scroll acquired one').toEqual([undefined]);
    });
});
