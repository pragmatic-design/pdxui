// Funnel series renderer — conversion/pipeline visualization.
// Trapezoids stacked vertically, widest at top (descending) or bottom (ascending).

import type { ChartArea, DataPoint, ChartTheme } from '../core/types';
import type { CanvasRenderer } from '../core/renderer';
import { chartNumbers, type ChartNumbers } from '../core/numbers';
import { mostReadableOn } from '../core/color';

/** Draw funnel chart. */
export function drawFunnel(
    r: CanvasRenderer,
    data: DataPoint[],
    area: ChartArea,
    theme: ChartTheme,
    palette: string[],
    ascending = false,
    animProgress = 1,
    nf: ChartNumbers = chartNumbers(),
): void {
    if (!data.length) return;

    const sorted = ascending ? [...data].reverse() : [...data];
    const maxVal = Math.max(...sorted.map(d => Math.abs(d.y)), 1);
    const count = sorted.length;
    const gap = 3;
    const totalGap = gap * (count - 1);
    const sliceH = (area.height - totalGap) / count;
    const maxWidth = area.width * 0.85;
    const cx = area.x + area.width / 2;
    const c = r.ctx;
    const font = `${theme.fontSize}px ${theme.fontFamily}`;
    const boldFont = `600 ${theme.fontSize}px ${theme.fontFamily}`;

    for (let i = 0; i < count; i++) {
        const d = sorted[i];
        const nextD = sorted[i + 1];
        const topW = (Math.abs(d.y) / maxVal) * maxWidth * animProgress;
        const botW = nextD
            ? (Math.abs(nextD.y) / maxVal) * maxWidth * animProgress
            : topW * 0.3 * animProgress; // last slice tapers

        const y = area.y + i * (sliceH + gap);
        const color = palette[i % palette.length];

        // Trapezoid
        c.beginPath();
        c.moveTo(cx - topW / 2, y);
        c.lineTo(cx + topW / 2, y);
        c.lineTo(cx + botW / 2, y + sliceH);
        c.lineTo(cx - botW / 2, y + sliceH);
        c.closePath();
        c.fillStyle = color;
        c.fill();

        // Separator
        if (i > 0) {
            c.strokeStyle = theme.bgColor;
            c.lineWidth = gap;
            c.beginPath();
            c.moveTo(cx - topW / 2 - gap, y);
            c.lineTo(cx + topW / 2 + gap, y);
            c.stroke();
        }

        // Label (inside the trapezoid)
        if (animProgress > 0.8) {
            const labelY = y + sliceH / 2;
            const label = String(d.x ?? '');
            const text = `${nf.number(d.y)} (${nf.percent(sorted[0].y ? d.y / sorted[0].y : 0)})`;
            const halfW = Math.max(topW, botW) / 2;

            // Label on the left side
            const labelX = cx - halfW - 8;
            if (labelX > area.x) {
                r.text(label, labelX, labelY, theme.textColor, font, 'right', 'middle');
            }

            // Value + percentage: centred on the slice, in whichever text colour reads best on its
            // fill, when it fits and that colour reaches 4.5:1; otherwise right of the slice, on the
            // surface. In the background colour it would not read (dark on blue in the dark scheme,
            // white on yellow in the light one), and dropped when it does not fit, a narrow slice
            // would show none.
            const avgW = (topW + botW) / 2;
            const ink = mostReadableOn(color, ['#ffffff', theme.textColor, theme.bgColor]);
            if (ink && ink.ratio >= 4.5 && r.measureText(text, boldFont) + 16 <= avgW) {
                r.text(text, cx, labelY, ink.color, boldFont, 'center', 'middle');
            } else {
                r.text(text, cx + halfW + 8, labelY, theme.textColor, boldFont, 'left', 'middle');
            }
        }
    }
}
