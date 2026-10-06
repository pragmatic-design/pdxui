// Runtime Router — generic interpreted router for dev mode.
// In production, the compiler plugin replaces this with a generated optimized router.
//
// Features: regex matching, signal state, scroll restoration, middleware hooks,
// guard enforcement, redirects, query params, param constraints, base path.

import { signal, computed, effect, $t, sanitizeUrl } from '@pdxui/core';
import { saveScrollPosition as saveScroll, restoreScrollPosition as restoreScroll } from '@pdxui/core';
import { setRouteTrail } from '@pdxui/core';
import { DEV, setDevtoolsRouteSource, recordDevtoolsNavigation } from '@pdxui/core';
import type { ReadonlySignal, ScrollRestoration, RouteCrumb } from '@pdxui/core';

// ─── Scroll restoration ─────────────────────────────────────────────
//
// Core's, not a copy (`@pdxui/core/browser/scroll`). Several implementations of one behaviour is
// how a fix lands in one copy and not the others — a hash decoded unguarded in one copy throws a
// URIError on a URL ending in `#%` while another copy guards it. One owner, and core is the only
// package both routers already import.

const isBrowser = typeof window !== 'undefined';

/**
 * The main outlet — the one without a name — that the page renders in. Core saves and restores the
 * scroll of the container it scrolls in, not only the window's: pdx-app-layout scrolls the page
 * inside `.pdx-app-main`. Looked up on every navigation, since the layout can change.
 */
function primaryOutlet(): Element | null {
    return isBrowser ? document.querySelector('pdx-router-outlet:not([name]), pdx-router-outlet[name=""]') : null;
}

// ─── Types ─────────────────────────────────────────────────────────

export interface RouteConfig {
    path: string;
    component: () => Node | DocumentFragment | Promise<unknown>;
    guard?: string;
    loader?: () => Promise<unknown>;
    redirect?: string;
    meta?: Record<string, unknown>;
    /** `@scroll` on the page: what happens to the scroll position when this route is entered. */
    scroll?: ScrollRestoration;
    /**
     * This page renders a `<pdx-router-outlet>`, so routes below its path nest inside it.
     *
     * Set by the compiler from the template, never inferred from the path: `/owners` is a prefix of
     * `/owners/new` and they are siblings.
     */
    hasOutlet?: boolean;
    /**
     * What this route is called in a breadcrumb — `@page '/tickets' { label: 'Tickets' }`.
     *
     * A function when the name needs the record: `(params) => 'Ticket ' + params.id`, because
     * "Ticket 42" is the useful crumb and "42" is not. A route with no label contributes no crumb,
     * which is deliberate — deriving one from the path would show the URL segments a reader
     * already has in the address bar.
     */
    label?: string | ((params: Record<string, string>) => string);
    /**
     * The crumb as a dictionary key — `@page '/customers' { label: $t('customers.title') }` —
     * translated with the route's params. Data, so every route table carries it: an
     * ancestor a deep link never loads still names itself, in the page's language. Wins over `label`.
     */
    labelKey?: string;
}

export interface ResolvedRoute {
    path: string;
    params: Record<string, string>;
    query: Record<string, string>;
    config: RouteConfig;
    /**
     * The matched route and every registered route above it, outermost first, with `config` last.
     * A flat route is a chain of one, so code that only reads `config` needs nothing else.
     *
     * A route is above another when its path is a **segment prefix** of it AND it renders a child
     * outlet (`hasOutlet`). Both halves are needed: `/tickets/:id` is the parent of
     * `/tickets/:id/interventions/:n`, while `/owners` is a prefix of `/owners/new` and they are
     * siblings. Each outlet takes the level at its own nesting depth.
     */
    chain: RouteConfig[];
}

export interface RouterOptions {
    basePath?: string;
    /** Path to navigate to when a guard check fails. */
    /**
     * Where a DENIED guard sends the visitor — a path, or a function of the permission that was
     * refused which answers one, or `null` for "show the refusal here".
     *
     * A denial has two causes and they want two answers: no session → the login, with the intended
     * path remembered; a session without the permission → the 403, in the outlet of the level that
     * was denied. The router cannot tell them apart — it asks a `guardChecker` that answers a
     * boolean — so the function is how an application says which of the two this is.
     *
     *     guardFailRedirect: () => auth.isAuthenticated() ? null : '/login'
     */
    guardFailRedirect?: string | ((permission: string) => string | null | undefined);
    /** Static redirect table: [{ from: '/old', to: '/new' }] */
    redirects?: { from: string; to: string }[];
}

// ─── State ─────────────────────────────────────────────────────────

const _path = signal(isBrowser ? location.pathname : '/');
const _params = signal<Record<string, string>>({});
const _query = signal<Record<string, string>>({});
const _search = signal(isBrowser ? location.search : '');
const _meta = signal<Record<string, unknown> | undefined>(undefined);
const _state = signal<Record<string, unknown> | undefined>(undefined);
// A loader's result per LEVEL, keyed by route pattern.
//
// Not one signal: with a parent and a child both loading, `currentLoaderData()` would have no
// answer — whose data is it? Running both into one value would give a page the other level's data
// depending on the order, which is worse than not running it.
//
// So the map, and two ways to read it: `currentLoaderData()` means "the matched route's", which is
// what a caller on a flat route wants, and
// `loaderData('/tickets/:id')` reads a named level — the case a parent/child split exists for. It
// is the shape React Router settled on (`useLoaderData` / `useRouteLoaderData`), for the same
// reason.
type LoaderState = 'idle' | 'loading' | 'done' | 'error';
const _loaderData = signal<Record<string, unknown>>({});
const _loaderState = signal<Record<string, LoaderState>>({});
/** Which level `currentLoaderData()` resolves against: the matched route, set before its loader runs. */
const _loaderFocus = signal<string | null>(null);
/**
 * The params each level's loader last ran with — ITS OWN, not the whole match.
 *
 * This is what makes a sibling move cheap: `/tickets/7/notes/1` → `/tickets/7/notes/2` leaves the
 * ticket's own `:id` untouched, so its loader does not run again and the page it feeds does not
 * flicker. Change `:id` and it does.
 */
