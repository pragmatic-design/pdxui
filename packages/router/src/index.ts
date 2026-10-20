// @pdxui/router — the public surface.
//
// One router, in TypeScript (`./runtime`), run by dev, by a production build and by an app that
// calls `createRouter(routes)` itself. A build emits the route TABLE — data compiled from the
// project's `@page` declarations — and the seam, `./active`, installs it; everything below comes
// through that seam. `packages/router/tests/parity.test.ts` runs the behaviour suite against every
// way of producing the routes.

export {
    createRouter, createRouterFromTable, configureRouter, destroyRouter, navigate,
    currentPath, currentParams, currentQuery, currentSearch, currentMeta, currentState,
    currentLoaderData, currentLoaderState, loaderData, loaderState, loaderError, currentRoute, currentNavError,
    navigation, onBeforeNavigate, onAfterNavigate,
    registerGuardChecker, setQuery, setQueryParam,
} from './active';
export type { RouteConfig, ResolvedRoute, RouterOptions, NavigationHop, RouteTable, TableRoute, LoaderContext } from './active';
// Typed routes (#150): augmented by the app's generated `.pdx/routes.d.ts`.
export type { Navigate, RouteRegistry, RoutePath, RouteArgs, NavigationState } from './route-types';
// The type of a route's params and, as a value, the context token the outlet provides them under (#495).
export { RouteParams } from './route-types';

// Compile-time route types. The route table is emitted by @pdxui/compiler
// (virtual:pdx-routes); these type aliases keep public imports type-checking,
// but no generator ships from this package.
/** A route entry as collected from a @page declaration at build time. */
export interface RouteEntry {
    path: string;
    file: string;
    params: { name: string; type: string; segmentIndex: number }[];
    guard?: string;
    /**
     * The @loader function — not its name: RouteConfig types it `() => Promise<unknown>`, and the
     * compiler hoists the declaration to module scope and registers the reference, so this is a
     * function everywhere it matters.
     */
    loader?: () => Promise<unknown>;
    search?: string;
    prefetch?: string;
    transition?: string;
    layout?: string;
    meta?: Record<string, unknown>;
    outlets?: { name: string; tag: string }[];
    aliases?: string[];
    redirect?: string;
}
/** Result of generating an optimized router from route entries. */
export interface GeneratedRouter {
    code: string;
    dts: string;
    speculationRules?: string;
    entries: RouteEntry[];
}

// Router outlet — keep-alive page rendering
export { PdxRouterOutlet, routeParams } from './outlet';

// Navigation link — SPA-aware <a> with prefetch + active class
export { PdxLink } from './link';

// Start a route's chunk before anything renders it: an app that holds its outlet (for the route's
// strings, say) starts the chunk alongside, rather than after.
export { prefetchRoute } from './prefetch';
