// Breaking a reactive loop must not leave the rest of the page deaf.
//
// The flush guard stops a loop after MAX_FLUSH_ITERATIONS by dropping everything still queued. Every
// effect in that queue has already been told, and a computed notifies once: `markDirty` returns early
// while `dirty` is true, on the promise that a reader is already pending. Dropping the queue breaks that
// promise. A computed marked dirty in the last cycle stays dirty with nobody left to read it, and every
// later notification stops at the early return — the binding behind it never runs again: the graph
// intact, both computeds dirty, the screen stale.
//
// The loop itself stays broken — re-running it is what the guard exists to prevent. What must come back
// is everything ELSE, on the next ordinary change.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { signal, computed, effect, batch } from '../src/reactivity/signal';

afterEach(() => { vi.restoreAllMocks(); });

/**
 * A real loop, and a bystander dirtied inside it.
 *
 * Two effects that write each other's signal never settle. The second also writes `src` on every turn,
 * so `doubled` is marked dirty in each cycle and its reader is queued for the next one — which is how
 * the reader ends up in the queue the guard throws away.
 */
function loopWithBystander() {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const src = signal(1);
    const doubled = computed(() => src() * 2);
    let seen = 0;
    let readerRuns = 0;
    const reader = effect(() => { seen = doubled(); readerRuns++; });

    const a = signal(0);
    const b = signal(0);
    let loopRuns = 0;
    const one = effect(() => { loopRuns++; b.set(a() + 1); });
    const two = effect(() => { loopRuns++; const v = b(); a.set(v + 1); src.set(v); });

    return {
        src, errors,
        seen: () => seen,
        readerRuns: () => readerRuns,
        loopRuns: () => loopRuns,
        dispose: () => { reader(); one(); two(); },
    };
}

describe('after the flush guard breaks a loop', () => {
    it('control — the guard really fired, so the rows below measure its aftermath', () => {
        const t = loopWithBystander();
        expect(t.errors, 'no loop was detected: every row below would measure nothing')
            .toHaveBeenCalledWith(expect.stringContaining('Infinite reactive loop'));
        t.dispose();
    });

    it('a computed dirtied in the broken flush updates its binding on the next ordinary change', () => {
        const t = loopWithBystander();

        t.src.set(999);
        expect(t.seen(), 'the computed stayed dirty and deaf: the binding never ran again').toBe(1998);
        t.dispose();
    });

    it('and on every change after that, not just the first', () => {
        const t = loopWithBystander();
        t.src.set(10);
        t.src.set(20);
        expect(t.seen()).toBe(40);
        t.dispose();
    });

    it('control — recovering the bystander does not restart the loop', () => {
        const t = loopWithBystander();
        const before = t.loopRuns();

        t.src.set(999);
        expect(t.loopRuns(), 'the recovery re-ran the loop the guard had just stopped').toBe(before);
        t.dispose();
    });
});

describe('the early return it relies on still holds without a broken flush', () => {
    it('two writes before a read notify the reader once', () => {
        // The epoch must not turn `markDirty` into «notify on every write». A computed dirtied twice
        // in one batch is still one notification, one run.
        const s = signal(0);
        const c = computed(() => s() + 1);
        let runs = 0;
        const stop = effect(() => { c(); runs++; });
        expect(runs).toBe(1);

        batch(() => { s.set(1); s.set(2); });
        expect(runs, 'the reader ran once per write instead of once per batch').toBe(2);
        stop();
    });
});
