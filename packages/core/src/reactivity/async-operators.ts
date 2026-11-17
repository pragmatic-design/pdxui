// Async signal operators — the patterns that make RxJS indispensable, as signals.
// switchSignal (cancel previous), exhaustSignal (ignore while busy), retrySignal.

import { signal, computed, effect, batch } from './signal';
import type { ReadonlySignal, Dispose } from '../utils/types';
import type { AsyncState } from './resource';

// ─── Types ─────────────────────────────────────────────────────────

/** @deprecated The alpha status words; read {@link AsyncSignal.state} (#1169). Removed in the next release. */
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * A signal of an async value that speaks the beta's async vocabulary (#141, #1169), as a resource,
 * `useQuery`, a mutation and a loader do: call it, or `data()`, for the last successful value.
 */
export interface AsyncSignal<T> extends ReadonlySignal<T | undefined> {
    /** The last successful value, `undefined` until there is one. */
    data: ReadonlySignal<T | undefined>;
    /** The last error, `null` when there is none; only a success clears it. */
    error: ReadonlySignal<Error | null>;
    /**
     * `'pending'` while a first request runs with no data, `'success'` or `'error'` once one has
     * settled; a later request leaves it where it was, with {@link pending} true.
     */
    state: ReadonlySignal<AsyncState>;
    /** A request is in flight, first load or refresh. */
    pending: ReadonlySignal<boolean>;
    /** @deprecated `state()`, in the alpha words: `'loading'` for a request with no data yet. Removed in the next release. */
    status: ReadonlySignal<AsyncStatus>;
    /** @deprecated `state() === 'pending'`, a request with no data yet. Removed in the next release. */
    loading: ReadonlySignal<boolean>;
    /** Dispose the signal and cancel any in-flight request. */
    dispose: Dispose;
}

export interface RetryOptions {
    /** Max number of retries. Default: 3. */
    maxRetries?: number;
    /** Backoff strategy. Default: 'exponential'. */
    backoff?: 'fixed' | 'linear' | 'exponential';
    /** Base delay in ms. Default: 1000. */
    delayMs?: number;
    /** Optional retry predicate — return false to stop retrying. */
    shouldRetry?: (error: unknown, attempt: number) => boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * The state behind an async signal, and its three transitions, as resource() makes them: a request
 * starting is pending, and `'pending'` only with no data yet; a success sets the data and clears the
 * error; a failure sets the error and keeps the data.
 */
export interface AsyncCell<T> {
    readonly _value: ReturnType<typeof signal<T | undefined>>;
    readonly _state: ReturnType<typeof signal<AsyncState>>;
    readonly _pending: ReturnType<typeof signal<boolean>>;
    readonly _error: ReturnType<typeof signal<Error | null>>;
    start(): void;
    succeed(value: T): void;
    fail(err: unknown): void;
}

/** A failure as an `Error`: a rejection with anything else is wrapped, its value kept as the cause. */
function asError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err), { cause: err });
}

/** The state of an async signal, `initialValue` its data until a request settles. */
export function createAsyncCell<T>(initialValue: T | undefined): AsyncCell<T> {
    const _value = signal<T | undefined>(initialValue);
    const _state = signal<AsyncState>('idle');
    const _pending = signal(false);
    const _error = signal<Error | null>(null);
    return {
        _value, _state, _pending, _error,
        start: () => batch(() => {
            _pending.set(true);
            if (_value.peek() === undefined) _state.set('pending');
        }),
        succeed: (value) => batch(() => {
            _value.set(value as never);
            _error.set(null);
            _pending.set(false);
            _state.set('success');
        }),
        fail: (err) => batch(() => {
            _error.set(asError(err));
            _pending.set(false);
            _state.set('error');
        }),
    };
}

/**
 * The async vocabulary over a cell: the readable signal, its members, and the deprecated alpha
 * names computed from them.
 */
