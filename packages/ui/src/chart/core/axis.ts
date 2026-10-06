// Axis rendering — draws grid lines, tick labels, axis names.
// Supports left/right Y-axis for dual-axis charts.

import type { ChartArea, ChartTheme } from './types';
import type { Scale } from './scales';
import type { CanvasRenderer } from './renderer';
import { chartNumbers, type ChartNumbers } from './numbers';

export type AxisFormatter = (value: unknown) => string;

/** A number through `format`; anything else (a category, a date) as its string. */
function numeric(format: (n: number) => string): AxisFormatter {
    return (v) => (typeof v === 'number' ? format(v) : String(v ?? ''));
}

/**
 * Resolve a format string to a formatter, in the chart's numbers: 'currency' (compact, in the
 * chart's currency), 'percent' (the value is already a percentage: 45 → "45%"), 'compact', or a
 * template "{value} pts". The built-ins do not write '$' and "K" by hand on a browser-locale
 * number.
 */
export function resolveFormatter(fmt?: string, nf: ChartNumbers = chartNumbers()): AxisFormatter | undefined {
    if (!fmt) return undefined;
    if (fmt === 'currency') return numeric(nf.currency);
    if (fmt === 'percent') return numeric(n => nf.percent(n / 100));
    if (fmt === 'compact') return numeric(nf.compact);
    // Template pattern: "{value}%", "${value}K" etc.
    if (fmt.includes('{value}')) {
        return (v) => fmt.replace('{value}', typeof v === 'number' ? nf.number(v) : String(v));
    }
    return undefined;
}

/** Measure how much bottom space the x-axis needs (for layout). */
export function measureXAxisHeight(
    r: CanvasRenderer,
    scale: Scale,
    areaWidth: number,
    theme: ChartTheme,
    formatter?: AxisFormatter,
    name?: string,
): number {
    const ticks = scale.ticks(Math.max(2, Math.floor(areaWidth / 80)));
    const font = `${theme.fontSize}px ${theme.fontFamily}`;
    const fmt = formatter || scale.format.bind(scale);
    const rotation = detectLabelRotation(r, ticks, fmt, font, areaWidth);
    let h = theme.fontSize + 8; // base
    if (rotation > 0) {
        const maxLabelW = ticks.reduce<number>((m, t) => Math.max(m, r.measureText(fmt(t), font)), 0);
        h = Math.sin(rotation) * maxLabelW + theme.fontSize * 0.5 + 8;
    }
    if (name) h += theme.fontSize + 4;
    return h;
}

/** Draw x-axis (bottom) with labels and grid lines. Auto-rotates labels when they overlap. */
export function drawXAxis(
    r: CanvasRenderer,
    scale: Scale,
    area: ChartArea,
    theme: ChartTheme,
    name?: string,
    formatter?: AxisFormatter,
): void {
    const ticks = scale.ticks(Math.max(2, Math.floor(area.width / 80)));
    const font = `${theme.fontSize}px ${theme.fontFamily}`;
    const fmt = formatter || scale.format.bind(scale);
    const y = area.y + area.height;
    const rotation = detectLabelRotation(r, ticks, fmt, font, area.width);

    // Axis line
    r.line(area.x, y, area.x + area.width, y, theme.gridColor, 1);

    const stride = labelStride(r, ticks, fmt, font, area.width, rotation, theme.fontSize);
    for (let i = 0; i < ticks.length; i += stride) {
        const tick = ticks[i];
        const x = scale.map(tick);
        if (x < area.x - 1 || x > area.x + area.width + 1) continue;

        r.line(x, area.y, x, y, theme.gridColor, 0.5, [3, 3]);

        const label = fmt(tick);
        if (rotation > 0) {
            // Rotated labels
            const c = r.ctx;
            c.save();
            c.translate(x, y + 6);
            c.rotate(-rotation);
            r.text(label, 0, 0, theme.mutedColor, font, 'right', 'top');
            c.restore();
        } else {
            r.text(label, x, y + theme.fontSize * 0.8, theme.mutedColor, font, 'center', 'top');
        }
    }

    const labelOffset = rotation > 0
        ? Math.sin(rotation) * ticks.reduce<number>((m, t) => Math.max(m, r.measureText(fmt(t), font)), 0) + 8
        : theme.fontSize * 2;

    if (name) {
        const nameFont = `${theme.fontSize - 1}px ${theme.fontFamily}`;
        r.text(name, area.x + area.width / 2, y + labelOffset, theme.mutedColor, nameFont, 'center', 'top');
    }
}

