// Composable signal pipeline — type-safe operator chaining.
// Beats RxJS pipe: each step returns a Signal, auto-tracked, zero subscribe.

import { signal, computed, effect } from './signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────────

/** A signal operator: transforms a source signal getter into a new signal. */
export type SignalOperator<In, Out> = (source: () => In) => ReadonlySignal<Out> & { dispose?: Dispose };

type DisposableSignal<T> = ReadonlySignal<T> & { dispose: Dispose };

// ─── pipe() ────────────────────────────────────────────────────────

/**
 * Compose signal operators into a pipeline.
 *
 * Usage:
 *   const result = pipe(query,
 *     debounce(300),
 *     distinct(),
 *     map(q => q.trim().toLowerCase()),
 *     filter(q => q.length > 2)
 *   );
 */
export function pipe<A>(source: () => A): ReadonlySignal<A>;
export function pipe<A, B>(source: () => A, op1: SignalOperator<A, B>): DisposableSignal<B>;
export function pipe<A, B, C>(source: () => A, op1: SignalOperator<A, B>, op2: SignalOperator<B, C>): DisposableSignal<C>;
export function pipe<A, B, C, D>(source: () => A, op1: SignalOperator<A, B>, op2: SignalOperator<B, C>, op3: SignalOperator<C, D>): DisposableSignal<D>;
export function pipe<A, B, C, D, E>(source: () => A, op1: SignalOperator<A, B>, op2: SignalOperator<B, C>, op3: SignalOperator<C, D>, op4: SignalOperator<D, E>): DisposableSignal<E>;
export function pipe<A, B, C, D, E, F>(source: () => A, op1: SignalOperator<A, B>, op2: SignalOperator<B, C>, op3: SignalOperator<C, D>, op4: SignalOperator<D, E>, op5: SignalOperator<E, F>): DisposableSignal<F>;
export function pipe(source: () => unknown, ...operators: SignalOperator<unknown, unknown>[]): DisposableSignal<unknown> {
    if (operators.length === 0) {
        const c = computed(source) as DisposableSignal<unknown>;
        c.dispose = () => {};
        return c;
    }

    const disposables: Dispose[] = [];
    let current: () => unknown = source;

    for (const op of operators) {
        const result = op(current);
        if (result.dispose) disposables.push(result.dispose);
        current = result;
    }

    const readable = (() => current()) as DisposableSignal<unknown>;
    readable.peek = () => (current as ReadonlySignal<unknown>).peek?.() ?? current();
    readable.dispose = () => { for (const d of disposables) d(); };
    return readable;
}

// ─── Pipe-compatible operators ─────────────────────────────────────

/** Debounce operator for pipe(). */
export function debounce<T>(ms: number): SignalOperator<T, T> {
    return (source) => {
        const _value = signal<T>(source());
        let timer: ReturnType<typeof setTimeout> | null = null;

        const dispose = effect(() => {
            const next = source();
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => _value.set(next as never), ms);
        });

        const readable = (() => _value()) as ReadonlySignal<T> & { dispose: Dispose };
        readable.peek = () => _value.peek();
        readable.dispose = () => { dispose(); if (timer) clearTimeout(timer); };
        return readable;
    };
}

/** Throttle operator for pipe(). */
export function throttle<T>(ms: number): SignalOperator<T, T> {
    return (source) => {
        const _value = signal<T>(source());
        let lastUpdate = 0;
        let pending: ReturnType<typeof setTimeout> | null = null;

        const dispose = effect(() => {
            const next = source();
            const now = Date.now();
            const elapsed = now - lastUpdate;

            if (elapsed >= ms) {
                _value.set(next as never);
                lastUpdate = now;
            } else if (!pending) {
                pending = setTimeout(() => {
                    _value.set(source() as never);
                    lastUpdate = Date.now();
                    pending = null;
                }, ms - elapsed);
            }
        });

        const readable = (() => _value()) as ReadonlySignal<T> & { dispose: Dispose };
        readable.peek = () => _value.peek();
        readable.dispose = () => { dispose(); if (pending) clearTimeout(pending); };
        return readable;
    };
}

/** Map operator for pipe(). Transforms each value. */
export function map<In, Out>(fn: (value: In) => Out): SignalOperator<In, Out> {
    return (source) => {
        const c = computed(() => fn(source()));
        const readable = c as ReadonlySignal<Out> & { dispose?: Dispose };
        return readable;
    };
}

/** Filter operator for pipe(). Keeps last valid value when predicate fails. */
export function filter<T>(predicate: (value: T) => boolean): SignalOperator<T, T> {
    return (source) => {
        const initial = source();
        const _value = signal<T>(predicate(initial) ? initial : undefined as T);

        const dispose = effect(() => {
            const next = source();
            if (predicate(next)) _value.set(next as never);
        });

        const readable = (() => _value()) as ReadonlySignal<T> & { dispose: Dispose };
        readable.peek = () => _value.peek();
        readable.dispose = dispose;
        return readable;
    };
}

/** Skip duplicate values using equality check. */
export function distinct<T>(equals?: (a: T, b: T) => boolean): SignalOperator<T, T> {
    const eq = equals ?? ((a: T, b: T) => Object.is(a, b));
    return (source) => {
        const _value = signal<T>(source());

        const dispose = effect(() => {
            const next = source();
            if (!eq(next, _value.peek())) _value.set(next as never);
        });

        const readable = (() => _value()) as ReadonlySignal<T> & { dispose: Dispose };
        readable.peek = () => _value.peek();
        readable.dispose = dispose;
        return readable;
    };
}

/** Skip the first N changes after initial value. */
export function skip<T>(count: number): SignalOperator<T, T> {
    return (source) => {
        let changes = 0;
        const _value = signal<T>(undefined as T);
        let isFirst = true;

        const dispose = effect(() => {
            const next = source();
            if (isFirst) { isFirst = false; return; } // skip initial effect run
            if (changes >= count) {
                _value.set(next as never);
            } else {
                changes++;
            }
        });

        const readable = (() => _value()) as ReadonlySignal<T> & { dispose: Dispose };
        readable.peek = () => _value.peek();
        readable.dispose = dispose;
        return readable;
    };
}

/** Debug: observe values flowing through the pipe without modifying them. */
export function tap<T>(fn: (value: T) => void): SignalOperator<T, T> {
    return (source) => {
        const c = computed(() => {
            const val = source();
            fn(val);
            return val;
        });
        return c as ReadonlySignal<T> & { dispose?: Dispose };
    };
}

/** Catch errors in the pipeline and recover with a fallback value. */
export function catchError<T>(handler: (error: unknown) => T): SignalOperator<T, T> {
    return (source) => {
        // Use computed — it naturally re-evaluates when source changes,
        // and try/catch inside computed properly tracks dependencies.
        const safe = computed(() => {
            try {
                return source();
            } catch (e) {
                return handler(e);
            }
        });
        return safe as ReadonlySignal<T> & { dispose?: Dispose };
    };
}

/** Take only the first N emissions (changes), then freeze. Initial value doesn't count. */
export function take<T>(count: number): SignalOperator<T, T> {
    return (source) => {
        const _value = signal<T>(source());
        let changes = 0;
        let isFirst = true;

        const dispose = effect(() => {
            const next = source();
            if (isFirst) { isFirst = false; return; } // skip initial effect run
            if (changes < count) {
                _value.set(next as never);
                changes++;
            }
        });

        const readable = (() => _value()) as ReadonlySignal<T> & { dispose: Dispose };
        readable.peek = () => _value.peek();
        readable.dispose = dispose;
        return readable;
    };
}
