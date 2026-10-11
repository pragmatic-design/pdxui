// Dependency tracking records a source once per run and keeps its subscriptions between runs (#116).
//
// Every read did `subscribers.add(reader)` and pushed the source into the reader's list, with no
// dedupe, and every effect run detached from every source and re-attached as it read them again:
// a signal read three times was three entries, and an effect whose reads never change paid one
// delete and one add per source per run. Now a run records a source once, and a re-run whose reads
// are the same touches no subscription at all.
//
// What the runs SEE must not move with it: an effect that writes a source before reading it again
// in the same run does not schedule itself, as when it was detached; one that reads and then writes
// does; a source no longer read stops notifying. Those rows guard the old semantics.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { signal, computed, effect } from '../src/index';
import { _getCurrentEffect } from '../src/reactivity/signal';

afterEach(() => { vi.restoreAllMocks(); });

/**
 * The calls `Set.prototype[method]` received for `subscriber` while `fn` ran. An `add` count includes
 * the one the flush queue makes to schedule the effect (its dedup set): one, whatever the tracking.
 */
function setCalls(method: 'add' | 'delete', subscriber: unknown, fn: () => void): number {
    const spy = vi.spyOn(Set.prototype, method);
    try {
        fn();
        return spy.mock.calls.filter(([arg]) => arg === subscriber).length;
    } finally {
        spy.mockRestore();
    }
}

describe('dependency tracking reuses what did not change', () => {
    it('a source read three times in one run is recorded once', () => {
        const s = signal(0);
        let run: unknown;
        effect(() => { run = _getCurrentEffect(); s(); s(); s(); });
        const adds = setCalls('add', run, () => s.set(1));
        expect(adds, 'the same source was subscribed once per read').toBeLessThanOrEqual(1);
    });

    it('a re-run with the same reads detaches from nothing and re-attaches to nothing', () => {
        const a = signal(0);
        const b = signal(0);
        let run: unknown;
        effect(() => { run = _getCurrentEffect(); a(); b(); });
        let adds = 0;
        const deletes = setCalls('delete', run, () => {
            adds = setCalls('add', run, () => a.set(1));
        });
        expect(deletes, 'the run detached from sources it read again').toBe(0);
        // The one add is the queue's; two more were a and b re-attached.
        expect(adds, 'the run re-attached to sources it was attached to').toBeLessThanOrEqual(1);
    });

    it('a computed that reads the same source twice prunes nothing it read again', () => {
        const s = signal(1);
        const doubled = computed(() => s() + s());
        let effectRuns = 0;
        effect(() => { doubled(); effectRuns++; });
        s.set(2);
        expect(doubled()).toBe(4);
        expect(effectRuns).toBe(2);
    });
});

describe('and what a run sees does not change', () => {
    it('writing a source before reading it again does not schedule the effect itself', () => {
        const s = signal(0);
        const trigger = signal(0);
        let runs = 0;
        effect(() => { trigger(); s.set(s.peek() + 1); s(); runs++; });
        runs = 0;
        trigger.set(1);
        expect(runs).toBe(1);
    });

    it('reading a source and then writing it schedules the effect again', () => {
        const s = signal(0);
        let runs = 0;
        effect(() => { runs++; if (s() < 3) s.set(s() + 1); });
        expect(s()).toBe(3);
        expect(runs).toBe(4);
    });

    it('a source no longer read stops notifying, and one read again resumes', () => {
        const flag = signal(true);
        const a = signal(0);
        const b = signal(0);
        let runs = 0;
        effect(() => { runs++; if (flag()) a(); else b(); });
        flag.set(false);
        runs = 0;
        a.set(1);
        expect(runs, 'a was dropped').toBe(0);
        b.set(1);
        expect(runs, 'b is now read').toBe(1);
        flag.set(true);
        runs = 0;
        a.set(2);
        expect(runs, 'a is read again').toBe(1);
        b.set(2);
        expect(runs, 'b was dropped').toBe(1);
    });

    it('the reads change order between runs and every source still notifies', () => {
        const order = signal(true);
        const a = signal(0);
        const b = signal(0);
        let runs = 0;
        effect(() => { runs++; if (order()) { a(); b(); } else { b(); a(); } });
        order.set(false);
        runs = 0;
        a.set(1);
        b.set(1);
        expect(runs).toBe(2);
    });
});
