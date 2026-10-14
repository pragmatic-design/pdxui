// processInSlices (#240): a long loop over data, split into slices of about 5 ms that yield to
// input between them, so a click or a keystroke is answered while the job runs. The time each slice
// takes is measured with performance.now(), which these tests drive by hand, and every yield goes
// through a MessageChannel, which they count.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { processInSlices } from '../src/utils/slices';
import { signal, effect } from '../src/index';

type SchedulerHost = { scheduler?: { yield?: () => Promise<void> } };
const host = globalThis as unknown as SchedulerHost;
const originalScheduler = host.scheduler;

/** A clock that moves only when an item says so. */
function fakeClock() {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    return { advance: (ms: number) => { now += ms; } };
}

/** Count the yields: `onYield` runs as each MessageChannel is made. */
function countYields(onYield: () => void) {
    const Original = globalThis.MessageChannel;
    vi.stubGlobal('MessageChannel', class extends Original {
        constructor() { super(); onYield(); }
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    host.scheduler = originalScheduler;
});

describe('processInSlices', () => {
    it('processes every item, in order, with its index', async () => {
        const seen: Array<[string, number]> = [];
        await processInSlices(['a', 'b', 'c', 'd'], (item, index) => { seen.push([item, index]); });
        expect(seen).toEqual([['a', 0], ['b', 1], ['c', 2], ['d', 3]]);
    });

    it('yields a MessageChannel macrotask after each 5 ms of work, never a timer', async () => {
        const clock = fakeClock();
        const yields: number[] = [];
        let processed = 0;
        countYields(() => yields.push(processed));
        const timeout = vi.spyOn(globalThis, 'setTimeout');
        // Each item costs 1 ms: a slice holds five items, then yields.
        await processInSlices(Array.from({ length: 12 }, (_, i) => i), () => { processed++; clock.advance(1); });
        expect(processed).toBe(12);
        expect(yields).toEqual([5, 10]);
        expect(timeout).not.toHaveBeenCalled();
    });

    it('takes a longer slice with sliceMs', async () => {
        const clock = fakeClock();
        const yields: number[] = [];
        let processed = 0;
        countYields(() => yields.push(processed));
        await processInSlices(Array.from({ length: 50 }, (_, i) => i), () => { processed++; clock.advance(1); }, { sliceMs: 20 });
        expect(yields).toEqual([20, 40]);
    });

    it('does not use scheduler.yield where it exists', async () => {
        const clock = fakeClock();
        const schedulerYield = vi.fn(async () => {});
        host.scheduler = { yield: schedulerYield };
        const yields: number[] = [];
        countYields(() => yields.push(1));
        await processInSlices(Array.from({ length: 12 }, (_, i) => i), () => { clock.advance(1); });
        expect(schedulerYield).not.toHaveBeenCalled();
        expect(yields).toHaveLength(2);
    });

    it('does not yield when the whole job fits in one slice', async () => {
        const yields: number[] = [];
        countYields(() => yields.push(1));
        await processInSlices([1, 2, 3], () => {});
        expect(yields).toEqual([]);
    });

    it('stops when the signal aborts between slices, rejecting with its reason and processing no later item', async () => {
        const clock = fakeClock();
        const controller = new AbortController();
        const seen: number[] = [];
        countYields(() => controller.abort());
        const run = processInSlices(Array.from({ length: 20 }, (_, i) => i), (i) => { seen.push(i); clock.advance(1); }, { signal: controller.signal });
        await expect(run).rejects.toMatchObject({ name: 'AbortError' });
        expect(seen).toEqual([0, 1, 2, 3, 4]);
    });

    it('stops at the next item when work itself aborts mid-slice', async () => {
        const controller = new AbortController();
        const reason = new Error('the filter changed');
        const seen: number[] = [];
        const run = processInSlices([0, 1, 2, 3], (i) => { seen.push(i); if (i === 1) controller.abort(reason); }, { signal: controller.signal });
        await expect(run).rejects.toBe(reason);
        expect(seen).toEqual([0, 1]);
    });

    it('processes nothing when the signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        const work = vi.fn();
        await expect(processInSlices([1, 2, 3], work, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(work).not.toHaveBeenCalled();
    });

    it('rejects with the error work throws, and processes no later item', async () => {
        const seen: number[] = [];
        const run = processInSlices([0, 1, 2], (i) => { seen.push(i); if (i === 1) throw new Error('bad row'); });
        await expect(run).rejects.toThrow('bad row');
        expect(seen).toEqual([0, 1]);
    });

    it('leaves signal writes to the ordinary flush: an effect sees what the same plain loop shows it', async () => {
        const items = Array.from({ length: 10 }, (_, i) => i);
        const observe = async (run: (write: (i: number) => void) => Promise<void> | void) => {
            const total = signal(0);
            const seen: number[] = [];
            const dispose = effect(() => { seen.push(total()); });
            await run((i) => total.set((t) => t + i));
            await Promise.resolve();
            dispose();
            return seen;
        };
        const plain = await observe((write) => { for (const i of items) write(i); });
        const clock = fakeClock();
        const sliced = await observe((write) => processInSlices(items, (i) => { write(i); clock.advance(1); }));
        expect(sliced).toEqual(plain);
        expect(sliced[sliced.length - 1]).toBe(45);
    });
});
