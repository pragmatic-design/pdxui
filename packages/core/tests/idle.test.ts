// useIdle — how long since the user was last here.
//
// `createAuthStore` knows when the TOKEN expires; useIdle knows when the USER left, and those are
// different questions. A token that lives eight hours does not protect a screen left open on a
// shared desk, and an application handling anything regulated is asked for an inactivity timeout
// in its first review.
//
// Everything here runs on fake timers, and the one test that matters most does not trust them: a
// background tab's timers are throttled by the browser, so "idle after 15 minutes" has to be true
// by the WALL CLOCK when the tab comes back, not by a timer that was allowed to run.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useIdle } from '../src/browser/idle';

beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
});

afterEach(() => {
    vi.useRealTimers();
});

/** An activity event, as the document would see it. */
function activity(type = 'pointerdown'): void {
    document.dispatchEvent(new Event(type, { bubbles: true }));
}

describe('useIdle', () => {
    it('is not idle to begin with', () => {
        const idle = useIdle({ after: 1000 });
        expect(idle.isIdle()).toBe(false);
        expect(idle.msRemaining()).toBe(1000);
        idle.dispose();
    });

    it('becomes idle after the interval', () => {
        const idle = useIdle({ after: 1000 });
        vi.advanceTimersByTime(999);
        expect(idle.isIdle(), 'idle one millisecond early').toBe(false);
        vi.advanceTimersByTime(2);
        expect(idle.isIdle()).toBe(true);
        idle.dispose();
    });

    it('an activity event resets it', () => {
        const idle = useIdle({ after: 1000 });
        vi.advanceTimersByTime(900);
        activity();
        vi.advanceTimersByTime(900);
        expect(idle.isIdle(), 'the pointer event did not reset the countdown').toBe(false);
        vi.advanceTimersByTime(200);
        expect(idle.isIdle()).toBe(true);
        idle.dispose();
    });

    it('counts a key, a scroll and a touch as activity too', () => {
        for (const type of ['keydown', 'scroll', 'touchstart', 'pointermove']) {
            const idle = useIdle({ after: 1000 });
            vi.advanceTimersByTime(900);
            activity(type);
            vi.advanceTimersByTime(900);
            expect(idle.isIdle(), `${type} was not treated as activity`).toBe(false);
            idle.dispose();
        }
    });

    it('throttles the reset, so a mousemove storm is not a thousand resets', () => {
        // The reason this is not `addEventListener('mousemove', reset)`: a reset on every event
        // is a signal write on every event, and a signal write is a render.
        const idle = useIdle({ after: 10_000, throttle: 500 });
        const seen: number[] = [];
        const stop = [idle.msRemaining].map(s => {
            let last = s();
            return setInterval(() => { const v = s(); if (v !== last) { seen.push(v); last = v; } }, 1);
        });

        vi.advanceTimersByTime(600);
        for (let i = 0; i < 100; i++) activity('pointermove');
        vi.advanceTimersByTime(10);
        expect(idle.resetCount, '100 events produced more than a handful of resets').toBeLessThan(3);

        stop.forEach(clearInterval);
        idle.dispose();
    });

    it('warns once, at the right moment', () => {
        const onWarn = vi.fn();
        const idle = useIdle({ after: 10_000, warnBefore: 2_000, onWarn });

        vi.advanceTimersByTime(7_999);
        expect(onWarn, 'warned early').not.toHaveBeenCalled();
        vi.advanceTimersByTime(2);
        expect(onWarn).toHaveBeenCalledTimes(1);

        // Still one after more time passes: a warning that repeats is a dialog that cannot be read.
        vi.advanceTimersByTime(1_000);
        expect(onWarn).toHaveBeenCalledTimes(1);
        idle.dispose();
    });

    it('counts down, so a dialog can show the seconds left', () => {
        const idle = useIdle({ after: 10_000, tick: 1_000 });
        vi.advanceTimersByTime(3_000);
        expect(idle.msRemaining()).toBeLessThanOrEqual(7_000);
        expect(idle.msRemaining()).toBeGreaterThan(6_000);
        idle.dispose();
    });

    it('calls onIdle once when it goes idle', () => {
        const onIdle = vi.fn();
        const idle = useIdle({ after: 1_000, onIdle });
        vi.advanceTimersByTime(1_100);
        expect(onIdle).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(5_000);
        expect(onIdle, 'onIdle fired again while already idle').toHaveBeenCalledTimes(1);
        idle.dispose();
    });

    it('reset() says "I am still here", warning included', () => {
        const onWarn = vi.fn();
        const idle = useIdle({ after: 10_000, warnBefore: 2_000, onWarn });
        vi.advanceTimersByTime(8_100);
        expect(onWarn).toHaveBeenCalledTimes(1);

        idle.reset();
        expect(idle.isIdle()).toBe(false);
        vi.advanceTimersByTime(7_000);
        expect(onWarn, 'the warning did not arm again after a reset').toHaveBeenCalledTimes(1);
        // The warning window is checked on the TICK (1s by default), not continuously: a
        // countdown that reads once a second cannot warn at a finer grain than a second, and
        // asking it to would be asserting a timer resolution nobody needs.
        vi.advanceTimersByTime(2_000);
        expect(onWarn).toHaveBeenCalledTimes(2);
        idle.dispose();
    });

    it('a tab hidden longer than the timeout is idle on return, BY WALL CLOCK', () => {
        // The test the whole thing is for. A background tab's timers are throttled to once a
        // minute or stopped altogether, so an implementation that trusts `setTimeout` comes back
        // still logged in after an hour. The clock is asked instead, on `visibilitychange`.
        const idle = useIdle({ after: 5_000 });

        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        // The browser ran no timer at all — that is what being throttled means.
        vi.setSystemTime(new Date(Date.now() + 60_000));

        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        expect(idle.isIdle(), 'a tab asleep for a minute came back inside a 5s timeout').toBe(true);
        idle.dispose();
    });

    it('control — a tab hidden for LESS than the timeout is not idle on return', () => {
        // Without this, "always idle after any visibilitychange" would pass the test above.
        const idle = useIdle({ after: 60_000 });

        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        vi.setSystemTime(new Date(Date.now() + 5_000));
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        expect(idle.isIdle()).toBe(false);
        idle.dispose();
    });

    it('activity in another tab counts as activity here', () => {
        // A user working in a second tab of the same app has not left. `storage` is the cheap
        // answer, and the only one that needs no service worker.
        const idle = useIdle({ after: 10_000, crossTab: true });
        vi.advanceTimersByTime(9_000);

        window.dispatchEvent(Object.assign(new Event('storage'), {
            key: 'pdx:idle', newValue: String(Date.now()),
        }));

        vi.advanceTimersByTime(9_000);
        expect(idle.isIdle(), 'work in another tab did not count').toBe(false);
        idle.dispose();
    });

    it('dispose() removes every listener it added — counted, not trusted', () => {
        const added = new Map<string, number>();
        const addDoc = document.addEventListener.bind(document);
        const removeDoc = document.removeEventListener.bind(document);
        const count = (map: Map<string, number>, type: string, by: number) =>
            map.set(type, (map.get(type) ?? 0) + by);

        vi.spyOn(document, 'addEventListener').mockImplementation((t, l, o) => { count(added, String(t), 1); addDoc(t, l as EventListener, o); });
        vi.spyOn(document, 'removeEventListener').mockImplementation((t, l, o) => { count(added, String(t), -1); removeDoc(t, l as EventListener, o); });
        const winAdded = new Map<string, number>();
        const addWin = window.addEventListener.bind(window);
        const removeWin = window.removeEventListener.bind(window);
        vi.spyOn(window, 'addEventListener').mockImplementation((t, l, o) => { count(winAdded, String(t), 1); addWin(t, l as EventListener, o); });
        vi.spyOn(window, 'removeEventListener').mockImplementation((t, l, o) => { count(winAdded, String(t), -1); removeWin(t, l as EventListener, o); });

        const idle = useIdle({ after: 1_000, crossTab: true });
        expect([...added.values()].reduce((a, b) => a + b, 0), 'nothing was listened to').toBeGreaterThan(0);

        idle.dispose();

        const leftOnDocument = [...added.entries()].filter(([, n]) => n !== 0);
        const leftOnWindow = [...winAdded.entries()].filter(([, n]) => n !== 0);
        expect(leftOnDocument, 'listeners left on document').toEqual([]);
        expect(leftOnWindow, 'listeners left on window').toEqual([]);

        vi.restoreAllMocks();
    });

    it('and a disposed instance stops counting', () => {
        const onIdle = vi.fn();
        const idle = useIdle({ after: 1_000, onIdle });
        idle.dispose();
        vi.advanceTimersByTime(5_000);
        expect(onIdle, 'a disposed idle still fired').not.toHaveBeenCalled();
    });
});
