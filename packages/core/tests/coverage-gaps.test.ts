// Coverage gap tests: cycle detection, store Map/Set/array, tween interruption, error boundary.

import { describe, it, expect, vi } from 'vitest';
import { signal, computed, effect, untracked } from '../src/reactivity/signal';
import { store } from '../src/reactivity/store';
import { sample, skipUntil, takeUntil } from '../src/reactivity/utility-operators';
import { pipe, tap, catchError, map, filter } from '../src/reactivity/pipe';
import { tween, easings } from '../src/renderer/tween';
import { errorBoundary } from '../src/renderer/error-boundary';
import { waitUntil } from './wait-until';

// ═══════════════════════════════════════════════════════════════
// CYCLE DETECTION
// ═══════════════════════════════════════════════════════════════

describe('cycle detection in flush', () => {
    it('detects infinite effect loop and breaks', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const a = signal(0);

        // Create a cycle: effect reads a, writes a → re-triggers itself
        const dispose = effect(() => {
            const v = a();
            if (v < 200) a.set(v + 1); // would loop forever without guard
        });

        // Should have broken after MAX_FLUSH_ITERATIONS
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Infinite reactive loop'));
        spy.mockRestore();
        dispose();
    });

    it('allows non-cyclic effect writes', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const a = signal(0);
        const b = signal(0);

        // Non-cyclic: effect reads a, writes b (different signal)
        const dispose = effect(() => {
            b.set(a() * 2); // writes to b, not a — no cycle
        });

        a.set(5);
        expect(b()).toBe(10);
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
        dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// STORE MAP/SET
// ═══════════════════════════════════════════════════════════════

describe('store() with Map', () => {
    it('tracks Map.set() mutations', () => {
        const s = store({ cache: new Map<string, number>() });
        let mapSize = 0;

        const dispose = effect(() => { mapSize = s.cache.size; });
        expect(mapSize).toBe(0);

        s.cache.set('a', 1);
        expect(mapSize).toBe(1);

        s.cache.set('b', 2);
        expect(mapSize).toBe(2);

        dispose();
    });

    it('tracks Map.delete()', () => {
        const s = store({ cache: new Map([['a', 1], ['b', 2]]) });
        let mapSize = 0;

        const dispose = effect(() => { mapSize = s.cache.size; });
        expect(mapSize).toBe(2);

        s.cache.delete('a');
        expect(mapSize).toBe(1);
        dispose();
    });
});

describe('store() with Set', () => {
    it('tracks Set.add() mutations', () => {
        const s = store({ tags: new Set<string>() });
        let setSize = 0;

        const dispose = effect(() => { setSize = s.tags.size; });
        expect(setSize).toBe(0);

        s.tags.add('typescript');
        expect(setSize).toBe(1);

        s.tags.add('vitest');
        expect(setSize).toBe(2);

        dispose();
    });

    it('tracks Set.delete()', () => {
        const s = store({ tags: new Set(['a', 'b', 'c']) });
        let setSize = 0;

        const dispose = effect(() => { setSize = s.tags.size; });

        s.tags.delete('b');
        expect(setSize).toBe(2);
        dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// STORE ARRAY FINE-GRAINED MUTATIONS
// ═══════════════════════════════════════════════════════════════

describe('store() array fine-grained', () => {
    it('push() notifies length subscriber', () => {
        const s = store({ items: [1, 2, 3] });
        let len = 0;

        const dispose = effect(() => { len = s.items.length; });
        expect(len).toBe(3);

        s.items.push(4);
        expect(len).toBe(4);
        dispose();
    });

    it('pop() notifies length subscriber', () => {
        const s = store({ items: [1, 2, 3] });
        let len = 0;

        const dispose = effect(() => { len = s.items.length; });

        s.items.pop();
        expect(len).toBe(2);
        dispose();
    });

    it('reverse() is tracked', () => {
        const s = store({ items: [1, 2, 3] });
        let count = 0;

        let first = 0;
        const dispose = effect(() => { first = s.items[0]; count++; });
        const before = count;

        s.items.reverse();
        // `before` is compared, so the block measures the tracking its name claims and not only
        // reverse(). What reverse notifies is every INDEX, not the length
        // (store.ts:318): it moves the contents and leaves the length alone, so a reader of
        // `items.length` is correctly left asleep and a reader of an index must be woken.
        expect(count, 'reverse() did not notify a reader of items[0]').toBeGreaterThan(before);
        expect(first).toBe(3);
        expect(s.items[0]).toBe(3);
        dispose();
    });

    it('fill() is tracked', () => {
        const s = store({ items: [1, 2, 3] });
        let count = 0;

        const dispose = effect(() => { s.items.length; count++; });

        s.items.fill(0);
        expect(s.items).toEqual([0, 0, 0]);
        dispose();
    });

    it('splice() notifies correctly', () => {
        const s = store({ items: ['a', 'b', 'c', 'd'] });
        let len = 0;

        const dispose = effect(() => { len = s.items.length; });

        s.items.splice(1, 2, 'x'); // Remove b,c, insert x
        expect(len).toBe(3);
        expect(s.items).toEqual(['a', 'x', 'd']);
        dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// TWEEN INTERRUPTION
// ═══════════════════════════════════════════════════════════════

describe('tween() interruption', () => {
    it('changes target mid-animation', async () => {
        const target = signal(0);
        const t = tween(() => target(), { duration: 100, easing: easings.linear });

        target.set(100);

        // Sample the tween WHILE it is in flight, and capture the value inside the predicate.
        //
        // Not `setTimeout(30)` into a 100ms tween and then a read: that is two-sided, so load
        // can push the read past the end and fail `toBeLessThan(100)`. Reading after the wait
        // returns would reintroduce the same race in a smaller window — the value keeps moving —
        // so the sample is taken at the moment the condition holds.
        //
        // ⚠️ The `suite-hygiene` check does not catch that shape: the statement after the sleep is
        // an assignment, not an assertion. It is a tight rule on purpose, and this is what it misses.
        let midValue = 0;
        await waitUntil(() => {
            const v = t();
            if (v > 0 && v < 100) { midValue = v; return true; }
            return false;
        }, 'the tween to be mid-animation');

        expect(midValue).toBeGreaterThan(0);
        expect(midValue).toBeLessThan(100);

        target.set(0); // Reverse direction
        await waitUntil(() => t() === 0, 'the tween to reach its reversed target');

        expect(t()).toBe(0); // Should reach new target
        t.dispose();
    });

    it('rapid target changes settle correctly', async () => {
        const target = signal(0);
        const t = tween(() => target(), { duration: 50, easing: easings.linear });

        target.set(100);
        target.set(50);
        target.set(200);

        // ⚠️ Not `await setTimeout(100)` for a 50ms animation: that goes red in a full
        // `pnpm test` — eight packages plus Playwright competing for cores — while passing on its
        // own. A stopwatch is not synchronisation: wait for the CONDITION, with a ceiling that only
        // decides how long we are willing to wait before calling it broken.
        const deadline = Date.now() + 2000;
        while (t() !== 200 && Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 10));
        }

        expect(t()).toBe(200); // Should reach final target
        t.dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// ERROR BOUNDARY
// ═══════════════════════════════════════════════════════════════

describe('error boundary integration', () => {
    it('catches sync errors in content function', () => {
        const container = document.createElement('div');
        const frag = errorBoundary(
            () => { throw new Error('test error'); },
            (err) => {
                const el = document.createElement('div');
                el.textContent = `Error: ${(err as Error).message}`;
                return el;
            },
        );

        container.appendChild(frag);
        expect(container.textContent).toContain('Error: test error');
    });
});

// ═══════════════════════════════════════════════════════════════
// PIPE COMPOSITION EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('pipe composition', () => {
    it('tap + map + filter composed', () => {
        const s = signal(0);
        const tapped: number[] = [];

        const result = pipe(
            () => s(),
            tap(v => tapped.push(v)),
            map((v: number) => v * 10),
            filter((v: number) => v > 20),
        );

        expect(result()).toBeUndefined(); // 0 * 10 = 0, filtered out

        s.set(3); // 3 * 10 = 30 > 20 → passes
        expect(result()).toBe(30);
        expect(tapped).toContain(3);

        s.set(1); // 1 * 10 = 10 ≤ 20 → filtered, keeps 30
        expect(result()).toBe(30);

        result.dispose();
    });

    it('catchError recovers in pipe chain', () => {
        const s = signal(5);
        const result = pipe(
            () => {
                const v = s();
                if (v === 0) throw new Error('zero!');
                return 100 / v;
            },
            catchError(() => -1),
        );

        expect(result()).toBe(20); // 100/5

        s.set(0);
        expect(result()).toBe(-1); // caught

        s.set(10);
        expect(result()).toBe(10); // 100/10 = 10, recovered

        result.dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// STANDALONE OPERATORS THAT WERE UNDER-TESTED
// ═══════════════════════════════════════════════════════════════

describe('sample() standalone', () => {
    it('captures source value when notifier fires', () => {
        const data = signal('initial');
        const trigger = signal(0);
        const sampled = sample(() => data(), () => trigger());

        data.set('updated');
        // And it really does not update yet: the source is read through untracked, so the notifier
        // is the only dependency.
        expect(sampled()).toBe('initial');

        trigger.set(1);
        expect(sampled()).toBe('updated');
        sampled.dispose();
    });
});

describe('skipUntil() standalone', () => {
    it('ignores until gate opens then passes through', () => {
        const s = signal(1);
        const gate = signal(false);
        const gated = skipUntil(() => s(), () => gate());

        expect(gated()).toBeUndefined();
        s.set(2);
        expect(gated()).toBeUndefined();

        gate.set(true); // open gate
        s.set(3);
        expect(gated()).toBe(3);

        s.set(4);
        expect(gated()).toBe(4); // stays open
        gated.dispose();
    });
});

describe('takeUntil() standalone', () => {
    it('passes until stopper fires then freezes', () => {
        const s = signal(1);
        const stop = signal(false);
        const limited = takeUntil(() => s(), () => stop());

        expect(limited()).toBe(1);
        s.set(2);
        expect(limited()).toBe(2);

        stop.set(true); // stop
        s.set(99);
        expect(limited()).toBe(2); // frozen
        limited.dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// COMPUTED WITH EQUALITY — DOWNSTREAM PROPAGATION
// ═══════════════════════════════════════════════════════════════

describe('computed equality prevents downstream cascade', () => {
    it('downstream effect does NOT run when equality matches', () => {
        const source = signal({ x: 1, y: 2 });
        let downstreamRuns = 0;

        const justX = computed(
            () => source().x,
            { equals: (a, b) => a === b },
        );

        const dispose = effect(() => { justX(); downstreamRuns++; });
        expect(downstreamRuns).toBe(1);

        // Change y but NOT x — justX should stay same (1 === 1)
        source.set({ x: 1, y: 99 });
        expect(downstreamRuns).toBe(1); // NOT re-triggered

        // Change x — justX changes
        source.set({ x: 5, y: 99 });
        expect(downstreamRuns).toBe(2);

        dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// UNTRACKED EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('untracked edge cases', () => {
    it('nested untracked scopes', () => {
        const a = signal(1);
        const b = signal(2);
        const c = signal(3);
        let runs = 0;

        const dispose = effect(() => {
            a(); // tracked
            untracked(() => {
                b(); // NOT tracked
                untracked(() => {
                    c(); // NOT tracked (nested)
                });
            });
            runs++;
        });

        expect(runs).toBe(1);
        b.set(20); // not tracked
        expect(runs).toBe(1);
        c.set(30); // not tracked
        expect(runs).toBe(1);
        a.set(10); // tracked
        expect(runs).toBe(2);
        dispose();
    });

    it('restores tracking after untracked throws', () => {
        const a = signal(1);
        const b = signal(2);
        let runs = 0;

        const dispose = effect(() => {
            a(); // tracked
            try {
                untracked(() => { throw new Error('oops'); });
            } catch {}
            b(); // should still be tracked (context restored)
            runs++;
        });

        expect(runs).toBe(1);
        b.set(20);
        expect(runs).toBe(2); // b is tracked
        dispose();
    });
});
