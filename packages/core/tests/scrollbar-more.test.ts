// useScrollbar — the overlay scrollbar.
//
// happy-dom lays nothing out, so scrollHeight and clientHeight are 0 and every ratio would be NaN.
// The metrics are defined on the element instead: that is not a workaround, it is the only way to
// test thumb geometry at all without a real engine, and the geometry is the whole file.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useScrollbar } from '../src/component/scrollbar';

let host: HTMLElement;
let area: HTMLElement;

/** Give the element the scroll metrics a real layout would have. */
function metrics(el: HTMLElement, m: {
    scrollHeight?: number; clientHeight?: number;
    scrollWidth?: number; clientWidth?: number;
    scrollTop?: number; scrollLeft?: number;
}): void {
    for (const [k, v] of Object.entries(m)) {
        if (k === 'scrollTop' || k === 'scrollLeft') {
            let current = v as number;
            Object.defineProperty(el, k, {
                configurable: true,
                get: () => current,
                set: (next: number) => { current = next; },
            });
        } else {
            Object.defineProperty(el, k, { configurable: true, get: () => v as number });
        }
    }
}

const vTrack = () => document.querySelector<HTMLElement>('[data-pdx-scrollbar-track="v"]');
const hTrack = () => document.querySelector<HTMLElement>('[data-pdx-scrollbar-track="h"]');
const thumbIn = (track: HTMLElement | null) =>
    track?.querySelector<HTMLElement>('[data-pdx-scrollbar-thumb]') ?? null;

function pointer(type: string, target: EventTarget, x: number, y: number): void {
    const e = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
    Object.defineProperties(e, { clientX: { value: x }, clientY: { value: y }, pointerId: { value: 1 } });
    target.dispatchEvent(e);
}

beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    area = document.createElement('div');
    host.appendChild(area);
    document.body.appendChild(host);
    // Tall content in a short box: 1000px of content, 200px visible.
    metrics(area, { scrollHeight: 1000, clientHeight: 200, scrollWidth: 200, clientWidth: 200, scrollTop: 0, scrollLeft: 0 });
});

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

describe('useScrollbar — what it builds', () => {
    it('wraps the container and hangs a track beside it', () => {
        const s = useScrollbar(() => area);

        const wrapper = area.parentElement!;
        expect(wrapper, 'the container was not wrapped').not.toBe(host);
        expect(wrapper.style.position).toBe('relative');
        expect(vTrack()?.parentElement, 'the track scrolls with the content instead of floating')
            .toBe(wrapper);
        expect(thumbIn(vTrack())).toBeTruthy();
        s.dispose();
    });

    it('hides the native scrollbar', () => {
        const s = useScrollbar(() => area);
        expect(area.style.overflow).toBe('auto');
        expect(area.style.scrollbarWidth).toBe('none');
        expect(area.hasAttribute('data-pdx-scrollbar')).toBe(true);
        expect(document.head.querySelector('style')?.textContent).toContain('::-webkit-scrollbar');
        s.dispose();
    });

    it('builds only the axis it was asked for', () => {
        const v = useScrollbar(() => area);
        expect(vTrack()).toBeTruthy();
        expect(hTrack()).toBeNull();
        v.dispose();

        const h = useScrollbar(() => area, { axis: 'horizontal' });
        expect(vTrack()).toBeNull();
        expect(hTrack()).toBeTruthy();
        h.dispose();

        const both = useScrollbar(() => area, { axis: 'both' });
        expect(vTrack()).toBeTruthy();
        expect(hTrack()).toBeTruthy();
        both.dispose();
    });

    it('takes the classes it is given', () => {
        const s = useScrollbar(() => area, { trackClass: 'my-track', thumbClass: 'my-thumb' });
        expect(vTrack()?.classList.contains('my-track')).toBe(true);
        expect(thumbIn(vTrack())?.classList.contains('my-thumb')).toBe(true);
        s.dispose();
    });
});

