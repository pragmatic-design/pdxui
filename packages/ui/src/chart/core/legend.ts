// Legend — interactive series toggle. Horizontal or vertical, any position.

import type { ChartTheme } from './types';
import type { CanvasRenderer } from './renderer';

export type LegendPosition = 'top' | 'bottom' | 'left' | 'right';

export interface LegendItem {
    name: string;
    color: string;
    visible: boolean;
    /** Icon shape hint: 'circle' (default), 'rect' (bar), 'line' */
    icon?: 'circle' | 'rect' | 'line';
}

export type LegendHit = { name: string; rect: { x: number; y: number; w: number; h: number } };

/** Measure how much space the legend needs (width for left/right, height for top/bottom). */
export function measureLegend(
    r: CanvasRenderer,
    items: LegendItem[],
    position: LegendPosition,
    theme: ChartTheme,
): number {
    const font = `${theme.fontSize}px ${theme.fontFamily}`;
    const iconW = 14;

    if (position === 'left' || position === 'right') {
        // Vertical: need max item width + padding
        let maxW = 0;
        for (const item of items) {
            const w = iconW + 6 + r.measureText(item.name, font);
            if (w > maxW) maxW = w;
        }
        return maxW + 24;
    }
    // Horizontal: fixed height row
    return theme.fontSize + 16;
}

/** Draw legend. Returns hit-test rects for click interaction. */
export function drawLegend(
    r: CanvasRenderer,
    items: LegendItem[],
    x: number,
    y: number,
    maxWidth: number,
    theme: ChartTheme,
    position: LegendPosition = 'top',
    maxHeight?: number,
): LegendHit[] {
    if (position === 'left' || position === 'right') {
        return drawVerticalLegend(r, items, x, y, theme, maxHeight ?? 400);
    }
    return drawHorizontalLegend(r, items, x, y, maxWidth, theme);
}

// ─── Horizontal (top / bottom) ─────────────────────

function drawHorizontalLegend(
    r: CanvasRenderer,
    items: LegendItem[],
    x: number,
    y: number,
    maxWidth: number,
    theme: ChartTheme,
): LegendHit[] {
    const font = `${theme.fontSize}px ${theme.fontFamily}`;
    const iconW = 12;
    const gap = 20;
    const hits: LegendHit[] = [];

    let totalWidth = 0;
    for (const item of items) {
        totalWidth += iconW + 6 + r.measureText(item.name, font) + gap;
    }
    totalWidth -= gap;

    let cx = x + Math.max(0, (maxWidth - totalWidth) / 2);

    for (const item of items) {
        const labelW = r.measureText(item.name, font);
        const itemW = iconW + 6 + labelW;
        const iconColor = item.visible ? item.color : theme.gridColor;
        const textColor = item.visible ? theme.textColor : theme.mutedColor;

        drawIcon(r, item.icon ?? 'circle', cx + iconW / 2, y, iconW, iconColor);
        r.text(item.name, cx + iconW + 6, y, textColor, font, 'left', 'middle');

        hits.push({ name: item.name, rect: { x: cx - 4, y: y - iconW, w: itemW + 8, h: iconW * 2 } });
        cx += itemW + gap;
    }
    return hits;
}

// ─── Vertical (left / right) ───────────────────────

function drawVerticalLegend(
    r: CanvasRenderer,
    items: LegendItem[],
    x: number,
    y: number,
    theme: ChartTheme,
    maxHeight: number,
): LegendHit[] {
    const font = `${theme.fontSize}px ${theme.fontFamily}`;
    const iconW = 12;
    const lineH = theme.fontSize + 10;
    const hits: LegendHit[] = [];

    let cy = y;
    for (const item of items) {
        if (cy + lineH > y + maxHeight) break; // overflow guard
        const labelW = r.measureText(item.name, font);
        const iconColor = item.visible ? item.color : theme.gridColor;
        const textColor = item.visible ? theme.textColor : theme.mutedColor;

        drawIcon(r, item.icon ?? 'circle', x + iconW / 2, cy + lineH / 2, iconW, iconColor);
        r.text(item.name, x + iconW + 6, cy + lineH / 2, textColor, font, 'left', 'middle');

        hits.push({ name: item.name, rect: { x: x - 4, y: cy, w: iconW + 6 + labelW + 8, h: lineH } });
        cy += lineH;
    }
    return hits;
}

// ─── Icon shapes ───────────────────────────────────

function drawIcon(r: CanvasRenderer, icon: string, cx: number, cy: number, size: number, color: string): void {
    const half = size / 2;
    switch (icon) {
        case 'rect':
            r.rect(cx - half, cy - half * 0.6, size, half * 1.2, color, 2);
            break;
        case 'line':
            r.line(cx - half, cy, cx + half, cy, color, 2);
            r.circle(cx, cy, 3, color);
            break;
        default: // circle
            r.circle(cx, cy, half, color);
    }
}