/** Draw y-axis with labels and grid lines. Supports left or right positioning. */
export function drawYAxis(
    r: CanvasRenderer,
    scale: Scale,
    area: ChartArea,
    theme: ChartTheme,
    name?: string,
    position: 'left' | 'right' = 'left',
    formatter?: AxisFormatter,
    drawGrid = true,
    color?: string,
): void {
    const ticks = scale.ticks(Math.max(2, Math.floor(area.height / 50)));
    const font = `${theme.fontSize}px ${theme.fontFamily}`;
    const fmt = formatter || scale.format.bind(scale);
    const axisColor = color || theme.mutedColor;

    const axisX = position === 'left' ? area.x : area.x + area.width;

    // Axis line
    r.line(axisX, area.y, axisX, area.y + area.height, theme.gridColor, 1);

    let labelW = 0;
    for (const tick of ticks) {
        const y = scale.map(tick);
        if (y < area.y - 1 || y > area.y + area.height + 1) continue;
        labelW = Math.max(labelW, r.measureText(fmt(tick), font));

        // Grid lines only from left axis (avoid double grid)
        if (drawGrid) {
            r.line(area.x, y, area.x + area.width, y, theme.gridColor, 0.5, [3, 3]);
        }

        const label = fmt(tick);
        if (position === 'left') {
            r.text(label, axisX - 8, y, axisColor, font, 'right', 'middle');
        } else {
            r.text(label, axisX + 8, y, axisColor, font, 'left', 'middle');
        }
    }

    if (name) {
        const nameFont = `${theme.fontSize - 1}px ${theme.fontFamily}`;
        // Beyond the widest tick label, in the band the layout reserves for it. A fixed distance
        // from the axis would sit on top of any wider label ("$60.0K").
        const offset = 8 + labelW + 4 + (theme.fontSize - 1) / 2;
        if (position === 'left') {
            const cx = axisX - offset;
            const cy = area.y + area.height / 2;
            r.ctx.save();
            r.ctx.translate(cx, cy);
            r.ctx.rotate(-Math.PI / 2);
            r.text(name, 0, 0, axisColor, nameFont, 'center', 'middle');
            r.ctx.restore();
        } else {
            const cx = axisX + offset;
            const cy = area.y + area.height / 2;
            r.ctx.save();
            r.ctx.translate(cx, cy);
            r.ctx.rotate(Math.PI / 2);
            r.text(name, 0, 0, axisColor, nameFont, 'center', 'middle');
            r.ctx.restore();
        }
    }
}

// ─── Label thinning ────────────────────────────────

/**
 * Draw every n-th label, n being the smallest that keeps drawn labels apart. Unrotated, a label
 * needs its width plus a gap; rotated by θ, parallel one-line labels clear each other when their
 * anchors are lineHeight / sin θ apart. Drawn all, 90 dates in 800 px overlap into one band.
 * Under zoom the scale holds only the visible range, so this is recomputed over it.
 */
function labelStride(
    r: CanvasRenderer, ticks: unknown[], fmt: (v: unknown) => string, font: string,
    width: number, rotation: number, fontSize: number,
): number {
    if (ticks.length <= 1) return 1;
    const spacing = width / ticks.length;
    const footprint = rotation > 0
        ? fontSize / Math.sin(rotation)
        : ticks.reduce<number>((m, t) => Math.max(m, r.measureText(fmt(t), font)), 0) + 8;
    return Math.max(1, Math.ceil(footprint / spacing));
}

// ─── Label rotation detection ──────────────────────

/** Determine if labels need rotation. Returns angle in radians (0 = horizontal). */
function detectLabelRotation(
    r: CanvasRenderer,
    ticks: unknown[],
    fmt: (v: unknown) => string,
    font: string,
    availableWidth: number,
): number {
    if (ticks.length <= 1) return 0;

    // Measure total label width with minimum spacing
    const minGap = 8;
    let totalNeeded = 0;
    for (const t of ticks) {
        totalNeeded += r.measureText(fmt(t), font) + minGap;
    }

    if (totalNeeded <= availableWidth) return 0;

    // Labels too wide — try 45° first
    const cos45 = Math.cos(Math.PI / 4);
    let totalAt45 = 0;
    for (const t of ticks) {
        totalAt45 += r.measureText(fmt(t), font) * cos45 + minGap;
    }
    if (totalAt45 <= availableWidth) return Math.PI / 4;

    // Still too wide — go 60°
    return Math.PI / 3;
}
