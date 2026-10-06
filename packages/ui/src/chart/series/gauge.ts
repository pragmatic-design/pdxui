// Gauge series renderer — circular meter for KPI dashboards.
// Supports progress arc, tick marks, and value label.

import type { ChartArea, ChartTheme } from '../core/types';
import type { CanvasRenderer } from '../core/renderer';
import { chartNumbers, type ChartNumbers } from '../core/numbers';

export interface GaugeConfig {
    value: number;
    min: number;
    max: number;
    label?: string;
    format?: string;
    /** Arc start/end in degrees (default: 225 → -45, i.e. 270° sweep). */
    startAngle?: number;
    endAngle?: number;
    /** Show tick marks on the arc. */
    ticks?: boolean;
    /** Color thresholds: [value, color][] — sorted ascending. */
    thresholds?: [number, string][];
}

/** Draw a gauge chart. */
export function drawGauge(
    r: CanvasRenderer,
    config: GaugeConfig,
    area: ChartArea,
    theme: ChartTheme,
    defaultColor: string,
    animProgress = 1,
    nf: ChartNumbers = chartNumbers(),
): void {
    const cx = area.x + area.width / 2;
    const cy = area.y + area.height * 0.58; // shift down slightly
    const radius = Math.min(area.width, area.height) * 0.42;
    const c = r.ctx;

    // Angles (degrees → radians). Default: 225° to -45° (270° arc, open at bottom)
    const startDeg = config.startAngle ?? 225;
    const endDeg = config.endAngle ?? -45;
    const startRad = (startDeg * Math.PI) / 180;
    const endRad = (endDeg * Math.PI) / 180;
    const totalSweep = startRad - endRad; // positive for clockwise sweep

    const { min, max, value } = config;
    const fraction = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
    const animFraction = fraction * animProgress;

    // Determine color based on thresholds
    let arcColor = defaultColor;
    if (config.thresholds) {
        for (const [threshold, color] of config.thresholds) {
            if (value >= threshold) arcColor = color;
        }
    }

    const trackWidth = radius * 0.15;
    const arcWidth = radius * 0.15;

    // Background track
    c.beginPath();
    c.arc(cx, cy, radius, -startRad, -endRad);
    c.strokeStyle = theme.gridColor;
    c.lineWidth = trackWidth;
    c.lineCap = 'round';
    c.stroke();

    // Value arc
    if (animFraction > 0.001) {
        const valueAngle = -startRad + totalSweep * animFraction * -1;
        c.beginPath();
        c.arc(cx, cy, radius, -startRad, valueAngle, totalSweep < 0);
        c.strokeStyle = arcColor;
        c.lineWidth = arcWidth;
        c.lineCap = 'round';
        c.stroke();
    }

    // Tick marks
    if (config.ticks !== false) {
        const tickCount = 10;
        for (let i = 0; i <= tickCount; i++) {
            const t = i / tickCount;
            const angle = -startRad + t * (endRad - startRad) * -1;
            const isMajor = i % 5 === 0;
            const innerR = radius - trackWidth / 2 - (isMajor ? 10 : 6);
            const outerR = radius - trackWidth / 2 - 2;
            c.beginPath();
            c.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
            c.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
            c.strokeStyle = theme.mutedColor;
            c.lineWidth = isMajor ? 1.5 : 0.8;
            c.lineCap = 'butt';
            c.stroke();
        }
    }

    // Value text (center)
    const displayValue = animProgress >= 1 ? value : min + (value - min) * animProgress;
    const formatted = config.format
        ? config.format.replace('{value}', nf.number(Math.round(displayValue)))
        : nf.number(Math.round(displayValue));
    const valueFont = `700 ${radius * 0.35}px ${theme.fontFamily}`;
    r.text(formatted, cx, cy - radius * 0.05, theme.textColor, valueFont, 'center', 'middle');

    // Label text (below value)
    if (config.label) {
        const labelFont = `${theme.fontSize}px ${theme.fontFamily}`;
        r.text(config.label, cx, cy + radius * 0.25, theme.mutedColor, labelFont, 'center', 'middle');
    }

    // Min/max labels
    const minMaxFont = `${theme.fontSize - 1}px ${theme.fontFamily}`;
    const minAngle = -startRad;
    const maxAngle = -endRad;
    const labelR = radius + trackWidth / 2 + 12;
    r.text(nf.number(min), cx + Math.cos(minAngle) * labelR, cy + Math.sin(minAngle) * labelR, theme.mutedColor, minMaxFont, 'center', 'middle');
    r.text(nf.number(max), cx + Math.cos(maxAngle) * labelR, cy + Math.sin(maxAngle) * labelR, theme.mutedColor, minMaxFont, 'center', 'middle');
}