let _loaderKeys: Record<string, string> = {};
const _route = signal<ResolvedRoute | null>(null);
// Distinguish a guard denial (403) from a no-match (404): both set _route to null,
// but the outlet needs to know WHICH error page to render.
const _navError = signal<'403' | '404' | null>(null);
/**
 * The level of the chain the last 403 was raised at — 0 for a flat route or a denial at the top.
 *
 * A denial takes down the level it happened at and everything below it, and NOT the levels above:
 * those were allowed, and a permission on one tab must not cost the page the tab belongs to.
 * The outlet at this depth renders the refusal; the ones above it render their route.
 */
const _navErrorDepth = signal(0);

export const currentPath: ReadonlySignal<string> = computed(() => _path());
export const currentParams: ReadonlySignal<Record<string, string>> = computed(() => _params());
export const currentQuery: ReadonlySignal<Record<string, string>> = computed(() => _query());
/** Raw query string of the current route, including the leading '?' (or '' when none). */
export const currentSearch: ReadonlySignal<string> = computed(() => _search());
export const currentMeta: ReadonlySignal<Record<string, unknown> | undefined> = computed(() => _meta());
/** Navigation state — ephemeral data passed via navigate(), not in the URL. */
export const currentState: ReadonlySignal<Record<string, unknown> | undefined> = computed(() => _state());
/** Data returned by the MATCHED route's @loader function. For a parent's, see {@link loaderData}. */
export const currentLoaderData: ReadonlySignal<unknown> = computed(() => {
    const focus = _loaderFocus();
    return focus === null ? undefined : _loaderData()[focus];
});
/** Loader execution state of the matched route: idle → loading → done/error. */
export const currentLoaderState: ReadonlySignal<LoaderState> = computed(() => {
    const focus = _loaderFocus();
    return focus === null ? 'idle' : (_loaderState()[focus] ?? 'idle');
});

/**
 * What a specific level's @loader returned, by its route pattern — `loaderData('/tickets/:id')`.
 *
 * This is how a child reads its parent's data: the parent loaded the ticket, the child loads one
 * intervention, and moving between interventions leaves the ticket alone. Reactive: read it in a
 * computed or a template and it updates when that level reloads.
 *
 * `undefined` when the level declared no loader, has not loaded yet, failed, or is not in the
 * current chain at all — a page cannot read the data of a branch it has left.
 */
export function loaderData(routePath: string): unknown {
    return _loaderData()[routePath];
}

/** The same, for the state. 'idle' for a level that is not loading and has nothing. */
export function loaderState(routePath: string): LoaderState {
    return _loaderState()[routePath] ?? 'idle';
}
export const currentRoute: ReadonlySignal<ResolvedRoute | null> = computed(() => _route());
/**
 * Last navigation error kind: '403' (guard denied, no redirect), '404' (no match),
 * or null (last navigation resolved a route). The outlet reads this to pick which
 * error page to render when currentRoute() is null.
 */
export const currentNavError: ReadonlySignal<'403' | '404' | null> = computed(() => _navError());

/**
 * The nesting depth that the current navigation error belongs to.
 *
 * The outlet compares it with its own depth: the one that matches renders the error page, the ones
 * above it keep their level of the chain. 0 for a 404 and for a denial with no allowed prefix,
 * which is the whole-page behaviour of a flat route.
 */
export const currentNavErrorDepth: ReadonlySignal<number> = computed(() => _navErrorDepth());

// ─── The address bar ──────────────────────────────────────────────
// The URL is written only once the before-hooks accept. Written first, a hook that refused would
// keep the screen and move the URL — and a reload would open the screen it had refused, past the
// very hook that protected unsaved work. A link a person clicks waits too, under the Navigation API
// as well. When the URL has ALREADY moved (Back, Forward, code that
// writes history itself), a refusal puts it back on the screen shown.

/** The URL and history state of the screen on show, or null before the first one. */
let _shownUrl: string | null = null;
let _shownState: unknown = null;

/**
 * True while this module writes the URL itself. Under the Navigation API `pushState` and
 * `replaceState` fire the same `navigate` event the router listens to; answering our own write
 * resolves the navigation twice, which the outlet turns into two mounted pages.
 */
let _writingUrl = false;

function writeUrl(mode: 'push' | 'replace', state: unknown, url: string): void {
    _writingUrl = true;
    try {
        if (mode === 'push') history.pushState(state, '', url);
        else history.replaceState(state, '', url);
    } finally {
        _writingUrl = false;
    }
}

/** Record the URL now in the address bar as the one belonging to the screen just published. */
function markShown(): void {
    if (!isBrowser) return;
    _shownUrl = location.pathname + location.search + location.hash;
    _shownState = history.state;
}

/** A refused navigation whose URL had already moved: put the address bar back on the screen shown. */
function restoreShown(): void {
    if (!isBrowser || _shownUrl === null) return;
    _state.set((_shownState ?? undefined) as Record<string, unknown> | undefined);
    if (location.pathname + location.search + location.hash === _shownUrl) return;
    writeUrl('replace', _shownState, _shownUrl);
}

// ─── Guard System ─────────────────────────────────────────────────

type GuardChecker = (name: string) => boolean | Promise<boolean>;
let guardChecker: GuardChecker | null = null;

/**
 * Warn once — and loudly — when a route declares a guard nothing can answer.
 *
 * Denying in silence would be as confusing as a silent admission: the developer sees
 * a 403 on a route they believe they are allowed to reach, with nothing pointing at the cause.
 */
let _warnedNoChecker = false;
function warnMissingGuardChecker(guard: string): void {
    if (_warnedNoChecker) return;
    _warnedNoChecker = true;
    console.warn(
        `[pdx-router] Route guard "${guard}" was denied because no guard checker is registered. ` +
        `Mount <pdx-router-outlet>, which registers one, or call registerGuardChecker() yourself. ` +
        `A declared guard that cannot be evaluated is denied, never allowed.`,
    );
}

