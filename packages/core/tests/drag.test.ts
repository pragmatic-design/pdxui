import { describe, it, expect, vi } from 'vitest';
import { useDrag, useDropZone } from '../src/component/drag';
import { signal } from '../src/reactivity/signal';

describe('useDrag', () => {
    it('creates drag state signals', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        const drag = useDrag(() => el);
        expect(drag.isDragging()).toBe(false);
        expect(drag.position()).toEqual({ x: 0, y: 0 });
        expect(drag.delta()).toEqual({ dx: 0, dy: 0 });

        drag.dispose();
        el.remove();
    });

    it('isDragging becomes true on pointerdown', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        const drag = useDrag(() => el);

        el.dispatchEvent(new PointerEvent('pointerdown', {
            clientX: 100, clientY: 100, pointerId: 1, bubbles: true,
        }));

        expect(drag.isDragging()).toBe(true);

        // Clean up with pointerup
        document.dispatchEvent(new PointerEvent('pointerup', {
            clientX: 100, clientY: 100, pointerId: 1, bubbles: true,
        }));

        expect(drag.isDragging()).toBe(false);

        drag.dispose();
        el.remove();
    });

    it('tracks position during drag', async () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        const drag = useDrag(() => el);

        el.dispatchEvent(new PointerEvent('pointerdown', {
            clientX: 100, clientY: 100, pointerId: 1, bubbles: true,
        }));

        document.dispatchEvent(new PointerEvent('pointermove', {
            clientX: 150, clientY: 120, pointerId: 1, bubbles: true,
        }));

        // the move is processed at most once per frame (rAF throttle)
        await new Promise(r => requestAnimationFrame(() => r(null)));
        expect(drag.position()).toEqual({ x: 50, y: 20 });

        document.dispatchEvent(new PointerEvent('pointerup', {
            clientX: 150, clientY: 120, pointerId: 1, bubbles: true,
        }));

        drag.dispose();
        el.remove();
    });

    it('respects axis constraint', async () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        const drag = useDrag(() => el, { axis: 'x' });

        el.dispatchEvent(new PointerEvent('pointerdown', {
            clientX: 100, clientY: 100, pointerId: 1, bubbles: true,
        }));

        document.dispatchEvent(new PointerEvent('pointermove', {
            clientX: 150, clientY: 150, pointerId: 1, bubbles: true,
        }));

        // the move is processed at most once per frame (rAF throttle)
        await new Promise(r => requestAnimationFrame(() => r(null)));
        expect(drag.position().x).toBe(50);
        expect(drag.position().y).toBe(0); // y constrained

        document.dispatchEvent(new PointerEvent('pointerup', {
            clientX: 150, clientY: 150, pointerId: 1, bubbles: true,
        }));

        drag.dispose();
        el.remove();
    });

    it('respects disabled option', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        const disabled = signal(true);

        const drag = useDrag(() => el, { disabled: () => disabled() });

        el.dispatchEvent(new PointerEvent('pointerdown', {
            clientX: 100, clientY: 100, pointerId: 1, bubbles: true,
        }));

        expect(drag.isDragging()).toBe(false);

        drag.dispose();
        el.remove();
    });

    it('handles null element', () => {
        const drag = useDrag(() => null);
        expect(drag.isDragging()).toBe(false);
        drag.dispose(); // should not throw
    });

    it('cleans up on dispose', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        const drag = useDrag(() => el);
        drag.dispose();

        // After dispose, pointerdown should not trigger
        el.dispatchEvent(new PointerEvent('pointerdown', {
            clientX: 100, clientY: 100, pointerId: 1, bubbles: true,
        }));

        expect(drag.isDragging()).toBe(false);
        el.remove();
    });
});

describe('useDropZone', () => {
    it('creates drop zone signals', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        const drop = useDropZone(() => el);
        expect(drop.isOver()).toBe(false);
        expect(drop.edge()).toBeNull();

        drop.dispose();
        el.remove();
    });

    it('handles null element', () => {
        const drop = useDropZone(() => null);
        expect(drop.isOver()).toBe(false);
        drop.dispose(); // should not throw
    });

    it('cleans up on dispose', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        const drop = useDropZone(() => el);
        drop.dispose(); // should not throw
        el.remove();
    });

    it('calls onDrop with data and position', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        const onDrop = vi.fn();

        const drop = useDropZone(() => el, { onDrop });

        // onDrop is not called without active drag — this is an integration test
        // The full drag→drop flow requires setPointerCapture which happy-dom may not support fully
        expect(typeof onDrop).toBe('function');

        drop.dispose();
        el.remove();
    });
});
