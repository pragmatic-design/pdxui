// The data a prefetch loaded ahead of the click, kept for the navigation that follows (#119).
//
// A prefetch under the `hover` or `viewport` policy starts the target's loader as well as its chunk.
// Its result is kept under the loader call's identity — the key `docs/language/beta/routing.md`
// defines in «The identity of a loader call» — so two links that differ only in the order or the
// encoding of their query share one call, and two that differ in a value do not. A navigation within
// `PREFETCH_TTL_MS` with the same key takes the result; after that it is dropped, and the navigation
// calls the loader itself.

/** How long a prefetched result waits for its navigation. */
export const PREFETCH_TTL_MS = 10_000;

/** The params a level declares in its OWN pattern. `/tickets/:id/notes/:n` → ['id', 'n']. */
export function ownParamNames(pattern: string): string[] {
    return [...pattern.matchAll(/:([A-Za-z0-9_]+)/g)].map(m => m[1]);
}

/**
 * The query, canonical: its pairs sorted by key, the values of a repeated key kept in URL order,
 * each pair decoded then encoded again. No query and `?` alone are both empty; a fragment is no part
 * of it.
 */
export function canonicalQuery(search: string): string {
    const raw = search.split('#')[0].replace(/^\?/, '');
    if (raw === '') return '';
    const pairs = [...new URLSearchParams(raw)];
    // A stable sort: the values of a repeated key stay in the order the URL gave them.
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

/** The identity of a loader call: `pattern | own params, keys sorted | canonical query`. */
export function loaderIdentity(pattern: string, params: Record<string, string>, search: string): string {
    const own = ownParamNames(pattern).sort().map(n => `${n}=${encodeURIComponent(params[n] ?? '')}`).join('&');
    return `${pattern}|${own}|${canonicalQuery(search)}`;
}

interface Prefetched { promise: Promise<unknown>; at: number }

const prefetched = new Map<string, Prefetched>();

/** Whether a call with this identity is already held, and young enough to be taken. */
function fresh(entry: Prefetched | undefined): entry is Prefetched {
    return !!entry && Date.now() - entry.at <= PREFETCH_TTL_MS;
}

/**
 * Start `loader` for `key` unless a fresh call is already held. Returns whether it started one.
 *
 * A call that fails is forgotten: the navigation then calls the loader itself, and its failure is
 * the one the page reports.
 */
export function prefetchLoaderCall(key: string, loader: () => unknown): boolean {
    if (fresh(prefetched.get(key))) return false;
    const entry: Prefetched = { promise: Promise.resolve().then(loader), at: Date.now() };
    prefetched.set(key, entry);
    entry.promise.then(undefined, () => {
        if (prefetched.get(key) === entry) prefetched.delete(key);
    });
    return true;
}

/** The prefetched call for `key`, handed to the navigation once; undefined when none is fresh. */
export function takePrefetchedLoaderCall(key: string): Promise<unknown> | undefined {
    const entry = prefetched.get(key);
    prefetched.delete(key);
    return fresh(entry) ? entry.promise : undefined;
}

/** Test seam: the held calls are module state. */
export function resetLoaderPrefetch(): void {
    prefetched.clear();
}