/** Register a guard checker. Called with the guard name from @guard declarations. */
export function registerGuardChecker(checker: GuardChecker): void {
    guardChecker = checker;
    _warnedNoChecker = false;
}

// ─── Router Instance ───────────────────────────────────────────────

let registeredRoutes: { config: RouteConfig; regex: RegExp; paramNames: string[] }[] = [];

// ─── Nested routes: the chain above a matched one ──────────────────
//
// Computed from the paths alone, so an existing flat route starts nesting the moment a route whose
// path is its prefix is registered. No `children:` table to keep in step with the files, and no new
// declaration — which is the reason it is a prefix rule and not a field.
const _chainCache = new Map<string, RouteConfig[]>();

/** Is `parent` a SEGMENT prefix of `child`? `/tickets/:id` is; `/tick` is not. */
function isSegmentPrefix(parent: string, child: string): boolean {
    if (parent === child || parent === '/') return false;
    const p = parent.endsWith('/') ? parent.slice(0, -1) : parent;
    return child.startsWith(p + '/');
}

/**
 * The matched route and its ancestors, outermost first. A route with no ancestor is a chain of one.
 *
 * `/` is excluded on purpose: it is a prefix of everything, and treating it as everyone's parent
 * would nest the whole application inside the home page.
 *
 * A redirect route is excluded too — it renders nothing, so it cannot be a level.
 */
function chainFor(config: RouteConfig): RouteConfig[] {
    const cached = _chainCache.get(config.path);
    if (cached) return cached;

    const chain = registeredRoutes
        .map(r => r.config)
        .filter(c => c.hasOutlet && !c.redirect && isSegmentPrefix(c.path, config.path))
        .sort((a, b) => a.path.length - b.path.length);
    chain.push(config);

    _chainCache.set(config.path, chain);
    return chain;
}

// ─── Loaders, one per level ────────────────────────────────────────

/** The params a level declares in its OWN pattern. `/tickets/:id/notes/:n` at the parent → ['id']. */
function ownParamNames(pattern: string): string[] {
    return [...pattern.matchAll(/:([A-Za-z0-9_]+)/g)].map(m => m[1]);
}

/** A level's identity for this navigation: its own params, with their values. */
function loaderKey(pattern: string, params: Record<string, string>): string {
    return ownParamNames(pattern).map(n => `${n}=${params[n] ?? ''}`).join('&');
}

/**
 * Decide what has to load, and commit what does not — synchronously.
 *
 * Split from the running on purpose. `handleNavigation` must stay SYNCHRONOUS for a navigation
 * with nothing to load: awaiting unconditionally makes every navigation asynchronous, and then a
 * navigation that started earlier finishes later and publishes its route over a newer one — the
 * initial navigation to `/` lands on top of a 404 that has already been reported. The same holds
 * for `await`ing a boolean before-hook.
 *
 * Returns the levels that still have to run, outermost first. Empty means nothing to await.
 */
function planLoaders(
    chain: RouteConfig[],
    params: Record<string, string>,
): RouteConfig[] {
    const prevData = _loaderData.peek();
    const prevState = _loaderState.peek();
    const prevKeys = _loaderKeys;

    // Built from the CHAIN, so a level that is not in it is simply not carried over: leaving
    // a branch forgets its data rather than leaving it readable from somewhere it does not belong.
    const data: Record<string, unknown> = {};
    const state: Record<string, LoaderState> = {};
    const keys: Record<string, string> = {};

    const pending: RouteConfig[] = [];

    for (const level of chain) {
        const key = loaderKey(level.path, params);
        keys[level.path] = key;
        if (!level.loader) continue;

        // Unchanged since the last navigation: keep it. This is the sibling move — the parent's
        // data stays on screen and no request is made for something already held.
        if (prevKeys[level.path] === key && level.path in prevData) {
            data[level.path] = prevData[level.path];
            state[level.path] = prevState[level.path] ?? 'done';
            continue;
        }
        state[level.path] = 'loading';
        pending.push(level);
    }

    _loaderData.set(data);
    _loaderState.set(state);
    _loaderKeys = keys;
    return pending;
}

/**
 * Run the planned loaders in order, outermost first — the order the data depends in, and the order
 * the guards already run in. Returns false when a newer navigation superseded this one.
 */
async function runLoaders(pending: RouteConfig[], navId: number): Promise<boolean> {
    for (const level of pending) {
        if (!level.loader) continue;
        try {
            const result = await level.loader();
            if (navId !== _navSeq) return false; // a newer navigation won — drop this stale result
            _loaderData.set({ ..._loaderData.peek(), [level.path]: result });
            _loaderState.set({ ..._loaderState.peek(), [level.path]: 'done' });
        } catch (err) {
            if (navId !== _navSeq) return false;
            const nextData = { ..._loaderData.peek() };
            delete nextData[level.path];
            _loaderData.set(nextData);
            _loaderState.set({ ..._loaderState.peek(), [level.path]: 'error' });
            console.error(`[pdx-router] Loader failed for ${level.path}:`, err);
        }
    }
    // Checked on the way out even when nothing ran. This function is async whatever the chain
    // holds, so every navigation yields a microtask here — and a navigation that started BEFORE a
    // newer one would otherwise resume and publish its route over it: the initial navigation to
    // `/` would overwrite a 404 that had already been reported.
    return navId === _navSeq;
}

/** Nothing matched, or a guard denied: no level has data any more. */
function clearLoaders(): void {
    _loaderData.set({});
    _loaderState.set({});
    _loaderKeys = {};
    _loaderFocus.set(null);
}

// ─── The breadcrumb's trail ────────────────────────────────────────
//
// The chain, made usable: a name instead of a pattern, and an href with the params filled in.
// Published into core's registry so `<pdx-breadcrumb>` can read it without `@pdxui/ui`
// depending on this package.

