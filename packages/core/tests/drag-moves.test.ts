// `useDrag` moves the element.
//
// The documentation says *"Make an element draggable"*. A composable that only REPORTS a gesture —
// `isDragging()`, `position()`, the hit testing that lights the drop zones — leaves a board where
// everything works — zones lit, drops fired, the move persisted — while the card sits still under
// the pointer.
//
// Every consumer would then write the same four lines, which this repository treats as a framework
// bug: boilerplate a developer has to write is a declaration the framework failed to offer.
//
// So the composable moves the element. `move: false` is the way out, and a `ghost` implies it — a
// ghost is a second element that follows the pointer, and moving the original too would be a double.

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrag } from '../src/component/drag';

/** One animation frame: the pointermove is throttled to it. */
const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

function press(el: HTMLElement, x: number, y: number): void {
    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: 1, bubbles: true }));
}
function moveTo(x: number, y: number): void {
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerId: 1, bubbles: true }));
}
function release(x: number, y: number): void {
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, pointerId: 1, bubbles: true }));
}

let el: HTMLElement;

beforeEach(() => {
    document.body.innerHTML = '';
    el = document.createElement('div');
    document.body.appendChild(el);
});

describe('useDrag moves what it drags', () => {
    it('the element follows the pointer', async () => {
        const drag = useDrag(() => el);
        expect(el.style.transform, 'the fixture already had a transform').toBe('');

        press(el, 100, 100);
        moveTo(150, 120);
        await frame();

        expect(el.style.transform, 'the element did not move under the pointer')
            .toBe('translate(50px, 20px)');

        release(150, 120);
        drag.dispose();
    });

    it('and is put back when the drag ends', async () => {
        const drag = useDrag(() => el);
        press(el, 100, 100);
        moveTo(180, 140);
        await frame();
        expect(el.style.transform, 'the move did not take, so the reset proves nothing')
            .toBe('translate(80px, 40px)');

        release(180, 140);

        expect(el.style.transform, 'the element stayed where the drag left it').toBe('');
        drag.dispose();
    });

    it('move: false leaves the element alone — the splitter case', async () => {
        // A handle whose value follows the pointer while the handle itself does not move.
        const drag = useDrag(() => el, { move: false });
        press(el, 100, 100);
        moveTo(150, 120);
        await frame();

        expect(el.style.transform, 'move: false still moved the element').toBe('');
        expect(drag.position(), 'move: false stopped the reporting too').toEqual({ x: 50, y: 20 });

        release(150, 120);
        drag.dispose();
    });

    it('a ghost implies move: false — the original stays, the preview follows', async () => {
        // The ghost is a second element under the pointer. Moving the original as well would show
        // two things moving for one gesture, which is what the opt-out exists for.
        const drag = useDrag(() => el, { ghost: (src) => src.cloneNode(true) as HTMLElement });
        press(el, 100, 100);
        moveTo(150, 120);
        await frame();

        expect(el.style.transform, 'the element moved as well as its ghost').toBe('');

        release(150, 120);
        drag.dispose();
    });

    it('the movement obeys the axis constraint', async () => {
        // The movement reads the same dx/dy the reporting does, AFTER the axis and the bounds have
        // been applied to them. Without this, `axis: x` would report a constrained position and
        // move the element freely.
        const drag = useDrag(() => el, { axis: 'x' });
        press(el, 100, 100);
        moveTo(150, 160);
        await frame();

        expect(el.style.transform, 'the vertical movement was not constrained')
            .toBe('translate(50px, 0px)');

        release(150, 160);
        drag.dispose();
    });

    it('a transform the element already had is restored, not erased', async () => {
        // A card that is rotated by its own CSS must not come back straight.
        el.style.transform = 'rotate(2deg)';
        const drag = useDrag(() => el);

        press(el, 100, 100);
        moveTo(150, 100);
        await frame();
        expect(el.style.transform, 'the element did not move').toContain('translate(50px, 0px)');

        release(150, 100);
        expect(el.style.transform, 'the drag ate the transform the element came with').toBe('rotate(2deg)');
        drag.dispose();
    });
});
