// Reactive async data loading with cache, retry, stale-while-revalidate,
// deduplication, abort, and 7-state lifecycle.
//
// Performance:
//   - AbortController per-fetch: cancels stale requests immediately
//   - Cache dedup: same key = same data, no duplicate fetches
//   - Lazy computed status: derived signals computed only when read
//   - fetchCount guard: stale responses discarded without allocation
//
// Security:
//   - AbortController prevents leaked pending requests on component destroy
//   - Error objects sanitized (no response body in error.message)

import { signal, computed, effect, batch, collectDisposers, onDispose } from './signal';
import type { ReadonlySignal, Dispose } from '../utils/types';
import { getDefaultCache } from './cache';
import type { Cache, CacheWriteListener, Flight } from './cache';
import { joinRequest, leaveRequest, supersedeRequest } from './cache';
import { isRetryableError, retryDelayMs } from '../http/middleware';

// ─── Types ─────────────────────────────────────────────────────────

export type ResourceState =
    | 'idle'        // never fetched (enabled=false or initial)
    | 'loading'     // first fetch in progress, no data yet
    | 'reloading'   // refetch in progress, previous data still available
    | 'success'     // fresh data available
    | 'stale'       // data available but past staleTime, background revalidate
    | 'error'       // fetch failed, no data (or stale data in .data)
    | 'local';      // data set manually via mutate()

export interface ResourceStatus {
    readonly isLoading: boolean;    // loading || reloading
    readonly isError: boolean;
    readonly isSuccess: boolean;
    readonly isStale: boolean;
    readonly hasData: boolean;      // data !== undefined (true even in error/stale if cached)
    readonly isIdle: boolean;
}

export interface ResourceOptions<T = unknown> {
    /** Cache key. Auto-generated from fetcher if not provided. */
    key?: string | (() => string);
    /** How long data is fresh after fetch, in ms (default: 30_000). */
    staleTime?: number;
    /** Max retry attempts on error (default: 0). */
    retry?: number;
    /**
     * Tags for semantic invalidation (e.g. ['users', 'admin']) — or a function of the key the
     * resource resolved, called at each cache write, so a resource whose key changes is tagged with
     * the current one. Every `@fetch` passes `(k) => [k, …its own tags]`: an array given to
     * `invalidate` matches tags, and this is what lets it name a fetch by its key.
     */
    tags?: string[] | ((key: string) => string[]);
    /** Disable fetching until condition is met (for dependent queries). */
    enabled?: boolean | (() => boolean);
    /** Transform raw response before caching. */
    transform?: (raw: unknown) => T;
    /** Called on successful fetch. */
    onSuccess?: (data: T) => void;
    /** Called on fetch error. */
    onError?: (error: unknown) => void;
    /** Custom cache instance (default: global cache). */
    cache?: Cache;

    // Legacy compat (deprecated — use staleTime)
    /** @deprecated Use staleTime instead. */
    stale?: boolean;
}

export interface Resource<T> {
    /** Current data (undefined if not yet loaded). */
    readonly data: ReadonlySignal<T | undefined>;
    /** Current error (undefined if no error). */
    readonly error: ReadonlySignal<unknown | undefined>;
    /** Whether currently loading (first load or refetch). */
    readonly loading: ReadonlySignal<boolean>;
    /** True ONLY during background revalidation (has data + refetching). False during initial load. */
    readonly isPending: ReadonlySignal<boolean>;
    /** Current lifecycle state (7 states). */
    readonly state: ReadonlySignal<ResourceState>;
    /** Derived status flags for convenience. */
    readonly status: ReadonlySignal<ResourceStatus>;
    /** The cache key used by this resource. */
    readonly key: string;
    /** Re-fetch data (cancels any in-flight request). */
    refetch(): Promise<void>;
    /** Optimistically set data without fetching. State → 'local'. */
    mutate(value: T): void;
    /** Cancel any in-flight request. */
    abort(): void;
    /** Clean up: cancel requests, unsubscribe from cache. */
    dispose(): void;
}

// ─── Render helper ─────────────────────────────────────────────────

export interface ResourceHandlers<T> {
    loading?: () => Node | DocumentFragment;
    success?: (data: T) => Node | DocumentFragment;
    error?: (err: unknown, retry: () => void) => Node | DocumentFragment;
    stale?: (data: T) => Node | DocumentFragment;
    reloading?: (data: T) => Node | DocumentFragment;
}

// ─── resource() ────────────────────────────────────────────────────

