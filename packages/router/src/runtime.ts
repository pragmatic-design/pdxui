// The router — the only one. Dev, a production build and an app that calls createRouter(routes) by
// hand all run this code; what a build adds is DATA, the route table the compiler emits
// (`virtual:pdx-routes`), which the seam installs and `routeTable()` hands to the outlet.
//
// The pieces: `matcher.ts` turns the routes into a lookup once, `navigation.ts` resolves a
// navigation, `state.ts` publishes the result, `loaders.ts` and `trail.ts` run the per-level
// loaders and the breadcrumb, `address.ts` owns the address bar and the query, `route-table.ts`
// holds the build's table.

import { DEV, setDevtoolsRouteSource, recordDevtoolsNavigation, setDevtoolsMapSource } from '@pdxui/core';
import { saveScrollPosition as saveScroll } from '@pdxui/core';
import { compileMatcher } from './matcher';
import { clearLoaders } from './loaders';
import { installRouteTable, toRouteConfig } from './route-table';
import { isBrowser, _path, _params, _query, _route, _navError, _state } from './state';
import { isWritingUrl, writeUrl, primaryOutlet } from './address';
import { config, handleNavigation, stripBase, onAfterNavigate, guardAnswer } from './navigation';
import { routeMap } from './devtools-map';
import type { RouteConfig, RouterOptions, RouteTable } from './types';

export type { RouteConfig, ResolvedRoute, RouterOptions, NavigationHop, RouteTable, TableRoute, LoaderContext } from './types';
export type { LoaderSource } from './state';
export {
    currentPath, currentParams, currentQuery, currentSearch, currentMeta, currentState,
    currentLoaderData, currentLoaderState, loaderData, loaderState, loaderError, loaderSource, currentRoute, currentNavError,
    currentNavErrorDepth, navigation,
} from './state';
export { setQuery, setQueryParam } from './address';
export { navigate, registerGuardChecker, onBeforeNavigate, onAfterNavigate, retryNavigation } from './navigation';
export { redirect, notFound } from './outcomes';
export { installRouteTable, routeTable, pageModule, toRouteConfig } from './route-table';

/** Listener cleanup for the active router instance (set by createRouter). */
let _routerCleanup: (() => void) | null = null;

/**
 * Create the router from route configs, and start it: listen for navigations and resolve the URL
 * the page was opened at.
 *
 * The matcher is built here, once, from `routes` — `compileMatcher` — so a navigation does no
 * parsing. A static route is tried before any dynamic one, and among dynamic routes the declared
 * order holds: matching `/customers/:id` first would let it catch `/customers/import`.
 *
 * @param routes - Array of route configurations
 * @param options - Router options or basePath string (backward compat)
 */
export function createRouter(routes: RouteConfig[], options?: string | RouterOptions): void {
    // Remove listeners from a previous createRouter() — HMR/re-init safe, prevents stale listeners
    // from stacking — and reset the per-instance config so a re-init doesn't inherit stale state
    // (e.g. a guardFailRedirect from a previous mount).
    _routerCleanup?.();
    _routerCleanup = null;
    config.basePath = '';
    config.guardFailRedirect = null;
    config.redirects = null;
    if (DEV) {
        reportToDevtools();
        _devtoolsRoutes = routes;
    }

    // Backward compat: createRouter(routes, '/base') still works
    configureRouter(typeof options === 'string' ? { basePath: options } : options);
    config.matcher = compileMatcher(routes);

    if (!isBrowser) return;
    _routerCleanup = listen();
    handleNavigation(stripBase(location.pathname));
}

/**
 * Install a build's route table and start the router on it — what an app with no
 * `<pdx-router-outlet>` calls. The outlet does the same from `routeTable()`.
 */
export function createRouterFromTable(table: RouteTable, options?: RouterOptions): void {
    installRouteTable(table);
    createRouter(table.routes.map(toRouteConfig), options);
}

/**
 * Options the routes cannot carry: a base path, extra redirects, where a denied guard goes.
 *
 * Merged into the running router. A base path that changes while it is running re-resolves the
 * current URL, which until then was matched with the old prefix.
 */
export function configureRouter(options?: RouterOptions): void {
    if (!options) return;
    // Default undefined → no redirect: a guard denial without an explicit target surfaces as 403
    // (reachable), instead of being masked by a forced redirect to '/'.
    if (options.guardFailRedirect !== undefined) config.guardFailRedirect = options.guardFailRedirect;
    if (options.redirects) {
        config.redirects ??= new Map();
        for (const r of options.redirects) config.redirects.set(r.from, r.to);
    }
    if (typeof options.basePath === 'string' && options.basePath !== config.basePath) {
        config.basePath = options.basePath;
        if (isBrowser && _routerCleanup) handleNavigation(stripBase(location.pathname));
    }
}

/**
 * Tear down the active router: removes the popstate/navigation listener.
 * Call on app teardown or before re-creating the router (HMR). Idempotent.
 */
export function destroyRouter(): void {
    _routerCleanup?.();
    _routerCleanup = null;
    // A destroyed router holds no page, so it holds no page's data. Without this the loader map
    // outlives the router that filled it and the next one starts with somebody else's records.
    clearLoaders();
}

/** Register the navigation listener — the Navigation API's when there is one — and return its removal. */
function listen(): () => void {
    if ('navigation' in window) {
        const nav = window.navigation!;
        const onNavigate = (e: PdxNavigateEvent) => {
            if (isWritingUrl() || !e.canIntercept || e.hashChange) return;
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
                    writeUrl(mode, null, config.basePath + target + url.hash);
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
        return () => nav.removeEventListener('navigate', onNavigate);
    }
    const onPopState = (e: PopStateEvent) => {
        // Restore navigation state from history entry
        _state.set(e.state ?? undefined);
        handleNavigation(stripBase(location.pathname), true);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
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

/**
 * `__PDX_DEVTOOLS__.route()` and `.navigations()`: where the app is, and how it got there, for an
 * agent that asks a running app. Called from createRouter, not at module load: the
 * package declares this module free of load-time effects. Once, however many routers are created.
 */
let _devtoolsReporting = false;
/** The routes of the last `createRouter`, for `__PDX_DEVTOOLS__.map()`. Development only. */
let _devtoolsRoutes: readonly RouteConfig[] = [];
function reportToDevtools(): void {
    if (_devtoolsReporting) return;
    _devtoolsReporting = true;
    setDevtoolsMapSource(() => routeMap(_devtoolsRoutes, config.matcher, guardAnswer));
    setDevtoolsRouteSource(() => ({
        path: _path.peek(),
        params: _params.peek(),
        query: _query.peek(),
        matched: _route.peek()?.config.path ?? null,
    }));
    onAfterNavigate((from, to) => recordDevtoolsNavigation({
        from, to, matched: _route.peek()?.config.path ?? null, error: _navError.peek(),
    }));
}
