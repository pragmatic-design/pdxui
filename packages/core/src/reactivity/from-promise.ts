// Promise ↔ Signal bridge — seamless async/signal interop.

import { signal, computed, effect } from './signal';
import type { ReadonlySignal, Dispose } from '../utils/types';
import type { AsyncStatus } from './async-operators';

// ─── Types ─────────────────────────────────────────────────────────

export interface PromiseSignal<T> extends ReadonlySignal<T | undefined> {
    status: ReadonlySignal<AsyncStatus>;
    loading: ReadonlySignal<boolean>;
    error: ReadonlySignal<unknown>;
}

// ─── fromPromise() ──────────────────────────────────────────────

/**
 * Convert a Promise into a reactive signal with loading/error states.
 *
 * Usage:
 *   const user = fromPromise(fetchUser(42));
 *   effect(() => {
 *     if (user.loading()) showSpinner();
 *     else if (user.error()) showError(user.error());
 *     else renderUser(user());
 *   });
 */
export function fromPromise<T>(
    promise: Promise<T>,
    initialValue?: T,
): PromiseSignal<T> {
    const _value = signal<T | undefined>(initialValue);
    const _status = signal<AsyncStatus>('loading');
    const _error = signal<unknown>(null);

    promise
        .then((result) => {
            _value.set(result as never);
            _status.set('success' as never);
        })
        .catch((err) => {
            _error.set(err as never);
            _status.set('error' as never);
        });

    const readable = (() => _value()) as PromiseSignal<T>;
    readable.peek = () => _value.peek();
    readable.status = computed(() => _status());
    readable.loading = computed(() => _status() === 'loading');
    readable.error = computed(() => _error());
    return readable;
}

// ─── fromCallback() ─────────────────────────────────────────────

/**
 * Convert a callback-based API into a signal.
 * Useful for third-party APIs that use callbacks.
 *
 * Usage:
 *   const position = fromCallback<GeolocationPosition>((set) => {
 *     const id = navigator.geolocation.watchPosition(set);
 *     return () => navigator.geolocation.clearWatch(id);
 *   });
 */
export function fromCallback<T>(
    setup: (setter: (value: T) => void) => Dispose | void,
    initialValue?: T,
): ReadonlySignal<T | undefined> & { dispose: Dispose } {
    const _value = signal<T | undefined>(initialValue);
    const cleanup = setup((val) => _value.set(val as never));

    const readable = (() => _value()) as ReadonlySignal<T | undefined> & { dispose: Dispose };
    readable.peek = () => _value.peek();
    readable.dispose = () => { if (cleanup) cleanup(); };
    return readable;
}

// ─── toPromise() ─────────────────────────────────────────────────

/**
 * Wait for a signal to match a condition, resolving as a Promise.
 * Bridge from reactive world back to async/await.
 *
 * Usage:
 *   await toPromise(isReady);                     // wait until truthy
 *   await toPromise(count, v => v >= 10);         // wait until count >= 10
 *   const user = await toPromise(userData);       // wait until defined
 */
export function toPromise<T>(
    source: () => T,
    predicate?: (value: T) => boolean,
): Promise<T> {
    const pred = predicate ?? ((v: T) => !!v);

    return new Promise<T>((resolve) => {
        // Check immediately
        const current = source();
        if (pred(current)) {
            resolve(current);
            return;
        }

        // Wait for condition
        const dispose = effect(() => {
            const val = source();
            if (pred(val)) {
                // Defer dispose to avoid modifying effect list during flush
                queueMicrotask(() => dispose());
                resolve(val);
            }
        });
    });
}

// ─── toAsync() ──────────────────────────────────────────────────

/**
 * Convert a signal source into an async iterable.
 * Enables `for await` patterns with signals.
 *
 * Usage:
 *   for await (const value of toAsync(count)) {
 *     console.log('Count changed to:', value);
 *     if (value >= 10) break;
 *   }
 */
export function toAsync<T>(source: () => T): AsyncIterable<T> & { dispose: Dispose } {
    let disposed = false;
    let resolver: ((value: IteratorResult<T>) => void) | null = null;
    const queue: T[] = [];

    const disposeEffect = effect(() => {
        const val = source();
        if (resolver) {
            const r = resolver;
            resolver = null;
            r({ value: val, done: false });
        } else {
            queue.push(val);
        }
    });

    const dispose = () => {
        disposed = true;
        disposeEffect();
        if (resolver) {
            resolver({ value: undefined as T, done: true });
            resolver = null;
        }
    };

    const iterable: AsyncIterable<T> & { dispose: Dispose } = {
        [Symbol.asyncIterator]() {
            return {
                next(): Promise<IteratorResult<T>> {
                    if (disposed) return Promise.resolve({ value: undefined as T, done: true });
                    if (queue.length > 0) {
                        return Promise.resolve({ value: queue.shift()!, done: false });
                    }
                    return new Promise<IteratorResult<T>>((resolve) => { resolver = resolve; });
                },
                return(): Promise<IteratorResult<T>> {
                    dispose();
                    return Promise.resolve({ value: undefined as T, done: true });
                },
            };
        },
        dispose,
    };

    return iterable;
}
