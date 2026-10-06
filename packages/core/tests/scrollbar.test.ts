// Coverage (gesture/DOM): useScrollbar — custom overlay scrollbar.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useScrollbar } from '../src/component/scrollbar';

function ptr(type: string, opts: { x?: number; y?: number } = {}): MouseEvent {
    return new MouseEvent(type, { clientX: opts.x ?? 0, clientY: opts.y ?? 0, bubbles: true, cancelable: true });
}

function mockDims(el: HTMLElement, sh: number, ch: number, sw = 100, cw = 100) {
    let st = 0, sl = 0;
    Object.defineProperty(el, 'scrollHeight', { value: sh, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: ch, configurable: true });
    Object.defineProperty(el, 'scrollWidth', { value: sw, configurable: true });
    Object.defineProperty(el, 'clientWidth', { value: cw, configurable: true });
    Object.defineProperty(el, 'scrollTop', { get: () => st, set: (v) => { st = v; }, configurable: true });
    Object.defineProperty(el, 'scrollLeft', { get: () => sl, set: (v) => { sl = v; }, configurable: true });
}

let el: HTMLElement;
beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    el = document.createElement('div');
    el.appendChild(document.createElement('div')); // content child
    mockDims(el, 300, 100); // overflowing vertically
    document.body.appendChild(el);
});
afterEach(() => vi.unstubAllGlobals());

describe('useScrollbar', () => {
    it('wraps the container and creates a vertical track + thumb', () => {
        const sb = useScrollbar(() => el, { axis: 'vertical' });
        const wrapper = el.parentElement!;
        expect(wrapper.style.position).toBe('relative');
        const track = wrapper.querySelector('[data-pdx-scrollbar-track="v"]') as HTMLElement;
        expect(track).toBeTruthy();
        const thumb = track.querySelector('[data-pdx-scrollbar-thumb]') as HTMLElement;
        // ratio 100/300 → thumb sized, visible
        expect(parseFloat(thumb.style.height)).toBeGreaterThanOrEqual(24);
        expect(thumb.style.opacity).toBe('1');
        expect(sb.scrollTop()).toBe(0);
        sb.dispose();
    });

    it('hides the track when content fits (ratio ≥ 1)', () => {
        mockDims(el, 100, 100); // no overflow
        const sb = useScrollbar(() => el, { axis: 'vertical' });
        const track = el.parentElement!.querySelector('[data-pdx-scrollbar-track="v"]') as HTMLElement;
        expect(track.style.display).toBe('none');
        sb.dispose();
    });

    it('recalculate reflects the current scroll position', () => {
        const sb = useScrollbar(() => el, { axis: 'vertical' });
        el.scrollTop = 150;
        sb.recalculate();
        expect(sb.scrollTop()).toBe(150);
        sb.dispose();
    });

    it('scrollTo / scrollBy / scrollIntoView delegate to the container', () => {
        el.scrollTo = vi.fn();
        el.scrollBy = vi.fn();
        const sb = useScrollbar(() => el, { axis: 'vertical' });
        sb.scrollTo({ top: 50 });
        sb.scrollBy({ top: 10 });
        expect(el.scrollTo).toHaveBeenCalledWith({ top: 50 });
        expect(el.scrollBy).toHaveBeenCalledWith({ top: 10 });
        const child = document.createElement('div');
        child.scrollIntoView = vi.fn();
        sb.scrollIntoView(child, { block: 'center' });
        expect(child.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
        sb.dispose();
    });

    it('dragging the thumb scrolls the container', () => {
        const sb = useScrollbar(() => el, { axis: 'vertical' });
        const thumb = el.parentElement!.querySelector('[data-pdx-scrollbar-thumb]') as HTMLElement;
        thumb.dispatchEvent(ptr('pointerdown', { y: 0 }));
        document.dispatchEvent(ptr('pointermove', { y: 20 })); // ratio 3 → scrollTop = 60
        expect(el.scrollTop).toBe(60);
        document.dispatchEvent(ptr('pointerup', { y: 20 }));
        sb.dispose();
    });

    it('clicking the track jumps to a position', () => {
        const sb = useScrollbar(() => el, { axis: 'vertical' });
        const track = el.parentElement!.querySelector('[data-pdx-scrollbar-track="v"]') as HTMLElement;
        track.getBoundingClientRect = () => ({ top: 0, left: 0, height: 100, width: 8, bottom: 100, right: 8, x: 0, y: 0, toJSON() {} }) as DOMRect;
        track.dispatchEvent(ptr('click', { y: 50 })); // 50% → scrollTop = 0.5 * (300-100) = 100
        expect(el.scrollTop).toBe(100);
        sb.dispose();
    });

    it('dispose unwraps the container', () => {
        const sb = useScrollbar(() => el, { axis: 'vertical' });
        expect(el.parentElement!.style.position).toBe('relative'); // inside wrapper
        sb.dispose();
        expect(el.parentElement).toBe(document.body); // back out
        expect(el.hasAttribute('data-pdx-scrollbar')).toBe(false);
    });
});
