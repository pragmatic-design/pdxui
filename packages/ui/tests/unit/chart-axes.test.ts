// pdx-chart axes: labelled ends, readable category labels, and titles and legends that stay off
// the tick labels.
//
// - The domain reaches the top tick: with values to 9100, a step of 5000 and a domain stopping at
//   ≈9.5K, the 10K tick is never drawn and the axis shows only 0 and 5.0K.
// - Category labels are thinned: 90 of them ("Zoom & Pan") overlap into a band otherwise.
// - The left axis title clears the tick labels, rather than sitting a fixed 45 px from the axis on
//   top of wider ones ("$60.0K").
// - A bottom legend clears rotated X labels, rather than sitting a fixed 33 px below the plot.
//
// The axes draw to a canvas: a recording renderer stands in for it, and the assertions are on the
// positions it was asked to draw at.
import { describe, it, expect } from 'vitest';
import { seriesYDomain, linearScale, categoryScale } from '../../src/chart/core/scales';
import { drawXAxis, drawYAxis, measureXAxisHeight } from '../../src/chart/core/axis';
import { legendOrigin } from '../../src/chart/core/layout';
import type { ChartArea, ChartTheme } from '../../src/chart/core/types';
import type { CanvasRenderer } from '../../src/chart/core/renderer';

const theme: ChartTheme = {
    palette: ['#000'], textColor: '#000', mutedColor: '#666', gridColor: '#ccc', bgColor: '#fff',
    fontFamily: 'sans-serif', fontSize: 13,
};
const CHAR = 7;   // px per character in the recording renderer

interface Drawn { text: string; x: number; y: number; align: string; origin: { x: number; y: number }; rotation: number }

function recorder() {
    const drawn: Drawn[] = [];
    let origin = { x: 0, y: 0 }, rotation = 0;
    const stack: { origin: typeof origin; rotation: number }[] = [];
    const ctx = {
        save() { stack.push({ origin: { ...origin }, rotation }); },
        restore() { const s = stack.pop()!; origin = s.origin; rotation = s.rotation; },
        translate(x: number, y: number) { origin = { x: origin.x + x, y: origin.y + y }; },
        rotate(a: number) { rotation += a; },
    };
    const r = {
        ctx,
        line() {},
        measureText: (s: string) => s.length * CHAR,
        text(text: string, x: number, y: number, _c: string, _f: string, align = 'left') {
            drawn.push({ text, x, y, align, origin: { ...origin }, rotation });
        },
    } as unknown as CanvasRenderer;
    return { r, drawn };
}

describe('Y domain reaches its ticks', () => {
    it('a line of 0…9100 with 4 ticks: the domain ends at 10000, and 0, 5000 and 10000 are labelled', () => {
        const data = [0, 2000, 9100].map((y, index) => ({ x: index, y, raw: {}, index }));
        const [min, max] = seriesYDomain([{ type: 'line', data }], false, 4);
        expect([min, max]).toEqual([0, 10000]);
        const ticks = linearScale([min, max], [300, 0]).ticks(4);
        expect(ticks).toEqual([0, 5000, 10000]);
    });

    it('bars stay on zero, and a negative domain is niced at its low end', () => {
        const bars = [-37, 12, 81].map((y, index) => ({ x: index, y, raw: {}, index }));
        const [min, max] = seriesYDomain([{ type: 'bar', data: bars }], false, 5);
        expect(min).toBeLessThanOrEqual(-37);
        expect(max).toBeGreaterThanOrEqual(81);
        const ticks = linearScale([min, max], [300, 0]).ticks(5) as number[];
        expect(ticks[0]).toBe(min);
        expect(ticks[ticks.length - 1]).toBe(max);
        expect(ticks).toContain(0);
    });
});

describe('category labels are thinned to the ones that fit', () => {
    const area: ChartArea = { x: 40, y: 20, width: 800, height: 300 };
    const days = Array.from({ length: 90 }, (_, i) => `Day ${i + 1}`);

    it('90 labels in 800 px: the drawn ones do not overlap', () => {
        const { r, drawn } = recorder();
        drawXAxis(r, categoryScale(days, [area.x, area.x + area.width]), area, theme);
        const labels = drawn.filter(d => d.text.startsWith('Day '));
        expect(labels.length).toBeLessThan(90);
        expect(labels.length).toBeGreaterThan(10);
        // Rotated labels are parallel boxes one line tall: they clear each other when their anchors
        // are at least lineHeight / sin(angle) apart. Unrotated, when a whole label width is.
        const angle = Math.abs(labels[0].rotation);
        const need = angle > 0 ? theme.fontSize / Math.sin(angle) : Math.max(...labels.map(l => l.text.length * CHAR)) + 8;
        for (let i = 1; i < labels.length; i++) {
            expect(labels[i].origin.x + labels[i].x - (labels[i - 1].origin.x + labels[i - 1].x)).toBeGreaterThanOrEqual(need - 0.01);
        }
    });

    it('12 short labels in 800 px are all drawn', () => {
        const { r, drawn } = recorder();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        drawXAxis(r, categoryScale(months, [area.x, area.x + area.width]), area, theme);
        expect(drawn.filter(d => months.includes(d.text)).length).toBe(12);
    });
});

describe('the Y axis title stays off the tick labels', () => {
    it('the title is drawn beyond the widest tick label', () => {
        const area: ChartArea = { x: 120, y: 20, width: 600, height: 300 };
        const { r, drawn } = recorder();
        const currency = (v: unknown) => '$' + ((v as number) / 1000).toFixed(1) + 'K';
        drawYAxis(r, linearScale([0, 60000], [area.y + area.height, area.y]), area, theme, 'Revenue', 'left', currency);
        const ticks = drawn.filter(d => d.text.startsWith('$'));
        const title = drawn.find(d => d.text === 'Revenue')!;
        // Tick labels are right-aligned at x: they span [x - width, x]. The title is rotated, one
        // line tall, centred on its origin: it spans [cx - h/2, cx + h/2].
        const leftmostTick = Math.min(...ticks.map(t => t.x - t.text.length * CHAR));
        const titleRight = title.origin.x + (theme.fontSize - 1) / 2;
        expect(titleRight).toBeLessThanOrEqual(leftmostTick);
    });
});

describe('a bottom legend sits below the X labels', () => {
    it('below rotated labels, not a fixed distance under the plot', () => {
        const area: ChartArea = { x: 40, y: 20, width: 400, height: 300 };
        const { r } = recorder();
        const long = Array.from({ length: 30 }, (_, i) => `Category ${i + 1}`);
        const xAxisHeight = measureXAxisHeight(r, categoryScale(long, [area.x, area.x + area.width]), area.width, theme);
        expect(xAxisHeight).toBeGreaterThan(theme.fontSize + 20);
        const { y } = legendOrigin('bottom', area, theme, false, xAxisHeight);
        expect(y).toBeGreaterThanOrEqual(area.y + area.height + xAxisHeight);
    });
});
