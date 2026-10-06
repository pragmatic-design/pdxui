// Coverage (DOM): useResizeHandle — drag-to-resize with pointer events.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useResizeHandle } from '../src/component/resize-handle';

function pointer(type: string, x: number, y = 0): MouseEvent {
    return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
}

describe('useResizeHandle', () => {
    let handle: HTMLElement;
    let target: HTMLElement;
    beforeEach(() => {
        document.body.innerHTML = '';
        handle = document.createElement('div');
        target = document.createElement('div');
        document.body.append(handle, target);
    });

    it('setSize clamps to min/max', () => {
        const r = useResizeHandle(() => handle, () => target, { min: 50, max: 300 });
        r.setSize(10);
        expect(r.size()).toBe(50);
        r.setSize(9999);
        expect(r.size()).toBe(300);
        r.setSize(120);
        expect(r.size()).toBe(120);
        r.dispose();
    });

    it('drag updates size and toggles isResizing + fires callbacks', () => {
        const onResize = vi.fn();
        const onStart = vi.fn();
        const onEnd = vi.fn();
        const r = useResizeHandle(() => handle, () => target, {
            min: 0, max: 1000, onResize, onResizeStart: onStart, onResizeEnd: onEnd,
        });

        handle.dispatchEvent(pointer('pointerdown', 100));
        expect(r.isResizing()).toBe(true);
        expect(onStart).toHaveBeenCalled();

        document.dispatchEvent(pointer('pointermove', 180)); // delta +80
        expect(r.size()).toBe(80);
        expect(onResize).toHaveBeenLastCalledWith(80);

        document.dispatchEvent(pointer('pointerup', 180));
        expect(r.isResizing()).toBe(false);
        expect(onEnd).toHaveBeenCalledWith(80);
        r.dispose();
    });

    it('reverse inverts the drag delta', () => {
        const r = useResizeHandle(() => handle, () => target, { min: 0, max: 1000, reverse: true });
        handle.dispatchEvent(pointer('pointerdown', 200));
        document.dispatchEvent(pointer('pointermove', 120)); // moved left 80 → grows in reverse
        expect(r.size()).toBe(80);
        document.dispatchEvent(pointer('pointerup', 120));
        r.dispose();
    });

    it('reset returns to the initial size', () => {
        const r = useResizeHandle(() => handle, () => target, { initialSize: 150, min: 0 });
        r.setSize(300);
        r.reset();
        expect(r.size()).toBe(150);
        r.dispose();
    });

    it('dispose detaches the handle listener', () => {
        const r = useResizeHandle(() => handle, () => target, { min: 0 });
        r.dispose();
        handle.dispatchEvent(pointer('pointerdown', 100));
        expect(r.isResizing()).toBe(false); // listener removed → no-op
    });
});
