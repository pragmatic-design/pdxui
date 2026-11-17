// Promise ↔ Signal bridge — seamless async/signal interop.

import { signal, effect } from './signal';
import type { ReadonlySignal, Dispose } from '../utils/types';
import { createAsyncCell, readAsyncCell, type AsyncStatus } from './async-operators';
import type { AsyncState } from './resource';

// ─── Types ─────────────────────────────────────────────────────────

/** A promise as a signal, in the beta's async vocabulary (#141, #1169). */
export interface PromiseSignal<T> extends ReadonlySignal<T | undefined> {
    /** The resolved value, `undefined` until it resolves (or the initial value given). */
    data: ReadonlySignal<T | undefined>;
    /** The rejection, `null` until there is one. */
    error: ReadonlySignal<Error | null>;
    /** `'pending'` until the promise settles, then `'success'` or `'error'`. */
    state: ReadonlySignal<AsyncState>;
    /** The promise has not settled. */
    pending: ReadonlySignal<boolean>;
    /** @deprecated `state()`, in the alpha words: `'loading'` while it is pending. Removed in the next release. */
    status: ReadonlySignal<AsyncStatus>;
    /** @deprecated `state() === 'pending'`. Removed in the next release. */
    loading: ReadonlySignal<boolean>;
}

// ─── fromPromise() ──────────────────────────────────────────────

/**
 * Convert a Promise into a reactive signal that speaks the async vocabulary.
 *
 * Usage:
 *   const user = fromPromise(fetchUser(42));
 *   effect(() => {
 *     if (user.state() === 'pending') showSpinner();
 *     else if (user.error()) showError(user.error());
 *     else renderUser(user.data());
 *   });
 */
export function fromPromise<T>(
    promise: Promise<T>,
    initialValue?: T,
): PromiseSignal<T> {
    const cell = createAsyncCell<T>(initialValue);
    // A promise is a request that has already started; an initial value is shown, not data, so
    // the state is 'pending' whatever it is.
    cell._pending.set(true);
    cell._state.set('pending');

    promise.then((result) => cell.succeed(result), (err) => cell.fail(err));

    return readAsyncCell<T, PromiseSignal<T>>(cell);
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
