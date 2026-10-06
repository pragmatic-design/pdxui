// The router that is running — the dev/prod seam, and the only place either implementation is named.
//
// PDX has two routers. `./runtime` is the interpreted one: a regex matcher that needs no build step,
// and the one dev uses. `@pdxui/compiler` emits a second — a switch with no regex and no loop,
// compiled from the project's own `@page` declarations. This file is what makes a production build
// use it: without the swap, the Dual Mode table (docs/architecture/framework.md) would claim a row
// that is not true, and a production build would evaluate every `@guard` with the dev matcher.
//
// The swap is by CONTENT, not by a fork: in a production build the compiler's `load` hook answers
// for THIS FILE with the generated module. Every other file in the package — `index.ts`, `outlet.ts`,
// `link.ts` — imports the router from here and never from an implementation, so there is exactly one
// router in a build and no way to end up reading one while navigating with the other. That is also
// what keeps `p2-plus.test.ts`'s "no compiled component imports virtual:pdx-router" assertion
// meaningful: components import `@pdxui/router`, which comes through here.
//
// The two implementations are drop-in for each other, and `packages/router/tests/parity.test.ts`
// is what says so — one behaviour, written once, run against both. `createRouter` is the only name
// whose MEANING differs: the interpreted router builds its table from the argument, the generated
// one baked it in at build time and ignores it. Both accept the call, which is why the outlet does
// not need to know which one it got.
//
// A file that imports `./runtime` directly is a hole in this seam, and
// `packages/router/tests/seam.test.ts` is the assertion that closes it.

export {
    createRouter, destroyRouter, navigate,
    currentPath, currentParams, currentQuery, currentSearch, currentMeta, currentState,
    currentLoaderData, currentLoaderState, loaderData, loaderState, currentRoute, currentNavError,
    currentNavErrorDepth,
    onBeforeNavigate, onAfterNavigate,
    registerGuardChecker, setQuery, setQueryParam,
    // The build-time route table, or null in dev. See the note on the interpreted router's copy.
    routeTable, pageModule,
} from './runtime';

// Types describe the shape both implementations answer with; they are erased before the swap
// happens, so they always come from the interpreted router's declarations.
export type { RouteConfig, ResolvedRoute, RouterOptions, NavigationHop } from './runtime';