/** `/tickets/:id` + `{ id: '42' }` → `/tickets/42`. A crumb has to be somewhere you can go. */
function fillParams(pattern: string, params: Record<string, string>): string {
    return pattern.replace(/:([A-Za-z0-9_]+)\??/g, (whole, name: string) => {
        const value = params[name];
        return value === undefined ? whole : encodeURIComponent(value);
    });
}

/**
 * The label a PAGE MODULE published for this path, when the route table has none.
 *
 * `@page { label: ticketLabel }` names a function, and a function cannot be written into the route
 * table the compiler scans: it lives in the page's own module, and that module is imported lazily,
 * after `createRouter` has already read the table. So the crumb is looked up live, from the
 * registration the module makes when it loads.
 */
function liveRoute(path: string): RouteConfig | undefined {
    const reg = (globalThis as { __pdx_routes?: RouteConfig[] }).__pdx_routes;
    return reg?.find(r => r.path === path);
}

/**
 * What a level of the trail is called, or undefined for a level that is not a crumb. A dictionary
 * KEY first: data in the table, so an ancestor a deep link never loaded still names
 * itself, translated with the route's params. Then a written label, then one a module published.
 */
function crumbLabel(level: RouteConfig, params: Record<string, string>): string | undefined {
    const key = level.labelKey ?? liveRoute(level.path)?.labelKey;
    if (key !== undefined) return $t(key, params);
    const declared = level.label ?? liveRoute(level.path)?.label;
    if (declared === undefined) return undefined;
    // A string label may name params — `label: 'Ticket :id'` — which is how a DIRECTIVE gets a
    // dynamic crumb from a value rather than from source to evaluate. A FUNCTION is the other
    // half, and the only one that can name the record: only the app can look a ticket up.
    return typeof declared === 'function' ? declared(params) : fillParams(declared, params);
}

/**
 * The trail is drawn inside an effect, disposed at the next navigation: a label that reads the
 * dictionary is drawn again when the language changes, or when the section holding it arrives.
 * Drawn once, it would keep the language it was built in.
 */
let _trailEffect: (() => void) | null = null;

/** The last navigation, so a registration arriving afterwards can draw the trail again. */
let _lastTrail: { matched: RouteConfig; params: Record<string, string> } | null = null;

/**
 * Draw the trail again when a page module registers a path that is IN it — which is the moment a
 * label the table could not carry becomes available. Anything else registering changes no crumb,
 * so it costs one string comparison and no work.
 */
function onRouteRegistered(path: string): void {
    const last = _lastTrail;
    if (!last) return;
    if (path !== last.matched.path && !isSegmentPrefix(path, last.matched.path)) return;
    publishTrail(last.matched, last.params);
}

function publishTrail(matched: RouteConfig, params: Record<string, string>): void {
    _lastTrail = { matched, params };
    (globalThis as { __pdx_routeRegistered?: (p: string) => void }).__pdx_routeRegistered = onRouteRegistered;
    // Every ANCESTOR BY PATH, not the render chain. `chainFor` excludes a route that renders no
    // child outlet, and it is right to: `hasOutlet` is what stops `/owners` from being treated as
    // the parent of `/owners/new`. But a breadcrumb is navigation, not rendering — a reader who
    // came through `/tickets` is one click from it whether or not the detail renders inside it,
    // and a trail that skipped it would jump from the root to the leaf.
    //
    // What keeps this from inventing steps is the LABEL: a route with none contributes no crumb,
    // so `/owners` appears above `/owners/new` only if someone declared that it should.
    const ancestors = registeredRoutes
        .map(r => r.config)
        .filter(c => !c.redirect && isSegmentPrefix(c.path, matched.path))
        .sort((a, b) => a.path.length - b.path.length);

    _trailEffect?.();
    _trailEffect = effect(() => {
        const crumbs: RouteCrumb[] = [];
        for (const level of [...ancestors, matched]) {
            // No label, no crumb. Falling back to the path would put URL segments in front of a
            // reader who already has the address bar, and would make a renamed route look renamed twice.
            const label = crumbLabel(level, params);
            if (label === undefined) continue;
            crumbs.push({ label, href: fillParams(level.path, params), current: level === matched });
        }
        setRouteTrail(crumbs);
    });
}
let _basePath = '';
let _guardFailRedirect_: string | ((permission: string) => string | null | undefined) | null = null;
let _redirectMap: Map<string, string> | null = null;

/**
 * Create a runtime router from route configs.
 * @param routes - Array of route configurations
 * @param options - Router options or basePath string (backward compat)
 */
