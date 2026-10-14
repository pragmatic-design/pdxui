import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
        // In the document, as a rendered row is: a detached element has no size to measure (#283).
        document.body.appendChild(el);
        virt.measureElement(el);

        expect(virt.totalSize()).toBe(140);
        virt.dispose();
        el.remove();
    });
});

// #252: an item measured once and then resized — an image that loads, a row that wraps — kept its
// first size. measureElement now observes what it measures.

/** A ResizeObserver the test drives: every instance, what it watches, and a way to fire it. */
class FakeResizeObserver {
    static all: FakeResizeObserver[] = [];
    readonly watched = new Set<Element>();
    disconnected = false;
    constructor(private readonly cb: ResizeObserverCallback) { FakeResizeObserver.all.push(this); }
    observe(el: Element): void { this.watched.add(el); }
    unobserve(el: Element): void { this.watched.delete(el); }
    disconnect(): void { this.watched.clear(); this.disconnected = true; }
    fire(el: Element): void {
        this.cb([{ target: el } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
}

describe('virtualizer: measured items stay measured', () => {
    const original = globalThis.ResizeObserver;
    beforeEach(() => {
        FakeResizeObserver.all = [];
        (globalThis as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
    });
    afterEach(() => {
        (globalThis as { ResizeObserver: unknown }).ResizeObserver = original;
    });

    /** A rendered item: its index, and a height the test can change. */
    function item(index: number, height: number): HTMLElement & { setHeight(h: number): void } {
        let h = height;
        const el = Object.assign(document.createElement('div'), { setHeight: (next: number) => { h = next; } });
        el.dataset.virtualIndex = String(index);
        Object.defineProperty(el, 'offsetHeight', { get: () => h });
        document.body.appendChild(el);
        return el;
    }

    /** The observer that watches items — not the one on the scroll container. */
    const itemObserver = (el: Element) => FakeResizeObserver.all.find((o) => o.watched.has(el));

    it('an element handed to measureElement and then resized updates totalSize', () => {
        const virt = createVirtualizer({ count: () => 10, estimateSize: () => 10, getScrollElement: () => null });
        const el = item(0, 50);
        virt.measureElement(el);
        expect(virt.totalSize()).toBe(140);

        const observer = itemObserver(el);
        expect(observer, 'the measured element is not observed').toBeDefined();
        el.setHeight(80);
        observer!.fire(el);
        expect(virt.totalSize(), 'a resize after the first measurement was not taken').toBe(170);
        virt.dispose();
        el.remove();
    });

    it('a disconnected element is unobserved instead of measured', () => {
        const virt = createVirtualizer({ count: () => 10, estimateSize: () => 10, getScrollElement: () => null });
        const el = item(0, 50);
        virt.measureElement(el);
        const observer = itemObserver(el)!;
        el.remove();
        el.setHeight(0);
        observer.fire(el);
        expect(observer.watched.has(el), 'a removed element is still observed').toBe(false);
        expect(virt.totalSize(), 'a removed element was measured at 0').toBe(140);
        virt.dispose();
    });

    it('an element not yet in the document is observed, not measured at 0', () => {
        // A row built in a fragment, before the fragment is placed: read then, its height is 0, and
        // a list measured that way lost 100 rows' worth of height (#283).
        const virt = createVirtualizer({ count: () => 10, estimateSize: () => 10, getScrollElement: () => null });
        const el = item(0, 50);
        el.remove();
        el.setHeight(0);
        virt.measureElement(el);
        expect(virt.totalSize(), 'a detached element was measured at 0').toBe(100);
        expect(itemObserver(el), 'the detached element is not observed for when it is placed').toBeDefined();
        virt.dispose();
    });

    it('dispose() disconnects the observer', () => {
        const virt = createVirtualizer({ count: () => 10, estimateSize: () => 10, getScrollElement: () => null });
        const el = item(0, 50);
        virt.measureElement(el);
        const observer = itemObserver(el)!;
        virt.dispose();
        expect(observer.disconnected).toBe(true);
        el.remove();
    });
});
