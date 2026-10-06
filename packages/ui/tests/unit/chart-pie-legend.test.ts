// A pie or a doughnut names its slices.
//
// A legend of SERIES, shown only when there is more than one, names nothing on a pie: it has one
// series, and what it needs named are its CATEGORIES. Without them a doughnut of tickets by status
// draws three slices and nothing says which is which — the tooltip does, on hover only, out of reach
// of a keyboard or a phone.
//
// The real engine, on a 2D context that accepts every call: happy-dom has no canvas, and what is
// measured here is what the engine hands pdx-chart's legend, not a picture.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChartEngine, type ChartConfig } from '../../src/chart/core/engine';
import { chartDataTable } from '../../src/chart/core/describe';

let restore: (() => void) | null = null;
beforeAll(() => {
    const proto = HTMLCanvasElement.prototype as unknown as { getContext: unknown };
    const original = proto.getContext;
    proto.getContext = function (this: HTMLCanvasElement) {
        const canvas = this;
        return new Proxy({}, {
            get: (_t, prop) => {
                if (prop === 'canvas') return canvas;
                if (prop === 'measureText') return (s: string) => ({ width: String(s).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
                if (prop === 'getLineDash') return () => [];
                if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop: () => {} });
                return () => {};
            },
            set: () => true,
        });
    };
    restore = () => { proto.getContext = original; };
});
afterAll(() => restore?.());

const STATUS = [
    { status: 'Open', count: 12 },
    { status: 'Waiting', count: 9 },
    { status: 'Closed', count: 15 },
];

function engineWith(config: Partial<ChartConfig>): ChartEngine {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const engine = new ChartEngine(host);
    engine.update({ type: 'doughnut', data: STATUS, xField: 'status', yField: ['count'], ...config } as ChartConfig);
    return engine;
}

describe('the legend of a pie or a doughnut', () => {
    for (const type of ['doughnut', 'pie'] as const) {
        it(`${type}: one item per slice, named by its category`, () => {
            const items = engineWith({ type }).getLegendItems();
            expect(items.map(i => i.name), 'the legend lists the one series, not the slices').toEqual(['Open', 'Waiting', 'Closed']);
            expect(new Set(items.map(i => i.color)).size, 'every slice has its own colour').toBe(3);
        });
    }

    it('hiding a slice keeps the others\' colours: a colour belongs to its category', () => {
        const engine = engineWith({});
        const before = engine.getLegendItems();
        engine.setSeriesVisible('Waiting', false);
        const after = engine.getLegendItems();
        expect(after.find(i => i.name === 'Waiting')?.visible).toBe(false);
        expect(after.map(i => i.color)).toEqual(before.map(i => i.color));
    });

    it('control — a bar chart with two series still lists its series', () => {
        const engine = engineWith({
            type: 'bar',
            data: [{ q: 'Q1', a: 1, b: 2 }, { q: 'Q2', a: 3, b: 4 }],
            xField: 'q', yField: ['a', 'b'], seriesNames: ['Desktop', 'Mobile'],
        });
        expect(engine.getLegendItems().map(i => i.name)).toEqual(['Desktop', 'Mobile']);
    });
});

describe('the data table of a doughnut with a slice hidden', () => {
    it('leaves the hidden category out, as the drawing does', () => {
        const config = { type: 'doughnut', data: STATUS, xField: 'status', yField: ['count'] } as ChartConfig;
        const table = chartDataTable(config, new Set(['Waiting']), 'Category')!;
        expect(table.rows.map(r => r[0])).toEqual(['Open', 'Closed']);
    });

    it('control — nothing hidden, every category', () => {
        const config = { type: 'doughnut', data: STATUS, xField: 'status', yField: ['count'] } as ChartConfig;
        expect(chartDataTable(config, new Set(), 'Category')!.rows.length).toBe(3);
    });
});
