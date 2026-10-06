// Signal operators — reactive helpers inspired by RxJS patterns.
// Zero dependencies beyond core signal/effect.

import { signal, effect } from './signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

/**
 * Create a debounced signal — value updates only after `ms` milliseconds of silence.
 * Useful for search inputs, resize handlers, etc.
 *
 * Usage:
 *   const search = signal('');
 *   const debouncedSearch = debounced(() => search(), 300);
 *   effect(() => fetchResults(debouncedSearch()));
 */
export function debounced<T>(source: () => T, ms: number): ReadonlySignal<T> & { dispose: Dispose } {
    const _value = signal<T>(source());
    let timer: ReturnType<typeof setTimeout> | null = null;

    const dispose = effect(() => {
        const next = source();
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => _value.set(next as never), ms);
    });

    const readable = (() => _value()) as ReadonlySignal<T> & { dispose: Dispose };
    readable.peek = () => _value.peek();
    readable.dispose = () => {
        dispose();
        if (timer) clearTimeout(timer);
    };
    return readable;
}

/**
 * Create a throttled signal — value updates at most every `ms` milliseconds.
 * Useful for scroll handlers, mouse move, etc.
 *
 * Usage:
 *   const scrollY = signal(0);
 *   const throttledY = throttled(() => scrollY(), 100);
 */
export function throttled<T>(source: () => T, ms: number): ReadonlySignal<T> & { dispose: Dispose } {
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
    readable.dispose = () => {
        dispose();
        if (pending) clearTimeout(pending);
    };
    return readable;
}

/**
 * Combine multiple signal sources into one — re-emits whenever ANY source changes.
 * Returns latest values as a tuple.
 *
 * Usage:
 *   const [width, height] = [signal(0), signal(0)];
 *   const dimensions = merged(() => width(), () => height());
 *   effect(() => console.log(dimensions())); // [w, h]
 */
export function merged<T extends readonly (() => unknown)[]>(
    ...sources: T
): ReadonlySignal<{ [K in keyof T]: ReturnType<T[K]> }> {
    const _value = signal(sources.map(s => s()) as unknown as { [K in keyof T]: ReturnType<T[K]> });

    effect(() => {
        const values = sources.map(s => s()) as unknown as { [K in keyof T]: ReturnType<T[K]> };
        _value.set(values as never);
    });

    const readable = (() => _value()) as ReadonlySignal<{ [K in keyof T]: ReturnType<T[K]> }>;
    readable.peek = () => _value.peek();
    return readable;
}
