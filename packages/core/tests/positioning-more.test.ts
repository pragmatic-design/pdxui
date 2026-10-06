// computePosition and its middleware.
//
// This is pure geometry, so it is testable exactly: every expected number below is the arithmetic
// written out, not a value copied from a run. Rects are stubbed because happy-dom lays nothing out
// and would answer 0×0 for everything.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    computePosition, offset, flip, shift, arrow, size, hide, autoUpdate,
} from '../src/component/positioning';
import type { VirtualElement } from '../src/component/positioning';

/** A rect at a fixed place — the only thing computePosition reads off an element. */
function rect(x: number, y: number, w: number, h: number): DOMRect {
    return {
        x, y, width: w, height: h,
        top: y, left: x, right: x + w, bottom: y + h,
        toJSON() { return this; },
    } as DOMRect;
}

const virtual = (r: DOMRect): VirtualElement => ({ getBoundingClientRect: () => r });

/** A real element that answers a fixed rect. */
function el(r: DOMRect): HTMLElement {
    const node = document.createElement('div');
    node.getBoundingClientRect = () => r;
    return node;
}

// The viewport happy-dom reports, so the expected numbers below are not guesses.
const VW = window.innerWidth;
const VH = window.innerHeight;

afterEach(() => { document.body.innerHTML = ''; });

describe('placement geometry', () => {
    const reference = virtual(rect(100, 100, 50, 20));   // 100..150 × 100..120
    const floating = () => el(rect(0, 0, 80, 40));

    const at = (placement: Parameters<typeof computePosition>[2] extends undefined ? never : string) =>
        computePosition(reference, floating(), { placement: placement as never });

    it('bottom centres under the reference', () => {
        const { x, y } = at('bottom');
        expect(x).toBe(100 + 25 - 40);   // ref centre 125, half the floating width
        expect(y).toBe(120);             // ref bottom
    });

    it('top sits above it', () => {
        const { x, y } = at('top');
        expect(x).toBe(85);
        expect(y).toBe(100 - 40);
    });

    it('left and right go beside it, centred vertically', () => {
        expect(at('left')).toMatchObject({ x: 100 - 80, y: 100 + 10 - 20 });
        expect(at('right')).toMatchObject({ x: 150, y: 90 });
    });

    it('-start aligns the leading edges', () => {
        expect(at('bottom-start').x, 'a start alignment did not line up the left edges').toBe(100);
        expect(at('right-start').y).toBe(100);
    });

    it('-end aligns the trailing edges', () => {
        expect(at('bottom-end').x).toBe(150 - 80);
        expect(at('right-end').y).toBe(120 - 40);
    });

    it('defaults to bottom, and to the absolute strategy', () => {
        const r = computePosition(reference, floating());
        expect(r.placement).toBe('bottom');
        expect(r.strategy).toBe('absolute');
    });

    it('carries the strategy it was given through untouched', () => {
        expect(computePosition(reference, floating(), { strategy: 'fixed' }).strategy).toBe('fixed');
    });

    it('adds the iframe offset when the reference lives in one', () => {
        const iframe = el(rect(30, 40, 400, 300)) as HTMLIFrameElement;
        const r = computePosition(reference, floating(), { placement: 'bottom', iframe });

        expect(r.y, 'the cross-frame offset was not applied').toBe(120 + 40);
        expect(r.x).toBe(85 + 30);
    });
});

describe('the middleware pipeline', () => {
    it('applies each result in order, and collects the data under its name', () => {
        const first = { name: 'first', fn: () => ({ x: 1, data: { a: 1 } }) };
        const second = { name: 'second', fn: (s: { x: number }) => ({ x: s.x + 10 }) };

        const r = computePosition(virtual(rect(0, 0, 10, 10)), el(rect(0, 0, 10, 10)), {
            middleware: [first, second],
        });

        expect(r.x).toBe(11);
        expect(r.middlewareData.first).toEqual({ a: 1 });
        expect(r.middlewareData.second, 'a middleware with no data still got an entry')
            .toBeUndefined();
    });

    it('a middleware that returns nothing leaves the position alone', () => {
        const base = computePosition(virtual(rect(50, 50, 10, 10)), el(rect(0, 0, 10, 10)));
        const withNoop = computePosition(virtual(rect(50, 50, 10, 10)), el(rect(0, 0, 10, 10)), {
            middleware: [{ name: 'noop', fn: () => ({}) }],
        });
        expect(withNoop).toMatchObject({ x: base.x, y: base.y });
    });
});

