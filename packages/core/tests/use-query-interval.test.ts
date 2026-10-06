// `useQuery`'s polling.
//
// `refetchInterval` is public, documented in `api.md` and in `data.md`, and acted on in three lines
// of `use-query.ts`.
//
// Three lines are small enough to look safe, and each has a way to be wrong that only a clock
// finds: an interval that outlives the component that made it, a tab nobody is looking at being
// polled forever, and a tick arriving while the last one is still in flight.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useQuery } from '../src/reactivity/use-query';
import { collectDisposers } from '../src/reactivity/signal';
import { getDefaultCache } from '../src/reactivity/cache';

const PERIOD = 1_000;

/** A fetcher that counts, and whose promise this test decides when to settle. */
function countingFetcher() {
    const calls: (() => void)[] = [];
    let count = 0;
    const fetcher = (): Promise<number> => {
        count++;
        return new Promise<number>((resolve) => {
            calls.push(() => resolve(count));
        });
    };
    return {
        fetcher,
        get count() { return count; },
        /** Settle every request issued so far. */
        settleAll() { for (const r of calls.splice(0)) r(); },
        get inFlight() { return calls.length; },
    };
}

/** A fetcher that resolves immediately — for the tests that only count ticks. */
function tickCounter() {
    let count = 0;
    return { fetcher: () => { count++; return Promise.resolve(count); }, get count() { return count; } };
}

let keySeq = 0;
const nextKey = (): string => `use-query-interval-${++keySeq}`;

/** Options that leave ONLY the interval in play: focus and reconnect off, no cache reuse. */
function opts(key: string, extra: Record<string, unknown> = {}) {
    return { key, refetchOnFocus: false, refetchOnReconnect: false, staleTime: 0, ...extra };
}

