import { describe, it, expect } from 'vitest';
import { createVirtualizer } from '../src/renderer/virtualizer';
import { signal } from '../src/reactivity/signal';

function createScrollContainer(height = 200): HTMLElement {
    const el = document.createElement('div');
    // Mock clientHeight since happy-dom doesn't layout
    Object.defineProperty(el, 'clientHeight', { value: height, writable: true });
    Object.defineProperty(el, 'clientWidth', { value: 300, writable: true });
    document.body.appendChild(el);
    return el;
}

describe('createVirtualizer', () => {
    it('computes visible items for fixed-size list', () => {
        const scrollEl = createScrollContainer(200);
        const _count = signal(100);

        const v = createVirtualizer({
            count: () => _count(),
            estimateSize: () => 40,
            getScrollElement: () => scrollEl,
            overscan: 2,
        });

        const items = v.items();
        // Viewport 200px, items 40px each → ~5 visible + 2 overscan = ~7 items
        expect(items.length).toBeGreaterThanOrEqual(5);
        expect(items.length).toBeLessThanOrEqual(10);
        expect(items[0].index).toBe(0);
        expect(items[0].start).toBe(0);
        expect(items[0].size).toBe(40);

        v.dispose();
        scrollEl.remove();
    });

    it('totalSize covers all items', () => {
        const scrollEl = createScrollContainer();
        const v = createVirtualizer({
            count: () => 50,
            estimateSize: () => 30,
            getScrollElement: () => scrollEl,
        });

        expect(v.totalSize()).toBe(50 * 30); // 1500
        v.dispose();
        scrollEl.remove();
    });

    it('handles empty list', () => {
        const scrollEl = createScrollContainer();
        const v = createVirtualizer({
            count: () => 0,
            estimateSize: () => 40,
            getScrollElement: () => scrollEl,
        });

        expect(v.items().length).toBe(0);
        expect(v.totalSize()).toBe(0);
        v.dispose();
        scrollEl.remove();
    });

    it('reacts to count changes', () => {
        const scrollEl = createScrollContainer();
        const _count = signal(10);

        const v = createVirtualizer({
            count: () => _count(),
            estimateSize: () => 40,
            getScrollElement: () => scrollEl,
        });

        expect(v.totalSize()).toBe(400);
        _count.set(20);
        expect(v.totalSize()).toBe(800);

        v.dispose();
        scrollEl.remove();
    });

    it('supports gap between items', () => {
        const scrollEl = createScrollContainer();
        const v = createVirtualizer({
            count: () => 5,
            estimateSize: () => 40,
            getScrollElement: () => scrollEl,
            gap: 10,
        });

        // Total: 5*40 + 4*10 = 240
        expect(v.totalSize()).toBe(240);

        const items = v.items();
        // Second item starts at 40 + 10 = 50
        expect(items[1].start).toBe(50);

        v.dispose();
        scrollEl.remove();
    });

    it('variable item sizes', () => {
        const scrollEl = createScrollContainer();
        const sizes = [20, 50, 30, 60, 40];

        const v = createVirtualizer({
            count: () => sizes.length,
            estimateSize: (i) => sizes[i],
            getScrollElement: () => scrollEl,
        });

        // Total: 20+50+30+60+40 = 200
        expect(v.totalSize()).toBe(200);

        const items = v.items();
        expect(items[0].size).toBe(20);
        expect(items[1].start).toBe(20);
        expect(items[1].size).toBe(50);
        expect(items[2].start).toBe(70);

        v.dispose();
        scrollEl.remove();
    });

    it('scrollTo sets scroll position', () => {
        const scrollEl = createScrollContainer();
        const v = createVirtualizer({
            count: () => 100,
            estimateSize: () => 40,
            getScrollElement: () => scrollEl,
        });

        v.scrollTo(10);
        expect(scrollEl.scrollTop).toBe(400); // 10 * 40

        v.scrollTo(5, { align: 'end' });
        // 5*40 - 200 + 40 = 40
        expect(scrollEl.scrollTop).toBe(40);

        v.dispose();
        scrollEl.remove();
    });

    it('disposes cleanly', () => {
        const scrollEl = createScrollContainer();
        const v = createVirtualizer({
            count: () => 100,
            estimateSize: () => 40,
            getScrollElement: () => scrollEl,
        });

        v.dispose(); // should not throw
        scrollEl.remove();
    });

    it('handles null scroll element', () => {
        const v = createVirtualizer({
            count: () => 10,
            estimateSize: () => 40,
            getScrollElement: () => null,
        });

        // With viewport=0 and scroll=0, items at offset 0 are still "visible"
        // totalSize still reflects all items
        expect(v.totalSize()).toBe(400);
        // scrollTo should not throw
        v.scrollTo(5);
        v.dispose();
    });
});

// measureElement has to invalidate the layout and totalSize.

describe('virtualizer measureElement', () => {
    it('a measurement that differs from the estimate updates totalSize with no scroll', () => {
        const count = signal(10);
        const virt = createVirtualizer({
            count: () => count(),
            estimateSize: () => 10,
            getScrollElement: () => null,
        });

        expect(virt.totalSize()).toBe(100);

        const el = document.createElement('div');
        el.dataset.virtualIndex = '0';
        Object.defineProperty(el, 'offsetHeight', { value: 50 });
        virt.measureElement(el);

        expect(virt.totalSize()).toBe(140);
        virt.dispose();
    });
});
