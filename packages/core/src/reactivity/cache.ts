// Global reactive cache with invalidation, GC, and deduplication.
//
// Performance:
//   - O(1) key lookup via Map
//   - Wildcard matching: linear scan only on entries (not all keys)
//   - GC runs on timer, not on every access
//   - Subscriber count tracking for zero-cost cleanup
//
// Design: inspired by TanStack Query's QueryCache but integrated with
// our signal system. Tags enable SvelteKit-style semantic invalidation.

import { signal, batch } from './signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────────

export interface CacheEntry<T = unknown> {
    readonly key: string;
    readonly data: T;
    readonly timestamp: number;
    readonly staleAt: number;
    readonly tags: readonly string[];
    /** Number of active subscribers (resource instances using this entry). */
    subscribers: number;
    /** Timestamp when last subscriber left (for GC timing). */
    unsubscribedAt: number;
}

export interface CacheConfig {
    /** How long data is considered fresh, in ms (default: 30_000). */
    staleTime?: number;
    /** How long to keep data after all subscribers leave, in ms (default: 300_000). */
    gcTime?: number;
    /** Max cache entries — LRU eviction when exceeded (default: 200). */
    maxEntries?: number;
    /** GC interval in ms (default: 60_000). Set 0 to disable auto-GC. */
    gcInterval?: number;
}

/** Told the value written to a cache key by someone else (see {@link Cache.subscribe}). */
export type CacheWriteListener = (data: unknown) => void;

/** Matcher for invalidation: exact key, wildcard pattern, tag array, or predicate. */
export type InvalidationMatcher =
    | string                         // exact key or wildcard (contains *)
    | string[]                       // tag match: invalidate entries with ANY of these tags
    | ((key: string, tags: readonly string[]) => boolean);  // predicate

export interface Cache {
    /** Get a cache entry by key. Returns undefined if not found or expired. */
    get<T = unknown>(key: string): CacheEntry<T> | undefined;

    /**
     * Set a cache entry. `silent` skips the key's version bump, so nothing refetches (a resource
     * storing its own result). Every `onWrite` listener of the key is told either way, except
     * `writer`'s — the listener of whoever wrote.
     */
    set<T>(key: string, data: T, options?: { tags?: string[]; staleTime?: number; silent?: boolean; writer?: CacheWriteListener }): void;

    /** Check if a non-expired entry exists. */
    has(key: string): boolean;

    /**
     * Subscribe to a cache key (increments subscriber count). `onWrite`, when given, is called with the
     * value on every `set` of the key — silent or not — that another writer makes: how two consumers
     * of one key see each other's writes. Returns unsubscribe.
     */
    subscribe(key: string, onWrite?: CacheWriteListener): Dispose;

    /** Invalidate entries matching the pattern. Returns count of invalidated entries. */
    invalidate(matcher: InvalidationMatcher): number;

    /** Invalidate all entries. */
    invalidateAll(): void;

    /** Remove a specific entry. `silent` skips subscriber notification (internal resource writes). */
    remove(key: string, silent?: boolean): boolean;

    /** Run garbage collection (remove entries with 0 subscribers past gcTime). */
    gc(): number;

    /** Clear all entries. */
    clear(): void;

    /** Reactive signal: increments on every invalidation (effects can react). */
    version: ReadonlySignal<number>;

    /** Version signal scoped to a key (effects re-run when this key is invalidated). */
    keyVersion(key: string): ReadonlySignal<number>;

    /** Current number of entries. */
    readonly size: number;

    /** Stop GC timer. Call when disposing the cache. */
    dispose(): void;
}

// ─── Wildcard Matching ─────────────────────────────────────────────
// Supports: '/api/users/*' matches '/api/users/42', '/api/users/42/roles'
// No regex — simple prefix + suffix matching for performance.

