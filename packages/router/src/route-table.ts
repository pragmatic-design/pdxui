// The project's route table — data the compiler emits, read by the one router.
//
// A production build installs it from the seam (`active.ts`, which the compiler's `load` hook
// rewrites to import `virtual:pdx-routes`). The dev server cannot rely on that hook: an installed
// `@pdxui/router` may be pre-bundled, and a pre-bundled file is never loaded through a plugin. So
// in dev a module the plugin puts in `index.html` hands the same table over as
// `globalThis.__pdx_route_table`. Two doors, one table shape, one reader.

import type { RouteConfig, RouteTable, TableRoute } from './types';

let _installed: RouteTable | null = null;

/** Install the build's route table — the seam calls this once, when the router module loads. null removes it. */
export function installRouteTable(table: RouteTable | null): void {
    _installed = table;
}

function installed(): RouteTable | null {
    return _installed ?? (globalThis.__pdx_route_table as RouteTable | undefined) ?? null;
}

/**
 * The project's route table, or null when nothing installed one — an app that calls
 * `createRouter(routes)` itself, or a test.
 *
 * The outlet reads this before `globalThis.__pdx_routes`: a page module fills that WHEN IT IS
 * IMPORTED, so with it as the only source every page would have to be imported before the router
 * knew any of them, and `@page`'s code splitting could not happen.
 */
export function routeTable(): readonly TableRoute[] | null {
    return installed()?.routes ?? null;
}

/**
 * The lazy import of a page, with a literal specifier so the bundler gives the page its own chunk.
 * Keyed by path rather than by file, because two routes can share a page (a further path of its `@page`).
 */
export function pageModule(path: string): (() => Promise<unknown>) | undefined {
    return installed()?.pageModules?.[path];
}

/** Where the table's `@redirect` sends this path, if anywhere. */
export function tableRedirect(path: string): string | undefined {
    return installed()?.redirects?.find(r => r.from === path)?.to;
}

/**
 * A table route as the router takes it.
 *
 * Every field below must be carried, and a field dropped here fails in silence. Without `loader`
 * the loader code is unreachable — the page's `user.data()` stays undefined and `user.state()`
 * never leaves 'idle'; without `scroll` an `@scroll 'top'` does nothing; without `hasOutlet` every
 * nested route renders flat; without `label` and `labelKey` the breadcrumb loses its crumbs.
 */
export function toRouteConfig(r: TableRoute): RouteConfig {
    return {
        path: r.path,
        component: () => document.createElement(r.tag),
        guard: r.guard,
        redirect: r.redirect,
        meta: r.meta,
        loader: r.loader,
        scroll: r.scroll,
        hasOutlet: r.hasOutlet,
        label: r.label,
        labelKey: r.labelKey,
        title: r.title,
        titleKey: r.titleKey,
    };
}
