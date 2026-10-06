// Chart engine — orchestrates rendering, layout, interaction, animation.
// Supports dual Y-axis, mixed chart types, legend positioning, axis formatters.

import type { ChartArea, ChartTheme, Series, DataPoint, TooltipInfo } from './types';
import type { Scale } from './scales';
import { linearScale, categoryScale, timeScale, numericDomain, seriesYDomain } from './scales';
import { CanvasRenderer } from './renderer';
import { resolveTheme } from './theme';
import { computeLayout, legendOrigin } from './layout';
import { drawXAxis, drawYAxis, measureXAxisHeight, resolveFormatter, type AxisFormatter } from './axis';
import { drawLegend, type LegendItem, type LegendHit, type LegendPosition } from './legend';
import { showTooltip, hideTooltip } from './tooltip';
import { drawLine, mapPoints, type LinePx } from '../series/line';
import { drawBars, barSlot } from '../series/bar';
import { drawPie, computeSlices, type PieSlice } from '../series/pie';
import { drawGauge, type GaugeConfig } from '../series/gauge';
import { drawRadarGrid, drawRadarSeries } from '../series/radar';
import { parseCandleData, drawCandlesticks, candleDomain, type CandlePoint } from '../series/candlestick';
import { parseHeatmapData, drawHeatmap, type HeatmapCell } from '../series/heatmap';
import { drawFunnel } from '../series/funnel';
import { createZoom, type ZoomController } from './zoom';
import { exportPng, toPngDataUrl, copyToClipboard } from './export';
import { chartNumbers, type ChartNumbers } from './numbers';

// ─── Config types ──────────────────────────────────

export interface SeriesConfig {
    field: string;
    name?: string;
    /** Override chart type for this series (mixed charts). */
    type?: 'line' | 'bar' | 'area';
    /** Assign to right Y-axis (index 1). */
    yAxisIndex?: number;
    smooth?: boolean;
    area?: boolean;
    dash?: number[];
    color?: string;
}

export interface ChartConfig {
    type: 'line' | 'bar' | 'area' | 'pie' | 'doughnut' | 'scatter' | 'gauge' | 'radar' | 'candlestick' | 'heatmap' | 'funnel';
    data: Record<string, unknown>[];
    xField?: string;
    yField?: string | string[];
    /** Advanced: per-series config (overrides yField). */
    series?: SeriesConfig[];
    seriesNames?: string[];
    title?: string;
    smooth?: boolean;
    stacked?: boolean;
    tooltip?: boolean;
    legend?: boolean;
    /** Legend position: top (default), bottom, left, right. */
    legendPosition?: LegendPosition;
    xAxisName?: string;
    yAxisName?: string;
    /** Right Y-axis name (dual axis). */
    yAxisRightName?: string;
    /** X-axis format: 'currency', 'percent', 'compact', or template '{value}%'. */
    xFormat?: string;
    /** Left Y-axis format. */
    yFormat?: string;
    /** Right Y-axis format. */
    yRightFormat?: string;
    /** Enable zoom: 'inside' (mouse wheel + drag). */
    zoom?: 'inside' | false;
    /** Gauge-specific config. */
    gauge?: Partial<GaugeConfig>;
    /** The locale numbers are printed in (BCP 47). Default: the runtime's. */
    locale?: string;
    /** ISO 4217 code for the 'currency' format. Default: 'USD'. */
    currency?: string;
}

// ─── Engine ────────────────────────────────────────

export class ChartEngine {
    private renderer: CanvasRenderer;
    private container: HTMLElement;
    private resizeObs: ResizeObserver;
    private theme!: ChartTheme;
    private config!: ChartConfig;
    private series: Series[] = [];
    private area!: ChartArea;
    private xScale!: Scale;
    private yScale!: Scale;
    private yScaleRight: Scale | null = null;
    /** The X axis's measured height (rotated labels included): a bottom legend goes below it. */
    private xAxisHeight: number | undefined;
    private xFormatter?: AxisFormatter;
    private yFormatter?: AxisFormatter;
    private yRightFormatter?: AxisFormatter;
    /** Every number the chart prints, in its locale and currency. */
    private numbers: ChartNumbers = chartNumbers();
    private pixelCache: Map<string, LinePx[]> = new Map();
    private pieSlices: PieSlice[] = [];
    private legendItems: LegendItem[] = [];
    private legendHits: LegendHit[] = [];
    /** Per-series: which Y-axis (0=left, 1=right). */
    private seriesAxisIndex: number[] = [];
    private candleData: CandlePoint[] = [];
    private heatmapData: { cells: HeatmapCell[]; xLabels: string[]; yLabels: string[]; min: number; max: number } | null = null;
    private zoom: ZoomController | null = null;
    private zoomCleanup: (() => void) | null = null;
    private themeObs: MutationObserver | null = null;

