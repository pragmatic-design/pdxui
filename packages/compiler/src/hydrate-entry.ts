// `pdx({ hydrate: true })` (#160, part 5b): the page installs hydration before the app's own script
// runs, so a component the build pre-rendered takes over its markup instead of rendering over it.
//
// A module the plugin serves, put first in the head: module scripts run in document order, and a host
// that connected before `installHydration()` would render over the server's markup. With `@page`
// routes it also installs the outlet's adoption (`@pdxui/router/hydrate`), without which the outlet
// would build its route beside the one the page holds.
//
// The script is in the html BEFORE Vite reads it (`order: 'pre'`), so a build bundles it with the
// app's entry and a dev server serves it like any module: nothing inline, nothing a strict CSP
// refuses, and no bare specifier left for the browser to resolve.

import type { Plugin } from 'vite';
import { injectAfterHeadOpen } from './plugin-utils';

/** The URL the page loads hydration from, and the module that answers it. */
export const HYDRATE_ENTRY_URL = '/@pdx/hydrate.js';
const RESOLVED_HYDRATE_ENTRY = '\0pdx-hydrate-entry';

/** The module: hydration, and the outlet's adoption when the app has routes. */
export function hydrateEntryModule(hasRoutes: boolean): string {
    return hasRoutes
        ? `import { installHydration } from '@pdxui/core/hydrate';\nimport { installRouteAdoption } from '@pdxui/router/hydrate';\ninstallHydration();\ninstallRouteAdoption();\n`
        : `import { installHydration } from '@pdxui/core/hydrate';\ninstallHydration();\n`;
}

/**
 * What a build's page announces, and what each route's first screen would (#160): the `modulepreload`
 * and style `preload` tags the plugin wrote into `index.html` for the landing routes (`preloadRoutes`),
 * and the tags for each route pattern.
 */
export interface RoutePreloads {
    readonly landing: string;
    readonly routes: ReadonlyMap<string, string>;
}

/**
 * What the plugin offers a static build (`pdx build --ssg`), through Vite's `api` field on a plugin.
 */
export interface HydrateApi {
    /**
     * `html`, a page generated for the route `route`, announcing that route's chunks in place of the
     * landing route's: a generated page is the first screen of its own route. Unchanged before a
     * build has written the tags, or when the app announces none (`preloadRoutes: []`).
     */
    retargetPreloads(html: string, route: string): string;
}

/**
 * The plugin that puts hydration in the page. `hasRoutes` is asked when the module is loaded, after
 * the build has scanned the project's `@page` declarations; `preloads`, once a build has written the
 * page.
 */
export function hydrateEntryPlugin(hasRoutes: () => boolean, preloads: () => RoutePreloads | null = () => null): Plugin & { api: HydrateApi } {
    return {
        name: 'pragmatic-pdx-hydrate',
        api: {
            retargetPreloads(html: string, route: string): string {
                const p = preloads();
                const own = p?.routes.get(route);
                if (!p || !p.landing || own === undefined || !html.includes(p.landing)) return html;
                return html.replace(p.landing, () => own);
            },
        },
        transformIndexHtml: {
            order: 'pre',
            handler(html: string) {
                if (html.includes(HYDRATE_ENTRY_URL)) return html;
                return injectAfterHeadOpen(html, `<script type="module" src="${HYDRATE_ENTRY_URL}"></script>`);
            },
        },
        resolveId(id: string) {
            return id === HYDRATE_ENTRY_URL ? RESOLVED_HYDRATE_ENTRY : undefined;
        },
        load(id: string) {
            return id === RESOLVED_HYDRATE_ENTRY ? hydrateEntryModule(hasRoutes()) : undefined;
        },
    };
}
