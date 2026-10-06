// Line series renderer — line, smooth, area, markers.

import type { ChartArea, Series, DataPoint } from '../core/types';
import type { Scale } from '../core/scales';
import type { CanvasRenderer } from '../core/renderer';

export interface LinePx { x: number; y: number; point: DataPoint }

/** Map data points to pixel positions. */
export function mapPoints(series: Series, xScale: Scale, yScale: Scale): LinePx[] {
    return series.data.map(p => ({
        x: xScale.map(p.x),
        y: yScale.map(p.y),
        point: p,
    }));
}

/** Draw a line series (with optional area fill and markers). */
export function drawLine(
    r: CanvasRenderer,
    series: Series,
    pixels: LinePx[],
    area: ChartArea,
    _animProgress = 1,
): void {
    if (pixels.length < 2) return;

    // Clip to chart area
    r.ctx.save();
    r.ctx.beginPath();
    r.ctx.rect(area.x - 1, area.y - 1, area.width + 2, area.height + 2);
    r.ctx.clip();

    // Animated y positions (grow from baseline)
    const baseY = area.y + area.height;
    const pts = pixels.map(p => ({
        x: p.x,
        y: baseY + (p.y - baseY) * _animProgress,
    }));

    // Area fill
    if (series.area) {
        r.fillArea(pts, baseY, series.color, 0.12, !!series.smooth);
    }

    // Line
    if (series.smooth) {
        r.smoothLine(pts, series.color, 2);
    } else {
        r.polyline(pts, series.color, 2, series.dash);
    }

    // Markers
    if (series.markers !== false && pixels.length <= 50) {
        for (const p of pts) {
            r.circle(p.x, p.y, 3.5, '#fff', series.color);
        }
    }

    r.ctx.restore();
}