beforeEach(() => {
    vi.useFakeTimers();
    getDefaultCache().clear();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('useQuery: refetchInterval', () => {
    it('fires once per period, and the query refetches each time', async () => {
        const f = tickCounter();
        const q = useQuery(f.fetcher, opts(nextKey(), { refetchInterval: PERIOD }));
        await vi.advanceTimersByTimeAsync(0);
        const afterFirstLoad = f.count;
        expect(afterFirstLoad, 'the initial load did not happen').toBe(1);

        await vi.advanceTimersByTimeAsync(PERIOD * 3);
        expect(f.count - afterFirstLoad, 'three periods did not produce three refetches').toBe(3);
        q.dispose();
    });

    it('no option, or zero, schedules nothing at all', async () => {
        const none = tickCounter();
        const zero = tickCounter();
        const a = useQuery(none.fetcher, opts(nextKey()));
        const b = useQuery(zero.fetcher, opts(nextKey(), { refetchInterval: 0 }));
        await vi.advanceTimersByTimeAsync(0);

        await vi.advanceTimersByTimeAsync(PERIOD * 10);
        expect(none.count, 'a query with no interval polled').toBe(1);
        expect(zero.count, 'refetchInterval: 0 polled').toBe(1);
        a.dispose();
        b.dispose();
    });

    it('dispose() clears it: ten periods later, nothing more has been asked for', async () => {
        const f = tickCounter();
        const q = useQuery(f.fetcher, opts(nextKey(), { refetchInterval: PERIOD }));
        await vi.advanceTimersByTimeAsync(PERIOD * 2);
        const atDispose = f.count;
        expect(atDispose, 'the control failed: it was not polling in the first place').toBeGreaterThan(1);

        q.dispose();
        await vi.advanceTimersByTimeAsync(PERIOD * 10);
        expect(f.count, 'the interval survived dispose()').toBe(atDispose);
    });

    // ── The unmount path, which is NOT the dispose path ────────────────────────
    //
    // A component's `body()` — and so its `setup()` — runs inside `collectDisposers`
    // (`component/element.ts:211`), and the disposer it returns is what runs on disconnect. That is
    // the only teardown a component gets for free: nothing calls `useQuery().dispose()` for it. So
    // a query created in a component and never explicitly disposed used to leave a `setInterval`
    // running for the life of the tab — a request every N seconds against a screen that is gone —
    // plus its `visibilitychange` and `online` listeners.
    it('unmounting the scope that created it clears the interval', async () => {
        const f = tickCounter();
        const [, disposeScope] = collectDisposers(() =>
            useQuery(f.fetcher, opts(nextKey(), { refetchInterval: PERIOD })));
        await vi.advanceTimersByTimeAsync(PERIOD * 2);
        const atUnmount = f.count;
        expect(atUnmount, 'the control failed: it was not polling in the first place').toBeGreaterThan(1);

        disposeScope();
        await vi.advanceTimersByTimeAsync(PERIOD * 10);
        expect(f.count, 'the interval outlived the scope that created it').toBe(atUnmount);
    });

    it('the ownership scope also takes the focus and reconnect listeners with it', async () => {
        // Same leak, same fix, different symptom: the two listeners are attached to `document` and
        // `window`, so they outlive the component just as the interval did — and each one refetches
        // a resource whose screen is gone.
        const f = tickCounter();
        const [, disposeScope] = collectDisposers(() =>
            useQuery(f.fetcher, { key: nextKey(), staleTime: 0 }));
        await vi.advanceTimersByTimeAsync(0);
        const atUnmount = f.count;

        disposeScope();
        window.dispatchEvent(new Event('online'));
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(0);
        expect(f.count, 'a listener from a disposed query still refetches').toBe(atUnmount);
    });

    // ── The hidden tab ─────────────────────────────────────────────────────────
    //
    // The decision, written down here so it lives in the suite and not in someone's memory: the
    // interval does NOT fire while the tab is hidden, and it does not fire a catch-up round when it
    // comes back either — `refetchOnFocus`, on by default, already does exactly that. Pausing is
    // therefore free: the same freshness the moment the user returns, and none of the requests in
    // between. An app that turned `refetchOnFocus` off has no catch-up, so for that app the
    // interval keeps running hidden; that is the one case where polling a background tab is the
    // lesser wrong.
    //
    // This asserts OUR branch on `document.visibilityState`, not the browser's delivery of it.
    it('does not poll a hidden tab, and resumes when it comes back', async () => {
        const f = tickCounter();
        // NOT `opts()`: that helper turns `refetchOnFocus` off, and the pause is conditional on it
        // — without a focus refetch there would be nothing to catch up on return.
        const q = useQuery(f.fetcher, {
            key: nextKey(), staleTime: 0, refetchOnReconnect: false, refetchInterval: PERIOD,
        });
        await vi.advanceTimersByTimeAsync(PERIOD);
        const whileVisible = f.count;
        expect(whileVisible).toBe(2);

        setVisibility('hidden');
        await vi.advanceTimersByTimeAsync(PERIOD * 5);
        expect(f.count, 'a hidden tab was polled').toBe(whileVisible);

        setVisibility('visible');
        await vi.advanceTimersByTimeAsync(PERIOD);
        expect(f.count, 'polling did not resume when the tab came back').toBe(whileVisible + 1);
        q.dispose();
    });

    it('keeps polling a hidden tab when refetchOnFocus is off, because nothing else would catch up', async () => {
        const f = tickCounter();
        const q = useQuery(f.fetcher, {
            key: nextKey(), staleTime: 0, refetchOnReconnect: false, refetchOnFocus: false,
            refetchInterval: PERIOD,
        });
        await vi.advanceTimersByTimeAsync(0);
        const before = f.count;

        setVisibility('hidden');
        await vi.advanceTimersByTimeAsync(PERIOD * 3);
        expect(f.count - before, 'the interval stopped, and nothing will refetch on return').toBe(3);
        setVisibility('visible');
        q.dispose();
    });

    // ── Overlap ────────────────────────────────────────────────────────────────
    //
    // The decision: a tick that arrives while the previous refetch is STILL IN FLIGHT is skipped.
    // "Poll every second" means asking every second, not starting a request every second whatever
    // happened to the last one. Before this, `refetch()` was called on every tick regardless, and
    // each call started a new fetch — at a 1s interval against a 3s endpoint that is a request per
    // second, none of which is ever the one whose result gets used.
    it('skips a tick while a refetch is still in flight', async () => {
        const f = countingFetcher();
        const q = useQuery(f.fetcher, opts(nextKey(), { refetchInterval: PERIOD }));
        await vi.advanceTimersByTimeAsync(0);
        expect(f.count, 'the initial load did not start').toBe(1);
        f.settleAll();
        await vi.advanceTimersByTimeAsync(0);

        // One tick starts a refetch and nothing settles it.
        await vi.advanceTimersByTimeAsync(PERIOD);
        expect(f.count).toBe(2);

        // Four more ticks pass with that refetch still open.
        await vi.advanceTimersByTimeAsync(PERIOD * 4);
        expect(f.count, 'a tick started a second request while one was in flight').toBe(2);
        expect(f.inFlight, 'requests are stacking').toBe(1);

        // It settles; the next tick polls again.
        f.settleAll();
        await vi.advanceTimersByTimeAsync(PERIOD);
        expect(f.count, 'polling did not resume after the in-flight request settled').toBe(3);
        q.dispose();
    });
});

/** happy-dom does not let `visibilityState` be assigned; the getter is what our branch reads. */
function setVisibility(value: 'visible' | 'hidden'): void {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
}
