// useDrag and useDropZone.
//
// Two things make this file worth testing rather than exercising: the drop-zone hit test is GLOBAL
// state shared between every drag and every zone on the page, and the move handler is throttled to
// one frame, so nothing it computes is visible until the next animation frame. Both are the kind of
// thing that works in a demo with one draggable and breaks with two.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDrag, useDropZone } from '../src/component/drag';

let box: HTMLElement;

/** The move handler runs in a rAF; nothing it sets is readable before the next frame. */
const frame = () => new Promise(r => requestAnimationFrame(() => r(null)));

function rect(el: HTMLElement, left: number, top: number, width: number, height: number): void {
    (el as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect = () =>
        ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
            toJSON: () => ({}) }) as DOMRect;
}

function pointer(
    type: string, target: EventTarget, x: number, y: number,
    init: { pointerId?: number; pointerType?: string } = {},
): void {
    const e = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
    Object.defineProperties(e, {
        clientX: { value: x }, clientY: { value: y },
        pointerId: { value: init.pointerId ?? 1 },
        pointerType: { value: init.pointerType ?? 'mouse' },
    });
    target.dispatchEvent(e);
}

beforeEach(() => {
    document.body.innerHTML = '';
    box = document.createElement('div');
    document.body.appendChild(box);
    rect(box, 0, 0, 50, 50);
    // elementFromPoint drives the auto-scroll lookup and happy-dom does not implement it.
    // Returning null makes startAutoScroll return immediately, which is what a drag in the middle
    // of a non-scrollable page does anyway.
    (document as unknown as { elementFromPoint: unknown }).elementFromPoint = () => null;
});

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

describe('useDrag — following the pointer', () => {
    it('reports the offset from where the drag started', async () => {
        const d = useDrag(() => box);
        pointer('pointerdown', box, 10, 10);
        expect(d.isDragging()).toBe(true);

        pointer('pointermove', document, 40, 70);
        await frame();

        expect(d.position()).toEqual({ x: 30, y: 60 });
        pointer('pointerup', document, 40, 70);
        d.dispose();
    });

    it('reports the step since the last move, not the total', async () => {
        const d = useDrag(() => box);
        pointer('pointerdown', box, 0, 0);
        pointer('pointermove', document, 10, 10);
        await frame();
        pointer('pointermove', document, 15, 12);
        await frame();

        expect(d.delta()).toEqual({ dx: 5, dy: 2 });
        expect(d.position(), 'position is cumulative, delta is not').toEqual({ x: 15, y: 12 });
        pointer('pointerup', document, 15, 12);
        d.dispose();
    });

    it('measures a velocity while moving and zeroes it on release', async () => {
        const d = useDrag(() => box);
        pointer('pointerdown', box, 0, 0);
        pointer('pointermove', document, 200, 0);
        await frame();

        expect(Math.abs(d.velocity().vx), 'no velocity — a flick gesture cannot be told from a nudge')
            .toBeGreaterThan(0);

        pointer('pointerup', document, 200, 0);
        expect(d.velocity()).toEqual({ vx: 0, vy: 0 });
        d.dispose();
    });

    it('collapses several moves in one frame into a single update', async () => {
        // The throttle exists because the move body measures rects, hit-tests every drop zone and
        // calls elementFromPoint. Only the last position of the frame should be processed.
        const d = useDrag(() => box);
        pointer('pointerdown', box, 0, 0);
        pointer('pointermove', document, 10, 0);
        pointer('pointermove', document, 20, 0);
        pointer('pointermove', document, 30, 0);
        expect(d.position(), 'the move was processed synchronously').toEqual({ x: 0, y: 0 });

        await frame();

        expect(d.position()).toEqual({ x: 30, y: 0 });
        pointer('pointerup', document, 30, 0);
        d.dispose();
    });

    it('ignores a second pointer', async () => {
        const d = useDrag(() => box);
        pointer('pointerdown', box, 0, 0, { pointerId: 1 });
        pointer('pointermove', document, 90, 90, { pointerId: 2 });
        await frame();
        expect(d.position()).toEqual({ x: 0, y: 0 });
        pointer('pointerup', document, 0, 0, { pointerId: 1 });
        d.dispose();
    });
});

