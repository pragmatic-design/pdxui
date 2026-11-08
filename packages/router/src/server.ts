// The outlet rendered to a string, for static generation (#160): `@pdxui/router/server`.
//
// `<pdx-router-outlet>` is not a component: in the browser it builds the route it shows by hand
// (`outlet.ts`). On the server it writes the same tree for the URL being generated, through the
// render core opens to an element that is not a component (`registerServerElement`):
//
//   outlet[data-pdx-ssg=<route pattern>] > layout₁ > div[data-pdx-layout-host=layout₁] > … > page
//
// The page carries its params as attributes, as `_applyParams` writes them. At boot the outlet finds
// that tree and keeps it instead of building another one (`ssg-adopt.ts`), and every component in
// it hydrates as any other host.
//
// An outlet inside a page renders the next level of the chain, as it does in the browser: the
// depth is the number of outlets around it, counted while they write their content.
//
// Before the page renders, the path is prepared as a navigation to it would be (#160, part 6b-2): the
// app's `onBeforeNavigate` hooks run, each awaited — a hook that loads what the page reads (its
// strings, say) has loaded it — and the route's guards are asked the permissions the app has set,
// through the same bridge the outlet installs in the browser. A hook is the app's when a module
// registers it: one registered in a component's setup arrives with the render, after this.
//
// Then the chain's loaders run, outermost first, and the page is written with their data (#239). A
// loader that fails stops the build, naming the route.
//
// What renders nothing, `serverRoute` says why: a hook that refused the path, a guard the app's
// permissions deny, a redirect — a route's or a loader's `redirect()` — and a path no route matches or
// a loader says is not found.

import { DEV } from '@pdxui/core';
import { registerServerElement, serverElement } from '@pdxui/core/server';
import { pageModule, toRouteConfig } from './active';
import { clearLoaders, planLoaders, runLoaders } from './loaders';
import { loaderError } from './state';
import { compileMatcher } from './matcher';
import { beforeNavigateHooks, chainAllowed } from './navigation';
import { permissionGuard } from './permission-guard';
import { registeredRoutes, type RegisteredRoute } from './registered-routes';

/** What the outlet will render for the path handed to `serverRoute`. */
export interface ServerRoute {
    readonly path: string;
    /** The pattern of the route the path matched; null when nothing will be rendered. */
    readonly route: string | null;
    /** Why nothing will be rendered. */
    readonly skipped?: 'not-found' | 'refused' | 'guard' | 'redirect' | 'loader-redirect' | 'loader-not-found';
}

interface Level {
    readonly chain: readonly RegisteredRoute[];
    readonly params: Readonly<Record<string, string>>;
}

let level: Level | null = null;
/** How many outlets are writing their content around the one being rendered. */
let depth = 0;

/**
 * The URL the outlets render, prepared and set before `renderToString`. The route table is read
 * here, so the table — or the pages' registrations — must be in place first.
 */
export async function serverRoute(path: string): Promise<ServerRoute> {
    level = null;
    const routes = registeredRoutes() ?? [];
    const matcher = compileMatcher(routes);
    const found = matcher.match(path);
    if (!found) return { path, route: null, skipped: 'not-found' };
    const chain = matcher.chain(found.route);
    if (chain.some((r) => r.redirect)) return { path, route: null, skipped: 'redirect' };
    // In order, as a navigation runs them; the server has no page it comes from.
    for (const hook of beforeNavigateHooks()) {
        if (await hook('', path, { redirected: false }) === false) return { path, route: null, skipped: 'refused' };
    }
    if (!await chainAllowed(chain, permissionGuard)) return { path, route: null, skipped: 'guard' };
    // The chain's loaders, outermost first, as a navigation runs them (#239): the page is written with
    // their data. Each route starts from nothing of the one before it.
    clearLoaders();
    const configs = chain.map(toRouteConfig);
    const plan = planLoaders(configs, found.params, '');
    // A kept result is not shown stale on a page a build writes: its loader runs again.
    const outcome = await runLoaders([...plan.pending, ...plan.revalidate], () => true, { params: found.params });
    if (outcome.kind === 'redirect') return { path, route: null, skipped: 'loader-redirect' };
    if (outcome.kind === 'notFound') return { path, route: null, skipped: 'loader-not-found' };
    if (outcome.kind === 'error') {
        throw new Error(`the loader of ${outcome.level.path} failed for ${path}: ${loaderError(outcome.level.path)?.message ?? 'unknown error'}`);
    }
    level = { chain, params: found.params };
    return { path, route: found.route.path };
}

/** The patterns of the registered routes, in the order they were declared. */
export function serverRoutes(): string[] {
    return (registeredRoutes() ?? []).map((r) => r.path);
}

/**
 * Import every lazy page's module, so each page is a component the server can render: in the
 * browser a page loads when it is first shown, and on the server it would be an empty host.
 */
export async function loadServerPages(): Promise<void> {
    await Promise.all((registeredRoutes() ?? []).map((r) => pageModule(r.path)?.()));
}

registerServerElement('pdx-router-outlet', (attributes) => {
    // A named outlet is a region beside the page, not a level of it: left to the browser.
    if (attributes.get('name') || !level) return { content: null };
    const route = level.chain[depth];
    if (!route) return { content: null };
    const page = serverElement(route.tag, pageAttributes(level.params), {});
    const layouts = depth === 0 ? (route.layouts ?? []) : [];
    let content: unknown = page;
    for (let i = layouts.length - 1; i >= 0; i--) {
        const host = serverElement('div', { 'data-pdx-layout-host': layouts[i], style: 'display: contents;' }, {}, content);
        content = serverElement(layouts[i], { style: 'display: contents;' }, {}, host);
    }
    return {
        attributes: { 'data-pdx-ssg': route.path, style: 'display: block;' },
        content,
        around: (write) => {
            depth++;
            try { return write(); } finally { depth--; }
        },
    };
});

function pageAttributes(params: Readonly<Record<string, string>>): Record<string, string> {
    const attrs: Record<string, string> = DEV ? { 'data-pdx-route': '' } : {};
    for (const [name, value] of Object.entries(params)) attrs[name] = value;
    return attrs;
}
