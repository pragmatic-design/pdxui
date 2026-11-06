// A key's version is dropped once no entry needs it and nothing reads it (#906).
//
// The cache kept one version signal per key it was ever asked about, for its whole life, though its
// entries are capped at 200: a search that makes a key per query kept every query's version. Measured
// on the built core, 100,000 distinct keys left 62 MB behind, about 637 bytes a key.
//
// Dropped means the next `keyVersion(key)` is a new signal. A version with a reader is never dropped:
// the reader would stop hearing about the key.

import { describe, it, expect } from 'vitest';
import { createCache } from '../src/reactivity/cache';
import { effect } from '../src/reactivity/signal';

describe('cache — the versions it keeps', () => {
    it('drops the version of an evicted key nothing reads', () => {
        const cache = createCache({ maxEntries: 2, gcInterval: 0 });
        const first = cache.keyVersion('a');
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3); // evicts 'a'
        expect(cache.get('a')).toBeUndefined();
        expect(cache.keyVersion('a'), 'the evicted key kept its version').not.toBe(first);
    });

    it('drops the version of a removed key nothing reads', () => {
        const cache = createCache({ gcInterval: 0 });
        const first = cache.keyVersion('a');
        cache.set('a', 1);
        cache.remove('a');
        expect(cache.keyVersion('a')).not.toBe(first);
    });

    it('keeps the version a reader is subscribed to, and the reader hears later writes', () => {
        const cache = createCache({ maxEntries: 2, gcInterval: 0 });
        const kv = cache.keyVersion('a');
        let runs = 0;
        const stop = effect(() => { kv(); runs++; });
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3); // evicts 'a'
        cache.gc();
        expect(cache.keyVersion('a'), 'a version with a reader was dropped').toBe(kv);
        const before = runs;
        cache.set('a', 4);
        expect(runs).toBeGreaterThan(before);
        stop();
    });

    it('drops it in gc() once its last reader has left', () => {
        const cache = createCache({ gcInterval: 0 });
        const kv = cache.keyVersion('a');
        const stop = effect(() => { kv(); });
        cache.set('a', 1);
        cache.remove('a');
        expect(cache.keyVersion('a')).toBe(kv);
        stop();
        cache.gc();
        expect(cache.keyVersion('a'), 'gc() kept a version nobody reads').not.toBe(kv);
    });

    it('a version asked for again repeats no value an earlier one had', () => {
        const cache = createCache({ gcInterval: 0 });
        const first = cache.keyVersion('a');
        cache.set('a', 1);
        const seen = first.peek();
        cache.remove('a');
        expect(cache.keyVersion('a').peek()).not.toBe(seen);
    });
});