function matchesWildcard(key: string, pattern: string): boolean {
    const starIdx = pattern.indexOf('*');
    if (starIdx === -1) return key === pattern; // exact match

    const prefix = pattern.slice(0, starIdx);
    const suffix = pattern.slice(starIdx + 1);

    if (!key.startsWith(prefix)) return false;
    if (suffix && !key.endsWith(suffix)) return false;
    return key.length >= prefix.length + suffix.length;
}

function matchesTags(entryTags: readonly string[], matchTags: string[]): boolean {
    for (let i = 0; i < matchTags.length; i++) {
        if (entryTags.indexOf(matchTags[i]) !== -1) return true;
    }
    return false;
}

// ─── createCache ───────────────────────────────────────────────────

/**
 * A cache for resource results: keyed entries with a staleness clock, tag-based invalidation, an
 * LRU cap and a garbage collector.
 *
 * Two clocks, and confusing them is the usual mistake: `staleTime` (30s) is how long a value is
 * served WITHOUT refetching, `gcTime` (5min) is how long it is kept at all. Between the two, a
 * cached value is still returned immediately and refreshed in the background.
 *
 * Most apps never call this — {@link getDefaultCache} is created on first use. Make your own to
 * isolate a subsystem, or in a test that must not share state with another.
 */
export function createCache(config: CacheConfig = {}): Cache {
    const staleTime = config.staleTime ?? 30_000;
    const gcTime = config.gcTime ?? 300_000;
    const maxEntries = config.maxEntries ?? 200;
    const gcInterval = config.gcInterval ?? 60_000;

    const entries = new Map<string, CacheEntry>();
    // The value channel, next to the version (invalidation) channel: who is told a key's new value.
    const writeListeners = new Map<string, Set<CacheWriteListener>>();
    const _version = signal(0);
    const _keyVersions = new Map<string, ReturnType<typeof signal<number>>>();

    // LRU tracking: most recently accessed keys at the end
    const accessOrder: string[] = [];

    function touchAccess(key: string): void {
        const idx = accessOrder.indexOf(key);
        if (idx !== -1) accessOrder.splice(idx, 1);
        accessOrder.push(key);
    }

    function evictLRU(): void {
        // Count consecutive rotations of subscribed (unevictable) entries.
        // If we rotate a full cycle without finding anything to evict, every
        // remaining entry is subscribed — stop instead of looping forever.
        let rotations = 0;
        while (entries.size > maxEntries && accessOrder.length > 0) {
            const oldest = accessOrder[0];
            const entry = entries.get(oldest);
            // Don't evict entries with active subscribers
            if (entry && entry.subscribers > 0) {
                accessOrder.push(accessOrder.shift()!);
                if (++rotations >= accessOrder.length) break;
                continue;
            }
            // Found an evictable entry — reset the rotation guard.
            rotations = 0;
            accessOrder.shift();
            entries.delete(oldest);
            // Bump but KEEP the keyVersion signal alive: a resource subscribed to it via
            // cache.keyVersion() holds THIS signal instance. Deleting it would orphan the
            // subscription, and later invalidations would never notify again.
            bumpKeyVersion(oldest);
        }
    }

    function bumpKeyVersion(key: string): void {
        const kv = _keyVersions.get(key);
        if (kv) kv.set(v => v + 1);
    }

    // GC timer
    let gcTimerId: ReturnType<typeof setInterval> | undefined;
    if (gcInterval > 0) {
        gcTimerId = setInterval(() => cache.gc(), gcInterval);
    }

    const cache: Cache = {
        get<T>(key: string): CacheEntry<T> | undefined {
            const entry = entries.get(key);
            if (!entry) return undefined;
            touchAccess(key);
            return entry as CacheEntry<T>;
        },

        // `silent` skips the keyVersion bump — used by a resource storing its OWN freshly
        // fetched data (it already holds it; bumping would re-trigger its own auto-fetch).
        // External/optimistic writes omit it so resources reading the key observe the change.
        set<T>(key: string, data: T, options?: { tags?: string[]; staleTime?: number; silent?: boolean; writer?: CacheWriteListener }): void {
            const now = Date.now();
            const ttl = options?.staleTime ?? staleTime;
            const existing = entries.get(key);

            entries.set(key, {
                key,
                data,
                timestamp: now,
                staleAt: now + ttl,
                tags: Object.freeze(options?.tags ?? []),
                subscribers: existing?.subscribers ?? 0,
                unsubscribedAt: existing?.unsubscribedAt ?? 0,
            });

            touchAccess(key);
            // Notify subscribers so a written value (e.g. an optimistic mutation update) is
            // observed by resources reading this key — without this the only cache→UI bridge
            // would be invalidate(), and optimistic updates would never render.
            if (!options?.silent) bumpKeyVersion(key);
            // The value channel (beta spec, data.md, E7): every other consumer of the key gets the
            // value, silent write or not — a resource's own result, or its mutate(), reaches the
            // resources sharing its key without a request. Not the writer: it has the value already.
            const listeners = writeListeners.get(key);
            if (listeners) {
                batch(() => {
                    for (const listener of [...listeners]) if (listener !== options?.writer) listener(data);
                });
            }
            if (entries.size > maxEntries) evictLRU();
        },

        has(key: string): boolean {
            return entries.has(key);
        },

        subscribe(key: string, onWrite?: CacheWriteListener): Dispose {
            const entry = entries.get(key);
            if (entry) {
                entry.subscribers++;
            }
            if (onWrite) {
                let set = writeListeners.get(key);
                if (!set) writeListeners.set(key, set = new Set());
                set.add(onWrite);
            }
            let disposed = false;
            return () => {
                if (disposed) return;
                disposed = true;
                if (onWrite) {
                    const set = writeListeners.get(key);
                    set?.delete(onWrite);
                    if (set?.size === 0) writeListeners.delete(key);
                }
                const e = entries.get(key);
                if (e && e.subscribers > 0) {
                    e.subscribers--;
                    if (e.subscribers === 0) e.unsubscribedAt = Date.now();
                }
            };
        },

        invalidate(matcher: InvalidationMatcher): number {
            let count = 0;

            // All in one batch: a bumpKeyVersion BEFORE the delete would flush synchronously and
            // the listening effect would re-run finding the entry STILL in the cache (fresh)
            // → no refetch. The batch defers the notifications until the
            // deletions are complete — the same pattern as invalidateAll.
            batch(() => {
            if (typeof matcher === 'function') {
                for (const [key, entry] of entries) {
                    if (matcher(key, entry.tags)) {
                        entries.delete(key);
                        // the predicate branch notifies the subscribers like the others
                        bumpKeyVersion(key);
                        const idx = accessOrder.indexOf(key);
                        if (idx !== -1) accessOrder.splice(idx, 1);
                        count++;
                    }
                }
            } else if (Array.isArray(matcher)) {
                // Tag-based invalidation
                for (const [key, entry] of entries) {
                    if (matchesTags(entry.tags, matcher)) {
                        entries.delete(key);
                        bumpKeyVersion(key);
                        const idx = accessOrder.indexOf(key);
                        if (idx !== -1) accessOrder.splice(idx, 1);
                        count++;
                    }
                }
            } else {
                // String: exact or wildcard
                if (matcher.includes('*')) {
                    for (const [key] of entries) {
                        if (matchesWildcard(key, matcher)) {
                            entries.delete(key);
                            bumpKeyVersion(key);
                            const idx = accessOrder.indexOf(key);
                            if (idx !== -1) accessOrder.splice(idx, 1);
                            count++;
                        }
                    }
                } else {
                    if (entries.has(matcher)) {
                        entries.delete(matcher);
                        bumpKeyVersion(matcher);
                        const idx = accessOrder.indexOf(matcher);
                        if (idx !== -1) accessOrder.splice(idx, 1);
                        count++;
                    }
                }
            }
            });

            if (count > 0) _version.set(v => v + 1);
            return count;
        },

        invalidateAll(): void {
            const hadEntries = entries.size > 0;
            batch(() => {
                for (const key of entries.keys()) bumpKeyVersion(key);
                entries.clear();
                accessOrder.length = 0;
                if (hadEntries) _version.set(v => v + 1);
            });
        },

        remove(key: string, silent?: boolean): boolean {
            if (!entries.has(key)) return false;
            entries.delete(key);
            // Keep the keyVersion signal alive and bump it so subscribers re-run
            // and observe the entry is gone (→ refetch). Deleting it would orphan every
            // resource that had subscribed via cache.keyVersion(key). `silent` is used by a
            // resource's own refetch, which drives its reload directly.
            if (!silent) bumpKeyVersion(key);
            const idx = accessOrder.indexOf(key);
            if (idx !== -1) accessOrder.splice(idx, 1);
            return true;
        },

        gc(): number {
            const now = Date.now();
            let removed = 0;
            for (const [key, entry] of entries) {
                if (entry.subscribers === 0 && entry.unsubscribedAt > 0) {
                    if (now - entry.unsubscribedAt >= gcTime) {
                        entries.delete(key);
                        // Keep the keyVersion signal alive; gc only removes entries
                        // with zero subscribers, so there is nothing to notify.
                        const idx = accessOrder.indexOf(key);
                        if (idx !== -1) accessOrder.splice(idx, 1);
                        removed++;
                    }
                }
            }
            return removed;
        },

        clear(): void {
            // Bump every keyVersion so subscribed resources re-run and see their entry gone,
            // then keep the signals alive: clearing them would orphan live subscriptions.
            batch(() => {
                for (const key of entries.keys()) bumpKeyVersion(key);
                entries.clear();
                accessOrder.length = 0;
                _version.set(v => v + 1);
            });
        },

        version: signal(0) as unknown as ReadonlySignal<number>,

        keyVersion(key: string): ReadonlySignal<number> {
            let kv = _keyVersions.get(key);
            if (!kv) {
                kv = signal(0);
                _keyVersions.set(key, kv);
            }
            return kv as unknown as ReadonlySignal<number>;
        },

        get size(): number {
            return entries.size;
        },

        dispose(): void {
            if (gcTimerId !== undefined) clearInterval(gcTimerId);
            entries.clear();
            writeListeners.clear();
            _keyVersions.clear();
            accessOrder.length = 0;
        },
    };

    // Wire the version signal correctly
    (cache as { version?: ReadonlySignal<number> }).version = _version as unknown as ReadonlySignal<number>;

    return cache;
}

