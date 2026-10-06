// A bar encodes a value as a length, so a bar chart's Y axis starts at zero.
//
// Not only when the minimum is under 30% of the maximum: a plain bar chart of 40…90 would start at
// ≈37, and the lengths would lie. And a stacked chart's domain covers every segment, not the
// per-category TOTALS only: the site's Stacked Bar demo (totals 8800…12200) would get an axis from
// ≈8360, and Desktop, drawn 0→4500, would sit entirely below it and be clipped out.
//
// The chart draws to a canvas, so this asserts the domain arithmetic, the level the defect lives at
// (as chart-bar-slot.test does for bar geometry).
import { describe, it, expect } from 'vitest';
import { seriesYDomain } from '../../src/chart/core/scales';
import type { Series } from '../../src/chart/core/types';

function series(name: string, type: string, ys: number[], area = false): Series {
    return { name, type, area, color: '#000', data: ys.map((y, index) => ({ x: `Q${index + 1}`, y, raw: {}, index })) };
}

// The comp-chart.pdx Stacked Bar demo.
const DESKTOP = series('Desktop', 'bar', [4500, 5200, 4800, 5900]);
const MOBILE = series('Mobile', 'bar', [3200, 3800, 4100, 4600]);
const TABLET = series('Tablet', 'bar', [1100, 1300, 1400, 1700]);

describe('seriesYDomain', () => {
    it('a stacked bar chart starts at zero and reaches the tallest stack', () => {
        const [min, max] = seriesYDomain([DESKTOP, MOBILE, TABLET], true);
        expect(min).toBe(0);
        expect(max).toBeGreaterThanOrEqual(5900 + 4600 + 1700);
    });

    it('a plain bar chart of 40…90 starts at zero', () => {
        expect(seriesYDomain([series('A', 'bar', [40, 55, 90, 70])], false)[0]).toBe(0);
    });

    it('an area chart fills to zero, so it starts there too', () => {
        expect(seriesYDomain([series('A', 'line', [40, 55, 90, 70], true)], false)[0]).toBe(0);
    });

    it('a line chart of 40…90 keeps fitting the data', () => {
        const [min] = seriesYDomain([series('A', 'line', [40, 55, 90, 70])], false);
        expect(min).toBeGreaterThan(30);
        expect(min).toBeLessThan(40);
    });

    it('negative bars: the domain spans the lowest value to zero', () => {
        const [min, max] = seriesYDomain([series('A', 'bar', [-30, -10, -50])], false);
        expect(min).toBeLessThanOrEqual(-50);
        expect(max).toBe(0);
    });

    it('a stack that goes negative includes every boundary, not only the total', () => {
        // Totals 20 and 10, but the stack reaches 100 on the way (100 − 80): a totals-only
        // domain stops near 20 and cuts the first segment.
        const [min, max] = seriesYDomain([series('A', 'bar', [100, 50]), series('B', 'bar', [-80, -40])], true);
        expect(min).toBe(0);
        expect(max).toBeGreaterThanOrEqual(100);
    });
});
