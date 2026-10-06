// Coverage (gesture): usePullToRefresh — overscroll-to-refresh touch gesture.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePullToRefresh } from '../src/mobile/pull-to-refresh';

function touch(type: string, clientY: number): Event {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'touches', { value: [{ clientY }] });
    return e;
}
function setScrollTop(el: HTMLElement, v: number) {
    Object.defineProperty(el, 'scrollTop', { value: v, configurable: true });
}
const tick = () => new Promise(r => setTimeout(r, 0));

describe('usePullToRefresh', () => {
    let el: HTMLElement;
    beforeEach(() => {
        document.body.innerHTML = '';
        el = document.createElement('div');
        setScrollTop(el, 0);
        document.body.appendChild(el);
    });

    it('pulls with resistance and reports progress', () => {
        const r = usePullToRefresh(() => el, { onRefresh: () => Promise.resolve(), threshold: 80, resistance: 0.4 });
        el.dispatchEvent(touch('touchstart', 0));
        el.dispatchEvent(touch('touchmove', 100)); // raw 100 → delta 40
        expect(r.isPulling()).toBe(true);
        expect(r.pullDistance()).toBeCloseTo(40);
        expect(r.progress()).toBeCloseTo(0.5);
        r.dispose();
    });

    it('clamps pull distance to maxPull', () => {
        const r = usePullToRefresh(() => el, { onRefresh: () => Promise.resolve(), maxPull: 150, resistance: 1 });
        el.dispatchEvent(touch('touchstart', 0));
        el.dispatchEvent(touch('touchmove', 500));
        expect(r.pullDistance()).toBe(150);
        r.dispose();
    });

    it('triggers refresh when released past threshold, then resets', async () => {
        const onRefresh = vi.fn(() => Promise.resolve());
        const r = usePullToRefresh(() => el, { onRefresh, threshold: 80, resistance: 0.4 });
        el.dispatchEvent(touch('touchstart', 0));
        el.dispatchEvent(touch('touchmove', 250)); // delta = min(150, 100) = 100 ≥ 80
        el.dispatchEvent(touch('touchend', 250));

        expect(onRefresh).toHaveBeenCalledTimes(1);
        expect(r.isRefreshing()).toBe(true);
        await tick();
        expect(r.isRefreshing()).toBe(false);
        expect(r.pullDistance()).toBe(0);
        r.dispose();
    });

    it('resets without refresh when released below threshold', () => {
        const onRefresh = vi.fn(() => Promise.resolve());
        const r = usePullToRefresh(() => el, { onRefresh, threshold: 80, resistance: 0.4 });
        el.dispatchEvent(touch('touchstart', 0));
        el.dispatchEvent(touch('touchmove', 50)); // delta 20 < 80
        el.dispatchEvent(touch('touchend', 50));
        expect(onRefresh).not.toHaveBeenCalled();
        expect(r.pullDistance()).toBe(0);
        r.dispose();
    });

    it('does nothing when disabled or not at top', () => {
        const onRefresh = vi.fn(() => Promise.resolve());
        const disabledR = usePullToRefresh(() => el, { onRefresh, disabled: () => true });
        el.dispatchEvent(touch('touchstart', 0));
        el.dispatchEvent(touch('touchmove', 250));
        expect(disabledR.isPulling()).toBe(false);
        disabledR.dispose();

        setScrollTop(el, 50); // not at top
        const r = usePullToRefresh(() => el, { onRefresh, resistance: 0.4 });
        el.dispatchEvent(touch('touchstart', 0));
        el.dispatchEvent(touch('touchmove', 250));
        expect(r.isPulling()).toBe(false);
        r.dispose();
    });
});