/**
 * What a resource calls to load: it receives the request's `signal` and hands it to its transport —
 * `({ signal }) => fetch(url, { signal })`, `({ signal }) => client.get(url, { signal })` — so a
 * request that is superseded, aborted or disposed stops on the network. A fetcher that takes no
 * parameter is one too; its request is ignored when it is superseded, but runs to the end.
 */
export type ResourceFetcher<T> = (ctx: { signal: AbortSignal }) => Promise<T>;

let resourceCounter = 0;

/**
 * An async value as reactive state: `data`, `error` and `state` you read like signals, with the
 * fetch, the cache, the retries and the cancellation already handled.
 *
 * The four states are `idle | loading | success | error`, and the point of having them is that a
 * template branches on `state()` instead of juggling a loading boolean against a possibly-stale
 * `data`. {@link resourceWhen} renders that branch for you.
 *
 * A stale response can never overwrite a fresh one: each fetch takes a generation number and an
 * AbortController, so a slow request that returns after a newer one is discarded rather than
 * flickering the old value back in.
 *
 * `key` puts the result in the cache and shares it with every other resource using that key;
 * `tags` are what {@link invalidate} matches on after a {@link mutation}. `staleTime` (30s by
 * default) is how long a cached value is served without a refetch.
 *
 * In a `.pdx` file `@fetch users: 'GET /api/users'` compiles to this.
 */