    // Animation
    private animProgress = 0;
    private animFrame = 0;

    constructor(container: HTMLElement) {
        this.container = container;
        this.renderer = new CanvasRenderer(container);
        this.resizeObs = new ResizeObserver(() => {
            if (this.renderer.resize()) this.draw(1);
        });
        this.resizeObs.observe(container);

        // Watch for theme/scheme changes on <html> to re-render with new colors
        this.themeObs = new MutationObserver(() => {
            if (!this.config) return;
            this.theme = resolveTheme(this.container);
            this.buildSeries(); // rebuild series colors from new theme
            this.draw(1);
        });
        this.themeObs.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['pdx-theme', 'pdx-scheme'],
        });

        this.renderer.canvas.addEventListener('mousemove', this.onMouseMove);
        this.renderer.canvas.addEventListener('mouseleave', this.onMouseLeave);
        this.renderer.canvas.addEventListener('click', this.onClick);
    }

    update(config: ChartConfig): void {
        this.config = config;
        this.theme = resolveTheme(this.container);
        this.numbers = chartNumbers(config.locale, config.currency);
        this.xFormatter = resolveFormatter(config.xFormat, this.numbers);
        this.yFormatter = resolveFormatter(config.yFormat, this.numbers);
        this.yRightFormatter = resolveFormatter(config.yRightFormat, this.numbers);
        this.buildSeries();
        this.renderer.resize();

        // Zoom setup
        if (config.zoom === 'inside' && !this.zoom) {
            this.zoom = createZoom();
            this.zoomCleanup = this.zoom.attach(this.renderer.canvas, () => this.draw(1));
        } else if (!config.zoom && this.zoom) {
            this.zoomCleanup?.();
            this.zoom = null;
            this.zoomCleanup = null;
        }

        // Re-animating the whole chart on every update (streaming/subscribe) would cause
        // continuous redraws and interrupt the hover: the animation runs only on the first
        // render, later updates draw the final state.
        if (!this._renderedOnce) {
            this._renderedOnce = true;
            this.animate();
        } else {
            this.draw(1);
        }
    }

    private _renderedOnce = false;

    // ─── Series building ───────────────────────────

    private buildSeries(): void {
        const { type, data, xField, series: seriesConfigs } = this.config;
        if (!data?.length && type !== 'gauge') { this.series = []; return; }

        const xKey = xField || Object.keys(data[0] ?? {})[0];
        const isPie = type === 'pie' || type === 'doughnut';
        this.seriesAxisIndex = [];

        // Non-numeric values (null/undefined/NaN/strings): they do NOT become false
        // zeros that distort the series. With stacked, the sum per
        // index needs alignment → fallback 0; otherwise the point is skipped.
        const stackedMode = !!this.config.stacked;
        const toPoints = (rows: Record<string, unknown>[], field: string): DataPoint[] => {
            const out: DataPoint[] = [];
            for (let idx = 0; idx < rows.length; idx++) {
                const raw = rows[idx][field];
                const n = raw == null || raw === '' ? NaN : Number(raw);
                if (Number.isNaN(n)) {
                    if (stackedMode) out.push({ x: rows[idx][xKey], y: 0, raw: rows[idx], index: idx });
                    continue;
                }
                out.push({ x: rows[idx][xKey], y: n, raw: rows[idx], index: idx });
            }
            return out;
        };

        // Advanced series config vs simple yField
        if (seriesConfigs?.length) {
            this.series = seriesConfigs.map((sc, i) => {
                const points: DataPoint[] = toPoints(data, sc.field);
                this.seriesAxisIndex.push(sc.yAxisIndex ?? 0);
                const seriesType = sc.type || (type === 'area' ? 'line' : type);
                return {
                    name: sc.name || sc.field,
                    data: points,
                    color: sc.color || this.theme.palette[i % this.theme.palette.length],
                    type: seriesType,
                    smooth: sc.smooth ?? this.config.smooth,
                    area: sc.area ?? (sc.type === 'area' || type === 'area'),
                    markers: points.length <= 30,
                    dash: sc.dash,
                } satisfies Series;
            });
        } else {
            const yKeys = Array.isArray(this.config.yField) ? this.config.yField :
                this.config.yField ? [this.config.yField] :
                Object.keys(data[0] ?? {}).filter(k => k !== xKey && typeof data[0][k] === 'number');
            const names = this.config.seriesNames || yKeys;

            this.series = yKeys.map((key, i) => {
                const points: DataPoint[] = toPoints(data, key);
                this.seriesAxisIndex.push(0);
                return {
                    name: names[i] || key,
                    data: points,
                    color: this.theme.palette[i % this.theme.palette.length],
                    type: type === 'area' ? 'line' : type,
                    smooth: this.config.smooth,
                    area: type === 'area',
                    markers: points.length <= 30,
                } satisfies Series;
            });
        }

        // Legend items with icon hints. A pie's are its CATEGORIES: it has one series, and a legend
        // of series would never appear on it — three slices, and nothing to say which is which.
        // A rebuild (new data, a theme change) keeps what the legend had switched off.
        const wasHidden = new Set(this.legendItems.filter(l => !l.visible).map(l => l.name));
        this.legendItems = isPie
            ? (this.series[0]?.data ?? []).map((p, i) => {
                const name = String(p.x ?? '');
                return { name, color: this.theme.palette[i % this.theme.palette.length], visible: !wasHidden.has(name), icon: 'circle' as const };
            })
            : this.series.map(s => ({
                name: s.name, color: s.color, visible: true,
                icon: s.type === 'bar' ? 'rect' as const : s.type === 'line' ? 'line' as const : 'circle' as const,
            }));

        if (isPie) this.buildPieSlices();

        // Candlestick: parse OHLC data
        if (type === 'candlestick' && data.length) {
            const xKey = xField || Object.keys(data[0])[0];
            this.candleData = parseCandleData(data, xKey);
        }

        // Heatmap: parse grid data
        if (type === 'heatmap' && data.length) {
            const keys = Object.keys(data[0]);
            const xKey = xField || keys[0];
            const yKeys = Array.isArray(this.config.yField) ? this.config.yField : [this.config.yField || keys[1]];
            const valField = keys.find(k => k !== xKey && !yKeys.includes(k) && typeof data[0][k] === 'number') || keys[2];
            this.heatmapData = parseHeatmapData(data, xKey, yKeys[0], valField);
        }
    }

    /** The slices the legend leaves on. */
    private buildPieSlices(): void {
        const hidden = new Set(this.legendItems.filter(l => !l.visible).map(l => l.name));
        this.pieSlices = this.series.length > 0 ? computeSlices(this.series[0].data, this.theme.palette, hidden) : [];
    }

    // ─── Scales ────────────────────────────────────

    /** Get the visible data range (accounting for zoom). */
    private getVisibleData(series: Series[]): Series[] {
        if (!this.zoom || (this.zoom.state.start <= 0 && this.zoom.state.end >= 1)) return series;
        return series.map(s => {
            const [start, end] = this.zoom!.getVisibleRange(s.data.length);
            return { ...s, data: s.data.slice(start, end) };
        });
    }

    private buildScales(): void {
        const noAxes = ['pie', 'doughnut', 'gauge', 'radar', 'heatmap', 'funnel'].includes(this.config.type);
        if (noAxes) return;
        if (!this.series.length && this.config.type !== 'candlestick') return;

        // Candlestick uses its own data for scales
        if (this.config.type === 'candlestick' && this.candleData.length) {
            const cats = this.candleData.map(c => String(c.x));
            this.xScale = categoryScale(cats, [this.area.x, this.area.x + this.area.width]);
            const [yMin, yMax] = candleDomain(this.candleData);
            this.yScale = linearScale([yMin, yMax], [this.area.y + this.area.height, this.area.y], this.numbers.compact);
            return;
        }
        if (!this.series.length) return;

        const allVisible = this.getVisibleData(
            this.series.filter((_, i) => this.legendItems[i]?.visible !== false)
        );
        const firstPoint = allVisible[0]?.data[0];
        if (!firstPoint) return;

        // X scale. Time-axis heuristic: it takes an ISO-like date (YYYY-MM...), not
        // any string with a '-' that passes Date.parse — "Q1-2020" would end up
        // on the time axis. Iterative min/max: the spread on large
        // datasets blows the stack.
        const xVal = firstPoint.x;
        const isoLike = typeof xVal === 'string' && /^\d{4}-\d{2}/.test(xVal) && !isNaN(Date.parse(xVal));
        if (xVal instanceof Date || isoLike) {
            const dates = allVisible[0].data.map(p => p.x instanceof Date ? p.x : new Date(p.x as string));
            let minT = Infinity;
            let maxT = -Infinity;
            for (const d of dates) {
                const t = d.getTime();
                if (t < minT) minT = t;
                if (t > maxT) maxT = t;
            }
            this.xScale = timeScale(
                [new Date(minT), new Date(maxT)],
                [this.area.x, this.area.x + this.area.width],
                this.numbers.locale,   // the chart's locale, as its numbers
            );
        } else if (typeof xVal === 'number') {
            const vals = allVisible[0].data.map(p => p.x as number);
            this.xScale = linearScale(numericDomain(vals, 0), [this.area.x, this.area.x + this.area.width], this.numbers.compact);
        } else {
            const cats = allVisible[0].data.map(p => String(p.x));
            this.xScale = categoryScale(cats, [this.area.x, this.area.x + this.area.width]);
        }

        // Y scales — separate for left (index 0) and right (index 1).
        // A name→index Map: findIndex inside the loops would be O(n²), and with duplicate names
        // it would always map the first series.
        const nameToIdx = new Map<string, number>();
        this.series.forEach((os, i) => { if (!nameToIdx.has(os.name)) nameToIdx.set(os.name, i); });
        const leftSeries = allVisible.filter(s => this.seriesAxisIndex[nameToIdx.get(s.name) ?? 0] === 0);
        const rightSeries = allVisible.filter(s => this.seriesAxisIndex[nameToIdx.get(s.name) ?? 0] === 1);

        // Bars and areas from zero, stacks at every boundary (seriesYDomain).
        const buildYScale = (seriesList: Series[]): Scale | null => {
            if (!seriesList.length) return null;
            // Niced for the tick count drawYAxis asks for, so its end ticks are labelled.
            const tickCount = Math.max(2, Math.floor(this.area.height / 50));
            const [yMin, yMax] = seriesYDomain(seriesList, !!this.config.stacked, tickCount);
            return linearScale([yMin, yMax], [this.area.y + this.area.height, this.area.y], this.numbers.compact);
        };

        this.yScale = buildYScale(leftSeries.length ? leftSeries : allVisible)!;
        this.yScaleRight = rightSeries.length ? buildYScale(rightSeries) : null;
    }

    // ─── Animation ─────────────────────────────────

    private animate(): void {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        this.animProgress = 0;
        const start = performance.now();
        const duration = 400;
        const step = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            this.animProgress = 1 - Math.pow(1 - t, 3); // ease-out cubic
            this.draw(this.animProgress);
            if (t < 1) this.animFrame = requestAnimationFrame(step);
        };
        this.animFrame = requestAnimationFrame(step);
    }

    // ─── Draw ──────────────────────────────────────

    private draw(animProgress: number): void {
        const r = this.renderer;
        r.clear();
        if (!this.config) return;

        const isGauge = this.config.type === 'gauge';
        if (!isGauge && !this.series.length) return;

        const isPie = this.config.type === 'pie' || this.config.type === 'doughnut';
        const isRadar = this.config.type === 'radar';
        const noAxes = isPie || isGauge || isRadar;
        const hasRightAxis = this.seriesAxisIndex.some(idx => idx === 1);
        const legendPos = this.config.legendPosition ?? 'top';
        // More than one ITEM: for a pie those are its slices, one series or not.
        const showLegend = this.config.legend !== false && this.legendItems.length > 1;

        // Pre-measure x-axis height (for label rotation)
        let xAxisH: number | undefined;
        if (!noAxes && this.xScale) {
            xAxisH = measureXAxisHeight(r, this.xScale, r.width * 0.7, this.theme, this.xFormatter, this.config.xAxisName);
        }
        this.xAxisHeight = xAxisH;

        // Build scales once against a provisional full-canvas area so the layout can measure
        // tick-label widths using the REAL data domain (e.g. "€3000" vs a stale default).
        // Pixel ranges are corrected by the post-layout buildScales() call below.
        if (!this.area) this.area = { x: 0, y: 0, width: r.width, height: r.height };
        this.buildScales();

        // Layout. A heatmap labels its rows with categories, not Y ticks: those are reserved instead.
        const isHeatmap = this.config.type === 'heatmap' && !!this.heatmapData;
        this.area = computeLayout(
            r.width, r.height,
            noAxes || isHeatmap ? null : this.yScale ?? null,
            this.theme,
            {
                title: this.config.title,
                showLegend,
                legendPosition: legendPos,
                legendItems: showLegend ? this.legendItems : undefined,
                xAxisName: noAxes ? undefined : this.config.xAxisName,
                yAxisName: noAxes ? undefined : this.config.yAxisName,
                hasRightAxis: !noAxes && hasRightAxis,
                rightAxisName: this.config.yAxisRightName,
                xAxisHeight: xAxisH,
                leftAxisFormatter: this.yFormatter,
                rightAxisFormatter: this.yRightFormatter,
                leftLabels: isHeatmap ? this.heatmapData!.yLabels : undefined,
            },
            r,
            !noAxes && hasRightAxis ? this.yScaleRight : undefined,
        );

        this.buildScales();

        // Title
        if (this.config.title) {
            const titleFont = `600 ${this.theme.fontSize + 2}px ${this.theme.fontFamily}`;
            r.text(this.config.title, this.area.x, 10, this.theme.textColor, titleFont, 'left', 'top');
        }

        // Legend
        if (showLegend) {
            const { x, y } = this.getLegendOrigin(legendPos);
            this.legendHits = drawLegend(r, this.legendItems, x, y, this.area.width, this.theme, legendPos, this.area.height);
        }

        // Gauge
        if (isGauge) {
            const firstPoint = this.series[0]?.data[0];
            const gc: GaugeConfig = {
                value: firstPoint?.y ?? (this.config.gauge?.value ?? 0),
                min: this.config.gauge?.min ?? 0,
                max: this.config.gauge?.max ?? 100,
                label: this.config.gauge?.label ?? this.config.title,
                format: this.config.gauge?.format,
                ticks: this.config.gauge?.ticks,
                thresholds: this.config.gauge?.thresholds,
            };
            drawGauge(r, gc, this.area, this.theme, this.theme.palette[0], animProgress, this.numbers);
            return;
        }

        // Pie / Doughnut
        if (isPie) {
            drawPie(r, this.pieSlices, this.area, this.theme, this.config.type === 'doughnut', animProgress, this.numbers);
            return;
        }

        // Radar
        if (isRadar) {
            const labels = this.series[0]?.data.map(p => String(p.x)) ?? [];
            const allVals = this.series.flatMap(s => s.data.map(p => p.y));
            const maxVal = Math.max(...allVals, 1);
            drawRadarGrid(r, labels, this.area, this.theme);
            for (const s of this.series.filter((_, i) => this.legendItems[i]?.visible !== false)) {
                const normalized: Series = { ...s, data: s.data.map(p => ({ ...p, y: p.y / maxVal })) };
                drawRadarSeries(r, normalized, this.area, animProgress);
            }
            return;
        }

        // Heatmap
        if (this.config.type === 'heatmap' && this.heatmapData) {
            drawHeatmap(r, this.heatmapData.cells, this.heatmapData.xLabels, this.heatmapData.yLabels,
                this.heatmapData.min, this.heatmapData.max, this.area, this.theme, animProgress, this.numbers);
            return;
        }

        // Funnel
        if (this.config.type === 'funnel' && this.series.length > 0) {
            drawFunnel(r, this.series[0].data, this.area, this.theme, this.theme.palette, false, animProgress, this.numbers);
            return;
        }

        // Cartesian axes
        if (this.xScale) drawXAxis(r, this.xScale, this.area, this.theme, this.config.xAxisName, this.xFormatter);
        if (this.yScale) drawYAxis(r, this.yScale, this.area, this.theme, this.config.yAxisName, 'left', this.yFormatter, true);
        if (this.yScaleRight) {
            const rightColor = this.series.find((_, i) => this.seriesAxisIndex[i] === 1)?.color;
            drawYAxis(r, this.yScaleRight, this.area, this.theme, this.config.yAxisRightName, 'right', this.yRightFormatter, false, rightColor);
        }

        // Candlestick
        if (this.config.type === 'candlestick' && this.candleData.length) {
            drawCandlesticks(r, this.candleData, this.xScale, this.yScale, this.area, this.theme, animProgress);
            return;
        }

        // Series rendering (supports mixed types, zoom-filtered)
        const visibleSeries = this.getVisibleData(
            this.series.filter((_, i) => this.legendItems[i]?.visible !== false)
        );
        this.pixelCache.clear();

        // Collect bar series for grouped rendering
        const barSeries = visibleSeries.filter(s => s.type === 'bar');
        const lineSeries = visibleSeries.filter(s => s.type !== 'bar');

        // Draw bars first (behind lines)
        if (barSeries.length) {
            for (let bi = 0; bi < barSeries.length; bi++) {
                const s = barSeries[bi];
                const origIdx = this.series.findIndex(os => os.name === s.name);
                const yS = this.seriesAxisIndex[origIdx] === 1 && this.yScaleRight ? this.yScaleRight : this.yScale;
                drawBars(r, barSeries, bi, barSeries.length, this.xScale, yS, this.area, !!this.config.stacked, animProgress);
            }
        }

        // Draw lines/areas
        for (const s of lineSeries) {
            const origIdx = this.series.findIndex(os => os.name === s.name);
            const yS = this.seriesAxisIndex[origIdx] === 1 && this.yScaleRight ? this.yScaleRight : this.yScale;
            const px = mapPoints(s, this.xScale, yS);
            this.pixelCache.set(s.name, px);
            drawLine(r, s, px, this.area, animProgress);
        }
    }

    private getLegendOrigin(pos: LegendPosition): { x: number; y: number } {
        return legendOrigin(pos, this.area, this.theme, !!this.config.title, this.xAxisHeight);
    }

    // ─── Mouse interaction ─────────────────────────

    private onMouseMove = (e: MouseEvent): void => {
        const rect = this.renderer.canvas.getBoundingClientRect();
        this.hoverAt(e.clientX - rect.left, e.clientY - rect.top);
    };

    /** Highlight the points under (mx, my) and show their tooltip: the mouse's path, and the keyboard's. */
    private hoverAt(mx: number, my: number): void {
        if (this.config?.tooltip === false) return;
        if (!this.area || mx < this.area.x || mx > this.area.x + this.area.width) { hideTooltip(); return; }

        const isPie = this.config.type === 'pie' || this.config.type === 'doughnut';
        if (isPie) { this.handlePieHover(mx, my); return; }
        if (this.config.type === 'gauge' || this.config.type === 'radar') return;

        const info: TooltipInfo = { x: mx, y: my, points: [], label: '' };

        // The bar series that are actually drawn, in the order drawBars receives them: a grouped
        // bar's x depends on its index AMONG THE BARS, not among all series.
        const visibleBars = this.series.filter(
            s => s.type === 'bar' && this.legendItems.find(l => l.name === s.name)?.visible,
        );

        for (const s of this.series) {
            if (!this.legendItems.find(l => l.name === s.name)?.visible) continue;
            const globalIdx = this.series.indexOf(s);

            if (s.type === 'bar') {
                // Bar: find by category index
                if (!s.data.length) continue;
                const catWidth = this.area.width / s.data.length;
                const catIdx = Math.floor((mx - this.area.x) / catWidth);
                const point = s.data[Math.max(0, Math.min(catIdx, s.data.length - 1))];
                if (point) {
                    const yS = this.seriesAxisIndex[globalIdx] === 1 && this.yScaleRight ? this.yScaleRight : this.yScale;
                    // On the bar it belongs to, not on the centre of the category: with two series
                    // both markers would stack over the gap between the two bars.
                    const slot = barSlot(
                        this.xScale.map(point.x), visibleBars.indexOf(s), visibleBars.length,
                        this.area, s.data.length, !!this.config.stacked,
                    );
                    info.points.push({ series: s, point, px: slot.centre, py: yS.map(point.y) });
                    if (!info.label) info.label = String(point.x);
                }
            } else {
                // Line: find closest point
                const cache = this.pixelCache.get(s.name);
                if (!cache?.length) continue;
                let closest = cache[0];
                let minDist = Math.abs(cache[0].x - mx);
                for (let i = 1; i < cache.length; i++) {
                    const d = Math.abs(cache[i].x - mx);
                    if (d < minDist) { minDist = d; closest = cache[i]; }
                }
                info.points.push({ series: s, point: closest.point, px: closest.x, py: closest.y });
                if (!info.label) info.label = String(closest.point.x);
            }
        }

        if (info.points.length) {
            this.draw(this.animProgress);
            const cx = info.points[0].px;
            this.renderer.line(cx, this.area.y, cx, this.area.y + this.area.height, this.theme.gridColor, 1, [4, 3]);
            for (const p of info.points) {
                this.renderer.circle(p.px, p.py, 5, '#fff', p.series.color);
            }
            showTooltip(info, this.theme, this.container, this.numbers);
        }
    }

    private handlePieHover(mx: number, my: number): void {
        const cx = this.area.x + this.area.width / 2;
        const cy = this.area.y + this.area.height / 2;
        const dx = mx - cx, dy = my - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const radius = Math.min(this.area.width, this.area.height) / 2 * 0.85;
        if (dist > radius) { hideTooltip(); return; }
        let angle = Math.atan2(dy, dx);
        if (angle < -Math.PI / 2) angle += Math.PI * 2;
        for (const slice of this.pieSlices) {
            if (angle >= slice.startAngle && angle < slice.endAngle) {
                showTooltip({
                    x: mx, y: my,
                    points: [{ series: { name: slice.label, data: [], color: slice.color }, point: slice.point, px: mx, py: my }],
                    label: slice.label,
                }, this.theme, this.container, this.numbers);
                return;
            }
        }
        hideTooltip();
    }

    private onMouseLeave = (): void => {
        hideTooltip();
        if (this.animProgress >= 1) this.draw(1);
    };

    private onClick = (e: MouseEvent): void => {
        const rect = this.renderer.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        for (const hit of this.legendHits) {
            const r = hit.rect;
            if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
                const item = this.legendItems.find(l => l.name === hit.name);
                if (item) { item.visible = !item.visible; this.afterToggle(); this.animate(); }
                return;
            }
        }
    };

    // ─── Public API ─────────────────────────────────

    /** The series as the legend lists them: name, colour, visible. pdx-chart renders them as buttons. */
    getLegendItems(): LegendItem[] {
        return this.legendItems.map(l => ({ ...l }));
    }

    /** Show or hide a series — or, on a pie, a slice: what a legend button does. */
    setSeriesVisible(name: string, visible: boolean): void {
        const item = this.legendItems.find(l => l.name === name);
        if (!item || item.visible === visible) return;
        item.visible = visible;
        this.afterToggle();
        this.draw(1);
    }

    /** A pie's slices are computed, not filtered at draw time: the ones left share the circle. */
    private afterToggle(): void {
        if (this.config.type === 'pie' || this.config.type === 'doughnut') this.buildPieSlices();
    }

    /**
     * Highlight the index-th point (category, or pie slice) and show its tooltip, as the mouse would;
     * null hides it. The keyboard's way to the tooltips, so they are not mouse-only.
     */
    focusPoint(index: number | null): void {
        if (index === null || !this.area) {
            hideTooltip();
            if (this.animProgress >= 1) this.draw(1);
            return;
        }
        const isPie = this.config.type === 'pie' || this.config.type === 'doughnut';
        if (isPie) {
            const slice = this.pieSlices[index];
            if (!slice) return;
            const mid = (slice.startAngle + slice.endAngle) / 2;
            const radius = Math.min(this.area.width, this.area.height) / 2 * 0.5;
            this.handlePieHover(this.area.x + this.area.width / 2 + Math.cos(mid) * radius,
                this.area.y + this.area.height / 2 + Math.sin(mid) * radius);
            return;
        }
        const series = this.series.find(s => this.legendItems.find(l => l.name === s.name)?.visible);
        const point = series?.data[index];
        if (!point || !this.xScale) return;
        this.hoverAt(this.xScale.map(point.x), this.area.y + this.area.height / 2);
    }

    /** Download chart as PNG file. */
    exportPng(filename?: string): void { exportPng(this.renderer, filename); }

    /** Get chart as PNG data URL (for embedding). */
    toPngDataUrl(): string { return toPngDataUrl(this.renderer); }

    /** Copy chart to clipboard as PNG. */
    async copyToClipboard(): Promise<boolean> { return copyToClipboard(this.renderer); }

    destroy(): void {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        this.zoomCleanup?.();
        this.themeObs?.disconnect();
        this.resizeObs.disconnect();
        this.renderer.canvas.removeEventListener('mousemove', this.onMouseMove);
        this.renderer.canvas.removeEventListener('mouseleave', this.onMouseLeave);
        this.renderer.canvas.removeEventListener('click', this.onClick);
        this.renderer.destroy();
        hideTooltip();
    }
}