export function createRouter(routes: RouteConfig[], options?: string | RouterOptions): void {
    // Reset per-instance config so an HMR/re-init createRouter() doesn't inherit stale state
    // (e.g. a guardFailRedirect from a previous mount).
    _basePath = '';
    _guardFailRedirect_ = null;
    _redirectMap = null;
    if (DEV) reportToDevtools();

    // Backward compat: createRouter(routes, '/base') still works
    if (typeof options === 'string') {
        _basePath = options;
    } else if (options) {
        _basePath = options.basePath ?? '';
        // Default undefined → no redirect: a guard denial without an explicit target
        // surfaces as 403 (reachable), instead of being masked by a forced redirect to '/'.
        _guardFailRedirect_ = options.guardFailRedirect ?? null;
        if (options.redirects) {
            _redirectMap = new Map(options.redirects.map(r => [r.from, r.to]));
        }
    }

    // A STATIC route is tried before any dynamic one, and among dynamic routes the declared order
    // holds — the generated router's precedence, where a static path is a `switch` case. Matching in
    // registration order would let `/customers/:id`, scanned first, catch `/customers/import`: one
    // page in dev and another in a build. `sort` is stable, so the declared order is kept within
    // each group.
    const isDynamic = (path: string): boolean => path.includes(':') || path.includes('*');
    registeredRoutes = [...routes]
        .sort((a, b) => Number(isDynamic(a.path)) - Number(isDynamic(b.path)))
        .map(config => {
            const { regex, paramNames } = pathToRegex(config.path);
            return { config, regex, paramNames };
        });
    _chainCache.clear();

    if (isBrowser) {
        // Remove listeners from a previous createRouter() — HMR/re-init safe,
        // prevents stale listeners from stacking (memory leak).
        _routerCleanup?.();

        if ('navigation' in window) {
            const nav = window.navigation!;
            const onNavigate = (e: PdxNavigateEvent) => {
                if (_writingUrl || !e.canIntercept || e.hashChange) return;
                // A download is the browser's: it saves the file and the page stays. `downloadRequest`
                // is the file name, and a bare `download` attribute gives an EMPTY one in Chromium,
                // so a check on its truth would read `<a href download>` as a link click, and the
                // router would render the page, or the 404, and save nothing. A string, empty or not,
                // is a download.
                if (typeof e.downloadRequest === 'string') return;
                const url = new URL(e.destination.url);
                if (isLinkClick(e)) {
                    // Intercepting commits the URL when the event ends and asks the hooks after, so
                    // the address bar would name the destination while "leave?" is on screen. Cancel
                    // it and resolve it the way navigate() does: hooks first, URL on accept.
                    e.preventDefault();
                    const mode = e.navigationType === 'replace' ? 'replace' : 'push';
                    saveScroll(_path.peek(), primaryOutlet());
                    handleNavigation(stripBase(url.pathname) + url.search, false, 0, (target) => {
                        _state.set(undefined);
                        writeUrl(mode, null, _basePath + target + url.hash);
                    });
                    return;
                }
                const path = stripBase(url.pathname);
                // A traversal is Back or Forward: the page comes back where it was left, as on
                // popstate. Resolved as a new navigation it would come back at the top.
                const isBack = e.navigationType === 'traverse';
                e.intercept({ handler: () => handleNavigation(path, isBack) });
            };
            nav.addEventListener('navigate', onNavigate);
            _routerCleanup = () => nav.removeEventListener('navigate', onNavigate);
        } else {
            const onPopState = (e: PopStateEvent) => {
                // Restore navigation state from history entry
                _state.set(e.state ?? undefined);
                handleNavigation(stripBase(location.pathname), true);
            };
            window.addEventListener('popstate', onPopState);
            _routerCleanup = () => window.removeEventListener('popstate', onPopState);
        }

        handleNavigation(stripBase(location.pathname));
    }
}

/**
 * A person following a link: a push or replace they started, cancelable, and not a form post. That
 * one can wait for the hooks with the address bar unchanged. Back/Forward are traversals, which
 * cannot be re-issued as a push, and code that calls `history.pushState` itself (never
 * user-initiated) expects the URL to change when the call returns. Both keep the intercept: the URL
 * has moved, and a refusal puts it back.
 */
function isLinkClick(e: PdxNavigateEvent): boolean {
    return e.cancelable && e.userInitiated
        && (e.navigationType === 'push' || e.navigationType === 'replace')
        && !e.formData && typeof e.downloadRequest !== 'string';
}

/** Listener cleanup for the active router instance (set by createRouter). */
let _routerCleanup: (() => void) | null = null;

/**
 * Tear down the active router: removes the popstate/navigation listener.
 * Call on app teardown or before re-creating the router (HMR). Idempotent.
 */
/**
 * The build-time route table — **null here, on purpose**.
 *
 * Only the generated router has one: it is compiled from the project's `@page` declarations and
 * knows every route without loading a single page module. The interpreted router builds its table
 * from whatever `createRouter` was handed, which in dev comes from the page modules registering
 * themselves as they are imported — and in dev that costs nothing, because there is no bundle to
 * split. The outlet reads this first and falls back to `globalThis.__pdx_routes`.
 */
export function routeTable(): null { return null; }

/**
 * The lazy import of a page, **undefined here**.
 *
 * Only the generated router has one, with a literal specifier per page so the bundler can split
 * them. In dev the page modules are imported by the app's own glob and there is nothing to load
 * on demand.
 */
export function pageModule(_path: string): (() => Promise<unknown>) | undefined { return undefined; }

export function destroyRouter(): void {
    _routerCleanup?.();
    _routerCleanup = null;
    // A destroyed router holds no page, so it holds no page's data. Without this the loader map
    // outlives the router that filled it and the next one starts with somebody else's records.
    clearLoaders();
}

/**
 * Navigate programmatically.
 * @param path — route path (can include :param placeholders)
 * @param params — URL path params to replace :param segments
 * @param state — ephemeral navigation state (not in URL, accessible via currentState)
 */
export function navigate(path: string, params?: Record<string, string>, state?: Record<string, unknown>): void {
    let resolved = path;
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            // Escape the key for the RegExp; URL-encode the value so /, ?, #, %, spaces… in a param
            // can't change the path's semantics or break the route match.
            const escKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const enc = encodeURIComponent(String(value));
            // Strip constraint from placeholder: :id(number) → value, :id → value.
            // Global + trailing non-word-char guard so :idCard is NOT matched by :id, and all
            // occurrences are replaced.
            resolved = resolved.replace(new RegExp(`:${escKey}(\\([^)]*\\))?(?![A-Za-z0-9_])`, 'g'), () => enc);
        }
    }

    // Reject external/protocol-relative/javascript: targets — navigate() is for internal routes
    // only. The <a href> is already sanitized, but the click handler reaches here with the raw `to`.
    //
    // `isRouterTarget`, not `sanitizeUrl`: sanitizeUrl answers "is this URL safe to put in an
    // href", and http/https ARE safe there. So `navigate('https://example.com/x')` would pass that
    // check and reach `history.pushState` with a cross-origin URL, which throws a SecurityError
    // — an unhandled one, from inside a click handler. handleNavigation applies the right test
    // too, but only AFTER navigate has written the address bar. Checked on `resolved`, i.e. on
    // what pushState will receive.
    if (!isRouterTarget(resolved)) {
        console.warn(
            `[pdx-router] Refused to navigate to "${resolved}": a router target must be a path `
            + `inside this origin. Use location.href for an external destination.`,
        );
        return;
    }

    if (!isBrowser) {
        _state.set(state); // ephemeral, not in the URL
        return;
    }
    saveScroll(_path.peek(), primaryOutlet());
    // Resolved here and not through the Navigation API's event, with or without the API: the
    // hooks have to run BEFORE the address bar is written, and the event arrives after.
    // The commit receives the final target, so a redirect table entry pushes its target, once.
    handleNavigation(resolved, false, 0, (target) => {
        _state.set(state); // ephemeral, not in the URL
        writeUrl('push', state ?? null, _basePath + target);
    });
}

