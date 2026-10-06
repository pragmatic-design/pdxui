// Tests for DX improvements: untracked, computed equality, tap, catchError, tween, useQuery, portal animation.

import { describe, it, expect, vi } from 'vitest';
import { signal, computed, effect, untracked } from '../src/reactivity/signal';
import { pipe, map, tap, catchError } from '../src/reactivity/pipe';
import { tween, tweenMulti, easings } from '../src/renderer/tween';
import { useQuery } from '../src/reactivity/use-query';
import { portal } from '../src/renderer/helpers';
import { waitUntil } from './wait-until';

// ═══════════════════════════════════════════════════════════════
// untracked()
// ═══════════════════════════════════════════════════════════════

describe('untracked()', () => {
    it('reads signal without tracking dependency', () => {
        const a = signal(1);
        const b = signal(10);
        let runs = 0;

        const dispose = effect(() => {
            a(); // tracked
            untracked(() => b()); // NOT tracked
            runs++;
        });

        expect(runs).toBe(1);

        b.set(20); // should NOT re-trigger effect
        expect(runs).toBe(1);

        a.set(2); // SHOULD re-trigger effect
        expect(runs).toBe(2);

        dispose();
    });

    it('returns the value from the callback', () => {
        const s = signal(42);
        const result = untracked(() => s());
        expect(result).toBe(42);
    });

    it('works inside computed', () => {
        const a = signal(1);
        const b = signal(100);
        const c = computed(() => a() + untracked(() => b()));

        expect(c()).toBe(101);

        b.set(200); // untracked — computed stays clean
        expect(c()).toBe(101); // still 101 (not re-evaluated)

        a.set(2); // tracked — triggers re-evaluation
        expect(c()).toBe(202); // 2 + 200
    });

    it('restores tracking context after callback', () => {
        const a = signal(1);
        const b = signal(10);
        const c = signal(100);
        let runs = 0;

        const dispose = effect(() => {
            a(); // tracked
            untracked(() => b()); // NOT tracked
            c(); // tracked (after untracked block)
            runs++;
        });

        expect(runs).toBe(1);

        c.set(200); // tracked — triggers
        expect(runs).toBe(2);

        dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// computed() with equality
// ═══════════════════════════════════════════════════════════════

describe('computed() with equality', () => {
    it('skips notification when equals returns true', () => {
        const items = signal([1, 2, 3]);
        let computeCount = 0;
        let effectCount = 0;

        const sorted = computed(
            () => { computeCount++; return [...items()].sort(); },
            { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
        );

        const dispose = effect(() => { sorted(); effectCount++; });

        expect(effectCount).toBe(1);

        // Set same values in different order — sorted result is the same
        items.set([3, 1, 2]);
        // Computed re-evaluates but sorted result [1,2,3] is "equal" — no downstream notification
        expect(sorted()).toEqual([1, 2, 3]);
        expect(effectCount).toBe(1); // effect NOT re-triggered

        // Set actually different values
        items.set([1, 2, 3, 4]);
        expect(sorted()).toEqual([1, 2, 3, 4]);
        expect(effectCount).toBe(2); // effect triggered

        dispose();
    });

    it('works without equality option (default Object.is)', () => {
        const s = signal(1);
        let effectCount = 0;

        const doubled = computed(() => s() * 2);
        const dispose = effect(() => { doubled(); effectCount++; });

        expect(effectCount).toBe(1);
        s.set(1); // same value — signal skips
        s.set(2); // different
        expect(effectCount).toBe(2);

        dispose();
    });

    it('shallow array equality prevents re-render', () => {
        const data = signal({ list: [1, 2, 3], extra: 'a' });

        const justList = computed(
            () => data().list,
            {
                equals: (a, b) =>
                    a.length === b.length && a.every((v, i) => v === b[i]),
            },
        );

        let renders = 0;
        const dispose = effect(() => { justList(); renders++; });

        expect(renders).toBe(1);

        // Change `extra` but not `list` — justList should not re-trigger
        data.set({ list: [1, 2, 3], extra: 'b' });
        expect(renders).toBe(1); // no re-render

        // Change `list` items
        data.set({ list: [1, 2, 4], extra: 'b' });
        expect(renders).toBe(2);

        dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// tap() and catchError() pipe operators
// ═══════════════════════════════════════════════════════════════

describe('tap()', () => {
    it('observes values without modifying them', () => {
        const s = signal(5);
        const observed: number[] = [];

        const result = pipe(
            () => s(),
            tap(v => observed.push(v)),
            map(v => v * 2),
        );

        expect(result()).toBe(10);
        expect(observed).toContain(5);

        s.set(7);
        expect(result()).toBe(14);
        expect(observed).toContain(7);

        result.dispose();
    });

    it('does not affect the pipeline output', () => {
        const s = signal('hello');
        const result = pipe(
            () => s(),
            tap(() => { /* side effect */ }),
        );
        expect(result()).toBe('hello');
        result.dispose();
    });
});

describe('catchError()', () => {
    it('catches errors and provides fallback', () => {
        const s = signal(0);
        const risky = computed(() => {
            const v = s();
            if (v < 0) throw new Error('negative');
            return v;
        });

        const safe = pipe(
            () => risky(),
            catchError(() => -1),
        );

        expect(safe()).toBe(0);

        s.set(-5);
        expect(safe()).toBe(-1); // fallback
        safe.dispose();
    });

    it('handles error on initial value', () => {
        const s = signal(-1);

        const safe = pipe(
            () => {
                const v = s();
                if (v < 0) throw new Error('negative');
                return v;
            },
            catchError(() => 999),
        );

        expect(safe()).toBe(999); // caught

        s.set(42);
        expect(safe()).toBe(42); // recovered — source tracks s directly
        safe.dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// tween() animation signal
// ═══════════════════════════════════════════════════════════════

describe('tween()', () => {
    it('returns initial value immediately', () => {
        const target = signal(100);
        const t = tween(() => target(), { duration: 100 });
        expect(t()).toBe(100);
        t.dispose();
    });

    it('animates between values', async () => {
        // DRIVE the clock, do not race it.
        //
        // Waiting `setTimeout(50)` and asserting a 100ms animation is halfway through is fine on an
        // idle machine and a bet on a loaded one: under the full `pnpm test` the timer slips past
        // the end of the animation and the assertion reads `animating()` as false —
        // `expected false to be true`, about one run in ten.
        //
        // `tween` runs on performance.now() and requestAnimationFrame, so faking both makes the
        // midpoint exact instead of lucky: at 50ms of a 100ms linear tween the value IS 50, and the
        // assertions below can say so rather than bracketing it.
        vi.useFakeTimers();
        try {
            const target = signal(0);
            const t = tween(() => target(), { duration: 100, easing: easings.linear });

            target.set(100);
            await vi.advanceTimersByTimeAsync(50);

            expect(t.animating(), 'halfway through, the tween should be running').toBe(true);
            // 48, not 50: rAF advances in ~16ms steps, so the last frame before 50ms lands at 48.
            // Deterministic under fake timers — but asserted as a band rather than the exact 48,
            // which would pin the test to the fake clock's frame cadence.
            const mid = t();
            expect(mid, 'a linear tween is around its midpoint after half its duration').toBeGreaterThan(40);
            expect(mid, 'a linear tween is around its midpoint after half its duration').toBeLessThan(60);

            // Well past the end, not exactly to it: frames land on ~16ms boundaries, so advancing
            // to 110ms leaves the last frame at 96 and the tween still running. The assertion is
            // about the END STATE, so the wait only has to be generous.
            await vi.advanceTimersByTimeAsync(200);

            expect(t(), 'past its duration, the tween should be at the end value').toBe(100);
            expect(t.animating(), 'past its duration, the tween should have stopped').toBe(false);

            t.dispose();
        } finally {
            vi.useRealTimers();
        }
    });

    it('provides peek()', () => {
        const target = signal(50);
        const t = tween(() => target());
        expect(t.peek()).toBe(50);
        t.dispose();
    });
});

describe('tweenMulti()', () => {
    it('animates multiple values', async () => {
        const x = signal(0);
        const y = signal(0);
        const pos = tweenMulti(
            { x: () => x(), y: () => y() },
            { duration: 100, easing: easings.linear },
        );

        expect(pos()).toEqual({ x: 0, y: 0 });

        x.set(100);
        y.set(50);

        // Wait for the TWEEN TO ARRIVE, not for a stopwatch.
        //
        // Not `await new Promise(r => setTimeout(r, 150))` against a 100ms tween: fine on an idle
        // machine, and red inside a full `pnpm test` where six packages share it — the frames a
        // tween needs do not arrive on schedule under load. Same shape as `retrySignal` in
        // signal-operators.test.ts.
        //
        // The assertions are the exact endpoint, on both axes.
        await waitUntil(() => pos().x === 100 && pos().y === 50, 'tweenMulti to reach its target');

        const final = pos();
        expect(final.x).toBe(100);
        expect(final.y).toBe(50);

        pos.dispose();
    });
});

describe('easings', () => {
    it('linear produces identity', () => {
        expect(easings.linear(0)).toBe(0);
        expect(easings.linear(0.5)).toBe(0.5);
        expect(easings.linear(1)).toBe(1);
    });

    it('easeOutCubic starts fast, ends slow', () => {
        expect(easings.easeOutCubic(0)).toBe(0);
        expect(easings.easeOutCubic(0.5)).toBeGreaterThan(0.5); // ahead of linear
        expect(easings.easeOutCubic(1)).toBe(1);
    });

    it('easeOutBounce ends at 1', () => {
        expect(easings.easeOutBounce(1)).toBeCloseTo(1, 2);
    });
});

// ═══════════════════════════════════════════════════════════════
// useQuery()
// ═══════════════════════════════════════════════════════════════

describe('useQuery()', () => {
    it('fetches data and transitions through states', async () => {
        const result = useQuery(
            () => Promise.resolve({ users: [1, 2, 3] }),
            { key: 'test-users', refetchOnFocus: false, refetchOnReconnect: false },
        );

        expect(result.isLoading()).toBe(true);

        await waitUntil(() => result.isLoading() === false, 'the query to settle');

        expect(result.data()).toEqual({ users: [1, 2, 3] });
        expect(result.isLoading()).toBe(false);
        expect(result.error()).toBeUndefined();

        result.dispose();
    });

    it('handles errors', async () => {
        const result = useQuery(
            () => Promise.reject(new Error('network error')),
            { key: 'test-error', retry: 0, refetchOnFocus: false, refetchOnReconnect: false },
        );

        await waitUntil(() => !!result.error(), 'the query to report its failure');

        expect(result.error()).toBeTruthy();
        result.dispose();
    });

    it('supports optimistic mutation', async () => {
        const result = useQuery(
            () => Promise.resolve('original'),
            { key: 'test-mutate', refetchOnFocus: false, refetchOnReconnect: false },
        );

        await waitUntil(() => result.data() === 'original', 'the first value');
        expect(result.data()).toBe('original');

        result.mutate('optimistic');
        expect(result.data()).toBe('optimistic');

        result.dispose();
    });

    it('provides refetch method', async () => {
        let callCount = 0;
        const result = useQuery(
            () => { callCount++; return Promise.resolve(callCount); },
            { key: 'test-refetch', refetchOnFocus: false, refetchOnReconnect: false },
        );

        await waitUntil(() => result.data() === 1, 'the first value');
        expect(result.data()).toBe(1);

        await result.refetch();
        await waitUntil(() => callCount >= 2, 'the refetch to call the fetcher again');
        // refetch should have called the fetcher again
        expect(callCount).toBeGreaterThanOrEqual(2);

        result.dispose();
    });

    it('cleans up listeners on dispose', () => {
        const removeSpy = vi.spyOn(document, 'removeEventListener');
        const result = useQuery(
            () => Promise.resolve('data'),
            { key: 'test-cleanup' },
        );
        result.dispose();
        // Should have removed at least the visibilitychange listener
        expect(removeSpy).toHaveBeenCalled();
        removeSpy.mockRestore();
    });
});

// ═══════════════════════════════════════════════════════════════
// portal() with animation options
// ═══════════════════════════════════════════════════════════════

describe('portal() with animation', () => {
    it('accepts PortalOptions for enter/exit', () => {
        const container = document.createElement('div');
        container.id = 'portal-target';
        document.body.appendChild(container);

        const frag = portal(
            () => {
                const el = document.createElement('div');
                el.textContent = 'Hello';
                el.className = 'modal';
                return el;
            },
            '#portal-target',
            { enter: 'fade-in', exit: 'fade-out' },
        );

        document.body.appendChild(frag);

        // Content should be teleported to container
        const modal = container.querySelector('.modal');
        expect(modal).not.toBeNull();
        expect(modal!.textContent).toBe('Hello');

        // Cleanup
        container.remove();
    });

    it('still works without options (backward compat)', () => {
        const container = document.createElement('div');
        container.id = 'portal-compat';
        document.body.appendChild(container);

        const frag = portal(
            () => {
                const el = document.createElement('span');
                el.textContent = 'World';
                return el;
            },
            '#portal-compat',
        );

        document.body.appendChild(frag);
        expect(container.querySelector('span')!.textContent).toBe('World');
        container.remove();
    });
});