describe('useDrag — constraints', () => {
    it('locks to the x axis', async () => {
        const d = useDrag(() => box, { axis: 'x' });
        pointer('pointerdown', box, 0, 0);
        pointer('pointermove', document, 30, 60);
        await frame();
        expect(d.position()).toEqual({ x: 30, y: 0 });
        pointer('pointerup', document, 30, 60);
        d.dispose();
    });

    it('locks to the y axis', async () => {
        const d = useDrag(() => box, { axis: 'y' });
        pointer('pointerdown', box, 0, 0);
        pointer('pointermove', document, 30, 60);
        await frame();
        expect(d.position()).toEqual({ x: 0, y: 60 });
        pointer('pointerup', document, 30, 60);
        d.dispose();
    });

    it('stops at the edges of its parent', async () => {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        parent.appendChild(box);
        rect(parent, 0, 0, 100, 100);
        rect(box, 0, 0, 50, 50);

        const d = useDrag(() => box, { bounds: 'parent' });
        pointer('pointerdown', box, 0, 0);
        pointer('pointermove', document, 500, 500);      // far outside
        await frame();

        // 100 wide parent, 50 wide box → the furthest left edge is 50.
        expect(d.position(), 'the box escaped its parent').toEqual({ x: 50, y: 50 });
        pointer('pointerup', document, 500, 500);
        d.dispose();
    });

    it('stops at the edges of an element it is given', async () => {
        const area = document.createElement('div');
        document.body.appendChild(area);
        rect(area, 0, 0, 80, 80);
        rect(box, 0, 0, 50, 50);

        const d = useDrag(() => box, { bounds: area });
        pointer('pointerdown', box, 0, 0);
        pointer('pointermove', document, -500, -500);
        await frame();

        expect(d.position()).toEqual({ x: 0, y: 0 });
        pointer('pointerup', document, 0, 0);
        d.dispose();
    });

    it('accepts the bounds as a function', async () => {
        const area = document.createElement('div');
        document.body.appendChild(area);
        rect(area, 0, 0, 100, 100);
        const d = useDrag(() => box, { bounds: () => area });
        pointer('pointerdown', box, 0, 0);
        pointer('pointermove', document, 500, 0);
        await frame();
        expect(d.position().x).toBe(50);
        pointer('pointerup', document, 500, 0);
        d.dispose();
    });
});

describe('useDrag — where the grab is allowed', () => {
    it('does nothing while disabled', () => {
        const d = useDrag(() => box, { disabled: () => true });
        pointer('pointerdown', box, 0, 0);
        expect(d.isDragging()).toBe(false);
        d.dispose();
    });

    it('only starts from the handle when one is named', () => {
        const grip = document.createElement('span');
        grip.className = 'grip';
        box.appendChild(grip);

        const d = useDrag(() => box, { handle: '.grip' });
        pointer('pointerdown', box, 0, 0);
        expect(d.isDragging(), 'the whole element was draggable despite a handle').toBe(false);

        pointer('pointerdown', grip, 0, 0);
        expect(d.isDragging()).toBe(true);
        pointer('pointerup', document, 0, 0);
        d.dispose();
    });

    it('does nothing without an element', () => {
        const d = useDrag(() => null);
        expect(d.isDragging()).toBe(false);
        expect(() => d.dispose()).not.toThrow();
    });
});

describe('useDrag — touch and the long press', () => {
    it('waits for the hold before it starts', () => {
        vi.useFakeTimers();
        const d = useDrag(() => box, { longPressDelay: 300 });
        pointer('pointerdown', box, 0, 0, { pointerType: 'touch' });
        expect(d.isDragging(), 'a tap started a drag').toBe(false);
        vi.advanceTimersByTime(300);
        expect(d.isDragging()).toBe(true);
        pointer('pointerup', document, 0, 0);
        d.dispose();
    });

    it('cancels the hold if the finger moves away first — that is a scroll', () => {
        vi.useFakeTimers();
        const d = useDrag(() => box, { longPressDelay: 300 });
        pointer('pointerdown', box, 0, 0, { pointerType: 'touch' });
        pointer('pointermove', document, 0, 40);         // past the 10px slop
        vi.advanceTimersByTime(500);
        expect(d.isDragging()).toBe(false);
        d.dispose();
    });

    it('restores touch-action when the hold is cancelled', () => {
        // A cancel path that returns without restoring it leaves native scrolling broken on the
        // element for the rest of the session.
        vi.useFakeTimers();
        const d = useDrag(() => box, { longPressDelay: 300 });
        pointer('pointerdown', box, 0, 0, { pointerType: 'touch' });
        expect(box.style.touchAction).toBe('none');
        pointer('pointermove', document, 0, 40);
        expect(box.style.touchAction, 'the element can no longer be scrolled').toBe('');
        d.dispose();
    });

    it('does not wait for a mouse', () => {
        vi.useFakeTimers();
        const d = useDrag(() => box, { longPressDelay: 300 });
        pointer('pointerdown', box, 0, 0, { pointerType: 'mouse' });
        expect(d.isDragging()).toBe(true);
        pointer('pointerup', document, 0, 0);
        d.dispose();
    });
});

