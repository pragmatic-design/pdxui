import { describe, it, expect } from 'vitest';
import { useContainerSize, measure, measureRelative, registerContainerQueries } from '../src/component/container-size';
import { waitUntil } from './wait-until';

describe('useContainerSize', () => {
    it('returns signal-based width/height', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        const size = useContainerSize(() => el);
        // In happy-dom, initial size is 0
        expect(size.width()).toBe(0);
        expect(size.height()).toBe(0);
        expect(typeof size.dispose).toBe('function');

        size.dispose();
        el.remove();
    });

    it('provides breakpoint signals', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        const size = useContainerSize(() => el);
        // At width=0, isCompact should be true
        expect(size.isCompact()).toBe(true);
        expect(size.isMedium()).toBe(false);
        expect(size.isWide()).toBe(false);

        size.dispose();
        el.remove();
    });

    it('supports custom breakpoints', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        const size = useContainerSize(() => el, { compact: 200, wide: 400 });
        expect(size.isCompact()).toBe(true); // 0 < 200

        size.dispose();
        el.remove();
    });

    it('handles null element', () => {
        const size = useContainerSize(() => null);
        expect(size.width()).toBe(0);
        expect(size.height()).toBe(0);
        size.dispose();
    });

    it('cleans up on dispose', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        const size = useContainerSize(() => el);
        size.dispose(); // should not throw
        el.remove();
    });
});

describe('measure', () => {
    it('returns element dimensions', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        const result = measure(el);
        expect(result).toHaveProperty('width');
        expect(result).toHaveProperty('height');
        expect(result).toHaveProperty('x');
        expect(result).toHaveProperty('y');
        expect(typeof result.width).toBe('number');

        el.remove();
    });
});

describe('measureRelative', () => {
    it('calculates relative position and overlap', () => {
        const a = document.createElement('div');
        const b = document.createElement('div');
        document.body.appendChild(a);
        document.body.appendChild(b);

        const result = measureRelative(a, b);
        expect(result).toHaveProperty('dx');
        expect(result).toHaveProperty('dy');
        expect(result).toHaveProperty('overlap');
        expect(typeof result.overlap).toBe('boolean');

        a.remove();
        b.remove();
    });
});

describe('registerContainerQueries', () => {
    it('sets container-type on element', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        const dispose = registerContainerQueries(el);
        expect(el.style.containerType).toBe('inline-size');

        dispose();
        expect(el.style.containerType).toBe('');
        el.remove();
    });

    it('supports custom breakpoints', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        const dispose = registerContainerQueries(el, { md: 768, lg: 1024 });
        expect(el.style.containerType).toBe('inline-size');

        dispose();
        el.remove();
    });
});

// An element that appears after the microtask is observed all the same

describe('useContainerSize — an element that appears late', () => {
    it('attaches the observer when el() resolves a few frames later', async () => {
        let el: HTMLElement | null = null;
        const size = useContainerSize(() => el);

        // the element appears AFTER the initial microtask
        await new Promise(r => setTimeout(r, 10));
        el = document.createElement('div');
        el.getBoundingClientRect = () => ({
            width: 320, height: 200, top: 0, left: 0, right: 320, bottom: 200, x: 0, y: 0, toJSON: () => ({}),
        }) as DOMRect;
        document.body.appendChild(el);

        await waitUntil(() => size.width() === 320, 'the container size to be observed');
        expect(size.width()).toBe(320); // without the fix: it stayed 0 forever
        size.dispose();
    });
});