// ─── Requests in flight, shared per key ────────────────────────────
// Concurrent reads of one key share one request (beta spec, data.md, E7). Internal: resource() is
// the only caller. Kept beside the cache rather than in it, by cache, so a cache made by hand —
// anything with the Cache interface — shares requests too.

/** One request in flight for a key: what it resolves to, how to stop it, and who waits for it. */
export interface Flight {
    /** Settles with the request, or rejects the moment the request is aborted. */
    readonly promise: Promise<unknown>;
    readonly controller: AbortController;
    readonly consumers: Set<object>;
    /** The key's version when it started: an invalidation since means its answer may predate a write. */
    readonly version: number;
    /** Aborted by a refetch, which started the request its consumers wait for next. */
    superseded: boolean;
}

const flightsByCache = new WeakMap<Cache, Map<string, Flight>>();

function flightsOf(cache: Cache): Map<string, Flight> {
    let flights = flightsByCache.get(cache);
    if (!flights) flightsByCache.set(cache, flights = new Map());
    return flights;
}

/**
 * Join the request in flight for `key`, or start it with `start(signal)` when there is none. The
 * signal is the request's, aborted only when its last consumer leaves ({@link leaveRequest}) or a
 * refetch supersedes it ({@link supersedeRequest}).
 * @internal
 */