describe('useScrollbar — the thumb geometry', () => {
    it('sizes the thumb by the proportion visible', () => {
        // 200 of 1000 visible → a fifth of the 200px track → 40px.
        const s = useScrollbar(() => area);
        expect(thumbIn(vTrack())?.style.height).toBe('40px');
        s.dispose();
    });

    it('never shrinks below the minimum, however long the content', () => {
        metrics(area, { scrollHeight: 100000, clientHeight: 200 });
        const s = useScrollbar(() => area, { minThumbSize: 24 });
        expect(thumbIn(vTrack())?.style.height, 'the thumb became ungrabbable').toBe('24px');
        s.dispose();
    });

    it('moves the thumb in proportion to the scroll', () => {
        const s = useScrollbar(() => area);
        // Halfway down: maxScroll 800, thumb travel 200-40=160 → 80px.
        area.scrollTop = 400;
        s.recalculate();
        expect(thumbIn(vTrack())?.style.top).toBe('80px');

        area.scrollTop = 800;
        s.recalculate();
        expect(thumbIn(vTrack())?.style.top, 'the thumb did not reach the end of its track').toBe('160px');
        s.dispose();
    });

    it('hides the track when everything fits', () => {
        metrics(area, { scrollHeight: 200, clientHeight: 200 });
        const s = useScrollbar(() => area);
        expect(vTrack()?.style.display, 'a scrollbar for content that does not scroll').toBe('none');
        s.dispose();
    });

    it('does the same arithmetic horizontally', () => {
        metrics(area, { scrollWidth: 1000, clientWidth: 200, scrollLeft: 0 });
        const s = useScrollbar(() => area, { axis: 'horizontal' });
        expect(thumbIn(hTrack())?.style.width).toBe('40px');

        area.scrollLeft = 400;
        s.recalculate();
        expect(thumbIn(hTrack())?.style.left).toBe('80px');
        s.dispose();
    });

    it('reports the scroll position through its signals', () => {
        const s = useScrollbar(() => area);
        area.scrollTop = 250;
        s.recalculate();
        expect(s.scrollTop()).toBe(250);
        s.dispose();
    });

    it('recalculates when the container scrolls', () => {
        const s = useScrollbar(() => area);
        area.scrollTop = 400;
        area.dispatchEvent(new Event('scroll'));
        expect(s.scrollTop()).toBe(400);
        s.dispose();
    });
});

describe('useScrollbar — showing and hiding', () => {
    it('fades the thumb out after the idle delay', () => {
        vi.useFakeTimers();
        const s = useScrollbar(() => area, { autoHideMs: 500 });
        expect(thumbIn(vTrack())?.style.opacity).toBe('1');
        vi.advanceTimersByTime(501);
        expect(thumbIn(vTrack())?.style.opacity).toBe('0');
        s.dispose();
    });

    it('keeps it visible when auto-hide is off', () => {
        vi.useFakeTimers();
        const s = useScrollbar(() => area, { autoHideMs: 0 });
        vi.advanceTimersByTime(10_000);
        expect(thumbIn(vTrack())?.style.opacity).toBe('1');
        s.dispose();
    });

    it('brings it back when the pointer enters', () => {
        vi.useFakeTimers();
        const s = useScrollbar(() => area, { autoHideMs: 500 });
        vi.advanceTimersByTime(501);
        expect(thumbIn(vTrack())?.style.opacity).toBe('0');

        area.parentElement!.dispatchEvent(new Event('mouseenter'));

        expect(thumbIn(vTrack())?.style.opacity).toBe('1');
        s.dispose();
    });
});

describe('useScrollbar — dragging the thumb', () => {
    it('scrolls the container by the thumb movement, scaled', () => {
        const s = useScrollbar(() => area);
        const thumb = thumbIn(vTrack())!;

        pointer('pointerdown', thumb, 0, 0);
        pointer('pointermove', document, 0, 20);      // 20px of thumb → 20 * (1000/200) = 100

        expect(area.scrollTop).toBe(100);
        pointer('pointerup', document, 0, 20);
        s.dispose();
    });

    it('stops scrolling once released', () => {
        const s = useScrollbar(() => area);
        const thumb = thumbIn(vTrack())!;
        pointer('pointerdown', thumb, 0, 0);
        pointer('pointerup', document, 0, 0);
        pointer('pointermove', document, 0, 100);
        expect(area.scrollTop).toBe(0);
        s.dispose();
    });

    it('keeps the thumb visible for the whole drag', () => {
        vi.useFakeTimers();
        const s = useScrollbar(() => area, { autoHideMs: 100 });
        const thumb = thumbIn(vTrack())!;

        pointer('pointerdown', thumb, 0, 0);
        vi.advanceTimersByTime(500);

        expect(thumb.style.opacity, 'the thumb vanished from under the pointer').toBe('1');
        pointer('pointerup', document, 0, 0);
        s.dispose();
    });

    it('drags horizontally on the horizontal thumb', () => {
        metrics(area, { scrollWidth: 1000, clientWidth: 200, scrollLeft: 0 });
        const s = useScrollbar(() => area, { axis: 'horizontal' });
        const thumb = thumbIn(hTrack())!;

        pointer('pointerdown', thumb, 0, 0);
        pointer('pointermove', document, 20, 0);

        expect(area.scrollLeft).toBe(100);
        pointer('pointerup', document, 20, 0);
        s.dispose();
    });
});

