// The router that is running — and the door a production build installs its route table through.
//
// There is one router, `./runtime`, in TypeScript. What a build adds is DATA: the route table the
// compiler emits from the project's `@page` declarations (`virtual:pdx-routes`) — paths, lazy
// `import()`s, layouts, guards, redirects, meta, labels. In a production build the compiler's
// `load` hook answers for THIS FILE with a module that installs that table and then re-exports
// `./runtime`, so the table is in place before anything can ask for it. The router builds its
// matcher from it once, when the outlet starts it; a navigation does no parsing.
//
// Dev gets the same table from a module the plugin puts in `index.html` (`route-table.ts` says
// why that door, not this one), and an app with no plugin passes its routes to `createRouter`.
//
// Every other file in the package imports the router from here and never from `./runtime`, so
// the table a build installs is the one every reader sees: `packages/router/tests/seam.test.ts` is
// the assertion that keeps it the only door.

export {
    createRouter, createRouterFromTable, configureRouter, destroyRouter, navigate,
    currentPath, currentParams, currentQuery, currentSearch, currentMeta, currentState,
    loaderData, loaderState, loaderError, loaderSource, currentRoute, currentNavError,
    currentNavErrorDepth, navigation,
    onBeforeNavigate, onAfterNavigate, retryNavigation, redirect, notFound,
    registerGuardChecker, setQuery, setQueryParam,
    installRouteTable, routeTable, pageModule, toRouteConfig,
} from './runtime';

export type { RouteConfig, ResolvedRoute, RouterOptions, NavigationHop, RouteTable, TableRoute, LoaderContext, LoaderSource } from './runtime';
