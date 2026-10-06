// Reactivity guarantees: a glitch-free flush, a key version that outlives its entry, a set that notifies.
import { describe, it, expect } from 'vitest';
import { signal, computed, effect } from '../src/reactivity/signal';
import { createCache } from '../src/reactivity/cache';

// Glitch-free flush: an effect reading a signal AND a signal-derived computed
// must run exactly once per set, and never observe a stale computed.
describe('flush is glitch-free for signal+computed', () => {
    it('runs the effect once per set with the fresh derived value', async () => {
        const a = signal(1);
        const c = computed(() => a() * 2);
        const seen: Array<[number, number]> = [];
        effect(() => { seen.push([a(), c()]); });
        await Promise.resolve();

        a.set(2);
        await Promise.resolve();
        a.set(3);
        await Promise.resolve();

        expect(seen).toEqual([[1, 2], [2, 4], [3, 6]]);
    });

    it('deep diamond still updates and does not double-run', () => {
        const a = signal(1);
        const b = computed(() => a() + 1);
        const c = computed(() => b() * 10);
        let runs = 0;
        let last = 0;
        effect(() => { runs++; last = c(); });
        expect(runs).toBe(1);
        expect(last).toBe(20);
        a.set(4);
        expect(last).toBe(50);
        expect(runs).toBe(2); // one re-run, not two
    });
});

// cache.keyVersion signal must survive remove()/gc()/clear() so a resource that
// subscribed to it still gets notified by later invalidations.
describe('keyVersion survives removal', () => {
    it('keeps notifying after remove()', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('k', 1);
        let ticks = 0;
        const kv = cache.keyVersion('k');
        effect(() => { kv(); ticks++; });
        expect(ticks).toBe(1);

        cache.remove('k');          // must not orphan the signal
        expect(ticks).toBe(2);

        cache.set('k', 2);
        cache.invalidate('k');      // must still notify the original subscriber
        expect(ticks).toBeGreaterThanOrEqual(3);
    });
});

// cache.set must notify subscribers so an optimistic write renders.
describe('cache.set notifies subscribers', () => {
    it('bumps keyVersion on set', () => {
        const cache = createCache({ gcInterval: 0 });
        let ticks = 0;
        const kv = cache.keyVersion('k');
        effect(() => { kv(); ticks++; });
        expect(ticks).toBe(1);
        cache.set('k', { v: 1 });   // optimistic write
        expect(ticks).toBe(2);
    });
});