// ─── Query Params ─────────────────────────────────────────────────

/**
 * Publish the query — and only when it actually changed.
 *
 * Every writer builds the map fresh, so the identity check inside the signal suppresses nothing:
 * without this, `?status=closed` written over `?status=closed` would re-run every reader of
 * `currentQuery()`. That breaks the law the rest of the reactivity obeys, that writing the value
 * something already has is not a change, and on a page where the query round-trips it is a pump:
 * a filter builder writes the source, the page's handler writes the parameter, the parameter feeds
 * the builder's `:value` back, and nothing in the circle ever says «this is the same».
 *
 * What that costs is not a slow page. The flush guard breaks the loop at 100 cycles by DROPPING the
 * pending effects, and every computed marked dirty in that flush stays dirty with no reader left
 * to recompute it — `markDirty` returns early while already dirty, so those bindings are never
 * notified again. The screen freezes in silence, one console line away from nothing.
 *
 * Content comparison and not identity: the map is one level of strings, which is what a query is.
 */
function publishQuery(next: Record<string, string>): void {
    const prev = _query.peek();
    const keys = Object.keys(next);
    if (keys.length === Object.keys(prev).length && keys.every(k => prev[k] === next[k])) return;
    _query.set(next);
}

/** Set the entire query string reactively. Updates URL + signal. */
export function setQuery(params: Record<string, string>): void {
    if (!isBrowser) return;
    const sp = new URLSearchParams(params);
    const newUrl = `${location.pathname}?${sp.toString()}`;
    history.replaceState(null, '', newUrl);
    publishQuery(params);
    _search.set(location.search);
}

/** Set or remove a single query param. Pass null to remove. */
export function setQueryParam(key: string, value: string | null): void {
    if (!isBrowser) return;
    const sp = new URLSearchParams(location.search);
    if (value === null) sp.delete(key);
    else sp.set(key, value);
    const qs = sp.toString();
    history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
    publishQuery(parseQueryString());
    _search.set(location.search);
}

function parseQueryString(): Record<string, string> {
    if (!isBrowser) return {};
    const result: Record<string, string> = {};
    new URLSearchParams(location.search).forEach((v, k) => { result[k] = v; });
    return result;
}

// ─── Navigation Middleware ─────────────────────────────────────────

/**
 * What the router can tell a before-hook about the navigation it is asking about.
 *
 * `redirected` is true on every hop after the first: a redirect table entry, a route's own
 * `redirect`, a denied guard's `guardFailRedirect`. One navigation, asked again with a new
 * destination — and a hook that asks the USER something must not ask twice for one gesture.
 *
 * A hook cannot recognise that hop from `location.pathname`: whether the address moves on a
 * redirect depends on the router, and a check on it would ask twice in one mode and once in the
 * other.
 */
export interface NavigationHop {
    /** This is not the first hop: the navigation was redirected on its way here. */
    redirected: boolean;
}

type BeforeNavigateHook = (from: string, to: string, hop: NavigationHop) => boolean | Promise<boolean>;
type AfterNavigateHook = (from: string, to: string) => void;

const beforeHooks: BeforeNavigateHook[] = [];
const afterHooks: AfterNavigateHook[] = [];

/**
 * `__PDX_DEVTOOLS__.route()` and `.navigations()`: where the app is, and how it got there, for an
 * agent that asks a running app. Called from createRouter, not at module load: the
 * package declares this module free of load-time effects. Once, however many routers are created.
 */
let _devtoolsReporting = false;
function reportToDevtools(): void {
    if (_devtoolsReporting) return;
    _devtoolsReporting = true;
    setDevtoolsRouteSource(() => ({
        path: _path.peek(),
        params: _params.peek(),
        query: _query.peek(),
        matched: _route.peek()?.config.path ?? null,
    }));
    afterHooks.push((from, to) => recordDevtoolsNavigation({
        from, to, matched: _route.peek()?.config.path ?? null, error: _navError.peek(),
    }));
}

export function onBeforeNavigate(hook: BeforeNavigateHook): () => void {
    beforeHooks.push(hook);
    return () => {
        const idx = beforeHooks.indexOf(hook);
        if (idx >= 0) beforeHooks.splice(idx, 1);
    };
}

export function onAfterNavigate(hook: AfterNavigateHook): () => void {
    afterHooks.push(hook);
    return () => {
        const idx = afterHooks.indexOf(hook);
        if (idx >= 0) afterHooks.splice(idx, 1);
    };
}

// ─── Internal ──────────────────────────────────────────────────────

/** Strip basePath from an absolute pathname. */
function stripBase(pathname: string): string {
    if (!_basePath) return pathname;
    return pathname.startsWith(_basePath)
        ? (pathname.slice(_basePath.length) || '/')
        : pathname;
}

const MAX_REDIRECTS = 5;

/** Decode a matched path param (the write side encodes it); tolerate malformed %-sequences. */
function safeDecodeParam(v: string): string {
    try { return decodeURIComponent(v); } catch { return v; }
}

// Monotonic navigation token: async work (guards, loaders) from a superseded navigation must not
// write global state after a newer navigation has started (A→B fast, A's loader resolving last).
let _navSeq = 0;

/**
 * Is this a target the router may navigate to?
 *
 * Stricter than {@link sanitizeUrl}, deliberately. That function exists for `<a href>`, where
 * `https://stripe.com` is a perfectly good target, and its scheme allow-list contains http and
 * https. A ROUTER target is different: `history.pushState`/`replaceState` cannot leave the origin,
 * so an absolute URL here is never meaningful. Letting one through produces a SecurityError from
 * inside the browser instead of a message naming the configuration mistake.
 *
 * So: sanitize first (control characters, `javascript:`, protocol-relative including the
 * backslash-smuggled forms), then require a same-origin path.
 */
