// Radar series renderer — multi-dimensional polygon comparison.

import type { ChartArea, Series, ChartTheme } from '../core/types';
import type { CanvasRenderer } from '../core/renderer';

/** Draw radar chart background grid + axis labels. */
export function drawRadarGrid(
    r: CanvasRenderer,
    labels: string[],
    area: ChartArea,
    theme: ChartTheme,
    levels = 5,
): void {
    const cx = area.x + area.width / 2;
    const cy = area.y + area.height / 2;
    const radius = Math.min(area.width, area.height) / 2 * 0.75;
    const n = labels.length;
    if (n < 3) return;
    const c = r.ctx;
    const angleStep = (Math.PI * 2) / n;

    // Concentric polygon rings
    for (let level = 1; level <= levels; level++) {
        const lr = (radius / levels) * level;
        c.beginPath();
        for (let i = 0; i <= n; i++) {
            const angle = -Math.PI / 2 + i * angleStep;
            const x = cx + Math.cos(angle) * lr;
            const y = cy + Math.sin(angle) * lr;
            if (i === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
        }
        c.closePath();
        c.strokeStyle = theme.gridColor;
        c.lineWidth = level === levels ? 1 : 0.5;
        c.stroke();
    }

    // Axis spokes + labels
    const labelFont = `${theme.fontSize}px ${theme.fontFamily}`;
    for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + i * angleStep;
        const outerX = cx + Math.cos(angle) * radius;
        const outerY = cy + Math.sin(angle) * radius;

        // Spoke line
        r.line(cx, cy, outerX, outerY, theme.gridColor, 0.5);

        // Label (pushed slightly outside)
        const labelR = radius + 14;
        const lx = cx + Math.cos(angle) * labelR;
        const ly = cy + Math.sin(angle) * labelR;
        const align: CanvasTextAlign = Math.abs(Math.cos(angle)) < 0.1 ? 'center' :
            Math.cos(angle) > 0 ? 'left' : 'right';
        r.text(labels[i], lx, ly, theme.mutedColor, labelFont, align, 'middle');
    }
}

/** Draw one radar series polygon. Values are 0-1 normalized. */
export function drawRadarSeries(
    r: CanvasRenderer,
    series: Series,
    area: ChartArea,
    animProgress = 1,
): void {
    const cx = area.x + area.width / 2;
    const cy = area.y + area.height / 2;
    const radius = Math.min(area.width, area.height) / 2 * 0.75;
    const n = series.data.length;
    if (n < 3) return;

    const c = r.ctx;
    const angleStep = (Math.PI * 2) / n;
    const pts: { x: number; y: number }[] = [];

    for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + i * angleStep;
        const val = series.data[i].y * animProgress;
        const pr = radius * Math.max(0, Math.min(1, val));
        pts.push({
            x: cx + Math.cos(angle) * pr,
            y: cy + Math.sin(angle) * pr,
        });
    }

    // Fill
    c.beginPath();
    for (let i = 0; i < pts.length; i++) {
        if (i === 0) c.moveTo(pts[i].x, pts[i].y);
        else c.lineTo(pts[i].x, pts[i].y);
    }
    c.closePath();
    c.fillStyle = series.color;
    c.globalAlpha = 0.15;
    c.fill();
    c.globalAlpha = 1;

    // Stroke
    c.beginPath();
    for (let i = 0; i < pts.length; i++) {
        if (i === 0) c.moveTo(pts[i].x, pts[i].y);
        else c.lineTo(pts[i].x, pts[i].y);
    }
    c.closePath();
    c.strokeStyle = series.color;
    c.lineWidth = 2;
    c.stroke();

    // Dots
    for (const p of pts) {
        r.circle(p.x, p.y, 3.5, '#fff', series.color);
    }
}
