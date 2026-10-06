// Chart layout — computes the drawing area (plot region) from container size.
// Reserves space for axes, title, legend (any position), and dual Y-axis.

import type { ChartArea, ChartPadding, ChartTheme } from './types';
import type { Scale } from './scales';
import type { CanvasRenderer } from './renderer';
import type { LegendPosition, LegendItem } from './legend';
import type { AxisFormatter } from './axis';
import { measureLegend } from './legend';

export interface LayoutConfig {
    title?: string;
    showLegend?: boolean;
    legendPosition?: LegendPosition;
    legendItems?: LegendItem[];
    yAxisName?: string;
    xAxisName?: string;
    hasRightAxis?: boolean;
    rightAxisName?: string;
    /** Pre-measured x-axis height (includes rotated labels). */
    xAxisHeight?: number;
    /** Formatter used to DRAW left-axis ticks — must match for correct width reservation. */
    leftAxisFormatter?: AxisFormatter;
    /** Formatter used to DRAW right-axis ticks — must match for correct width reservation. */
    rightAxisFormatter?: AxisFormatter;
    /**
     * Category labels drawn on the left instead of Y ticks (the heatmap's rows): the widest is
     * reserved. With the width of numeric ticks, "Mon" would be clipped to "n".
     */
    leftLabels?: string[];
}

const BASE_PADDING: ChartPadding = { top: 12, right: 16, bottom: 8, left: 8 };

/**
 * Where the legend is drawn, for its position. A bottom legend goes below the X axis's measured
 * height — rotated labels included. A fixed fontSize + 20 under the plot would sit on top of rotated
 * labels, although the layout reserves their height.
 */
export function legendOrigin(
    pos: LegendPosition, area: ChartArea, theme: ChartTheme, hasTitle: boolean, xAxisHeight?: number,
): { x: number; y: number } {
    const titleH = hasTitle ? theme.fontSize + 12 : 0;
    switch (pos) {
        case 'top': return { x: area.x, y: titleH + theme.fontSize / 2 + 4 };
        case 'bottom': return { x: area.x, y: area.y + area.height + Math.max(theme.fontSize + 20, (xAxisHeight ?? 0) + 8) };
        case 'left': return { x: 8, y: area.y };
        case 'right': return { x: area.x + area.width + 16, y: area.y };
    }
}

/** Compute the plot area given container size and layout requirements. */
export function computeLayout(
    width: number,
    height: number,
    yScale: Scale | null,
    theme: ChartTheme,
    config: LayoutConfig,
    renderer: CanvasRenderer,
    rightYScale?: Scale | null,
): ChartArea {
    const pad = { ...BASE_PADDING };
    const font = `${theme.fontSize}px ${theme.fontFamily}`;
    const legendPos = config.legendPosition ?? 'top';

    // Title
    if (config.title) pad.top += theme.fontSize + 12;

    // Legend
    if (config.showLegend && config.legendItems?.length) {
        const legendSize = measureLegend(renderer, config.legendItems, legendPos, theme);
        switch (legendPos) {
            case 'top': pad.top += legendSize; break;
            case 'bottom': pad.bottom += legendSize; break;
            case 'left': pad.left += legendSize; break;
            case 'right': pad.right += legendSize; break;
        }
    }

    // Y-axis labels (left — measure max label width with the SAME formatter used to draw)
    if (yScale) {
        const ticks = yScale.ticks(6);
        const fmt = config.leftAxisFormatter ?? ((t: unknown) => yScale.format(t as number));
        let maxW = 0;
        for (const t of ticks) {
            const w = renderer.measureText(fmt(t), font);
            if (w > maxW) maxW = w;
        }
        pad.left += maxW + 8;
        if (config.yAxisName) pad.left += theme.fontSize + 4;
    }

    // Category labels on the left (the heatmap's rows), in the font they are drawn with
    if (config.leftLabels?.length) {
        const labelFont = `${theme.fontSize - 1}px ${theme.fontFamily}`;
        let maxW = 0;
        for (const label of config.leftLabels) maxW = Math.max(maxW, renderer.measureText(label, labelFont));
        pad.left += maxW + 8;
    }

    // Y-axis labels (right — dual axis; same formatter used to draw)
    if (config.hasRightAxis && rightYScale) {
        const ticks = rightYScale.ticks(6);
        const fmt = config.rightAxisFormatter ?? ((t: unknown) => rightYScale.format(t as number));
        let maxW = 0;
        for (const t of ticks) {
            const w = renderer.measureText(fmt(t), font);
            if (w > maxW) maxW = w;
        }
        pad.right += maxW + 8;
        if (config.rightAxisName) pad.right += theme.fontSize + 4;
    }

    // X-axis labels (xAxisHeight pre-measured by engine for rotation)
    pad.bottom += config.xAxisHeight ?? (theme.fontSize + 8);
    if (config.xAxisName && !config.xAxisHeight) pad.bottom += theme.fontSize + 4;

    return {
        x: pad.left,
        y: pad.top,
        width: Math.max(1, width - pad.left - pad.right),
        height: Math.max(1, height - pad.top - pad.bottom),
    };
}
