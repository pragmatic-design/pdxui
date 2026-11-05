// A measurement costs the virtualizer the rows it changes, not the whole list (#900).
//
// `applySize` invalidated every cumulative offset on each measurement, even one equal to the estimate,
// and then asked `findStartIndex` for the first visible row, which rebuilt the offsets over the whole
// list: 20 rows of 10,000 measured at their estimated height called `estimateSize` about 200,000
// times on top of the 10,000 of the first layout.

import { describe, it, expect, afterEach } from 'vitest';
import { createVirtualizer } from '../src/renderer/virtualizer';

const N = 10_000;
const ROW = 32;

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });

function setup() {
    const scroller = document.createElement('div');
    document.body.appendChild(scroller);
    let calls = 0;
    const v = createVirtualizer({
        count: () => N,
        estimateSize: () => { calls++; return ROW; },
        getScrollElement: () => scroller,
    });
    cleanup = () => { v.dispose(); scroller.remove(); };
    v.items();
    v.totalSize();
    const row = (index: number, height: number): HTMLElement => {
        const el = document.createElement('div');
        el.dataset.virtualIndex = String(index);
        Object.defineProperty(el, 'offsetHeight', { value: height });
        scroller.appendChild(el);
        return el;
    };
    return { v, row, calls: () => calls };
}

describe('virtualizer — the cost of a measurement', () => {
    it('a row measured at its estimated size changes nothing', () => {
        const { v, row, calls } = setup();
        const before = calls();
        for (let i = 0; i < 20; i++) v.measureElement(row(i, ROW));
        v.items();
        v.totalSize();
        expect(calls() - before, 'estimateSize calls for 20 rows measured at their estimate').toBeLessThanOrEqual(20);
    });

    it('rows measured at another size update the offsets once, not once per row', () => {
        const { v, row, calls } = setup();
        const before = calls();
        for (let i = 0; i < 20; i++) v.measureElement(row(i, ROW + 8));
        v.items();
        expect(v.totalSize()).toBe(N * ROW + 20 * 8);
        expect(calls() - before, 'estimateSize calls for 20 rows measured at another size').toBeLessThan(2 * N);
    });

    it('places the rows after a measured one by its measured size', () => {
        const { v, row } = setup();
        v.measureElement(row(2, 100));
        expect(v.itemRect(2)).toEqual({ start: 2 * ROW, size: 100 });
        expect(v.itemRect(3).start).toBe(2 * ROW + 100);
        expect(v.itemRect(N - 1).start).toBe((N - 2) * ROW + 100);
    });
});
