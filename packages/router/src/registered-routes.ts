// The routes the app registered, as the outlet reads them — in the browser, and on the server where a
// page is rendered to a string (server.ts, #160).
//
// The project's route table first, the modules' registrations second. `globalThis.__pdx_routes` is
// filled by a page module WHEN IT IS IMPORTED, so taking it as the only source would mean the app had
// to import every page before the router knew any of them existed — and `@page`'s code splitting
// could not happen, because the dynamic import the outlet performs would resolve to a module already
// in the entry chunk. The compiler emits the whole table from the same `@page` declarations, in dev
// and in a build, and the outlet imports a page the first time it shows it. The registrations are
// what an app without the plugin has.

import { routeTable } from './active';

/** A route as the outlet reads it from the table or a registration. */
export interface RegisteredRoute {
    path: string;
    tag: string;
    guard?: string;
    keepAlive?: boolean | number;
    preload?: boolean;
    lazy?: boolean;
    file?: string;       // relative file path for lazy import()
    prefetch?: string;
    transition?: string;  // CSS transition preset: 'fade', 'slide-left', etc.
    /**
     * The shell this page renders inside, as tags, outermost first.
     *
     * Written by the compiler from `@layout 'admin'`, which resolves the name to the tag
     * (`codegen-shared.ts` → `layoutChain`).
     */
    layouts?: string[];
    redirect?: string;    // route-level redirect target
    scroll?: 'preserve' | 'top';  // @scroll: what the scroll position does when this route is entered
    /** The page renders a <pdx-router-outlet>, so routes below its path nest inside it. */
    hasOutlet?: boolean;
    /** What this route is called in a breadcrumb; a function of the params when it needs them. */
    label?: string | ((params: Record<string, string>) => string);
    /** The crumb as a dictionary key, translated with the params. */
    labelKey?: string;
    /** The page's `@title` as a string, or as a dictionary key (#389). */
    title?: string;
    titleKey?: string;
    meta?: Record<string, unknown>;  // route metadata
    /**
     * The @loader function. A FUNCTION, not its name: the module the compiler generates hoists the
     * declaration to module scope and registers the reference, so `createRouter` receives something
     * it can actually call.
     */
    loader?: () => Promise<unknown>;
    /** `@loader user: loadUser { staleTime: 30_000 };` — how long its result is used again, in ms (#148). */
    loaderStaleTime?: number;
    outlets?: { name: string; tag: string }[];  // named outlet mappings
}

/** The registered routes: the table's, or the registrations' when there is no table. */
export function registeredRoutes(): readonly RegisteredRoute[] | undefined {
    const compiled = routeTable() as readonly RegisteredRoute[] | null;
    return (compiled && compiled.length > 0)
        ? compiled
        : globalThis.__pdx_routes as RegisteredRoute[] | undefined;
}
