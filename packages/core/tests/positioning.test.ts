import { describe, it, expect, vi } from 'vitest';
import {
    computePosition, autoUpdate,
    offset, flip, shift, arrow, size,
} from '../src/component/positioning';
import type { VirtualElement } from '../src/component/positioning';

// Helper: create a mock element with a fixed bounding rect
function mockElement(rect: Partial<DOMRect>): HTMLElement {
    const full: DOMRect = {
        x: rect.x ?? rect.left ?? 0,
        y: rect.y ?? rect.top ?? 0,
        width: rect.width ?? 0,
        height: rect.height ?? 0,
        top: rect.top ?? rect.y ?? 0,
        left: rect.left ?? rect.x ?? 0,
        right: (rect.left ?? rect.x ?? 0) + (rect.width ?? 0),
        bottom: (rect.top ?? rect.y ?? 0) + (rect.height ?? 0),
        toJSON: () => full,
    };

    const el = document.createElement('div');
    el.getBoundingClientRect = () => full;
    return el;
}

describe('computePosition', () => {
    it('positions bottom by default', () => {
        const reference = mockElement({ left: 100, top: 50, width: 80, height: 30 });
        const floating = mockElement({ width: 100, height: 40 });

        const result = computePosition(reference, floating);
        expect(result.placement).toBe('bottom');
        // Centered horizontally below reference
        expect(result.x).toBeCloseTo(90); // 100 + 40 - 50
        expect(result.y).toBe(80); // 50 + 30
    });

    it('positions top', () => {
        const reference = mockElement({ left: 100, top: 200, width: 80, height: 30 });
        const floating = mockElement({ width: 100, height: 40 });

        const result = computePosition(reference, floating, { placement: 'top' });
        expect(result.placement).toBe('top');
        expect(result.y).toBe(160); // 200 - 40
    });

    it('positions left', () => {
        const reference = mockElement({ left: 200, top: 100, width: 80, height: 30 });
        const floating = mockElement({ width: 100, height: 40 });

        const result = computePosition(reference, floating, { placement: 'left' });
        expect(result.x).toBe(100); // 200 - 100
    });

    it('positions right', () => {
        const reference = mockElement({ left: 100, top: 100, width: 80, height: 30 });
        const floating = mockElement({ width: 100, height: 40 });

        const result = computePosition(reference, floating, { placement: 'right' });
        expect(result.x).toBe(180); // 100 + 80
    });

    it('handles start alignment', () => {
        const reference = mockElement({ left: 100, top: 50, width: 200, height: 30 });
        const floating = mockElement({ width: 100, height: 40 });

        const result = computePosition(reference, floating, { placement: 'bottom-start' });
        expect(result.x).toBe(100); // aligned to reference left
    });

    it('handles end alignment', () => {
        const reference = mockElement({ left: 100, top: 50, width: 200, height: 30 });
        const floating = mockElement({ width: 100, height: 40 });

        const result = computePosition(reference, floating, { placement: 'bottom-end' });
        expect(result.x).toBe(200); // 100 + 200 - 100
    });

    it('supports VirtualElement (cursor/selection)', () => {
        const virtual: VirtualElement = {
            getBoundingClientRect: () => ({
                x: 150, y: 75, width: 0, height: 0,
                top: 75, left: 150, right: 150, bottom: 75,
                toJSON: () => ({}),
            } as DOMRect),
        };
        const floating = mockElement({ width: 60, height: 30 });

        const result = computePosition(virtual, floating, { placement: 'bottom' });
        expect(result.x).toBeCloseTo(120); // 150 - 30
        expect(result.y).toBe(75);
    });

    it('returns strategy', () => {
        const ref = mockElement({ left: 0, top: 0, width: 10, height: 10 });
        const float = mockElement({ width: 10, height: 10 });

        expect(computePosition(ref, float, { strategy: 'fixed' }).strategy).toBe('fixed');
        expect(computePosition(ref, float).strategy).toBe('absolute');
    });
});

describe('offset middleware', () => {
    it('adds distance on main axis', () => {
        const reference = mockElement({ left: 100, top: 50, width: 80, height: 30 });
        const floating = mockElement({ width: 100, height: 40 });

        const result = computePosition(reference, floating, {
            placement: 'bottom',
            middleware: [offset(8)],
        });
        expect(result.y).toBe(88); // 80 + 8
    });

    it('supports mainAxis + crossAxis', () => {
        const reference = mockElement({ left: 100, top: 50, width: 80, height: 30 });
        const floating = mockElement({ width: 100, height: 40 });

        const result = computePosition(reference, floating, {
            placement: 'bottom',
            middleware: [offset({ mainAxis: 10, crossAxis: 5 })],
        });
        expect(result.y).toBe(90); // 80 + 10
        expect(result.x).toBeCloseTo(95); // 90 + 5
    });
});

describe('flip middleware', () => {
    it('flips when overflowing viewport', () => {
        // Reference near bottom of viewport — bottom placement will overflow
        const reference = mockElement({ left: 100, top: 720, width: 80, height: 30 });
        const floating = mockElement({ width: 100, height: 100 });

        // Window is 1024x768 in happy-dom
        const result = computePosition(reference, floating, {
            placement: 'bottom',
            middleware: [flip()],
        });
        expect(result.placement).toBe('top');
    });

    it('keeps original if no flip fits', () => {
        // Both top and bottom overflow — keeps original
        const reference = mockElement({ left: 100, top: 50, width: 80, height: 660 });
        const floating = mockElement({ width: 100, height: 100 });

        const result = computePosition(reference, floating, {
            placement: 'bottom',
            middleware: [flip()],
        });
        expect(result.placement).toBe('bottom');
    });
});

