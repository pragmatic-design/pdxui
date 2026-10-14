// The load queue (#250): prefetches wait their turn — at most two at a time, and none while a load
// the visitor is waiting for is in flight — so a page of links cannot start dozens of downloads
// that compete with the navigation.

import { describe, it, expect, beforeEach } from 'vitest';
import { queuePrefetch, trackUrgentLoad, takePrefetch, cancelPrefetches, resetLoadQueue } from '../src/renderer/load-queue';
import { defer } from '../src/renderer/defer';

/** A load the test settles by hand. */
function controllable() {
    let resolve!: (v: unknown) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

/** Let the idle callback (setTimeout(0) here) and the promise callbacks run. */
const idle = () => new Promise((r) => setTimeout(r, 5));

/** A set of prefetches, recording when each one starts. */
function loads(n: number) {
    const started: number[] = [];
    const pending = Array.from({ length: n }, () => controllable());
    const queue = () => pending.forEach((p, i) => queuePrefetch(`route-${i}`, () => { started.push(i); return p.promise; }));
    return { started, pending, queue };
}

beforeEach(() => resetLoadQueue());

describe('the prefetch queue', () => {
    it('runs at most two prefetches at a time, and starts the next when one settles', async () => {
        const { started, pending, queue } = loads(50);
        queue();
        expect(started, 'a prefetch started before the browser was idle').toEqual([]);
        await idle();
        expect(started).toEqual([0, 1]);
        pending[0].resolve({});
        await idle();
        expect(started).toEqual([0, 1, 2]);
        pending[1].reject(new Error('offline'));
        await idle();
        expect(started, 'a failed prefetch did not free its place').toEqual([0, 1, 2, 3]);
    });

    it('queues a key once', () => {
        expect(queuePrefetch('a', () => Promise.resolve())).toBe(true);
        expect(queuePrefetch('a', () => Promise.resolve())).toBe(false);
    });

    it('starts nothing while a load the visitor waits for is in flight', async () => {
        const urgent = controllable();
        trackUrgentLoad(urgent.promise);
        const { started, queue } = loads(3);
        queue();
        await idle();
        expect(started, 'a prefetch competed with the navigation').toEqual([]);
        urgent.resolve({});
        await idle();
        expect(started).toEqual([0, 1]);
    });

    it('control — an urgent load that fails releases the queue too', async () => {
        const urgent = controllable();
        trackUrgentLoad(urgent.promise).catch(() => undefined);
        const { started, queue } = loads(1);
        queue();
        urgent.reject(new Error('offline'));
        await idle();
        expect(started).toEqual([0]);
    });
});

describe('a navigation takes its prefetch', () => {
    it('a queued one starts at once, whatever the queue is doing', async () => {
        const urgent = controllable();
        trackUrgentLoad(urgent.promise);
        const { started, queue } = loads(5);
        queue();
        const taken = takePrefetch('route-3');
        expect(taken).toBeInstanceOf(Promise);
        expect(started, 'the taken prefetch waited for its turn').toEqual([3]);
    });

    it('a running one is handed over as it is, not started again', async () => {
        const { started, pending, queue } = loads(2);
        queue();
        await idle();
        const taken = takePrefetch('route-0');
        expect(started).toEqual([0, 1]);
        pending[0].resolve('module');
        await expect(taken).resolves.toBe('module');
    });

    it('a taken prefetch is the navigation\'s load: it holds the queue back', async () => {
        const { started, pending, queue } = loads(4);
        queue();
        takePrefetch('route-2');
        await idle();
        expect(started, 'a prefetch started beside the navigation').toEqual([2]);
        pending[2].resolve({});
        await idle();
        expect(started).toEqual([2, 0, 1]);
    });

    it('nothing to take: undefined, and the navigation loads on its own', () => {
        expect(takePrefetch('nowhere')).toBeUndefined();
    });

    it('cancelPrefetches drops what is queued, except the target, and says what it dropped', async () => {
        const { started, queue } = loads(4);
        queue();
        expect(cancelPrefetches('route-1')).toEqual(['route-0', 'route-2', 'route-3']);
        await idle();
        expect(started).toEqual([1]);
        // Dropped means forgotten: the same key can be queued again.
        expect(queuePrefetch('route-0', () => Promise.resolve())).toBe(true);
    });
});

describe('@defer', () => {
    it('a deferred block\'s load in flight holds queued prefetches back', async () => {
        const block = controllable();
        const host = document.createElement('div');
        document.body.appendChild(host);
        host.appendChild(defer({ trigger: 'immediate' }, () => block.promise, () => document.createTextNode('loaded')));
        await idle();
        const { started, queue } = loads(1);
        queue();
        await idle();
        expect(started, 'a prefetch competed with the @defer block on screen').toEqual([]);
        block.resolve({});
        await idle();
        expect(started).toEqual([0]);
        host.remove();
    });
});
