// One queue for the code a page loads ahead of time (#250).
//
// A prefetch is correct on its own; fifty of them are not. A list page whose row links prefetch on
// `viewport` would start every route's `import()` as the rows scroll in, and a click on one of them
// would wait behind the downloads it started. So a prefetch is QUEUED: at most two run at a time,
// and a queued one starts only when the browser is idle and no load the visitor is waiting for —
// a navigation's chunk, a `@defer` block on screen — is in flight. Those URGENT loads are never
// queued; they are only counted, so the queue knows to wait.
//
// The router queues its route prefetches here and, on a navigation, takes the target's prefetch
// (`takePrefetch`) and drops the rest (`cancelPrefetches`). `defer()` counts its render load.

/** How many prefetches may download at once. */
const MAX_RUNNING = 2;

const queued = new Map<string, () => Promise<unknown>>();
const running = new Map<string, Promise<unknown>>();
let urgent = 0;
let scheduled = false;

type IdleWindow = { requestIdleCallback?: (cb: () => void) => number };

/** Run `fn` when the browser is idle; `setTimeout(0)` where `requestIdleCallback` does not exist. */
function whenIdle(fn: () => void): void {
    const w = (typeof window !== 'undefined' ? window : undefined) as IdleWindow | undefined;
    if (w?.requestIdleCallback) w.requestIdleCallback(fn);
    else setTimeout(fn, 0);
}

/** A prefetch starts: it holds one of the places until it settles, resolved or not. */
function start(key: string, load: () => Promise<unknown>): Promise<unknown> {
    const pending = load();
    running.set(key, pending);
    const settled = (): void => {
        if (running.get(key) === pending) running.delete(key);
        schedule();
    };
    pending.then(settled, settled);
    return pending;
}

/** Start what may start now, if anything is waiting. */
function pump(): void {
    scheduled = false;
    for (const [key, load] of queued) {
        if (urgent > 0 || running.size >= MAX_RUNNING) break;
        queued.delete(key);
        start(key, load);
    }
}

function schedule(): void {
    if (scheduled || queued.size === 0 || urgent > 0 || running.size >= MAX_RUNNING) return;
    scheduled = true;
    whenIdle(pump);
}

/**
 * Queue a prefetch under `key` (a route pattern, a deferred block). Returns whether it was queued:
 * false when the same key is already queued or running.
 */
export function queuePrefetch(key: string, load: () => Promise<unknown>): boolean {
    if (queued.has(key) || running.has(key)) return false;
    queued.set(key, load);
    schedule();
    return true;
}

/**
 * A load the visitor is waiting for: while it is in flight, no queued prefetch starts. It is never
 * queued itself. Returns the same promise.
 */
export function trackUrgentLoad<T>(load: Promise<T>): Promise<T> {
    urgent++;
    const settled = (): void => {
        urgent--;
        schedule();
    };
    load.then(settled, settled);
    return load;
}

/**
 * The prefetch a navigation needs, handed over: a queued one starts at once, as an urgent load; a
 * running one is returned as it is, for the navigation to await rather than start a second load.
 * Undefined when there is none, and the navigation loads on its own.
 */
export function takePrefetch(key: string): Promise<unknown> | undefined {
    const inFlight = running.get(key);
    if (inFlight) return inFlight;
    const load = queued.get(key);
    if (!load) return undefined;
    queued.delete(key);
    return trackUrgentLoad(start(key, load));
}

/**
 * Drop every queued prefetch except `except`'s. What is running finishes. Returns the keys dropped,
 * so their owner can forget them and queue them again later.
 */
export function cancelPrefetches(except?: string): string[] {
    const dropped = [...queued.keys()].filter((key) => key !== except);
    for (const key of dropped) queued.delete(key);
    return dropped;
}

/** Test seam: the queue is module state, and a suite needs a clean one between cases. */
export function resetLoadQueue(): void {
    queued.clear();
    running.clear();
    urgent = 0;
    scheduled = false;
}