export function resource<T>(
    fetcher: ResourceFetcher<T>,
    options?: ResourceOptions<T>,
): Resource<T> {
    const opts = options ?? {};
    const staleTime = opts.staleTime ?? 30_000;
    const maxRetry = opts.retry ?? 0;
    /** The tags of a cache write for this key: the static list, or the function of the key. */
    const tagsFor = (key: string): string[] =>
        typeof opts.tags === 'function' ? opts.tags(key) : (opts.tags ?? []);
    const transform = opts.transform;
    const cache = opts.cache ?? getDefaultCache();

    // Resolve cache key
    const keyFn = typeof opts.key === 'function' ? opts.key : null;
    let resolvedKey = typeof opts.key === 'string' ? opts.key : `__resource_${++resourceCounter}`;

    // Internal signals
    const _data = signal<T | undefined>(undefined);
    const _error = signal<unknown | undefined>(undefined);
    const _state = signal<ResourceState>('idle');

    // The shared request this resource waits for, and the key it was for (beta spec, data.md, E7):
    // concurrent reads of one key share one request, which is aborted when its last consumer leaves.
    let current: { key: string; flight: Flight } | null = null;
    let fetchGeneration = 0; // guards against stale responses
    let disposed = false;

    /** Stop waiting for the shared request, which goes on for the other consumers of its key. */
    function leaveCurrent(): void {
        if (!current) return;
        leaveRequest(cache, current.key, current.flight, onWrite);
        current = null;
    }

    // The value another consumer of the key wrote — its answer, its refetch, its mutate(): applied
    // here without a request. Also this resource's identity, as a consumer and as a writer, which
    // the cache does not tell its own writes.
    const onWrite: CacheWriteListener = (value) => {
        if (disposed) return;
        batch(() => {
            _data.set(value as T);
            _error.set(undefined);
            _state.set('success');
        });
    };

    // Cache subscription
    let cacheUnsub: Dispose | null = null;

    function subscribeToCacheKey(key: string): void {
        cacheUnsub?.();
        cacheUnsub = cache.subscribe(key, onWrite);
    }

    // Check cache for existing data
    function loadFromCache(key: string): boolean {
        const entry = cache.get<T>(key);
        if (!entry) return false;

        const now = Date.now();
        const isFresh = now < entry.staleAt;

        batch(() => {
            _data.set(entry.data);
            _error.set(undefined);
            _state.set(isFresh ? 'success' : 'stale');
        });

        return isFresh; // true = no refetch needed
    }

    // Core fetch logic
    async function doFetch(attempt = 0): Promise<void> {
        const generation = ++fetchGeneration;

        // Resolve dynamic key
        if (keyFn) {
            const newKey = keyFn();
            if (newKey !== resolvedKey) {
                resolvedKey = newKey;
                subscribeToCacheKey(resolvedKey);
            }
        }

        // Check enabled
        const isEnabled = typeof opts.enabled === 'function' ? opts.enabled() : opts.enabled;
        if (isEnabled === false) {
            _state.set('idle');
            return;
        }

        // Check cache first
        if (attempt === 0) {
            const isFresh = loadFromCache(resolvedKey);
            if (isFresh) return; // Cache hit, data is fresh

            // If stale data found, we're "reloading" (data visible, refetching)
            if (_data.peek() !== undefined) {
                _state.set(_state.peek() === 'stale' ? 'stale' : 'reloading');
            }
        }

        // Set loading state (only 'loading' if no data yet)
        if (_data.peek() === undefined) {
            _state.set('loading');
        }
        _error.set(undefined);

        // Leave the request this resource waited for before: it is superseded for this resource,
        // and aborted if no other consumer of its key still waits for it.
        leaveCurrent();
        let flight: Flight | undefined;

        try {
            // Join the request in flight for the key, or start it. Its signal (beta spec, data.md,
            // E2) is aborted when its last consumer leaves — superseded, abort(), dispose — so the
            // transport stops instead of running to the end for an answer nobody will read.
            flight = joinRequest(cache, resolvedKey, onWrite, (signal) => fetcher({ signal }));
            current = { key: resolvedKey, flight };
            const raw = await flight.promise;

            // Guard: if another fetch started, or this one was left, discard this result
            if (generation !== fetchGeneration) return;
            if (current?.flight !== flight) return;
            current = null;

            const data = transform ? transform(raw) : raw as unknown as T;

            // Update cache: silent, so this write triggers no refetch; the other consumers of the key
            // are told the value through their write listeners.
            cache.set(resolvedKey, data, { tags: tagsFor(resolvedKey), staleTime, silent: true, writer: onWrite });
            subscribeToCacheKey(resolvedKey);

            batch(() => {
                _data.set(data);
                _error.set(undefined);
                _state.set('success');
            });

            opts.onSuccess?.(data);
        } catch (err) {
            // Guard: discard errors from requests this resource no longer waits for
            if (generation !== fetchGeneration) return;
            if (flight && current?.flight !== flight) return;
            current = null;
            // Superseded for everyone by another consumer's refetch: wait for the request it started.
            if (flight?.superseded) return doFetch(attempt);
            if (flight?.controller.signal.aborted) return;

            // Retry what retrying can fix, with the HTTP client's classifier and backoff (beta spec,
            // E6): not a 4xx, a cancellation or a timeout; jitter, and Retry-After when the server
            // sends one. A read source owns its retries — `@fetch` turns the transport's off.
            if (attempt < maxRetry && isRetryableError(err)) {
                const delay = retryDelayMs(err, attempt);
                await new Promise(r => setTimeout(r, delay));
                if (generation === fetchGeneration) {
                    return doFetch(attempt + 1);
                }
                return;
            }

            batch(() => {
                _error.set(err);
                // Keep data if we have it (error + stale data)
                _state.set(_data.peek() !== undefined ? 'stale' : 'error');
            });

            opts.onError?.(err);
        }
    }

    // Subscribe to cache key for dedup
    subscribeToCacheKey(resolvedKey);

    // Auto-fetch reactively (tracks fetcher dependencies + enabled + dynamic key)
    const disposeEffect = effect(() => {
        // Touch reactive dependencies: enabled, dynamic key
        if (typeof opts.enabled === 'function') opts.enabled();
        // The key has to be resolved HERE, before reading keyVersion: reading the old
        // key's version would mean invalidating the new one never triggers the
        // refetch.
        if (keyFn) {
            const newKey = keyFn();
            if (newKey !== resolvedKey) {
                resolvedKey = newKey;
                subscribeToCacheKey(resolvedKey);
            }
        }

        // React to cache invalidation for this key
        cache.keyVersion(resolvedKey)();

        doFetch();
    });

    // Derived signals (lazy — only computed when read)
    const state = computed(() => _state()) as ReadonlySignal<ResourceState>;
    const data = computed(() => _data()) as ReadonlySignal<T | undefined>;
    const error = computed(() => _error()) as ReadonlySignal<unknown | undefined>;
    const loading = computed(() => {
        const s = _state();
        return s === 'loading' || s === 'reloading';
    });
    const status = computed<ResourceStatus>(() => {
        const s = _state();
        return {
            isLoading: s === 'loading' || s === 'reloading',
            isError: s === 'error',
            isSuccess: s === 'success',
            isStale: s === 'stale',
            hasData: _data() !== undefined,
            isIdle: s === 'idle',
        };
    });

    // isPending: true only during background refresh (data exists + refetching)
    const isPending = computed(() => {
        const s = state();
        return (s === 'reloading' || s === 'stale') && _data() !== undefined;
    });

    const res: Resource<T> = {
        data,
        error,
        loading,
        isPending,
        state,
        status,
        // Getter: with a dynamic keyFn a snapshot would stay at the initial value
        get key() { return resolvedKey; },

        async refetch(): Promise<void> {
            if (disposed) return;
            // Invalidate cache entry to force refetch, and supersede the request in flight for the
            // key for every consumer (beta spec, E7): they wait for the one this starts.
            cache.remove(resolvedKey, true);
            supersedeRequest(cache, resolvedKey);
            await doFetch();
        },

        mutate(value: T): void {
            if (disposed) return;
            batch(() => {
                _data.set(value);
                _error.set(undefined);
                _state.set('local');
            });
            // Written for every consumer of the key (E7), and without a request: silent.
            cache.set(resolvedKey, value, { tags: tagsFor(resolvedKey), staleTime, silent: true, writer: onWrite });
        },

        abort(): void {
            if (!current) return;
            // Cancelling is not failing (beta spec, data.md, E3): the bump stops the retry chain
            // too, and the source goes back to its last settled state — it stayed 'loading' for
            // good, its late answer discarded. error() is left as it was. The shared request is
            // left, and aborted only if no other consumer of the key still waits for it (E7).
            fetchGeneration++;
            leaveCurrent();
            _state.set(_data.peek() !== undefined ? 'success' : 'idle');
        },

        dispose(): void {
            if (disposed) return;
            disposed = true;
            // It invalidates the retries waiting in the backoff too: without the bump, the chain
            // would start fetching again after the dispose.
            fetchGeneration++;
            // The shared request goes on for the other consumers of the key, and is aborted when
            // this was the last one (E7).
            leaveCurrent();
            disposeEffect();
            cacheUnsub?.();
        },
    };

    // A resource lives as long as the scope that created it (beta spec, data.md, E8). In a component's
    // setup — every `@fetch` — that is the component: when it goes, the request is aborted, a retry
    // waiting in its backoff is dropped, and the cache subscription is released so the entry can be
    // collected. Without it only the auto-fetch effect stopped, and the subscription pinned the entry
    // past `maxEntries` and `gcTime`. `onDispose` is a no-op outside a scope, so a resource created at
    // module level is still disposed by hand; `dispose()` called twice (useQuery's) does nothing more.
    onDispose(() => res.dispose());
    return res;
}

