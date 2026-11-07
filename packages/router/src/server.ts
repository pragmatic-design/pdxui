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
// A route the server cannot know the answer for renders nothing, and `serverRoute` says why: a
// guard (the permissions are the visitor's) and a redirect. So does a path no route matches.

import { DEV } from '@pdxui/core';
import { registerServerElement, serverElement } from '@pdxui/core/server';
import { compileMatcher } from './matcher';
import { registeredRoutes, type RegisteredRoute } from './registered-routes';

/** What the outlet will render for the path handed to `serverRoute`. */
export interface ServerRoute {
    readonly path: string;
    /** The pattern of the route the path matched; null when nothing will be rendered. */
    readonly route: string | null;
    /** Why nothing will be rendered. */
    readonly skipped?: 'not-found' | 'guard' | 'redirect';
}

interface Level {
    readonly chain: readonly RegisteredRoute[];
    readonly params: Readonly<Record<string, string>>;
}

let level: Level | null = null;
/** How many outlets are writing their content around the one being rendered. */
let depth = 0;

/**
 * The URL the outlets render, set before `renderToString`. The route table is read here, so the
 * table — or the pages' registrations — must be in place first.
 */
export function serverRoute(path: string): ServerRoute {
    level = null;
    const routes = registeredRoutes() ?? [];
    const matcher = compileMatcher(routes);
    const found = matcher.match(path);
    if (!found) return { path, route: null, skipped: 'not-found' };
    const chain = matcher.chain(found.route);
    const refused = chain.find((r) => r.guard || r.redirect);
    if (refused) return { path, route: null, skipped: refused.guard ? 'guard' : 'redirect' };
    level = { chain, params: found.params };
    return { path, route: found.route.path };
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
