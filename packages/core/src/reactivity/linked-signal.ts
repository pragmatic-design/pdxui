// Writable derived signal — recomputes when source changes, but allows manual override.
//
// Fills the gap between computed (read-only derived) and signal (independent writable).
// Inspired by Angular's linkedSignal — unique in WC frameworks.
//
// Use cases:
//   - Pagination that resets on filter change: page = linkedSignal({ source: category, ... })
//   - Form default from server data: name = linkedSignal(() => serverUser.data()?.name ?? '')
//   - Selection that follows list: selected = linkedSignal({ source: items, computation: ... })
//
// Performance:
//   - Uses a single effect for tracking — no extra computed or watch
//   - Object.is comparison to avoid unnecessary signal writes

import { signal, effect } from './signal';
import type { Signal } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────────

export interface LinkedSignalOptions<S, T> {
    /** Reactive source expression — tracked for changes. */
    source: () => S;
    /** Compute the linked value. Receives source and optional previous state. */
    computation: (sourceValue: S, previous?: LinkedSignalPrevious<S, T>) => T;
}

export interface LinkedSignalPrevious<S, T> {
    /** Previous source value (before this change). */
    readonly source: S;
    /** Previous linked signal value (before recomputation). */
    readonly value: T;
}

// ─── linkedSignal() ────────────────────────────────────────────────

/** Create a writable derived signal.
 *  Full form: source + computation with previous state access. */
export function linkedSignal<S, T>(options: LinkedSignalOptions<S, T>): Signal<T>;

/** Create a writable derived signal.
 *  Shorthand: computation IS the source. Value recomputes on any dependency change. */
export function linkedSignal<T>(computation: () => T): Signal<T>;

export function linkedSignal<S, T>(
    optionsOrFn: LinkedSignalOptions<S, T> | (() => T),
): Signal<T> {
    // Normalize overloads
    const isShorthand = typeof optionsOrFn === 'function';
    const sourceFn = isShorthand
        ? optionsOrFn as unknown as () => S
        : (optionsOrFn as LinkedSignalOptions<S, T>).source;
    const computationFn = isShorthand
        ? ((_v: S) => _v) as unknown as (s: S, p?: LinkedSignalPrevious<S, T>) => T
        : (optionsOrFn as LinkedSignalOptions<S, T>).computation;

    // Evaluate initial value
    let prevSource: S = sourceFn();
    const initialValue = computationFn(prevSource, undefined);
    const inner = signal<T>(initialValue);

    // Track source changes — recompute when source changes
    let isFirst = true;
    effect(() => {
        const currentSource = sourceFn();

        // Skip first run (already computed initial value above)
        if (isFirst) {
            isFirst = false;
            return;
        }

        // Only recompute if source actually changed
        if (!Object.is(currentSource, prevSource)) {
            const prev: LinkedSignalPrevious<S, T> = {
                source: prevSource,
                value: inner.peek(),
            };
            prevSource = currentSource;

            const newValue = computationFn(currentSource, prev);
            // Avoid unnecessary signal writes
            if (!Object.is(newValue, inner.peek())) {
                inner.set(newValue);
            }
        }
    });

    return inner;
}