describe('offset', () => {
    const ref = virtual(rect(100, 100, 50, 20));
    const flt = () => el(rect(0, 0, 80, 40));

    it('pushes away from the reference, on whichever side it is', () => {
        const on = (placement: string) =>
            computePosition(ref, flt(), { placement: placement as never, middleware: [offset(10)] });

        expect(on('bottom').y).toBe(120 + 10);
        expect(on('top').y).toBe(60 - 10);
        expect(on('left').x).toBe(20 - 10);
        expect(on('right').x).toBe(150 + 10);
    });

    it('a number moves the main axis only', () => {
        const r = computePosition(ref, flt(), { placement: 'bottom', middleware: [offset(10)] });
        expect(r.x, 'a plain number shifted the cross axis too').toBe(85);
    });

    it('the object form moves both axes, along the right one for the side', () => {
        const vertical = computePosition(ref, flt(), {
            placement: 'bottom', middleware: [offset({ mainAxis: 4, crossAxis: 6 })],
        });
        expect(vertical).toMatchObject({ x: 85 + 6, y: 120 + 4 });

        const horizontal = computePosition(ref, flt(), {
            placement: 'right', middleware: [offset({ mainAxis: 4, crossAxis: 6 })],
        });
        expect(horizontal).toMatchObject({ x: 150 + 4, y: 90 + 6 });
    });

    it('an object with one axis leaves the other at zero', () => {
        const r = computePosition(ref, flt(), { placement: 'bottom', middleware: [offset({ crossAxis: 5 })] });
        expect(r).toMatchObject({ x: 90, y: 120 });
    });
});

describe('flip', () => {
    it('leaves a placement that fits alone', () => {
        const r = computePosition(virtual(rect(100, 100, 50, 20)), el(rect(0, 0, 80, 40)), {
            placement: 'bottom', middleware: [flip()],
        });
        expect(r.placement).toBe('bottom');
        expect(r.middlewareData.flip).toBeUndefined();
    });

    it('flips to the opposite side when the first choice overflows', () => {
        // A reference near the bottom edge: below it there is no room for a 40px panel.
        const ref = virtual(rect(100, VH - 30, 50, 20));
        const r = computePosition(ref, el(rect(0, 0, 80, 40)), {
            placement: 'bottom', middleware: [flip()],
        });

        expect(r.placement, 'the panel was left hanging off the bottom edge').toBe('top');
        expect(r.middlewareData.flip).toEqual({ flipped: true });
        expect(r.y).toBe(VH - 30 - 40);
    });

    it('keeps the alignment while flipping the side', () => {
        const ref = virtual(rect(100, VH - 30, 50, 20));
        const r = computePosition(ref, el(rect(0, 0, 80, 40)), {
            placement: 'bottom-start', middleware: [flip()],
        });
        expect(r.placement).toBe('top-start');
    });

    it('tries the fallbacks it was given, in the order it was given them', () => {
        // Inside a 300×300 box, a reference low enough that 'bottom' overflows while BOTH
        // fallbacks still fit — so the one that comes back is the one listed first, and swapping
        // the list swaps the answer.
        const boundary = el(rect(100, 100, 300, 300));
        const ref = virtual(rect(200, 350, 10, 20));
        const pick = (fallbackPlacements: ('top' | 'left')[]) =>
            computePosition(ref, el(rect(0, 0, 80, 40)), {
                placement: 'bottom', middleware: [flip({ boundary, fallbackPlacements })],
            }).placement;

        expect(pick(['top', 'left'])).toBe('top');
        expect(pick(['left', 'top']), 'the order of the fallbacks made no difference').toBe('left');
    });

    it('gives up rather than picking a fallback that does not fit either', () => {
        // A floating element taller than the viewport fits nowhere.
        const ref = virtual(rect(100, VH - 30, 50, 20));
        const r = computePosition(ref, el(rect(0, 0, 80, VH + 100)), {
            placement: 'bottom', middleware: [flip()],
        });
        expect(r.placement, 'flip claimed a fallback that overflows too').toBe('bottom');
    });

    it('measures against the boundary it is given, not the viewport', () => {
        const boundary = el(rect(0, 0, 400, 200));
        const ref = virtual(rect(100, 180, 50, 20));   // fits the viewport, not this box
        const r = computePosition(ref, el(rect(0, 0, 80, 40)), {
            placement: 'bottom', middleware: [flip({ boundary })],
        });
        expect(r.placement).toBe('top');
    });
});