describe('useDrag — the ghost', () => {
    it('is created, follows the pointer, and is removed on drop', async () => {
        const d = useDrag(() => box, {
            ghost: (el) => { const g = el.cloneNode(true) as HTMLElement; g.id = 'ghost'; return g; },
        });

        pointer('pointerdown', box, 5, 5);
        const g = document.getElementById('ghost')!;
        expect(g, 'no drag preview was created').toBeTruthy();
        expect(g.style.position).toBe('fixed');
        expect(g.style.pointerEvents, 'a ghost that swallows pointer events breaks the drop').toBe('none');

        pointer('pointermove', document, 33, 44);
        await frame();
        expect(g.style.left).toBe('33px');
        expect(g.style.top).toBe('44px');

        pointer('pointerup', document, 33, 44);
        expect(document.getElementById('ghost')).toBeNull();
        d.dispose();
    });

    it('takes the ghost with it when disposed mid-drag', () => {
        const d = useDrag(() => box, {
            ghost: (el) => { const g = el.cloneNode(true) as HTMLElement; g.id = 'ghost'; return g; },
        });
        pointer('pointerdown', box, 0, 0);
        d.dispose();
        expect(document.getElementById('ghost')).toBeNull();
    });
});

describe('useDropZone — hit testing', () => {
    let zone: HTMLElement;

    beforeEach(() => {
        zone = document.createElement('div');
        document.body.appendChild(zone);
        rect(zone, 100, 100, 200, 200);
    });

    it('knows when the pointer is over it, and when it leaves', async () => {
        const onEnter = vi.fn();
        const onLeave = vi.fn();
        const z = useDropZone(() => zone, { onEnter, onLeave });
        const d = useDrag(() => box);

        pointer('pointerdown', box, 0, 0);
        pointer('pointermove', document, 200, 200);          // inside
        await frame();
        expect(z.isOver()).toBe(true);
        expect(onEnter).toHaveBeenCalledTimes(1);

        pointer('pointermove', document, 500, 500);          // outside
        await frame();
        expect(z.isOver()).toBe(false);
        expect(onLeave).toHaveBeenCalledTimes(1);

        pointer('pointerup', document, 500, 500);
        d.dispose();
        z.dispose();
    });

    it('carries the dragged data to the drop', async () => {
        const onDrop = vi.fn();
        const z = useDropZone(() => zone, { onDrop });
        const d = useDrag(() => box, { data: () => ({ id: 7 }) });

        pointer('pointerdown', box, 0, 0);
        pointer('pointermove', document, 200, 200);
        await frame();
        pointer('pointerup', document, 200, 200);

        expect(onDrop).toHaveBeenCalledTimes(1);
        expect(onDrop.mock.calls[0][0]).toEqual({ id: 7 });
        d.dispose();
        z.dispose();
    });

    it('refuses what it does not accept', async () => {
        const onEnter = vi.fn();
        const onDrop = vi.fn();
        const z = useDropZone(() => zone, { accept: (data) => data === 'yes', onEnter, onDrop });
        const d = useDrag(() => box, { data: () => 'no' });

        pointer('pointerdown', box, 0, 0);
        pointer('pointermove', document, 200, 200);
        await frame();

        expect(z.isOver(), 'a rejected payload still lit the zone up').toBe(false);
        expect(onEnter).not.toHaveBeenCalled();
        pointer('pointerup', document, 200, 200);
        expect(onDrop).not.toHaveBeenCalled();
        d.dispose();
        z.dispose();
    });

    it('reports which edge the pointer is nearest', async () => {
        const z = useDropZone(() => zone);
        const d = useDrag(() => box);
        pointer('pointerdown', box, 0, 0);

        pointer('pointermove', document, 200, 110);      // near the top edge
        await frame();
        expect(z.edge()).toBe('top');

        pointer('pointermove', document, 200, 290);      // near the bottom
        await frame();
        expect(z.edge()).toBe('bottom');

        pointer('pointermove', document, 110, 200);      // near the left
        await frame();
        expect(z.edge()).toBe('left');

        pointer('pointermove', document, 200, 200);      // dead centre
        await frame();
        expect(z.edge(), 'the middle of a zone is not an edge').toBe('center');

        pointer('pointerup', document, 200, 200);
        d.dispose();
        z.dispose();
    });

    it('stops taking part once disposed', async () => {
        const onEnter = vi.fn();
        const z = useDropZone(() => zone, { onEnter });
        z.dispose();

        const d = useDrag(() => box);
        pointer('pointerdown', box, 0, 0);
        pointer('pointermove', document, 200, 200);
        await frame();

        expect(onEnter).not.toHaveBeenCalled();
        pointer('pointerup', document, 200, 200);
        d.dispose();
    });

    it('does nothing without an element', () => {
        const z = useDropZone(() => null);
        expect(z.isOver()).toBe(false);
        expect(() => z.dispose()).not.toThrow();
    });
});

