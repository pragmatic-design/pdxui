// A keyed selector (#117): `row.id === selected` in a list, without every row depending on `selected`.
//
// Read directly, `selected()` subscribes every row: a selection re-runs N effects to change two rows.
// `selector(() => selected())` keeps one signal per key that is being read; `is(key)` reads that one,
// and a change of the source from `a` to `b` sets the signals of `a` and `b` only. A key's signal
// exists while something reads it: each reader holds it, and lets go when it re-runs or is disposed.

import { signal, effect, untracked, onCleanup, batch, _getCurrentEffect } from './signal';
import type { Signal } from '../utils/types';

/** The reader of one key: whether the source is that key. */
export interface Selector<T> {
    /** Is the source `key`? Subscribes the caller to `key` alone. */
    is(key: T): boolean;
}

interface KeySignal { value: Signal<boolean>; readers: number }

/** A selector over `source`, compared with `Object.is`. */
export function selector<T>(source: () => T): Selector<T> {
    const keys = new Map<T, KeySignal>();
    let current = untracked(source);
    effect(() => {
        const next = source();
        if (Object.is(next, current)) return;
        const previous = current;
        current = next;
        batch(() => {
            keys.get(previous)?.value.set(false);
            keys.get(next)?.value.set(true);
        });
    });
    return {
        is(key: T): boolean {
            // Outside an effect nothing would let go of the key: read the answer, keep nothing.
            if (!_getCurrentEffect()) return Object.is(current, key);
            let entry = keys.get(key);
            if (!entry) {
                entry = { value: signal(Object.is(current, key)), readers: 0 };
                keys.set(key, entry);
            }
            const held = entry;
            held.readers++;
            // Let go when the reader re-runs or is disposed: the entry goes with its last reader.
            onCleanup(() => {
                if (--held.readers === 0 && keys.get(key) === held) keys.delete(key);
            });
            return held.value();
        },
    };
}
