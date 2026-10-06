// Heatmap series renderer — grid-based color intensity chart.

import type { ChartArea, ChartTheme } from '../core/types';
import type { CanvasRenderer } from '../core/renderer';
import { parseRgb, mixRgb, rgbString, contrastRatio } from '../core/color';
import { chartNumbers, type ChartNumbers } from '../core/numbers';

export interface HeatmapCell {
    x: string;
    y: string;
    value: number;
}

/** Parse heatmap data from records with x, y, value fields. */
export function parseHeatmapData(
    data: Record<string, unknown>[],
    xField: string,
    yField: string,
    valueField: string,
): { cells: HeatmapCell[]; xLabels: string[]; yLabels: string[]; min: number; max: number } {
    const cells: HeatmapCell[] = [];
    const xSet = new Set<string>();
    const ySet = new Set<string>();
    let min = Infinity, max = -Infinity;

    for (const row of data) {
        const x = String(row[xField] ?? '');
        const y = String(row[yField] ?? '');
        const v = Number(row[valueField]) || 0;
        cells.push({ x, y, value: v });
        xSet.add(x);
        ySet.add(y);
        if (v < min) min = v;
        if (v > max) max = v;
    }

    return {
        cells,
        xLabels: [...xSet],
        yLabels: [...ySet],
        min: min === Infinity ? 0 : min,
        max: max === -Infinity ? 1 : max,
    };
}

/**
 * The colour of a cell at t (0–1) between the low and high ends, or null when either end cannot be
 * resolved. Not a hex-only lerp: with one, the theme's oklch() tokens become `rgb(NaN,NaN,NaN)`, which
 * the canvas ignores, so each cell keeps the previous fill — white or black.
 */
export function heatCellColour(low: string, high: string, t: number): string | null {
    const a = parseRgb(low), b = parseRgb(high);
    return a && b ? rgbString(mixRgb(a, b, t)) : null;
}

/**
 * The value text colour on a cell: whichever of the theme's text and surface contrasts more with
 * it. It was white above t = 0.6 and the text colour below, a guess that did not know the cell.
 */
export function heatValueColour(cell: string, text: string, surface: string): string | null {
    const c = parseRgb(cell), t = parseRgb(text), s = parseRgb(surface);
    if (!c || !t || !s) return null;
    return contrastRatio(c, t) >= contrastRatio(c, s) ? text : surface;
}

/** Draw heatmap grid. */
export function drawHeatmap(
    r: CanvasRenderer,
    cells: HeatmapCell[],
    xLabels: string[],
    yLabels: string[],
    min: number,
    max: number,
    area: ChartArea,
    theme: ChartTheme,
    animProgress = 1,
    nf: ChartNumbers = chartNumbers(),
): void {
    const c = r.ctx;
    const colW = area.width / (xLabels.length || 1);
    const rowH = area.height / (yLabels.length || 1);
    const font = `${Math.min(theme.fontSize, rowH * 0.5)}px ${theme.fontFamily}`;
    const range = max - min || 1;

    // Colour ramp: the theme's inset surface → its primary. A fixed light low end would be a
    // white cell on a dark surface in the dark scheme.
    const lowColor = theme.insetColor || theme.bgColor;
    const highColor = theme.palette[0] || '#5470c6';

    // Build lookup for O(1) cell access
    const cellMap = new Map<string, number>();
    for (const cell of cells) cellMap.set(`${cell.x}|${cell.y}`, cell.value);

    // Draw cells
    for (let yi = 0; yi < yLabels.length; yi++) {
        for (let xi = 0; xi < xLabels.length; xi++) {
            const val = cellMap.get(`${xLabels[xi]}|${yLabels[yi]}`) ?? 0;
            const t = Math.max(0, Math.min(1, ((val - min) / range) * animProgress));
            const color = heatCellColour(lowColor, highColor, t);

            const x = area.x + xi * colW;
            const y = area.y + yi * rowH;

            if (color) {
                c.fillStyle = color;
                c.fillRect(x + 1, y + 1, colW - 2, rowH - 2);
            } else {
                // Ends the canvas could not read back: the high colour over the low, at t.
                c.fillStyle = lowColor;
                c.fillRect(x + 1, y + 1, colW - 2, rowH - 2);
                c.save();
                c.globalAlpha = t;
                c.fillStyle = highColor;
                c.fillRect(x + 1, y + 1, colW - 2, rowH - 2);
                c.restore();
            }

            // Value label (if cell is big enough), in the colour that reads on this cell
            if (colW > 30 && rowH > 20) {
                const textColor = (color && heatValueColour(color, theme.textColor, theme.bgColor)) || theme.textColor;
                r.text(nf.number(Math.round(val)), x + colW / 2, y + rowH / 2, textColor, font, 'center', 'middle');
            }
        }
    }

    // X labels (bottom)
    const labelFont = `${Math.min(theme.fontSize - 1, colW * 0.4)}px ${theme.fontFamily}`;
    for (let xi = 0; xi < xLabels.length; xi++) {
        const x = area.x + xi * colW + colW / 2;
        r.text(xLabels[xi], x, area.y + area.height + theme.fontSize, theme.mutedColor, labelFont, 'center', 'top');
    }

    // Y labels (left)
    for (let yi = 0; yi < yLabels.length; yi++) {
        const y = area.y + yi * rowH + rowH / 2;
        r.text(yLabels[yi], area.x - 6, y, theme.mutedColor, labelFont, 'right', 'middle');
    }
}
