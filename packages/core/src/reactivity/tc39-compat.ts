// TC39 Signals protocol compatibility layer.
// Provides Signal.subtle-compatible wrapper over our signal implementation.
// When the TC39 proposal stabilizes, this enables interop with other frameworks.
// Reference: https://github.com/tc39/proposal-signals

import { signal, computed, effect } from './signal';
import type { Signal, ReadonlySignal } from '../utils/types';

// ─── TC39 Signal.subtle interfaces (Stage 1 draft) ────────────────

/** TC39-compatible state signal (writable). */
export interface TC39State<T> {
    get(): T;
    set(value: T): void;
}

/** TC39-compatible computed signal (read-only derived). */
export interface TC39Computed<T> {
    get(): T;
}

/** TC39-compatible watcher (effect). */
export interface TC39Watcher {
    watch(...signals: TC39Computed<unknown>[]): void;
    unwatch(...signals: TC39Computed<unknown>[]): void;
    getPending(): TC39Computed<unknown>[];
}

// ─── Adapters: Pragmatic → TC39 ────────────────────────────────────

/**
 * Wrap a Pragmatic signal as a TC39-compatible State signal.
 *
 * Usage:
 *   const pdxSig = signal(0);
 *   const tc39Sig = toTC39State(pdxSig);
 *   tc39Sig.get(); // 0
 *   tc39Sig.set(5);
 */
export function toTC39State<T>(sig: Signal<T>): TC39State<T> {
    return {
        get: () => sig(),
        set: (value: T) => sig.set(value),
    };
}

/**
 * Wrap a Pragmatic computed as a TC39-compatible Computed signal.
 */
export function toTC39Computed<T>(comp: ReadonlySignal<T>): TC39Computed<T> {
    return {
        get: () => comp(),
    };
}

// ─── Adapters: TC39 → Pragmatic ────────────────────────────────────

/**
 * Create a Pragmatic signal from a TC39-compatible State signal.
 * Useful for consuming signals from other frameworks.
 */
export function fromTC39State<T>(tc39: TC39State<T>): Signal<T> {
    const sig = signal(tc39.get());

    // Two-way sync: when our signal changes → update TC39
    effect(() => {
        const val = sig();
        tc39.set(val);
    });

    return sig;
}

/**
 * Create a Pragmatic computed from a TC39-compatible Computed signal.
 */
export function fromTC39Computed<T>(tc39: TC39Computed<T>): ReadonlySignal<T> {
    // Wrap as computed that reads from TC39 source
    // Note: without a change notification protocol, this polls on access.
    // When TC39 adds a notification mechanism, this can be made push-based.
    return computed(() => tc39.get());
}