function isRouterTarget(path: string): boolean {
    if (sanitizeUrl(path) === null) return false;
    // A scheme of any kind, or a leading double slash in either slash flavour, leaves the origin.
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
    if (/^[/\\]{2}/.test(path.replace(/\\/g, '/'))) return false;
    return true;
}

/**
 * Resolve a navigation. `commit` is present when the address bar has NOT been written yet — a
 * `navigate()` call, or a clicked link under the Navigation API — and writes it once the
 * before-hooks accept. Without it the URL has already moved (Back/Forward, a history write by other
 * code, the landing page), and a refusal puts it back.
 */
async function handleNavigation(path: string, isBack = false, depth = 0, commit?: (target: string) => void): Promise<void> {
    const navId = ++_navSeq;

    // Every path that reaches the address bar comes through here — `navigate()`, the redirect
    // table, a route's `redirect`, and `guardFailRedirect` — so all four are checked, and none can
    // hand `replaceState` a target it cannot use. All four are developer-authored, so this is
    // defence in depth, not an open redirect; redirects are not exempt.
    if (!isRouterTarget(path)) {
        console.warn(
            `[pdx-router] Refused to navigate to "${path}": a router target must be a path inside `
            + `this origin. Use location.href for an external destination.`,
        );
        return;
    }
    // Redirect loop protection
    if (depth > MAX_REDIRECTS) {
        console.warn(`[pdx-router] Redirect loop detected (max ${MAX_REDIRECTS})`);
        return;
    }

    // Separate the query string from the pathname: route matching operates on the path only,
    // while currentSearch() exposes the raw query — set once the hooks have accepted, so a refused
    // navigation does not leak its query.
    const _qIdx = path.indexOf('?');
    const _searchFromPath = _qIdx >= 0 ? path.slice(_qIdx) : '';
    if (_qIdx >= 0) path = path.slice(0, _qIdx);

    // Check redirect table (from __pdx_redirects or RouterOptions.redirects)
    const redirectTarget = _redirectMap?.get(path)
        ?? (globalThis.__pdx_redirects as { from: string; to: string }[] | undefined)
            ?.find(r => r.from === path)?.to;
    if (redirectTarget) {
        // Checked HERE, not only on re-entry: the address bar is written before the recursive call,
        // so a guard at the top of this function would let `replaceState` see the raw target first
        // — the URL would already be written by the time the refusal happened.
        if (!isRouterTarget(redirectTarget)) {
            console.warn(
                `[pdx-router] Refused a redirect from "${path}" to "${redirectTarget}": a router `
                + `target must be a path inside this origin.`,
            );
            return;
        }
        // Update browser URL to reflect the redirect target — unless it has not been written yet,
        // in which case the pending commit will write the target instead of the source.
        if (isBrowser && !commit) writeUrl('replace', null, _basePath + redirectTarget);
        return handleNavigation(redirectTarget, isBack, depth + 1, commit);
    }

    const prevPath = _path.peek();

    // Run before-hooks (can cancel navigation)
    for (const hook of beforeHooks) {
        // A boolean is not awaited. Awaiting it would defer the rest of the resolution to a
        // microtask, so registering any hook — the outlet's leave check, for one — would make every
        // navigation asynchronous, pages with nothing to ask included.
        const answer = hook(prevPath, path, { redirected: depth > 0 });
        const result = typeof answer === 'boolean' ? answer : await answer;
        if (navId !== _navSeq) return; // a newer navigation superseded us while the async hook ran
        if (result === false) {
            if (!commit) restoreShown(); // the URL had already moved: put it back
            return;
        }
    }

    // Accepted: now the address bar may say where we are going.
    commit?.(path + _searchFromPath);
    // Prefer the URL bar (kept in sync by navigate/setQuery), fall back to the query carried
    // in the incoming path when the environment hasn't reflected it into location.search.
    _search.set(isBrowser ? (location.search || _searchFromPath) : _searchFromPath);

    // Parse query params
    const query = parseQueryString();

    // Matched against the path WITHOUT a trailing slash, the way the generated router does — the
    // same rule, including the root guard, so '/about/' and '/about' are one route in both.
    // `pathToRegex` compiles '/about' to `^\/about$`, so without it the same URL would be a 404 in
    // dev and a page in a production build. A trailing slash arrives from a copy-pasted URL, a CMS
    // link, a server that appends one — it is not exotic, and the 404 it would produce is not
    // actionable. `_path` keeps what the address bar holds: only the MATCH is normalised, which is
    // what the generated router does too.
    const matchPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

    for (const { config, regex, paramNames } of registeredRoutes) {
        // Route-level redirect: matched, and sends the navigation on — address included.
        //
        // The generated router writes it too, so the two agree about the URL a redirected route
        // leaves behind. A before-hook recognises the hop without reading the address bar, which is
        // what `NavigationHop` is for.
        if (config.redirect) {
            const match = regex.exec(matchPath);
            if (match) {
                if (!isRouterTarget(config.redirect)) {
                    console.warn(
                        `[pdx-router] Refused a redirect from "${path}" to "${config.redirect}": a `
                        + `router target must be a path inside this origin.`,
                    );
                    return;
                }
                if (isBrowser) writeUrl('replace', null, _basePath + config.redirect);
                return handleNavigation(config.redirect, isBack, depth + 1);
            }
        }

        const match = regex.exec(matchPath);
        if (match) {
            // Guard enforcement.
            //
            // A declared guard with nothing able to evaluate it FAILS CLOSED. Otherwise a route
            // declaring `@guard` would open whenever nothing has called registerGuardChecker —
            // which is the state of any app that calls createRouter() directly instead of mounting
            // <pdx-router-outlet>, and createRouter is the first public export of this package.
            //
            // The registration deliberately stays outside createRouter: wiring core's permission
            // system in here would make every consumer of @pdxui/router depend on it, and the
            // outlet is the seam that already knows about both. The cost of that split is this
            // case, so it is handled rather than assumed away.
            const chain = chainFor(config);

            // Every level's guard, outermost first: a parent that denies stops the child, which is
            // the point of declaring a guard on the parent at all. A flat route is a chain of one,
            // so for everything that does not nest this is a single guard check.
            for (let depthOfLevel = 0; depthOfLevel < chain.length; depthOfLevel++) {
                const level = chain[depthOfLevel];
                if (!level.guard) continue;
                const allowed = guardChecker ? await guardChecker(level.guard) : false;
                if (!guardChecker) warnMissingGuardChecker(level.guard);
                if (navId !== _navSeq) return; // superseded while the guard ran
                if (!allowed) {
                    // Honor guardFailRedirect.
                    // Redirect only if configured and not already the target (loop-safe).
                    //
                    // Resolved per denial, because it may be a FUNCTION of the permission that was
                    // refused: an app answers the login for a visitor with no session and `null`
                    // for one whose session is fine and whose permission is not — a sign-in form
                    // cannot help an authenticated visitor.
                    const redirectTo = typeof _guardFailRedirect_ === 'function'
                        ? _guardFailRedirect_(level.guard)
                        : _guardFailRedirect_;
                    if (redirectTo && redirectTo !== path) {
                        // And WRITE THE ADDRESS. The commit was spent before the route was matched
                        // — the address bar already says the route that was refused — so the hop
                        // has to move it itself, as the redirect table above does. Without this the
                        // login would render under the URL of the page it refused: a reload would go
                        // straight back to the denial, and a bookmark would save it.
                        if (!isRouterTarget(redirectTo)) {
                            console.warn(
                                `[pdx-router] Refused the guard redirect from "${path}" to `
                                + `"${redirectTo}": a router target must be a path inside this origin.`,
                            );
                            return;
                        }
                        if (isBrowser) writeUrl('replace', null, _basePath + redirectTo);
                        return handleNavigation(redirectTo, isBack, depth + 1);
                    }
                    _path.set(path);
                    _navError.set('403'); // distinguishes guard denial from 404 in the outlet
                    _navErrorDepth.set(depthOfLevel);
                    clearLoaders();         // a denied branch leaves nothing readable behind it

                    // The levels ABOVE the denied one were allowed, and they stay. `_route = null`
                    // is right only at the top: below it, it would take a page down for a
                    // permission on one of its tabs, and leave the visitor on a 403 whose only way
                    // back is the browser's Back button.
                    //
                    // The chain is truncated to the allowed prefix, so each outlet above the denial
                    // renders the level it already had — the parent is not even re-rendered, since
                    // its level did not change — and the outlet at `depthOfLevel` finds no level of
                    // its own and shows the refusal there.
                    if (depthOfLevel === 0) {
                        _route.set(null); // nothing was allowed: the error page is the page
                    } else {
                        const allowed = chain.slice(0, depthOfLevel);
                        const deepest = allowed[allowed.length - 1];
                        const deniedParams: Record<string, string> = {};
                        paramNames.forEach((name, i) => {
                            deniedParams[name] = safeDecodeParam(match[i + 1]);
                        });
                        _params.set(deniedParams);
                        publishQuery(query);
                        _route.set({ path: deepest.path, params: deniedParams, query, config: deepest, chain: allowed });
                    }
                    markShown();
                    for (const hook of afterHooks) hook(prevPath, path);
                    return;
                }
            }

            const params: Record<string, string> = {};
            paramNames.forEach((name, i) => {
                params[name] = safeDecodeParam(match[i + 1]);
            });

            // Every level's loader, outermost first — the same rule as the guards above. The
            // focus is set first so `currentLoaderState()` reads 'loading' for the page that is
            // about to render, as it always has. The planning is synchronous and the await happens
            // only when something actually has to load: see `planLoaders`.
            _loaderFocus.set(config.path);
            const pendingLoaders = planLoaders(chain, params);
            if (pendingLoaders.length > 0 && !await runLoaders(pendingLoaders, navId)) return;

            _path.set(path);
            _params.set(params);
            publishQuery(query);
            _meta.set(config.meta);
            _navError.set(null); // successful match clears any prior 403/404
            _route.set({ path: config.path, params, query, config, chain });
            publishTrail(config, params);

            markShown();
            restoreScroll(path, isBack, primaryOutlet(), config.scroll);
            for (const hook of afterHooks) hook(prevPath, path);
            return;
        }
    }

    // No match — 404
    _path.set(path);
    _params.set({});
    publishQuery(query);
    _meta.set(undefined);
    _navError.set('404');
    _navErrorDepth.set(0); // a no-match belongs to the outlet that owns the whole navigation
    clearLoaders();
    _route.set(null);
    markShown();
    restoreScroll(path, isBack, primaryOutlet());
    for (const hook of afterHooks) hook(prevPath, path);
}

/**
 * Convert route path to regex with named param extraction.
 * Supports:
 *   /users/:id           → /^\/users\/([^/]+)$/
 *   /users/:id(number)   → /^\/users\/([0-9]+)$/
 *   /users/:id(uuid)     → /^\/users\/([0-9a-f-]{36})$/
 *   /files/*              → /^\/files\/(.+)$/
 *   /items/:id([a-z]+)   → /^\/items\/([a-z]+)$/
 */
function pathToRegex(path: string): { regex: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];

    const regexStr = path
        // Catch-all wildcard: * → (.+)
        .replace(/\*/g, () => {
            paramNames.push('$rest');
            return '(.+)';
        })
        // Param with constraint: :name(constraint) → type-specific regex
        .replace(/:(\w+)(?:\(([^)]+)\))?/g, (_, name, constraint) => {
            paramNames.push(name);
            if (constraint === 'number') return '([0-9]+)';
            if (constraint === 'uuid') return '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})';
            if (constraint) return `(${constraint})`; // custom regex
            return '([^/]+)'; // default: any non-slash
        })
        .replace(/\//g, '\\/');

    return { regex: new RegExp(`^${regexStr}$`), paramNames };
}
