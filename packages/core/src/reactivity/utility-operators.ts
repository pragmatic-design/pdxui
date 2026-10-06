// Utility signal operators — complete the RxJS-beating ecosystem.
// distinct, previous, scan, pairwise, sample, skipUntil, takeUntil.

import { signal, effect, untracked } from './signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

type DisposableSignal<T> = ReadonlySignal<T> & { dispose: Dispose };

// ─── distinct() ─────────────────────────────────────────────────

/**
 * Skip emissions when value hasn't changed.
 * Like RxJS distinctUntilChanged but as a signal.
 *
 * Usage:
 *   const rounded = distinct(() => Math.round(value()), (a, b) => a === b);
 */
export function distinct<T>(
    source: () => T,
    equals?: (a: T, b: T) => boolean,
): DisposableSignal<T> {
    const eq = equals ?? ((a: T, b: T) => Object.is(a, b));
    const _value = signal<T>(source());

    const dispose = effect(() => {
        const next = source();
        if (!eq(next, _value.peek())) _value.set(next as never);
    });

    const readable = (() => _value()) as DisposableSignal<T>;
    readable.peek = () => _value.peek();
    readable.dispose = dispose;
    return readable;
}

// ─── previous() ─────────────────────────────────────────────────

/**
 * Track the previous value of a signal.
 *
 * Usage:
 *   const prev = previous(count);
 *   effect(() => console.log(`${prev()} → ${count()}`));
 */
export function previous<T>(source: () => T): DisposableSignal<T | undefined> {
    let prevVal: T | undefined = undefined;
    const _value = signal<T | undefined>(undefined);

    const dispose = effect(() => {
        const current = source();
        _value.set(prevVal as never);
        prevVal = current;
    });

    const readable = (() => _value()) as DisposableSignal<T | undefined>;
    readable.peek = () => _value.peek();
    readable.dispose = dispose;
    return readable;
}

// ─── scan() ─────────────────────────────────────────────────────

/**
 * Accumulate values over time (like Array.reduce but reactive).
 *
 * Usage:
 *   const total = scan(() => clicks(), (acc, v) => acc + v, 0);
 *   // Every click adds to total
 */
export function scan<T, R>(
    source: () => T,
    reducer: (acc: R, value: T) => R,
    initialValue: R,
): DisposableSignal<R> {
    let acc = initialValue;
    const _value = signal<R>(initialValue);

    const dispose = effect(() => {
        const next = source();
        acc = reducer(acc, next);
        _value.set(acc as never);
    });

    const readable = (() => _value()) as DisposableSignal<R>;
    readable.peek = () => _value.peek();
    readable.dispose = dispose;
    return readable;
}

// ─── pairwise() ─────────────────────────────────────────────────

/**
 * Emit pairs of [previous, current] values.
 *
 * Usage:
 *   const pair = pairwise(count);
 *   effect(() => {
 *     const [prev, curr] = pair();
 *     console.log(`Delta: ${curr - prev}`);
 *   });
 */
export function pairwise<T>(source: () => T): DisposableSignal<[T, T]> {
    let prev = source();
    const _value = signal<[T, T]>([prev, prev]);

    const dispose = effect(() => {
        const current = source();
        _value.set([prev, current] as never);
        prev = current;
    });

    const readable = (() => _value()) as DisposableSignal<[T, T]>;
    readable.peek = () => _value.peek();
    readable.dispose = dispose;
    return readable;
}

// ─── sample() ───────────────────────────────────────────────────

/**
 * Sample the source signal only when the notifier changes.
 * Like RxJS sample — useful for "get value on button click".
 *
 * Usage:
 *   const sampled = sample(() => formData(), () => submitClicked());
 *
 * The source is read through {@link untracked}, and that is the operator: read tracked, it becomes a
 * second dependency and the sampled signal follows the source, which is a mirror and not a sample.
 * The usage above is the case it breaks — form data changes on every keystroke.
 */
export function sample<T>(
    source: () => T,
    notifier: () => unknown,
): DisposableSignal<T> {
    const initial = untracked(source);
    const _value = signal<T>(initial);

    const dispose = effect(() => {
        notifier(); // the ONLY dependency
        _value.set(untracked(source) as never);
    });

    const readable = (() => _value()) as DisposableSignal<T>;
    readable.peek = () => _value.peek();
    readable.dispose = dispose;
    return readable;
}

// ─── skipUntil() ────────────────────────────────────────────────

/**
 * Ignore source emissions until the gate signal becomes truthy.
 *
 * Usage:
 *   const gated = skipUntil(() => data(), () => isReady());
 */
export function skipUntil<T>(
    source: () => T,
    gate: () => unknown,
): DisposableSignal<T> {
    let opened = false;
    const _value = signal<T>(undefined as T);

    const dispose = effect(() => {
        const next = source();
        if (!opened && gate()) opened = true;
        if (opened) _value.set(next as never);
    });

    const readable = (() => _value()) as DisposableSignal<T>;
    readable.peek = () => _value.peek();
    readable.dispose = dispose;
    return readable;
}

// ─── takeUntil() ────────────────────────────────────────────────

/**
 * Pass source emissions until the stopper becomes truthy, then freeze.
 *
 * Usage:
 *   const limited = takeUntil(() => data(), () => isDestroyed());
 */
export function takeUntil<T>(
    source: () => T,
    stopper: () => unknown,
): DisposableSignal<T> {
    let stopped = false;
    const _value = signal<T>(source());

    const dispose = effect(() => {
        if (stopped) return;
        if (stopper()) { stopped = true; return; }
        const next = source();
        _value.set(next as never);
    });

    const readable = (() => _value()) as DisposableSignal<T>;
    readable.peek = () => _value.peek();
    readable.dispose = dispose;
    return readable;
}