export function readAsyncCell<T, S extends ReadonlySignal<T | undefined>>(cell: AsyncCell<T>): S & {
    data: ReadonlySignal<T | undefined>; error: ReadonlySignal<Error | null>; state: ReadonlySignal<AsyncState>;
    pending: ReadonlySignal<boolean>; status: ReadonlySignal<AsyncStatus>; loading: ReadonlySignal<boolean>;
} {
    const { _value, _state, _pending, _error } = cell;
    const readable = (() => _value()) as S & AsyncSignal<T>;
    readable.peek = () => _value.peek();
    readable.data = computed(() => _value());
    readable.error = computed(() => _error());
    readable.state = computed(() => _state());
    readable.pending = computed(() => _pending());
    readable.status = computed(() => { const s = _state(); return s === 'pending' ? 'loading' : s; });
    readable.loading = computed(() => _state() === 'pending');
    return readable;
}

function wrapAsync<T>(cell: AsyncCell<T>, disposeFn: Dispose): AsyncSignal<T> {
    const readable = readAsyncCell<T, AsyncSignal<T>>(cell);
    readable.dispose = disposeFn;
    return readable;
}

function computeDelay(attempt: number, opts: RetryOptions): number {
    const base = opts.delayMs ?? 1000;
    switch (opts.backoff ?? 'exponential') {
        case 'fixed': return base;
        case 'linear': return base * (attempt + 1);
        case 'exponential': return base * Math.pow(2, attempt);
    }
}

// ─── switchSignal() ─────────────────────────────────────────────

/**
 * Cancel the previous async operation when the source changes.
 * The RxJS switchMap equivalent — the most useful async pattern.
 *
 * Usage:
 *   const results = switchSignal(
 *     () => searchQuery(),
 *     (query) => fetch(`/api/search?q=${query}`).then(r => r.json())
 *   );
 *   effect(() => {
 *     if (results.state() === 'pending') showSpinner();
 *     else renderResults(results.data());
 *   });
 */
export function switchSignal<S, T>(
    source: () => S,
    fetcher: (value: S, signal: AbortSignal) => Promise<T>,
): AsyncSignal<T> {
    const cell = createAsyncCell<T>(undefined);
    let abortCtrl: AbortController | null = null;
    let version = 0;

    const dispose = effect(() => {
        const sourceVal = source();

        // Cancel previous
        if (abortCtrl) abortCtrl.abort();
        abortCtrl = new AbortController();
        const myVersion = ++version;
        const myAbort = abortCtrl;

        cell.start();

        fetcher(sourceVal, myAbort.signal)
            .then((result) => {
                // Only apply if still the latest version
                if (myVersion === version) cell.succeed(result);
            })
            .catch((err) => {
                if (myVersion === version && !myAbort.signal.aborted) cell.fail(err);
            });
    });

    return wrapAsync<T>(cell, () => {
        dispose();
        if (abortCtrl) abortCtrl.abort();
    });
}

// ─── exhaustSignal() ────────────────────────────────────────────

/**
 * Ignore new triggers while the current operation is still running.
 * The RxJS exhaustMap equivalent — perfect for form submit anti-double-click.
 *
 * Usage:
 *   const submitResult = exhaustSignal(
 *     () => submitTrigger(),
 *     () => fetch('/api/submit', { method: 'POST', body })
 *   );
 */
export function exhaustSignal<S, T>(
    source: () => S,
    fetcher: (value: S, signal: AbortSignal) => Promise<T>,
): AsyncSignal<T> {
    const cell = createAsyncCell<T>(undefined);
    let busy = false;
    let abortCtrl: AbortController | null = null;
    let disposed = false;

    const dispose = effect(() => {
        const sourceVal = source();

        // Ignore if already running
        if (busy) return;
        busy = true;

        const myAbort = new AbortController();
        abortCtrl = myAbort;
        cell.start();

        fetcher(sourceVal, myAbort.signal)
            .then((result) => {
                // Drop the result if disposed/aborted in the meantime (align with switchSignal).
                if (disposed || myAbort.signal.aborted) return;
                cell.succeed(result);
            })
            .catch((err) => {
                if (disposed || myAbort.signal.aborted) return;
                cell.fail(err);
            })
            .finally(() => { busy = false; });
    });

    return wrapAsync<T>(cell, () => {
        disposed = true;
        dispose();
        if (abortCtrl) abortCtrl.abort();
    });
}

