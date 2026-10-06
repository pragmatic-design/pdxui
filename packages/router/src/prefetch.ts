// Fetching a route's chunk before the click.
//
// `@page` means code splitting: the entry does not carry the whole application, and a route is
// downloaded the first time it is shown. That moves the wait rather than removing it — the first
// click on a route stalls for a network round trip. This is the other half.
//
// `<link rel="prefetch" href="/settings">` does not prefetch a route: in a single-page app it asks
// the server for the SPA fallback — `index.html`, a document the router will never navigate to —
// and never for the route's JavaScript. A declaration that does nothing reads as a solved problem,
// which is worse than no declaration.
//
// What actually prefetches a route is calling its `import()` early. The module cache does the
// deduplication, so the load the outlet performs on the click finds it already resolved.

import { routeTable, pageModule } from './active';

/** What a route says about being fetched ahead of time. */
export type PrefetchPolicy = 'hover' | 'eager' | 'never';

/** The shape this module reads out of the route table; the rest of an entry is not its business. */
interface PrefetchableRoute {
    path: string;
    prefetch?: string;
}

/**
 * One entry per route PATTERN, not per URL: `/tickets/1` and `/tickets/2` are one chunk, and
 * asking the module cache twice is free while the bookkeeping is not.
 */
const started = new Set<string>();

/**
 * The load each prefetch started, by route pattern, for the outlet to WAIT ON rather than start a
 * second one.
 *
 * A second `import()` of a route is not the same as the first. Vite's preload helper remembers the
 * files it has already asked for, and the second caller does not wait for them: it gets the module
 * as soon as the JavaScript is in, while the route's stylesheet the first call is waiting for is
 * still on the wire. The page would be painted unstyled and then move — a 0.0385 layout shift on
 * the landing route when the shell prefetches it at boot.
 */
const inflight = new Map<string, Promise<unknown>>();

/** The load a prefetch already started for this route, if one did; the outlet awaits it. */
export function prefetchedLoad(path: string): Promise<unknown> | undefined {
    return inflight.get(path);
}

/** Test seam: the module cache is per-process and a suite needs a clean one between cases. */
export function resetPrefetch(): void {
    started.clear();
    inflight.clear();
}

/** The routes this build knows about — the build-time table first, as the outlet reads it. */
function table(): PrefetchableRoute[] {
    const compiled = routeTable() as PrefetchableRoute[] | null;
    if (compiled && compiled.length > 0) return compiled;
    return (globalThis as { __pdx_routes?: PrefetchableRoute[] }).__pdx_routes ?? [];
}

/**
 * The route a URL belongs to.
 *
 * Deliberately loose: segment count and literal segments must agree, and `:anything` matches any
 * one segment — a param CONSTRAINT is not checked. Being wrong here costs a chunk nobody needed,
 * never a wrong page, and duplicating the matcher's constraint rules to save that would be the
 * second copy of a thing that must not drift.
 */
export function routeFor(url: string): PrefetchableRoute | undefined {
    const clean = url.split(/[?#]/)[0];
    if (!clean.startsWith('/')) return undefined;         // external, or a scheme we do not own
    const segs = clean.split('/').filter(Boolean);

    for (const route of table()) {
        const pattern = route.path.split('/').filter(Boolean);
        if (pattern.length !== segs.length) continue;
        if (pattern.every((p, i) => p.startsWith(':') || p === segs[i])) return route;
    }
    return undefined;
}

/** What the route says, normalised; `hover` when it says nothing. */
export function policyFor(url: string): PrefetchPolicy {
    const declared = routeFor(url)?.prefetch;
    return declared === 'never' || declared === 'eager' ? declared : 'hover';
}

/**
 * Is prefetching worth someone's money right now?
 *
 * `saveData` is the visitor asking not to spend it, and a 2G connection is one where a speculative
 * download competes with the page they are actually reading. Both are read defensively: the
 * Network Information API is not in every browser, and the absence of it is not a slow connection.
 */
export function prefetchAllowed(): boolean {
    const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (!conn) return true;
    if (conn.saveData === true) return false;
    return conn.effectiveType !== 'slow-2g' && conn.effectiveType !== '2g';
}

/**
 * Fetch the chunk this URL will need, if there is one and it is wanted.
 *
 * Returns whether a fetch was STARTED, which is what a test can assert on; a caller has nothing to
 * do with the answer. Failure is swallowed on purpose: a prefetch that cannot reach the network is
 * a click that will load normally, not an error the visitor should be shown — the outlet reports
 * the real one when the navigation happens.
 */
export function prefetchRoute(url: string | null | undefined): boolean {
    if (!url) return false;
    if (!prefetchAllowed()) return false;

    const route = routeFor(url);
    if (!route || route.prefetch === 'never') return false;
    if (started.has(route.path)) return false;

    // No loader means nothing to fetch, and that is the normal case twice over: in dev the page
    // modules are already imported, and a route with `preload: true` was deliberately kept in the
    // entry. Mark it done anyway — the answer will not change.
    const load = pageModule(route.path);
    started.add(route.path);
    if (!load) return false;

    const pending = load();
    inflight.set(route.path, pending);
    // A failed prefetch is a normal load later: forgotten, so the outlet starts its own.
    pending.catch(() => { inflight.delete(route.path); });
    return true;
}
