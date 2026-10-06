// Reactivity-layer guarantees:
//   - store: function values stored verbatim (setRaw), __proto__ pollution guard, native nested objects
//   - cache: LRU eviction does not loop forever when every entry is subscribed
//   - computed: dependency pruning (conditional branch no longer tracked → no spurious recompute)
//
// Each fails if the behaviour it pins is taken out.

import { describe, it, expect } from 'vitest';
import { store } from '../src/reactivity/store';
import { createCache } from '../src/reactivity/cache';
import { signal, computed, effect, batch } from '../src/reactivity/signal';

describe('store — function property value is stored, not executed', () => {
    it('assigning a function stores it verbatim (setRaw, not updater)', () => {
        let called = false;
        const fn = () => { called = true; return 'x'; };
        const s = store<{ cb: ((prev?: unknown) => unknown) | null }>({ cb: null });

        s.cb = fn;

        expect(s.cb).toBe(fn);        // stored as-is, identity preserved
        expect(called).toBe(false);   // never invoked as an updater
    });
});

describe('store — prototype pollution guard', () => {
    it('assigning __proto__ does not pollute Object.prototype', () => {
        const s = store<Record<string, unknown>>({});
        // eslint-disable-next-line no-proto
        (s as Record<string, unknown>)['__proto__'] = { polluted: true };

        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
});

describe('store — nested native objects are returned raw (not proxied)', () => {
    it('nested Date methods do not throw', () => {
        const s = store({ d: new Date(0) });
        expect(() => s.d.getTime()).not.toThrow();
        expect(s.d.getTime()).toBe(0);
    });

    it('nested Map methods do not throw and read back correctly', () => {
        const s = store({ m: new Map<string, number>([['k', 1]]) });
        expect(() => s.m.get('k')).not.toThrow();
        expect(s.m.get('k')).toBe(1);
    });

    it('nested plain object stays reactive', () => {
        const s = store({ nested: { count: 0 } });
        let seen = -1;
        const dispose = effect(() => { seen = s.nested.count; });
        expect(seen).toBe(0);

        s.nested.count = 5;
        expect(seen).toBe(5);
        dispose();
    });
});

describe('cache — LRU eviction terminates when all entries are subscribed', () => {
    it('inserting past maxEntries with every entry subscribed does not loop forever', () => {
        const cache = createCache({ maxEntries: 2, gcInterval: 0 });

        // Fill to the limit and keep an active subscriber on each entry —
        // these are unevictable, so the eviction scan must give up instead of spinning.
        cache.set('a', 1);
        cache.subscribe('a');
        cache.set('b', 2);
        cache.subscribe('b');

        // This insert exceeds maxEntries; evictLRU scans 'a' then 'b' (both subscribed →
        // unevictable, rotated). Without the rotation guard it would spin forever over the
        // two subscribed keys. The guard must break the loop so the call returns.
        expect(() => cache.set('c', 3)).not.toThrow();

        // Subscribed entries are never dropped by eviction.
        expect(cache.has('a')).toBe(true);
        expect(cache.has('b')).toBe(true);

        cache.dispose();
    });

    it('evicts an unsubscribed entry when over the limit', () => {
        const cache = createCache({ maxEntries: 2, gcInterval: 0 });
        cache.set('a', 1); // unsubscribed → evictable
        cache.set('b', 2);
        cache.subscribe('b');
        cache.set('c', 3); // over limit → 'a' (oldest, unsubscribed) is evicted

        expect(cache.has('a')).toBe(false);
        expect(cache.has('b')).toBe(true);
        expect(cache.has('c')).toBe(true);
        cache.dispose();
    });
});

describe('computed — dependency pruning on conditional branch', () => {
    it('a no-longer-read dependency does not trigger downstream recompute', () => {
        const cond = signal(true);
        const a = signal(0);

        let computes = 0;
        const c = computed(() => {
            computes++;
            return cond() ? a() : 0;
        });

        let effectRuns = 0;
        const dispose = effect(() => { c(); effectRuns++; });

        expect(effectRuns).toBe(1);
        const computesAfterInit = computes;

        // Switch the branch off: `a` is no longer read → must be pruned as a dependency.
        cond.set(false);
        const computesAfterCond = computes;
        const effectRunsAfterCond = effectRuns;

        // Now mutate `a`: since it's pruned, neither the computed nor the effect should re-run.
        a.set(999);

        expect(computes).toBe(computesAfterCond); // computed did NOT recompute
        expect(effectRuns).toBe(effectRunsAfterCond); // effect did NOT re-run

        // Sanity: while cond was true, the dependency was live (init counted ≥1).
        expect(computesAfterInit).toBeGreaterThanOrEqual(1);

        dispose();
    });
});

describe('computed({ equals }) — dep re-tracking must not re-enter the notify pass', () => {
    // recompute() must not unsubscribe from every dep and let fn() re-subscribe. For an
    // UNCHANGED dep that is a delete+add, which moves the entry to the end of the source's
    // subscriber Set. notifySet iterates that Set live and JS visits entries appended during
    // iteration, so markDirty would run again, see `dirty` already reset by its own recompute,
    // re-enter — and loop forever. `equals` recomputes inside the notification pass, so this
    // hangs the process (it kills the vitest worker outright).
    it('settles instead of looping when equality matches', () => {
        const source = signal({ x: 1, y: 2 });
        let runs = 0;
        const justX = computed(() => source().x, { equals: (a, b) => a === b });
        const dispose = effect(() => { justX(); runs++; });

        expect(runs).toBe(1);
        source.set({ x: 1, y: 99 });   // y-only change → equality holds → no downstream run
        expect(runs).toBe(1);
        source.set({ x: 5, y: 99 });   // x changes → downstream runs once
        expect(runs).toBe(2);
        dispose();
    });

    it('still prunes deps that are no longer read', () => {
        const useA = signal(true);
        const a = signal(1);
        const b = signal(10);
        let computes = 0;
        const c = computed(() => { computes++; return useA() ? a() : b(); });

        expect(c()).toBe(1);
        const before = computes;
        b.set(20);                     // b is not a dep yet → must not recompute
        expect(computes).toBe(before);

        useA.set(false);
        expect(c()).toBe(20);
        const after = computes;
        a.set(2);                      // a is no longer read → must have been pruned
        expect(computes).toBe(after);
    });
});

describe('notify-pass re-entrancy — the invariant that keeps effects safe', () => {
    // Why effect() is NOT affected by the computed bug above even though its dep handling
    // has the same delete-then-re-add shape: effects are QUEUED (scheduleSubscriber only
    // calls __pdx_mark subscribers synchronously) and flush() iterates a snapshot ARRAY,
    // never the live subscriber Set. So an effect's re-subscribe can never reorder a Set
    // that is being iterated. Measured: probes A and C below pass even against the buggy
    // computed; only the probe that involves a computed({equals}) hung.
    //
    // The invariant is implicit, so these pin it: if someone tags another subscriber with
    // __pdx_mark, or makes computed prune eagerly again, these fail instead of hanging CI.
    it('A: an effect whose deps change between runs settles', () => {
        const useA = signal(true), a = signal(1), b = signal(2);
        let runs = 0;
        const dispose = effect(() => { useA() ? a() : b(); runs++; });
        useA.set(false);
        a.set(9);   // no longer a dep → must not re-run
        const afterA = runs;
        b.set(9);   // is a dep now → must re-run
        expect(runs).toBeGreaterThan(afterA);
        dispose();
    });

    it('C: an effect writing a signal during flush (nested notify) settles', () => {
        const a = signal(0), mirror = signal(0);
        let runs = 0;
        const d1 = effect(() => { mirror.set(a()); runs++; });
        const d2 = effect(() => { mirror(); });
        a.set(1);
        a.set(2);
        expect(runs).toBeGreaterThan(1);
        d1(); d2();
    });

    it('D: effect deps changing WHILE a computed({equals}) notifies settles', () => {
        const flag = signal(true), s1 = signal(1), s2 = signal(2);
        const c = computed(() => (flag() ? s1() : s2()), { equals: (p, n) => p === n });
        let runs = 0;
        const dispose = effect(() => { c(); flag() ? s1() : s2(); runs++; });
        batch(() => { flag.set(false); s2.set(5); });
        expect(runs).toBeGreaterThan(1);
        dispose();
    });

    it('chained computeds with equals settle', () => {
        const src = signal({ x: 1, y: 1 });
        const c1 = computed(() => src().x, { equals: (p, n) => p === n });
        const c2 = computed(() => c1() * 2, { equals: (p, n) => p === n });
        let runs = 0;
        const dispose = effect(() => { c2(); runs++; });
        src.set({ x: 1, y: 2 });   // x unchanged → no propagation through either computed
        expect(runs).toBe(1);
        src.set({ x: 2, y: 2 });
        expect(runs).toBe(2);
        dispose();
    });
});
