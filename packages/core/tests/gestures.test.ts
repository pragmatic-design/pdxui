// Tests for gesture recognition: swipe, longpress, pinch.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSwipe, onLongpress, onPinch } from '../src/component/gestures';

function createPointerEvent(type: string, opts: Partial<PointerEvent> = {}): PointerEvent {
    return new PointerEvent(type, {
        clientX: opts.clientX ?? 0,
        clientY: opts.clientY ?? 0,
        pointerId: (opts as any).pointerId ?? 1,
        bubbles: true,
    });
}

describe('onSwipe', () => {
    let el: HTMLElement;
    beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); });

    it('detects swipe left', () => {
        const callback = vi.fn();
        const dispose = onSwipe(el, 'left', callback, { threshold: 30 });

        el.dispatchEvent(createPointerEvent('pointerdown', { clientX: 200, clientY: 100 }));
        el.dispatchEvent(createPointerEvent('pointerup', { clientX: 100, clientY: 100 }));

        expect(callback).toHaveBeenCalledOnce();
        dispose();
    });

    it('detects swipe right', () => {
        const callback = vi.fn();
        const dispose = onSwipe(el, 'right', callback, { threshold: 30 });

        el.dispatchEvent(createPointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
        el.dispatchEvent(createPointerEvent('pointerup', { clientX: 200, clientY: 100 }));

        expect(callback).toHaveBeenCalledOnce();
        dispose();
    });

    it('detects swipe up', () => {
        const callback = vi.fn();
        const dispose = onSwipe(el, 'up', callback, { threshold: 30 });

        el.dispatchEvent(createPointerEvent('pointerdown', { clientX: 100, clientY: 200 }));
        el.dispatchEvent(createPointerEvent('pointerup', { clientX: 100, clientY: 100 }));

        expect(callback).toHaveBeenCalledOnce();
        dispose();
    });

    it('detects swipe down', () => {
        const callback = vi.fn();
        const dispose = onSwipe(el, 'down', callback, { threshold: 30 });

        el.dispatchEvent(createPointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
        el.dispatchEvent(createPointerEvent('pointerup', { clientX: 100, clientY: 200 }));

        expect(callback).toHaveBeenCalledOnce();
        dispose();
    });

    it('ignores swipe below threshold', () => {
        const callback = vi.fn();
        const dispose = onSwipe(el, 'left', callback, { threshold: 100 });

        el.dispatchEvent(createPointerEvent('pointerdown', { clientX: 200, clientY: 100 }));
        el.dispatchEvent(createPointerEvent('pointerup', { clientX: 170, clientY: 100 }));

        expect(callback).not.toHaveBeenCalled();
        dispose();
    });

    it('ignores wrong direction', () => {
        const callback = vi.fn();
        const dispose = onSwipe(el, 'left', callback, { threshold: 30 });

        el.dispatchEvent(createPointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
        el.dispatchEvent(createPointerEvent('pointerup', { clientX: 200, clientY: 100 }));

        expect(callback).not.toHaveBeenCalled();
        dispose();
    });

    it('dispose removes listeners', () => {
        const callback = vi.fn();
        const dispose = onSwipe(el, 'left', callback, { threshold: 30 });
        dispose();

        el.dispatchEvent(createPointerEvent('pointerdown', { clientX: 200, clientY: 100 }));
        el.dispatchEvent(createPointerEvent('pointerup', { clientX: 100, clientY: 100 }));

        expect(callback).not.toHaveBeenCalled();
    });
});

describe('onLongpress', () => {
    let el: HTMLElement;
    beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); });

    it('fires after hold duration', async () => {
        vi.useFakeTimers();
        const callback = vi.fn();
        const dispose = onLongpress(el, callback, { duration: 200 });

        el.dispatchEvent(createPointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
        vi.advanceTimersByTime(250);

        expect(callback).toHaveBeenCalledOnce();
        dispose();
        vi.useRealTimers();
    });

    it('cancels on move beyond tolerance', async () => {
        vi.useFakeTimers();
        const callback = vi.fn();
        const dispose = onLongpress(el, callback, { duration: 200, tolerance: 5 });

        el.dispatchEvent(createPointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
        el.dispatchEvent(createPointerEvent('pointermove', { clientX: 120, clientY: 100 }));
        vi.advanceTimersByTime(300);

        expect(callback).not.toHaveBeenCalled();
        dispose();
        vi.useRealTimers();
    });

    it('cancels on pointerup before duration', () => {
        vi.useFakeTimers();
        const callback = vi.fn();
        const dispose = onLongpress(el, callback, { duration: 500 });

        el.dispatchEvent(createPointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
        vi.advanceTimersByTime(100);
        el.dispatchEvent(createPointerEvent('pointerup'));

        vi.advanceTimersByTime(500);
        expect(callback).not.toHaveBeenCalled();
        dispose();
        vi.useRealTimers();
    });
});

describe('onPinch', () => {
    let el: HTMLElement;
    beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); });

    it('fires with scale on two-pointer move', () => {
        const callback = vi.fn();
        const dispose = onPinch(el, callback);

        // First finger
        el.dispatchEvent(new PointerEvent('pointerdown', {
            clientX: 100, clientY: 100, pointerId: 1, bubbles: true,
        }));
        // Second finger
        el.dispatchEvent(new PointerEvent('pointerdown', {
            clientX: 200, clientY: 100, pointerId: 2, bubbles: true,
        }));
        // Move second finger outward (zoom in)
        el.dispatchEvent(new PointerEvent('pointermove', {
            clientX: 300, clientY: 100, pointerId: 2, bubbles: true,
        }));

        expect(callback).toHaveBeenCalled();
        const event = callback.mock.calls[0][0];
        expect(event.scale).toBeGreaterThan(1); // zoomed in
        expect(event.center).toBeDefined();
        dispose();
    });

    it('does not fire with single pointer', () => {
        const callback = vi.fn();
        const dispose = onPinch(el, callback);

        el.dispatchEvent(new PointerEvent('pointerdown', {
            clientX: 100, clientY: 100, pointerId: 1, bubbles: true,
        }));
        el.dispatchEvent(new PointerEvent('pointermove', {
            clientX: 200, clientY: 100, pointerId: 1, bubbles: true,
        }));

        expect(callback).not.toHaveBeenCalled();
        dispose();
    });
});
