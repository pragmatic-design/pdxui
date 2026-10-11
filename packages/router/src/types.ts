// The router's public shapes.

import type { ScrollRestoration } from '@pdxui/core';

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

/** A route as the build's table carries it: data, plus the lazy imports a bundler can split on. */
export interface TableRoute {
    path: string;
    /** The page's custom element. */
    tag: string;
    guard?: string;
    redirect?: string;
    meta?: Record<string, unknown>;
    /** A bridge to the page's `@loader`: imports the page, then calls the function it registered. */
    loader?: () => Promise<unknown>;
    scroll?: ScrollRestoration;
    hasOutlet?: boolean;
    /** A string in a table the compiler wrote; a page module's own registration may carry a function. */
    label?: string | ((params: Record<string, string>) => string);
    labelKey?: string;
    // The outlet reads more of a table route — keepAlive, transition, layouts, outlets, file — and
    // types them itself (`RegisteredRoute` in outlet.ts).
}

/**
 * The route table a build (or the dev server) emits for the project's `@page` declarations.
 *
 * Data only: the router that reads it is this package's, the same one `createRouter(routes)` builds.
 */
export interface RouteTable {
    routes: readonly TableRoute[];
    /** One `import()` per lazily loaded page, keyed by route path, with a literal specifier. */
    pageModules?: Readonly<Record<string, () => Promise<unknown>>>;
    /** Every `@redirect '/from' -> '/to'` in the project. */
    redirects?: readonly { from: string; to: string }[];
}
