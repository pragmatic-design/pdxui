// Coverage (gesture): useSortable — drag-to-reorder with pointer events.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSortable } from '../src/component/sortable';

function ptr(type: string, opts: { x?: number; y?: number; pointerId?: number } = {}): MouseEvent {
    const e = new MouseEvent(type, { clientX: opts.x ?? 0, clientY: opts.y ?? 0, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'pointerId', { value: opts.pointerId ?? 1 });
    return e;
}

let container: HTMLElement;
let children: HTMLElement[];

beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('ul');
    children = [];
    for (let i = 0; i < 3; i++) {
        const li = document.createElement('li');
        // Stable, distinct rects (happy-dom returns 0s otherwise).
        li.getBoundingClientRect = () => ({ top: i * 50, left: 0, height: 50, width: 100, bottom: i * 50 + 50, right: 100, x: 0, y: i * 50, toJSON() {} }) as DOMRect;
        container.appendChild(li);
        children.push(li);
    }
    document.body.appendChild(container);
});

describe('useSortable', () => {
    it('reorders an item dragged downward', () => {
        const onReorder = vi.fn();
        const s = useSortable(() => container, { items: () => [0, 1, 2], onReorder, threshold: 5 });

        children[0].dispatchEvent(ptr('pointerdown', { y: 10 }));
        expect(s.activeIndex()).toBe(0);

        document.dispatchEvent(ptr('pointermove', { y: 120 })); // past threshold, into 3rd item
        expect(s.isDragging()).toBe(true);
        expect(s.overIndex()).toBe(2);

        document.dispatchEvent(ptr('pointerup', { y: 120 }));
        expect(onReorder).toHaveBeenCalledWith(0, 1); // toIndex 2 adjusted to 1 (moved down)
        expect(s.activeIndex()).toBe(-1);
        expect(s.isDragging()).toBe(false);
        s.dispose();
    });

    it('does not activate below the movement threshold', () => {
        const onReorder = vi.fn();
        const s = useSortable(() => container, { items: () => [0, 1, 2], onReorder, threshold: 20 });
        children[0].dispatchEvent(ptr('pointerdown', { y: 10 }));
        document.dispatchEvent(ptr('pointermove', { y: 15 })); // dy 5 < 20
        document.dispatchEvent(ptr('pointerup', { y: 15 }));
        expect(s.isDragging()).toBe(false);
        expect(onReorder).not.toHaveBeenCalled();
        s.dispose();
    });

    it('ignores drags that do not start on the handle', () => {
        const onReorder = vi.fn();
        const s = useSortable(() => container, { items: () => [0, 1, 2], onReorder, handle: '.grip' });
        children[0].dispatchEvent(ptr('pointerdown', { y: 10 })); // no .grip → ignored
        expect(s.activeIndex()).toBe(-1);
        s.dispose();
    });

    it('dispose detaches the pointerdown listener', () => {
        const onReorder = vi.fn();
        const s = useSortable(() => container, { items: () => [0, 1, 2], onReorder });
        s.dispose();
        children[0].dispatchEvent(ptr('pointerdown', { y: 10 }));
        expect(s.activeIndex()).toBe(-1);
    });
});