describe('shift', () => {
    it('pulls a panel that runs off the right edge back inside', () => {
        const ref = virtual(rect(VW - 20, 100, 10, 20));
        const r = computePosition(ref, el(rect(0, 0, 200, 40)), {
            placement: 'bottom', middleware: [shift()],
        });
        expect(r.x, 'the panel stayed off the right edge').toBe(VW - 8 - 200);
    });

    it('and one that runs off the left', () => {
        const ref = virtual(rect(2, 100, 10, 20));
        const r = computePosition(ref, el(rect(0, 0, 200, 40)), {
            placement: 'bottom', middleware: [shift()],
        });
        expect(r.x).toBe(8);
    });

    it('respects the padding it was given', () => {
        const ref = virtual(rect(2, 100, 10, 20));
        const r = computePosition(ref, el(rect(0, 0, 200, 40)), {
            placement: 'bottom', middleware: [shift({ padding: 24 })],
        });
        expect(r.x).toBe(24);
    });

    it('clamps inside a boundary element when given one', () => {
        const boundary = el(rect(100, 100, 300, 300));
        const ref = virtual(rect(110, 120, 10, 20));
        const r = computePosition(ref, el(rect(0, 0, 200, 40)), {
            placement: 'bottom', middleware: [shift({ boundary, padding: 0 })],
        });
        expect(r.x, 'the panel escaped its container').toBe(100);
    });

    it('leaves a panel that already fits where it is', () => {
        const ref = virtual(rect(300, 100, 50, 20));
        const plain = computePosition(ref, el(rect(0, 0, 80, 40)), { placement: 'bottom' });
        const shifted = computePosition(ref, el(rect(0, 0, 80, 40)), {
            placement: 'bottom', middleware: [shift()],
        });
        expect(shifted.x).toBe(plain.x);
    });
});

describe('arrow', () => {
    const arrowEl = () => document.createElement('span');

    it('points at the centre of the reference', () => {
        const ref = virtual(rect(100, 100, 50, 20));    // centre x = 125
        const r = computePosition(ref, el(rect(0, 0, 80, 40)), {
            placement: 'bottom', middleware: [arrow({ element: arrowEl() })],
        });

        // The floating element starts at x = 85, so the arrow sits 40px into it.
        expect(r.middlewareData.arrow).toMatchObject({ x: 40, y: undefined, side: 'top' });
    });

    it('uses y on a horizontal placement, and names the opposite side', () => {
        const ref = virtual(rect(100, 100, 50, 20));
        const r = computePosition(ref, el(rect(0, 0, 80, 40)), {
            placement: 'right', middleware: [arrow({ element: arrowEl() })],
        });
        expect(r.middlewareData.arrow).toMatchObject({ x: undefined, side: 'left' });
        expect(r.middlewareData.arrow.y).toBe(20);
    });

    it('stops at the padding rather than pointing off the panel', () => {
        // The reference is far to the left of a shifted panel: without the clamp the arrow
        // would be drawn outside the box it belongs to.
        const ref = virtual(rect(0, 100, 10, 20));
        const r = computePosition(ref, el(rect(0, 0, 200, 40)), {
            placement: 'bottom', middleware: [shift(), arrow({ element: arrowEl(), padding: 12 })],
        });
        expect(r.middlewareData.arrow.x).toBe(12);
    });

    it('clamps at the far edge too', () => {
        const ref = virtual(rect(VW, 100, 10, 20));
        const r = computePosition(ref, el(rect(0, 0, 200, 40)), {
            placement: 'bottom', middleware: [shift(), arrow({ element: arrowEl(), padding: 4 })],
        });
        expect(r.middlewareData.arrow.x).toBe(200 - 4);
    });
});

describe('size', () => {
    it('reports the room below for a bottom placement', () => {
        const ref = virtual(rect(100, 100, 50, 20));
        const r = computePosition(ref, el(rect(0, 0, 80, 40)), {
            placement: 'bottom', middleware: [size()],
        });

        expect(r.middlewareData.size).toMatchObject({
            availableHeight: VH - 8 - 120,
            availableWidth: VW - 16,
        });
    });

    it('and the room above for a top placement', () => {
        const ref = virtual(rect(100, 300, 50, 20));
        const r = computePosition(ref, el(rect(0, 0, 80, 40)), {
            placement: 'top', middleware: [size()],
        });
        expect(r.middlewareData.size.availableHeight).toBe(300 - 8);
    });

    it('a side placement gets the whole height', () => {
        const ref = virtual(rect(100, 300, 50, 20));
        const r = computePosition(ref, el(rect(0, 0, 80, 40)), {
            placement: 'right', middleware: [size()],
        });
        expect(r.middlewareData.size.availableHeight).toBe(VH - 16);
    });

    it('a declared maximum wins only when it is the smaller of the two', () => {
        const ref = virtual(rect(100, 100, 50, 20));
        const r = computePosition(ref, el(rect(0, 0, 80, 40)), {
            placement: 'bottom', middleware: [size({ maxWidth: 100, maxHeight: 999_999 })],
        });

        expect(r.middlewareData.size.maxWidth).toBe(100);
        expect(r.middlewareData.size.maxHeight,
            'a maximum larger than the room available was taken at face value')
            .toBe(VH - 8 - 120);
    });

    it('measures inside a boundary when given one', () => {
        const boundary = el(rect(0, 0, 300, 200));
        const ref = virtual(rect(10, 50, 50, 20));
        const r = computePosition(ref, el(rect(0, 0, 80, 40)), {
            placement: 'bottom', middleware: [size({ boundary, padding: 0 })],
        });
        expect(r.middlewareData.size.availableWidth).toBe(300);
        expect(r.middlewareData.size.availableHeight).toBe(200 - 70);
    });
});