describe('useDrag — teardown', () => {
    it('stops listening once disposed', () => {
        const d = useDrag(() => box);
        d.dispose();
        pointer('pointerdown', box, 0, 0);
        expect(d.isDragging()).toBe(false);
    });

    it('restores touch-action', () => {
        const d = useDrag(() => box);
        pointer('pointerdown', box, 0, 0);
        expect(box.style.touchAction).toBe('none');
        pointer('pointerup', document, 0, 0);
        expect(box.style.touchAction).toBe('');
        d.dispose();
    });

    it('can be disposed twice', () => {
        const d = useDrag(() => box);
        d.dispose();
        expect(() => d.dispose()).not.toThrow();
    });
});

// A board's columns, in the two arrangements a board actually has.
//
// The same pointer drag must move a card between columns whether the columns are STACKED or SIDE
// BY SIDE — a hit test that works for one geometry can do nothing in the other. These are the two
// geometries, with nothing else different — same zones, same card, same gesture.
//
// The card lives INSIDE the column it starts in, which is what a board looks like and what the
// earlier tests in this file do not cover: `box` is a sibling of `zone` there.
describe('two drop zones, tiled', () => {
    function board(layout: 'stacked' | 'side-by-side'): { a: HTMLElement; b: HTMLElement; card: HTMLElement } {
        const a = document.createElement('div');
        const b = document.createElement('div');
        const card = document.createElement('div');
        a.appendChild(card);
        document.body.append(a, b);

        if (layout === 'stacked') {
            rect(a, 0, 0, 300, 200);
            rect(b, 0, 200, 300, 200);
            rect(card, 10, 10, 280, 40);
        } else {
            rect(a, 0, 0, 300, 200);
            rect(b, 300, 0, 300, 200);
            rect(card, 10, 10, 280, 40);
        }
        return { a, b, card };
    }

    /** Press on the card, cross into the other zone, release there. */
    async function dragCardInto(card: HTMLElement, to: { x: number; y: number }): Promise<void> {
        pointer('pointerdown', card, 150, 30);
        pointer('pointermove', document, 158, 38);
        await frame();
        pointer('pointermove', document, to.x, to.y);
        await frame();
        pointer('pointerup', document, to.x, to.y);
    }

    it('stacked: a card dropped on the zone below lands there', async () => {
        const { a, b, card } = board('stacked');
        const onDropA = vi.fn();
        const onDropB = vi.fn();
        const za = useDropZone(() => a, { onDrop: onDropA });
        const zb = useDropZone(() => b, { onDrop: onDropB });
        const d = useDrag(() => card, { data: () => ({ id: 1 }) });

        await dragCardInto(card, { x: 150, y: 300 });

        expect(onDropB, 'the zone below never saw the drop').toHaveBeenCalledTimes(1);
        expect(onDropA).not.toHaveBeenCalled();
        d.dispose(); za.dispose(); zb.dispose();
    });

    it('side by side: a card dropped on the zone to the right lands there', async () => {
        const { a, b, card } = board('side-by-side');
        const onDropA = vi.fn();
        const onDropB = vi.fn();
        const za = useDropZone(() => a, { onDrop: onDropA });
        const zb = useDropZone(() => b, { onDrop: onDropB });
        const d = useDrag(() => card, { data: () => ({ id: 1 }) });

        await dragCardInto(card, { x: 450, y: 100 });

        expect(onDropB, 'the zone to the right never saw the drop').toHaveBeenCalledTimes(1);
        expect(onDropA).not.toHaveBeenCalled();
        d.dispose(); za.dispose(); zb.dispose();
    });
});