// ─── resourceWhen() — declarative rendering ────────────────────────

/**
 * Render one branch per resource state, and swap it when the state changes.
 *
 * Takes `{ loading, error, success, empty?, reloading? }` and returns a fragment that keeps itself
 * in step with the resource. The branches it renders are OWNED: the effects created by the previous
 * branch are disposed when the state changes, so a loading spinner's timer does not survive the
 * success it was replaced by.
 *
 * `empty` is the branch that stops "loaded, and there is nothing" from looking like "still loading";
 * `reloading` lets a background refresh show the old data instead of blanking the screen.
 */
export function resourceWhen<T>(
    res: Resource<T>,
    handlers: ResourceHandlers<T>,
): DocumentFragment {
    const frag = document.createDocumentFragment();
    const start = document.createComment('resource');
    const end = document.createComment('/resource');
    frag.appendChild(start);
    frag.appendChild(end);

    let currentNodes: Node[] = [];
    // An ownership scope for the rendered content: the effects of the previous
    // handlers must be disposed when the state changes (the same as when/match).
    let childDispose: (() => void) | null = null;

    effect(() => {
        const state = res.state();
        const parent = end.parentNode;
        if (!parent) return;

        // Remove old content
        for (const n of currentNodes) parent.removeChild(n);
        currentNodes = [];

        let content: Node | DocumentFragment | null | undefined = null;
        const [, disposeContent] = collectDisposers(() => {
            switch (state) {
            case 'loading':
                content = handlers.loading?.();
                break;
            case 'success':
            case 'local': {
                const data = res.data();
                if (data !== undefined && handlers.success) content = handlers.success(data);
                break;
            }
            case 'error': {
                const err = res.error();
                if (err !== undefined && handlers.error) content = handlers.error(err, () => res.refetch());
                break;
            }
            case 'stale': {
                const data = res.data();
                if (data !== undefined) {
                    content = handlers.stale?.(data) ?? handlers.success?.(data);
                }
                break;
            }
            case 'reloading': {
                const data = res.data();
                if (data !== undefined) {
                    content = handlers.reloading?.(data) ?? handlers.success?.(data);
                }
                break;
            }
            }
        });
        childDispose = disposeContent;

        // TS does not track the assignments made inside the collectDisposers closure
        const resolved = content as Node | DocumentFragment | null | undefined;
        if (resolved) {
            const nodes = resolved instanceof DocumentFragment
                ? Array.from(resolved.childNodes)
                : [resolved];
            for (const n of nodes) parent.insertBefore(n, end);
            currentNodes = nodes;
        }

        return () => { childDispose?.(); childDispose = null; };
    });

    return frag;
}
