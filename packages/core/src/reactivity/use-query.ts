// useQuery — high-level data fetching primitive.
// Semantic wrapper over resource() for common CRUD patterns.
// Inspired by TanStack Query, but signal-native.

import { resource } from './resource';
import { onDispose, currentScope, isScopeSuspended, onScopeSuspension } from './signal';
import { getDefaultCache, requestInFlight } from './cache';
import type { ResourceOptions, ResourceFetcher, AsyncState } from './resource';
import type { ReadonlySignal } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────────

export interface UseQueryOptions<T> {
    /** Cache key or reactive key function. */
    key: string | (() => string);
    /** How long data stays fresh (ms). Default: 30_000. */
    staleTime?: number;
    /** Max retry on error. Default: 3. */
    retry?: number;
    /** Tags for cache invalidation. */
    tags?: string[];
    /** Disable until condition is met (dependent queries). */
    enabled?: boolean | (() => boolean);
    /** Transform response. */
    transform?: (raw: unknown) => T;
    /** Refetch when window regains focus. Default: true. */
    refetchOnFocus?: boolean;
    /** Refetch when network reconnects. Default: true. */
    refetchOnReconnect?: boolean;
    /**
     * Refetch interval in ms. 0 = disabled. Default: 0.
     *
     * Paused while the tab is hidden, whatever `refetchOnFocus` says, and a tick is skipped while a
     * request for the key is in flight — as the focus and reconnect refetches are.
     */
    refetchInterval?: number;
    /** Callbacks. */
    onSuccess?: (data: T) => void;
    onError?: (error: unknown) => void;
}

/** A query's state, in the async vocabulary every source shares (beta spec, data.md, #141). */
export interface QueryResult<T> {
    /** The last successful value; `undefined` until there is one. */
    data: ReadonlySignal<T | undefined>;
    /** The last error; cleared only by the next success. */
    error: ReadonlySignal<Error | null>;
    /** `'idle' | 'pending' | 'success' | 'error'`. */
    state: ReadonlySignal<AsyncState>;
    /** Whether a request is in flight: first load, refresh, retry. */
    pending: ReadonlySignal<boolean>;
    /** Whether the value shown is no longer known to be current. */
    stale: ReadonlySignal<boolean>;
    /** Re-fetch manually. */
    refetch(): Promise<void>;
    /** Optimistically set data. */
    mutate(value: T): void;
    /** Cleanup. */
    dispose(): void;
}

// ─── useQuery() ────────────────────────────────────────────────────

/**
 * Declarative data fetching with caching, retry, and auto-refetch.
 *
 * The query function comes FIRST, as an argument of its own — the options object does not carry it.
 * (A single object with `queryFn` inside it is not the signature and cannot work: the object would
 * be called as the fetcher.)
 *
 * Usage:
 *   const users = useQuery(
 *     ({ signal }) => fetch(`/api/users?page=${page()}`, { signal }).then(r => r.json()),
 *     { key: () => `users:${page()}`, staleTime: 60_000, refetchOnFocus: true },
 *   );
 *   users.data();      // the value, or undefined
 *   users.pending();   // a request in flight, reactive
 *
 * A wrapper over {@link resource}: same cache, same `key`, same `tags`. What it adds is the
 * refetching a screen left open needs — on focus, on reconnect, on an interval — and `mutate()` for
 * an optimistic write. `@fetch` is the declarative form of the same job over the framework's HTTP
 * client; reach for `useQuery` when the fetcher is your own promise.
 */
export function useQuery<T>(
    queryFn: ResourceFetcher<T>,
    options?: UseQueryOptions<T>,
): QueryResult<T> {
    const opts = options ?? {} as UseQueryOptions<T>;

    // Build resource options
    const resourceOpts: ResourceOptions<T> = {
        key: opts.key,
        staleTime: opts.staleTime ?? 30_000,
        retry: opts.retry ?? 3,
        tags: opts.tags,
        enabled: opts.enabled,
        transform: opts.transform,
        onSuccess: opts.onSuccess,
        onError: opts.onError,
    };

    const res = resource(queryFn, resourceOpts);

    // The three triggers — focus, reconnect, polling — never start a request while one is in flight
    // (beta spec, data.md, «Polling and refetch on focus / reconnect»; #259). A refetch supersedes the
    // request in flight for every reader of the key (#258): coming back to the tab during a slow
    // first load would abort it and start it again, and a polling tick against a slower endpoint
    // would start a request every period, none of them ever the one whose result got used.
    // In flight for the KEY, from the cache's registry of shared requests: not `pending()`, which is
    // this reader's own, and blind to another reader's request.
    const cache = getDefaultCache();
    // A frozen page starts no request (#269): focus and reconnect do nothing while it is frozen, and
    // the polling pauses. A value that went stale meanwhile is refreshed on resume, by the resource.
    const scope = currentScope();
    const refreshUnlessPending = (): void => {
        if (isScopeSuspended(scope)) return;
        if (requestInFlight(cache, res.key)) return;
        void res.refetch();
    };

    // Auto-refetch on focus
    let focusHandler: (() => void) | null = null;
    if (opts.refetchOnFocus !== false && typeof document !== 'undefined') {
        focusHandler = () => {
            if (document.visibilityState === 'visible') refreshUnlessPending();
        };
        document.addEventListener('visibilitychange', focusHandler);
    }

    // Auto-refetch on reconnect
    let onlineHandler: (() => void) | null = null;
    if (opts.refetchOnReconnect !== false && typeof window !== 'undefined') {
        onlineHandler = refreshUnlessPending;
        window.addEventListener('online', onlineHandler);
    }

    // Polling interval. A tick skips while a request is in flight, like the other triggers, and a
    // HIDDEN TAB is not polled, whatever `refetchOnFocus` says: with the focus refetch on (the
    // default) the tab is refreshed the moment it comes back; with it off, on the next tick after.
    // Either way a tab nobody looks at makes no requests.
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let removeSuspension: (() => void) | null = null;
    const period = opts.refetchInterval ?? 0;
    const startPolling = (): void => {
        intervalId = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            refreshUnlessPending();
        }, period);
    };
    const stopPolling = (): void => {
        if (intervalId !== null) clearInterval(intervalId);
        intervalId = null;
    };
    if (period > 0) {
        if (!isScopeSuspended(scope)) startPolling();
        if (scope) removeSuspension = onScopeSuspension(scope, stopPolling, () => { if (intervalId === null) startPolling(); });
    }

    // A query's teardown belongs to whatever created it.
    //
    // `dispose()` cleared all three handles, and nothing called it: a component's `setup()` runs
    // inside `collectDisposers` (`component/element.ts:211`) and that scope is the only teardown it
    // gets for free. So a query made in a component and not explicitly disposed left a
    // `setInterval` running for the life of the tab — a request every N seconds against a screen
    // that is gone — plus a `visibilitychange` and an `online` listener, each refetching the same
    // dead resource. `onDispose` is a no-op outside a scope, so a query created at module level is
    // unaffected and still has to be disposed by hand.
    const dispose = (): void => {
        res.dispose();
        if (focusHandler) {
            document.removeEventListener('visibilitychange', focusHandler);
            focusHandler = null;
        }
        if (onlineHandler) {
            window.removeEventListener('online', onlineHandler);
            onlineHandler = null;
        }
        stopPolling();
        removeSuspension?.();
        removeSuspension = null;
    };
    onDispose(dispose);

    return {
        data: res.data,
        error: res.error,
        state: res.state,
        pending: res.pending,
        stale: res.stale,
        refetch: () => res.refetch(),
        mutate: (value: T) => res.mutate(value),
        dispose,
    };
}
