// Explicit Watcher — observe signal changes with old/new value tracking.
// Unlike effect (auto-track), watch explicitly declares what to observe.

import { effect } from './signal';
import type { Signal, ReadonlySignal, Dispose } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────────

type WatchSource<T> = Signal<T> | ReadonlySignal<T> | (() => T);

export interface WatchOptions {
    /** Run callback immediately with current value. Default: false. */
    immediate?: boolean;
    /** Auto-dispose after first change. Default: false. */
    once?: boolean;
    /** A name for the inspector, passed to the effect behind the watch. */
    name?: string;
}

// ─── watch() ──────────────────────────────────────────────────────

/**
 * Watch a single reactive source and call back on changes.
 *
 * Usage:
 *   watch(count, (newVal, oldVal) => console.log('changed'));
 *   watch(() => state.filter, (val) => refetch(val), { immediate: true });
 */
export function watch<T>(
    source: WatchSource<T>,
    callback: (newValue: T, oldValue: T) => void,
    options?: WatchOptions
): Dispose;

/**
 * Watch multiple reactive sources.
 *
 * Usage:
 *   watch([count, name], ([c, n], [oldC, oldN]) => { ... });
 */
export function watch<T extends readonly unknown[]>(
    sources: { [K in keyof T]: WatchSource<T[K]> },
    callback: (newValues: T, oldValues: T) => void,
    options?: WatchOptions
): Dispose;

// Implementation
export function watch(
    source: WatchSource<unknown> | WatchSource<unknown>[],
    callback: (newValue: unknown, oldValue: unknown) => void,
    options?: WatchOptions
): Dispose {
    const isMulti = Array.isArray(source);
    const sources = isMulti ? source : [source];

    // Read a source value (signal or getter function)
    function read(s: WatchSource<unknown>): unknown {
        return typeof s === 'function' && !('set' in s) ? s() : (s as Signal<unknown>)();
    }

    // Read without tracking (for initial oldValue)
    function peek(s: WatchSource<unknown>): unknown {
        if (typeof s === 'function' && 'peek' in s) return (s as Signal<unknown>).peek();
        // For plain getters, just call — we'll track in the effect anyway
        return typeof s === 'function' ? s() : s;
    }

    let oldValues = sources.map(peek);
    let disposed = false;

    if (options?.immediate) {
        const currentValues = [...oldValues];
        if (isMulti) {
            callback(currentValues, currentValues);
        } else {
            callback(currentValues[0], currentValues[0]);
        }
    }

    const dispose = effect(() => {
        // Read all sources inside effect to track dependencies
        const newValues = sources.map(read);

        // Check if any value changed
        let changed = false;
        for (let i = 0; i < newValues.length; i++) {
            if (!Object.is(newValues[i], oldValues[i])) {
                changed = true;
                break;
            }
        }

        if (changed && !disposed) {
            const prev = [...oldValues];
            oldValues = [...newValues];

            if (isMulti) {
                callback(newValues, prev);
            } else {
                callback(newValues[0], prev[0]);
            }

            if (options?.once) {
                disposed = true;
                dispose();
            }
        }
    }, options?.name ? { name: options.name } : undefined);

    return dispose;
}
