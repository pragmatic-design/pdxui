// useQuery — high-level data fetching primitive.
// Semantic wrapper over resource() for common CRUD patterns.
// Inspired by TanStack Query, but signal-native.

import { resource } from './resource';
import { computed, onDispose } from './signal';
import type { ResourceOptions } from './resource';
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
     * Paused while the tab is hidden (unless `refetchOnFocus` is off, which would leave nothing to
     * catch up on return), and a tick is skipped while the previous refetch is still in flight.
     */
    refetchInterval?: number;
    /** Callbacks. */
    onSuccess?: (data: T) => void;
    onError?: (error: unknown) => void;
}

export interface QueryResult<T> {
    /** Current data. */
    data: ReadonlySignal<T | undefined>;
    /** Whether loading (first load or refetch). */
    isLoading: ReadonlySignal<boolean>;
    /** Error if fetch failed. */
    error: ReadonlySignal<unknown>;
    /** Whether data exists (even stale). */
    hasData: ReadonlySignal<boolean>;
    /** Whether data is stale. */
    isStale: ReadonlySignal<boolean>;
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
 *     () => fetch(`/api/users?page=${page()}`).then(r => r.json()),
 *     { key: () => `users:${page()}`, staleTime: 60_000, refetchOnFocus: true },
 *   );
 *   users.data();      // the value, or undefined
 *   users.isLoading(); // reactive
 *
 * A wrapper over {@link resource}: same cache, same `key`, same `tags`. What it adds is the
 * refetching a screen left open needs — on focus, on reconnect, on an interval — and `mutate()` for
 * an optimistic write. `@fetch` is the declarative form of the same job over the framework's HTTP
 * client; reach for `useQuery` when the fetcher is your own promise.
 */
export function useQuery<T>(
    queryFn: () => Promise<T>,
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

    // Auto-refetch on focus
    let focusHandler: (() => void) | null = null;
    if (opts.refetchOnFocus !== false && typeof document !== 'undefined') {
        focusHandler = () => {
            if (document.visibilityState === 'visible') res.refetch();
        };
        document.addEventListener('visibilitychange', focusHandler);
    }

    // Auto-refetch on reconnect
    let onlineHandler: (() => void) | null = null;
    if (opts.refetchOnReconnect !== false && typeof window !== 'undefined') {
        onlineHandler = () => res.refetch();
        window.addEventListener('online', onlineHandler);
    }

    // Polling interval
    //
    // Two rules beyond a plain timer:
    //
    //   - a tick that arrives while the previous refetch is STILL IN FLIGHT is skipped. "Poll every
    //     second" means asking every second, not starting a request every second whatever became of
    //     the last one — at a 1s interval against a 3s endpoint, every tick would start a fetch and
    //     abort the bookkeeping of the one before it, so none of them would ever be the one whose
    //     result got used;
    //   - a HIDDEN TAB is not polled. This is free rather than a trade-off, because `refetchOnFocus`
    //     is on by default and refetches the moment the tab comes back: same freshness on return,
    //     none of the requests in between. The exception is an app that turned `refetchOnFocus` off
    //     — it has no catch-up, so for that app the interval keeps running hidden.
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let pollInFlight = false;
    const pauseWhileHidden = focusHandler !== null;
    if (opts.refetchInterval && opts.refetchInterval > 0) {
        intervalId = setInterval(() => {
            if (pollInFlight) return;
            if (pauseWhileHidden && document.visibilityState === 'hidden') return;
            pollInFlight = true;
            void res.refetch().finally(() => { pollInFlight = false; });
        }, opts.refetchInterval);
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
        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
        }
    };
    onDispose(dispose);

    return {
        data: res.data,
        isLoading: res.loading,
        error: res.error,
        hasData: computed(() => res.status().hasData),
        isStale: computed(() => res.status().isStale),
        refetch: () => res.refetch(),
        mutate: (value: T) => res.mutate(value),
        dispose,
    };
}
