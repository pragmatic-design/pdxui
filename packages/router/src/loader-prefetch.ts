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

/** The query a loader receives (#505): each key once, a repeated key as an array in URL order. */
export function parseLoaderQuery(search: string): Record<string, string | string[]> {
    const raw = search.split('#')[0].replace(/^\?/, '');
    const out: Record<string, string | string[]> = {};
    if (raw === '') return out;
    for (const [k, v] of new URLSearchParams(raw)) {
        const held = out[k];
        out[k] = held === undefined ? v : Array.isArray(held) ? [...held, v] : [held, v];
    }
    return out;
}

/** A held call: its promise, when it started, and its own controller, which aborts it if it goes unused. */
export interface PrefetchedCall { promise: Promise<unknown>; at: number; controller: AbortController }

const prefetched = new Map<string, PrefetchedCall>();

/**
 * Whether a held call is young enough to be taken. Not a type guard: a call that fails it is still a
 * call — an expired one, which is aborted as it is dropped.
 */
function fresh(entry: PrefetchedCall): boolean {
    return Date.now() - entry.at <= PREFETCH_TTL_MS;
}

/**
 * Start `loader` for `key` unless a fresh call is already held, giving it the signal of a controller
 * of its own (#505). Returns whether it started one. A held call that expired is aborted as it is
 * replaced.
 *
 * A call that fails is forgotten: the navigation then calls the loader itself, and its failure is
 * the one the page reports.
 */
export function prefetchLoaderCall(key: string, loader: (signal: AbortSignal) => unknown): boolean {
    const held = prefetched.get(key);
    if (held && fresh(held)) return false;
    held?.controller.abort();
    const controller = new AbortController();
    const entry: PrefetchedCall = { promise: Promise.resolve().then(() => loader(controller.signal)), at: Date.now(), controller };
    prefetched.set(key, entry);
    entry.promise.then(undefined, () => {
        if (prefetched.get(key) === entry) prefetched.delete(key);
    });
    return true;
}

/**
 * The prefetched call for `key`, handed to the navigation once; undefined when none is fresh. The
 * navigation takes its controller too, and aborts it when a newer navigation supersedes it. A call
 * that expired unused is aborted as it is dropped.
 */
export function takePrefetchedLoaderCall(key: string): PrefetchedCall | undefined {
    const entry = prefetched.get(key);
    prefetched.delete(key);
    if (!entry) return undefined;
    if (fresh(entry)) return entry;
    entry.controller.abort();
    return undefined;
}

/** Test seam: the held calls are module state. Each is aborted as it goes. */
export function resetLoaderPrefetch(): void {
    for (const entry of prefetched.values()) entry.controller.abort();
    prefetched.clear();
}
