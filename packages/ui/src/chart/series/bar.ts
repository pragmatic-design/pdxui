// Bar series renderer — vertical bars, grouped, stacked.

import type { ChartArea, Series } from '../core/types';
import type { Scale } from '../core/scales';
import type { CanvasRenderer } from '../core/renderer';

/**
 * Where a grouped bar sits, given the centre of its category.
 *
 * Exported because the hover marker has to land on the SAME x. Computing its own — the category
 * centre, `xScale.map(p.x)` — would stack both dots of a two-series chart over the gap between the
 * bars instead of on them. One function, one answer.
 */
export function barSlot(
    cx: number,
    seriesIndex: number,
    totalSeries: number,
    area: ChartArea,
    catCount: number,
    stacked: boolean,
): { left: number; width: number; centre: number } {
    const catWidth = area.width / catCount;
    const groupWidth = catWidth * 0.7;
    const width = stacked ? groupWidth : groupWidth / totalSeries;
    const left = stacked ? cx - groupWidth / 2 : cx - groupWidth / 2 + seriesIndex * width;
    return { left, width, centre: left + width / 2 };
}

/** Draw bar series. Supports grouped bars (multiple series side by side). */
export function drawBars(
    r: CanvasRenderer,
    allSeries: Series[],
    seriesIndex: number,
    totalSeries: number,
    xScale: Scale,
    yScale: Scale,
    area: ChartArea,
    stacked: boolean,
    animProgress = 1,
): void {
    const series = allSeries[seriesIndex];
    if (!series.data.length) return;

    r.ctx.save();
    r.ctx.beginPath();
    r.ctx.rect(area.x - 1, area.y - 1, area.width + 2, area.height + 2);
    r.ctx.clip();

    const baseY = yScale.map(0);
    const catCount = series.data.length;
    const barWidth = barSlot(0, seriesIndex, totalSeries, area, catCount, stacked).width;
    const radius = Math.min(3, barWidth / 4);

    for (let i = 0; i < series.data.length; i++) {
        const p = series.data[i];
        const cx = xScale.map(p.x);
        let yTop: number;
        let yBottom: number;

        if (stacked) {
            // Stack: compute offset from previous series
            let stackBase = 0;
            for (let s = 0; s < seriesIndex; s++) {
                stackBase += allSeries[s].data[i]?.y ?? 0;
            }
            yBottom = yScale.map(stackBase);
            yTop = yScale.map(stackBase + p.y);
        } else {
            yBottom = baseY;
            yTop = yScale.map(p.y);
        }

        // Animate from baseline
        yTop = yBottom + (yTop - yBottom) * animProgress;

        const slot = barSlot(cx, seriesIndex, totalSeries, area, catCount, stacked);
        const x = slot.left;
        const w = stacked ? slot.width : slot.width - 1;
        const h = yBottom - yTop;

        if (Math.abs(h) > 0.5) {
            r.rect(x, Math.min(yTop, yBottom), w, Math.abs(h), series.color, radius);
        }
    }

    r.ctx.restore();
}