export function joinRequest<T>(cache: Cache, key: string, consumer: object, start: (signal: AbortSignal) => Promise<T>): Flight & { promise: Promise<T> } {
    const flights = flightsOf(cache);
    const version = cache.keyVersion(key).peek();
    let flight = flights.get(key);
    // A request that started before the key was invalidated may answer with what the write
    // replaced: it is not joined, a new one is started for everyone.
    if (flight && flight.version !== version) {
        supersedeRequest(cache, key);
        flight = undefined;
    }
    if (!flight || flight.controller.signal.aborted) {
        const controller = new AbortController();
        const request = start(controller.signal);
        // Rejects the moment the request is aborted, whatever the transport does with the signal:
        // a consumer waiting for a superseded request has to learn it, to wait for the next one.
        const promise = new Promise<T>((resolve, reject) => {
            request.then(resolve, reject);
            controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
        });
        const created: Flight = { promise, controller, consumers: new Set(), version, superseded: false };
        flight = created;
        flights.set(key, created);
        // Settled: the next read starts its own request. Only this flight's entry, not a newer one.
        const clear = () => { if (flights.get(key) === created) flights.delete(key); };
        promise.then(clear, clear);
    }
    flight.consumers.add(consumer);
    return flight as Flight & { promise: Promise<T> };
}