// ─── retrySignal() ──────────────────────────────────────────────

/**
 * Retry a failing async operation with configurable backoff.
 *
 * Usage:
 *   const data = retrySignal(
 *     () => fetch('/api/data').then(r => r.json()),
 *     { maxRetries: 3, backoff: 'exponential', delayMs: 1000 }
 *   );
 */
export function retrySignal<T>(
    fetcher: (signal: AbortSignal) => Promise<T>,
    options?: RetryOptions,
): AsyncSignal<T> & { retry: () => void } {
    const opts: RetryOptions = { maxRetries: 3, backoff: 'exponential', delayMs: 1000, ...options };
    const cell = createAsyncCell<T>(undefined);
    let abortCtrl: AbortController | null = null;
    let disposed = false;

    async function attempt(): Promise<void> {
        if (disposed) return;
        abortCtrl = new AbortController();
        // The retries are part of one request: pending stays true while they wait or run.
        cell.start();

        for (let i = 0; i <= (opts.maxRetries ?? 3); i++) {
            if (disposed || abortCtrl.signal.aborted) return;

            try {
                const result = await fetcher(abortCtrl.signal);
                if (!disposed) cell.succeed(result);
                return;
            } catch (err) {
                if (disposed || abortCtrl.signal.aborted) return;

                const shouldRetry = opts.shouldRetry ? opts.shouldRetry(err, i) : true;
                if (i < (opts.maxRetries ?? 3) && shouldRetry) {
                    const delay = computeDelay(i, opts);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }

                cell.fail(err);
                return;
            }
        }
    }

    // Start immediately
    attempt();

    const base = wrapAsync<T>(cell, () => {
        disposed = true;
        if (abortCtrl) abortCtrl.abort();
    });

    // Add manual retry method
    const extended = base as AsyncSignal<T> & { retry: () => void };
    extended.retry = () => { attempt(); };
    return extended;
}

// ─── concatSignal() ─────────────────────────────────────────────

/**
 * Queue async operations — each waits for the previous to complete.
 * The RxJS concatMap equivalent.
 *
 * Usage:
 *   const saveResult = concatSignal(
 *     () => saveTriggered(),
 *     (data) => fetch('/api/save', { method: 'POST', body: JSON.stringify(data) })
 *   );
 */
export function concatSignal<S, T>(
    source: () => S,
    fetcher: (value: S, signal: AbortSignal) => Promise<T>,
): AsyncSignal<T> {
    const cell = createAsyncCell<T>(undefined);
    let queue: S[] = [];
    let processing = false;
    let abortCtrl: AbortController | null = null;
    let disposed = false;

    async function processQueue(): Promise<void> {
        if (processing || disposed) return;
        processing = true;

        while (queue.length > 0 && !disposed) {
            const val = queue.shift()!;
            abortCtrl = new AbortController();
            cell.start();

            const myAbort = abortCtrl;
            try {
                const result = await fetcher(val, myAbort.signal);
                // Drop the result if disposed/aborted in the meantime (align with switchSignal).
                if (!disposed && !myAbort.signal.aborted) cell.succeed(result);
            } catch (err) {
                if (!disposed && !myAbort.signal.aborted) cell.fail(err);
            }
        }

        processing = false;
    }

    const dispose = effect(() => {
        const val = source();
        queue.push(val);
        processQueue();
    });

    return wrapAsync<T>(cell, () => {
        disposed = true;
        dispose();
        if (abortCtrl) abortCtrl.abort();
        queue = [];
    });
}