describe('shift middleware', () => {
    it('clamps to viewport', () => {
        const reference = mockElement({ left: 0, top: 0, width: 10, height: 10 });
        const floating = mockElement({ width: 100, height: 40 });

        const result = computePosition(reference, floating, {
            placement: 'bottom',
            middleware: [shift({ padding: 8 })],
        });
        expect(result.x).toBeGreaterThanOrEqual(8);
        expect(result.y).toBeGreaterThanOrEqual(8);
    });
});

describe('arrow middleware', () => {
    it('computes arrow position', () => {
        const reference = mockElement({ left: 100, top: 50, width: 80, height: 30 });
        const floating = mockElement({ width: 200, height: 40 });
        const arrowEl = document.createElement('div');

        const result = computePosition(reference, floating, {
            placement: 'bottom',
            middleware: [arrow({ element: arrowEl })],
        });

        const arrowData = result.middlewareData.arrow;
        expect(arrowData).toBeDefined();
        expect(arrowData.x).toBeDefined(); // arrow x offset
        expect(arrowData.side).toBe('top'); // opposite of bottom
    });
});

describe('size middleware', () => {
    it('computes available dimensions', () => {
        const reference = mockElement({ left: 100, top: 300, width: 80, height: 30 });
        const floating = mockElement({ width: 100, height: 40 });

        const result = computePosition(reference, floating, {
            placement: 'bottom',
            middleware: [size()],
        });

        const sizeData = result.middlewareData.size;
        expect(sizeData).toBeDefined();
        expect(sizeData.availableHeight).toBeGreaterThan(0);
        expect(sizeData.availableWidth).toBeGreaterThan(0);
    });

    it('constrains to maxWidth/maxHeight', () => {
        const reference = mockElement({ left: 100, top: 300, width: 80, height: 30 });
        const floating = mockElement({ width: 100, height: 40 });

        const result = computePosition(reference, floating, {
            placement: 'bottom',
            middleware: [size({ maxWidth: 150, maxHeight: 200 })],
        });

        expect(result.middlewareData.size.maxWidth).toBeLessThanOrEqual(150);
        expect(result.middlewareData.size.maxHeight).toBeLessThanOrEqual(200);
    });
});

describe('middleware pipeline', () => {
    it('runs middleware in order', () => {
        const reference = mockElement({ left: 100, top: 50, width: 80, height: 30 });
        const floating = mockElement({ width: 100, height: 40 });

        const result = computePosition(reference, floating, {
            placement: 'bottom',
            middleware: [offset(8), shift({ padding: 4 })],
        });

        // offset + shift should both have been applied
        expect(result.y).toBeGreaterThanOrEqual(4);
    });

    it('collects middlewareData from all middleware', () => {
        const reference = mockElement({ left: 100, top: 50, width: 80, height: 30 });
        const floating = mockElement({ width: 100, height: 40 });
        const arrowEl = document.createElement('div');

        const result = computePosition(reference, floating, {
            placement: 'bottom',
            middleware: [offset(4), arrow({ element: arrowEl }), size()],
        });

        expect(result.middlewareData.arrow).toBeDefined();
        expect(result.middlewareData.size).toBeDefined();
    });
});

describe('autoUpdate', () => {
    it('returns a dispose function', () => {
        const ref = document.createElement('div');
        const float = document.createElement('div');
        document.body.appendChild(ref);
        document.body.appendChild(float);

        const update = vi.fn();
        const dispose = autoUpdate(ref, float, update);

        expect(typeof dispose).toBe('function');
        expect(update).toHaveBeenCalledTimes(1); // initial call

        dispose();
        ref.remove();
        float.remove();
    });
});

// the size middleware has to respect the boundary, as flip and shift do

describe('the size middleware with a boundary', () => {
    it('computes the constraint against the boundary, not the viewport', () => {
        const boundary = document.createElement('div');
        boundary.getBoundingClientRect = () => ({
            top: 100, left: 100, right: 500, bottom: 400,
            width: 400, height: 300, x: 100, y: 100, toJSON: () => ({}),
        }) as DOMRect;

        const reference: VirtualElement = {
            getBoundingClientRect: () => ({
                top: 150, left: 150, right: 200, bottom: 170,
                width: 50, height: 20, x: 150, y: 150, toJSON: () => ({}),
            }) as DOMRect,
        };
        const floating = document.createElement('div');
        floating.getBoundingClientRect = () => ({
            top: 0, left: 0, right: 100, bottom: 100,
            width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}),
        }) as DOMRect;

        const result = computePosition(reference, floating, {
            placement: 'bottom',
            middleware: [size({ boundary, padding: 0 })],
        });
        const data = result.middlewareData.size as { availableHeight: number; availableWidth: number };
        // bottom: the room from the reference's bottom (170) to the boundary's (400) = 230
        expect(data.availableHeight).toBe(230);
        expect(data.availableWidth).toBe(400);
    });
});