/**
 * `consumer` stops waiting for `flight` — it aborted, its key changed, it was disposed. The request
 * goes on for the others, and is aborted when the last one leaves.
 * @internal
 */
export function leaveRequest(cache: Cache, key: string, flight: Flight, consumer: object): void {
    flight.consumers.delete(consumer);
    if (flight.consumers.size > 0 || flight.controller.signal.aborted) return;
    flight.controller.abort();
    const flights = flightsOf(cache);
    if (flights.get(key) === flight) flights.delete(key);
}

/**
 * Abort the request in flight for `key` for everyone: a refetch starts the one they all wait for
 * next, and each consumer gets its value through the cache's write listeners.
 * @internal
 */
export function supersedeRequest(cache: Cache, key: string): void {
    const flights = flightsOf(cache);
    const flight = flights.get(key);
    if (!flight) return;
    flights.delete(key);
    flight.superseded = true;
    flight.controller.abort();
}

// ─── Default Cache Singleton ───────────────────────────────────────

let _defaultCache: Cache | null = null;

/**
 * The process-wide cache every {@link resource} uses unless given its own, created on first use.
 *
 * Being a singleton is the point: two components asking for the same key share one request and one
 * value — concurrent reads join the request in flight, and a value one resource writes (its answer,
 * its `mutate`) reaches the others on the key. It is also why a test that leaves entries behind can
 * change the next test's behaviour — see {@link setDefaultCache}.
 */
export function getDefaultCache(): Cache {
    if (!_defaultCache) _defaultCache = createCache();
    return _defaultCache;
}

/**
 * Replace the process-wide cache.
 *
 * For tests and for setup code that wants different staleness or size limits. Anything already
 * holding the previous cache keeps it, so call this before creating resources, not after.
 */
export function setDefaultCache(cache: Cache): void {
    _defaultCache = cache;
}

// ─── Convenience: global invalidation functions ────────────────────

/**
 * Drop matching entries from the default cache and return how many went, so the next read refetches.
 *
 * Matches on an exact key, a prefix pattern, or tags — tags being the useful one: a mutation that
 * created an order invalidates `['orders']` without knowing which keys are in play. The count is
 * worth checking in a test: zero means the matcher matched nothing, which looks identical to
 * "worked" from the outside.
 */
export function invalidate(matcher: InvalidationMatcher): number {
    return getDefaultCache().invalidate(matcher);
}

/**
 * Drop everything in the default cache.
 *
 * The blunt instrument: right after a logout, where anything cached belongs to the previous user.
 * Anywhere else, {@link invalidate} with tags refetches what changed instead of everything.
 */
export function invalidateAll(): void {
    getDefaultCache().invalidateAll();
}
