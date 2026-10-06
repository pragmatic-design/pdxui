// Async signal operators — the patterns that make RxJS indispensable, as signals.
// switchSignal (cancel previous), exhaustSignal (ignore while busy), retrySignal.

import { signal, computed, effect } from './signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────────

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncSignal<T> extends ReadonlySignal<T | undefined> {
    /** Current async status. */
    status: ReadonlySignal<AsyncStatus>;
    /** Loading flag (convenience). */
    loading: ReadonlySignal<boolean>;
    /** Error if last fetch failed. */
    error: ReadonlySignal<unknown>;
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

function createAsyncSignal<T>(initialValue: T | undefined): {
    _value: ReturnType<typeof signal<T | undefined>>;
    _status: ReturnType<typeof signal<AsyncStatus>>;
    _error: ReturnType<typeof signal<unknown>>;
} {
    return {
        _value: signal<T | undefined>(initialValue),
        _status: signal<AsyncStatus>('idle'),
        _error: signal<unknown>(null),
    };
}

function wrapAsync<T>(
    _value: ReturnType<typeof signal<T | undefined>>,
    _status: ReturnType<typeof signal<AsyncStatus>>,
    _error: ReturnType<typeof signal<unknown>>,
    disposeFn: Dispose,
): AsyncSignal<T> {
    const readable = (() => _value()) as AsyncSignal<T>;
    readable.peek = () => _value.peek();
    readable.status = computed(() => _status());
    readable.loading = computed(() => _status() === 'loading');
    readable.error = computed(() => _error());
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
 *     if (results.loading()) showSpinner();
 *     else renderResults(results());
 *   });
 */
export function switchSignal<S, T>(
    source: () => S,
    fetcher: (value: S, signal: AbortSignal) => Promise<T>,
): AsyncSignal<T> {
    const { _value, _status, _error } = createAsyncSignal<T>(undefined);
    let abortCtrl: AbortController | null = null;
    let version = 0;

    const dispose = effect(() => {
        const sourceVal = source();

        // Cancel previous
        if (abortCtrl) abortCtrl.abort();
        abortCtrl = new AbortController();
        const myVersion = ++version;
        const myAbort = abortCtrl;

        _status.set('loading' as never);
        _error.set(null as never);

        fetcher(sourceVal, myAbort.signal)
            .then((result) => {
                // Only apply if still the latest version
                if (myVersion === version) {
                    _value.set(result as never);
                    _status.set('success' as never);
                }
            })
            .catch((err) => {
                if (myVersion === version && !myAbort.signal.aborted) {
                    _error.set(err as never);
                    _status.set('error' as never);
                }
            });
    });

    return wrapAsync<T>(_value, _status, _error, () => {
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
    const { _value, _status, _error } = createAsyncSignal<T>(undefined);
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
        _status.set('loading' as never);
        _error.set(null as never);

        fetcher(sourceVal, myAbort.signal)
            .then((result) => {
                // Drop the result if disposed/aborted in the meantime (align with switchSignal).
                if (disposed || myAbort.signal.aborted) return;
                _value.set(result as never);
                _status.set('success' as never);
            })
            .catch((err) => {
                if (disposed || myAbort.signal.aborted) return;
                _error.set(err as never);
                _status.set('error' as never);
            })
            .finally(() => { busy = false; });
    });

    return wrapAsync<T>(_value, _status, _error, () => {
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
    const { _value, _status, _error } = createAsyncSignal<T>(undefined);
    let abortCtrl: AbortController | null = null;
    let disposed = false;

    async function attempt(): Promise<void> {
        if (disposed) return;
        abortCtrl = new AbortController();
        _status.set('loading' as never);
        _error.set(null as never);

        for (let i = 0; i <= (opts.maxRetries ?? 3); i++) {
            if (disposed || abortCtrl.signal.aborted) return;

            try {
                const result = await fetcher(abortCtrl.signal);
                if (!disposed) {
                    _value.set(result as never);
                    _status.set('success' as never);
                }
                return;
            } catch (err) {
                if (disposed || abortCtrl.signal.aborted) return;

                const shouldRetry = opts.shouldRetry ? opts.shouldRetry(err, i) : true;
                if (i < (opts.maxRetries ?? 3) && shouldRetry) {
                    const delay = computeDelay(i, opts);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }

                _error.set(err as never);
                _status.set('error' as never);
                return;
            }
        }
    }

    // Start immediately
    attempt();

    const base = wrapAsync<T>(_value, _status, _error, () => {
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
    const { _value, _status, _error } = createAsyncSignal<T>(undefined);
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
            _status.set('loading' as never);

            const myAbort = abortCtrl;
            try {
                const result = await fetcher(val, myAbort.signal);
                // Drop the result if disposed/aborted in the meantime (align with switchSignal).
                if (!disposed && !myAbort.signal.aborted) {
                    _value.set(result as never);
                    _status.set('success' as never);
                }
            } catch (err) {
                if (!disposed && !myAbort.signal.aborted) {
                    _error.set(err as never);
                    _status.set('error' as never);
                }
            }
        }

        processing = false;
    }

    const dispose = effect(() => {
        const val = source();
        queue.push(val);
        processQueue();
    });

    return wrapAsync<T>(_value, _status, _error, () => {
        disposed = true;
        dispose();
        if (abortCtrl) abortCtrl.abort();
        queue = [];
    });
}
