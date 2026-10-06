// Pie / Doughnut series renderer.

import type { ChartArea, DataPoint, ChartTheme } from '../core/types';
import type { CanvasRenderer } from '../core/renderer';
import { chartNumbers, type ChartNumbers } from '../core/numbers';

export interface PieSlice {
    label: string;
    value: number;
    color: string;
    startAngle: number;
    endAngle: number;
    /** Original data point. */
    point: DataPoint;
}

/**
 * Compute pie slices from data. `hidden` are the categories the legend has switched off: they leave
 * the circle, and the others share it. A slice's colour is its category's, by its place in the DATA —
 * hiding one must not repaint the rest, or the legend's swatches stop matching.
 */
export function computeSlices(
    data: DataPoint[],
    palette: string[],
    hidden: ReadonlySet<string> = new Set(),
): PieSlice[] {
    const shown = data
        .map((p, i) => ({ p, color: palette[i % palette.length] }))
        .filter(({ p }) => !hidden.has(String(p.x ?? '')));
    const total = shown.reduce((s, { p }) => s + Math.abs(p.y), 0) || 1;
    let angle = -Math.PI / 2; // start at top
    return shown.map(({ p, color }) => {
        const span = (Math.abs(p.y) / total) * Math.PI * 2;
        const slice: PieSlice = {
            label: String(p.x ?? ''),
            value: p.y,
            color,
            startAngle: angle,
            endAngle: angle + span,
            point: p,
        };
        angle += span;
        return slice;
    });
}

/** Draw pie/doughnut chart. */
export function drawPie(
    r: CanvasRenderer,
    slices: PieSlice[],
    area: ChartArea,
    theme: ChartTheme,
    doughnut = false,
    animProgress = 1,
    nf: ChartNumbers = chartNumbers(),
): void {
    const cx = area.x + area.width / 2;
    const cy = area.y + area.height / 2;
    const radius = Math.min(area.width, area.height) / 2 * 0.85;
    const innerRadius = doughnut ? radius * 0.55 : 0;

    const c = r.ctx;
    const font = `${theme.fontSize}px ${theme.fontFamily}`;

    // Gap between slices (angular padding in radians, proportional to radius)
    const gapAngle = slices.length > 1 ? 1.5 / radius : 0;

    for (const slice of slices) {
        const rawStart = slice.startAngle;
        const rawEnd = rawStart + (slice.endAngle - rawStart) * animProgress;
        // Inset each slice by half the gap on both sides
        const start = rawStart + gapAngle / 2;
        const end = rawEnd - gapAngle / 2;
        if (end <= start) continue;

        c.beginPath();
        if (innerRadius > 0) {
            // Doughnut: arc outer → arc inner (reversed)
            c.arc(cx, cy, radius, start, end);
            c.arc(cx, cy, innerRadius, end, start, true);
            c.closePath();
        } else {
            // Pie: arc outer → lineTo center
            c.moveTo(cx, cy);
            c.arc(cx, cy, radius, start, end);
            c.closePath();
        }
        c.fillStyle = slice.color;
        c.fill();
    }

    // Labels
    if (animProgress > 0.9) {
        for (const slice of slices) {
            const start = slice.startAngle;
            const end = start + (slice.endAngle - start) * animProgress;
            const midAngle = (start + end) / 2;
            const fraction = (slice.endAngle - slice.startAngle) / (Math.PI * 2);
            if (fraction > 0.04) {
                const labelR = doughnut ? (radius + innerRadius) / 2 : radius * 0.65;
                const lx = cx + Math.cos(midAngle) * labelR;
                const ly = cy + Math.sin(midAngle) * labelR;
                const pct = nf.percent(fraction);
                r.text(pct, lx, ly, theme.bgColor, `bold ${font}`, 'center', 'middle');
            }
        }
    }
}
