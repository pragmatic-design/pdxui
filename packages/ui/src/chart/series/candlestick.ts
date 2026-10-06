// Candlestick series renderer — OHLC financial chart.
// Each data point has open, high, low, close values.

import type { ChartArea, ChartTheme } from '../core/types';
import type { Scale } from '../core/scales';
import type { CanvasRenderer } from '../core/renderer';

export interface CandlePoint {
    x: unknown;
    open: number;
    high: number;
    low: number;
    close: number;
    index: number;
}

/** Parse candlestick data from raw records. */
export function parseCandleData(
    data: Record<string, unknown>[],
    xField: string,
    openField = 'open',
    highField = 'high',
    lowField = 'low',
    closeField = 'close',
): CandlePoint[] {
    return data.map((row, i) => ({
        x: row[xField],
        open: Number(row[openField]) || 0,
        high: Number(row[highField]) || 0,
        low: Number(row[lowField]) || 0,
        close: Number(row[closeField]) || 0,
        index: i,
    }));
}

/** Draw candlestick chart. */
export function drawCandlesticks(
    r: CanvasRenderer,
    candles: CandlePoint[],
    xScale: Scale,
    yScale: Scale,
    area: ChartArea,
    theme: ChartTheme,
    animProgress = 1,
): void {
    if (!candles.length) return;

    const c = r.ctx;
    c.save();
    c.beginPath();
    c.rect(area.x - 1, area.y - 1, area.width + 2, area.height + 2);
    c.clip();

    const catWidth = area.width / candles.length;
    const bodyWidth = catWidth * 0.6;
    const bullColor = theme.palette[2] || '#22c55e'; // green/success
    const bearColor = theme.palette[3] || '#ef4444'; // red/danger

    for (const candle of candles) {
        const cx = xScale.map(candle.x);
        const isBull = candle.close >= candle.open;
        const color = isBull ? bullColor : bearColor;

        // Animated: grow from midpoint
        const mid = (candle.open + candle.close) / 2;
        const animOpen = mid + (candle.open - mid) * animProgress;
        const animClose = mid + (candle.close - mid) * animProgress;
        const animHigh = mid + (candle.high - mid) * animProgress;
        const animLow = mid + (candle.low - mid) * animProgress;

        const yOpen = yScale.map(animOpen);
        const yClose = yScale.map(animClose);
        const yHigh = yScale.map(animHigh);
        const yLow = yScale.map(animLow);

        // Wick (high-low line)
        c.beginPath();
        c.moveTo(cx, yHigh);
        c.lineTo(cx, yLow);
        c.strokeStyle = color;
        c.lineWidth = 1;
        c.stroke();

        // Body (open-close rectangle)
        const bodyTop = Math.min(yOpen, yClose);
        const bodyH = Math.max(1, Math.abs(yOpen - yClose));
        c.fillStyle = isBull ? color : color;
        c.fillRect(cx - bodyWidth / 2, bodyTop, bodyWidth, bodyH);

        // Hollow body for bullish candles (optional style)
        if (isBull && bodyH > 2) {
            c.strokeStyle = color;
            c.lineWidth = 1.5;
            c.strokeRect(cx - bodyWidth / 2, bodyTop, bodyWidth, bodyH);
        }
    }

    c.restore();
}

/** Get the y-domain [min, max] from candle data. */
export function candleDomain(candles: CandlePoint[]): [number, number] {
    let min = Infinity, max = -Infinity;
    for (const c of candles) {
        if (c.low < min) min = c.low;
        if (c.high > max) max = c.high;
    }
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.05;
    return [min - pad, max + pad];
}
