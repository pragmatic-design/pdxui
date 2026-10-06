// The heatmap's colours are real colours in every theme, and its values are readable.
//
// `lerpColor` parses more than hex. The theme resolves its tokens through getComputedStyle, and
// Chromium hands an oklch() token back as `oklch(...)`: a hex-only parser gives NaN, the fill is
// `rgb(NaN,NaN,NaN)`, and the canvas ignores it and paints each cell with the previous fill — white
// or black. The low end is not a fixed #f0f0f0 (white-on-dark in the dark scheme), the value text is
// not a guess by threshold, and the layout reserves the width of the row labels, not of numeric
// ticks, so they are not clipped.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseRgb, contrastRatio } from '../../src/chart/core/color';
import { heatCellColour, heatValueColour } from '../../src/chart/series/heatmap';
import { computeLayout } from '../../src/chart/core/layout';
import type { ChartTheme } from '../../src/chart/core/types';
import type { CanvasRenderer } from '../../src/chart/core/renderer';

afterEach(() => { vi.restoreAllMocks(); });

describe('parseRgb', () => {
    it('reads hex and rgb() in both syntaxes', () => {
        expect(parseRgb('#fff')).toEqual([255, 255, 255, 1]);
        expect(parseRgb('#336699')).toEqual([51, 102, 153, 1]);
        expect(parseRgb('rgb(10, 20, 30)')).toEqual([10, 20, 30, 1]);
        expect(parseRgb('rgb(10 20 30 / 0.5)')).toEqual([10, 20, 30, 0.5]);
        expect(parseRgb('rgba(10,20,30,0.25)')).toEqual([10, 20, 30, 0.25]);
    });

    it('resolves any other CSS colour — oklch() — by letting a canvas paint it and reading it back', () => {
        // happy-dom has no 2D canvas; the stub stands in for the browser's own colour parser.
        const painted: string[] = [];
        const ctx = {
            fillStyle: '',
            clearRect() {},
            fillRect() { painted.push(this.fillStyle); },
            getImageData: () => ({ data: new Uint8ClampedArray([200, 140, 20, 255]) }),
        };
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
        expect(parseRgb('oklch(0.7 0.15 85)')).toEqual([200, 140, 20, 1]);
        expect(painted).toEqual(['oklch(0.7 0.15 85)']);
    });

    it('returns null, not NaN, for what it cannot resolve', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        expect(parseRgb('oklch(0.6 0.1 30)')).toBeNull();
    });
});

describe('heatmap cell and value colours', () => {
    it('a cell is a real mix of the two ends, never a NaN string', () => {
        const mid = heatCellColour('rgb(240, 240, 240)', 'rgb(40, 80, 200)', 0.5);
        expect(mid).toBe('rgb(140,160,220)');
        expect(heatCellColour('rgb(240, 240, 240)', 'rgb(40, 80, 200)', 0)).toBe('rgb(240,240,240)');
    });

    it('a cell whose ends cannot be read is null, so the caller falls back', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        expect(heatCellColour('oklch(0.97 0.01 250)', 'oklch(0.5 0.2 250)', 0.5)).toBeNull();
    });

    it('the value text is whichever of text and surface contrasts more with the cell', () => {
        const dark = 'rgb(20, 20, 30)', light = 'rgb(250, 250, 250)';
        expect(heatValueColour('rgb(30, 60, 160)', dark, light)).toBe(light);
        expect(heatValueColour('rgb(235, 235, 240)', dark, light)).toBe(dark);
        // And it holds 4.5:1 on both ends of a real ramp.
        for (const cell of ['rgb(30, 60, 160)', 'rgb(235, 235, 240)']) {
            const text = heatValueColour(cell, dark, light)!;
            expect(contrastRatio(parseRgb(cell)!, parseRgb(text)!)).toBeGreaterThanOrEqual(4.5);
        }
    });
});

describe('heatmap layout', () => {
    const theme: ChartTheme = {
        palette: ['#000'], textColor: '#000', mutedColor: '#666', gridColor: '#ccc', bgColor: '#fff',
        fontFamily: 'sans-serif', fontSize: 13,
    };
    const renderer = { measureText: (s: string) => s.length * 8 } as unknown as CanvasRenderer;

    it('reserves the width of the widest row label on the left', () => {
        const area = computeLayout(600, 300, null, theme, { leftLabels: ['Mon', 'Wednesday', 'Sun'] }, renderer);
        expect(area.x).toBeGreaterThanOrEqual('Wednesday'.length * 8 + 6);
    });
});