describe('hide', () => {
    it('is visible while the reference is on screen', () => {
        const r = computePosition(virtual(rect(100, 100, 50, 20)), el(rect(0, 0, 80, 40)), {
            middleware: [hide()],
        });
        expect(r.middlewareData.hide).toEqual({ hidden: false });
    });

    it('hides once the reference has scrolled past the top of the viewport', () => {
        const r = computePosition(virtual(rect(100, -50, 50, 20)), el(rect(0, 0, 80, 40)), {
            middleware: [hide()],
        });
        expect(r.middlewareData.hide).toEqual({ hidden: true });
    });

    it('hides below, left and right of the viewport too', () => {
        const check = (ref: DOMRect) =>
            computePosition(virtual(ref), el(rect(0, 0, 80, 40)), { middleware: [hide()] })
                .middlewareData.hide.hidden;

        expect(check(rect(100, VH + 10, 50, 20)), 'below the fold').toBe(true);
        expect(check(rect(-100, 100, 50, 20)), 'off to the left').toBe(true);
        expect(check(rect(VW + 10, 100, 50, 20)), 'off to the right').toBe(true);
    });

    it('measures against a scrolling container when it is given one', () => {
        const boundary = el(rect(0, 200, 400, 200));   // visible band: 200..400
        const check = (ref: DOMRect) =>
            computePosition(virtual(ref), el(rect(0, 0, 80, 40)), { middleware: [hide({ boundary })] })
                .middlewareData.hide.hidden;

        expect(check(rect(100, 250, 50, 20)), 'inside the band').toBe(false);
        expect(check(rect(100, 100, 50, 20)), 'scrolled above the band').toBe(true);
        expect(check(rect(100, 450, 50, 20)), 'scrolled below the band').toBe(true);
    });

    it('padding shrinks the band it considers visible', () => {
        const ref = rect(100, 5, 50, 20);   // 5..25, just inside the viewport
        const plain = computePosition(virtual(ref), el(rect(0, 0, 80, 40)), { middleware: [hide()] });
        const padded = computePosition(virtual(ref), el(rect(0, 0, 80, 40)), {
            middleware: [hide({ padding: 40 })],
        });

        expect(plain.middlewareData.hide.hidden).toBe(false);
        expect(padded.middlewareData.hide.hidden).toBe(true);
    });
});

describe('autoUpdate', () => {
    it('updates once straight away', () => {
        const update = vi.fn();
        const stop = autoUpdate(el(rect(0, 0, 10, 10)), el(rect(0, 0, 10, 10)), update);
        expect(update, 'the first position was never computed').toHaveBeenCalledTimes(1);
        stop();
    });

    it('follows a resize of the window, and stops on dispose', () => {
        const update = vi.fn();
        const stop = autoUpdate(el(rect(0, 0, 10, 10)), el(rect(0, 0, 10, 10)), update);
        update.mockClear();

        window.dispatchEvent(new Event('resize'));
        expect(update).toHaveBeenCalledTimes(1);

        stop();
        window.dispatchEvent(new Event('resize'));
        expect(update, 'the listener outlived the popover').toHaveBeenCalledTimes(1);
    });

    it('listens on the scrollable ancestors of both elements', () => {
        const scroller = document.createElement('div');
        scroller.style.overflow = 'auto';
        const reference = document.createElement('span');
        scroller.appendChild(reference);
        document.body.appendChild(scroller);

        const update = vi.fn();
        const stop = autoUpdate(reference, el(rect(0, 0, 10, 10)), update);
        update.mockClear();

        scroller.dispatchEvent(new Event('scroll'));

        expect(update, 'scrolling the container the trigger lives in did not reposition')
            .toHaveBeenCalledTimes(1);
        stop();
    });

    it('a virtual reference has no ancestors to listen to, and that is not an error', () => {
        const update = vi.fn();
        expect(() => autoUpdate(virtual(rect(0, 0, 1, 1)), el(rect(0, 0, 10, 10)), update)()).not.toThrow();
        expect(update).toHaveBeenCalled();
    });
});