describe('useScrollbar — clicking the track', () => {
    it('jumps to the clicked position', () => {
        const s = useScrollbar(() => area);
        const track = vTrack()!;
        (track as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect = () =>
            ({ top: 0, left: 0, width: 8, height: 200, right: 8, bottom: 200, x: 0, y: 0,
                toJSON: () => ({}) }) as DOMRect;

        const e = new Event('click', { bubbles: true }) as MouseEvent;
        Object.defineProperties(e, { clientY: { value: 100 }, clientX: { value: 4 } });
        track.dispatchEvent(e);

        // Halfway down the track → half of maxScroll (800).
        expect(area.scrollTop).toBe(400);
        s.dispose();
    });

    it('ignores a click that landed on the thumb — that is a drag, not a jump', () => {
        const s = useScrollbar(() => area);
        const track = vTrack()!;
        const thumb = thumbIn(track)!;

        const e = new Event('click', { bubbles: true }) as MouseEvent;
        Object.defineProperties(e, { clientY: { value: 100 }, clientX: { value: 4 } });
        thumb.dispatchEvent(e);

        expect(area.scrollTop).toBe(0);
        s.dispose();
    });
});

describe('useScrollbar — the imperative API', () => {
    it('delegates scrollTo and scrollBy to the container', () => {
        const scrollTo = vi.fn();
        const scrollBy = vi.fn();
        (area as unknown as { scrollTo: unknown }).scrollTo = scrollTo;
        (area as unknown as { scrollBy: unknown }).scrollBy = scrollBy;

        const s = useScrollbar(() => area);
        s.scrollTo({ top: 10 });
        s.scrollBy({ top: 5 });

        expect(scrollTo).toHaveBeenCalledWith({ top: 10 });
        expect(scrollBy).toHaveBeenCalledWith({ top: 5 });
        s.dispose();
    });

    it('scrollIntoView asks the element, with nearest as the default block', () => {
        const s = useScrollbar(() => area);
        const child = document.createElement('div');
        const spy = vi.fn();
        (child as unknown as { scrollIntoView: unknown }).scrollIntoView = spy;

        s.scrollIntoView(child);
        expect(spy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });

        s.scrollIntoView(child, { block: 'center' });
        expect(spy).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'center' });
        s.dispose();
    });
});

describe('useScrollbar — teardown', () => {
    it('puts the container back where it was and takes its style with it', () => {
        const styleCountBefore = document.head.querySelectorAll('style').length;
        const s = useScrollbar(() => area);
        expect(area.parentElement).not.toBe(host);

        s.dispose();

        expect(area.parentElement, 'the wrapper outlived the scrollbar').toBe(host);
        expect(document.querySelector('[data-pdx-scrollbar-track="v"]')).toBeNull();
        expect(area.hasAttribute('data-pdx-scrollbar')).toBe(false);
        expect(document.head.querySelectorAll('style').length).toBe(styleCountBefore);
    });

    it('leaves no hide timer behind', () => {
        vi.useFakeTimers();
        const s = useScrollbar(() => area, { autoHideMs: 1000 });
        s.dispose();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('does nothing without a container', () => {
        const s = useScrollbar(() => null);
        expect(s.scrollTop()).toBe(0);
        expect(() => s.recalculate()).not.toThrow();
        expect(() => s.dispose()).not.toThrow();
    });
});
