// pdx-chart — Declarative chart Web Component.
// Zero dependencies. Canvas-rendered. Design-token native.
// Auto-resize, animated transitions, DataSource binding.

import { component, html, generatedId, prop } from '@pdxui/core';
import { ChartEngine, type ChartConfig } from './core/engine';
import { chartDataTable, chartSeries, gaugeReading, pointText, type ChartDataTable } from './core/describe';
import { chartNumbers } from './core/numbers';
import { uiString, format } from '../shared/i18n';
import { resolveLocale } from '../shared/locale';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/chart';

/**
 * A zero-dependency chart drawn on a canvas, styled by the design tokens, that resizes itself.
 *
 * @csspart legend - The legend, a group of buttons, while there is more than one series or slice.
 * @csspart legend-item - A legend button: pressed while its series is shown.
 * @csspart swatch - A legend button's colour.
 * @csspart canvas - The box the chart is drawn in.
 */
component('pdx-chart', {
    props: {
        /** Chart type: line, bar, area, pie, doughnut, scatter, gauge, radar */
        type: prop('line'),
        /** Data array (array of objects) */
        data: prop<unknown[]>([]),
        /** X-axis field name (auto-detected if omitted) */
        xField: prop(''),
        /** Y-axis field name(s) — string or comma-separated */
        yField: prop(''),
        /** Series display names (comma-separated) */
        seriesNames: prop(''),
        /** Chart title */
        title: prop(''),
        /** Smooth line interpolation */
        smooth: prop(false),
        /** Stack series */
        stacked: prop(false),
        /** Show tooltip on hover */
        tooltip: prop(true),
        /** Show legend */
        legend: prop(true),
        /** Legend position: top, bottom, left, right */
        legendPosition: prop('top'),
        /** Chart height (CSS value) */
        height: prop(''),
        /** X-axis label */
        xAxisName: prop(''),
        /** Y-axis label */
        yAxisName: prop(''),
        /** Right Y-axis label (dual axis) */
        yAxisRightName: prop(''),
        /** X-axis format: currency, percent, compact, or template '{value}%' */
        xFormat: prop(''),
        /** Left Y-axis format */
        yFormat: prop(''),
        /** Right Y-axis format */
        yRightFormat: prop(''),
        /** Locale the chart prints numbers in (BCP 47). Empty: the nearest `lang`, then the browser. */
        locale: prop(''),
        /** Currency of the `currency` format (ISO 4217, e.g. "EUR"). Empty: "USD". */
        currency: prop(''),
        /** Enable zoom: 'inside' (mouse wheel + drag pan) */
        zoom: prop(''),
        /** Advanced: per-series config JSON string */
        seriesConfig: prop(''),
        /** Gauge: minimum value */
        min: prop(0),
        /** Gauge: maximum value */
        max: prop(100),
        /** Gauge: current value (alternative to data) */
        value: prop(0),
        /** Gauge: value format (e.g. "{value}%") */
        format: prop(''),
        /** DataSource binding (duck-typed) */
        source: prop<Record<string, unknown> | null>(null),
    },
    parts: ['legend', 'legend-item', 'swatch', 'canvas'],
    setup(ctx) {
        let engine: ChartEngine | null = null;
        let canvasHost: HTMLElement | null = null;
        const dataId = generatedId('pdx-chart-data');
        /** Series the legend has hidden: out of the drawing and out of the data table. */
        const hidden = new Set<string>();
        let table: ChartDataTable | null = null;
        /** The point the keyboard is on; -1 for none. */
        let focusIndex = -1;

        // ─── The accessible layer ─────────────────────────
        // The canvas is opaque to assistive technology. Around it: a figure named by its title,
        // described by a visually hidden table of its data, a legend of real buttons, and points
        // walked with the arrow keys and announced. It was role="img" — whose children are
        // presentational — named "bar chart, 4 data points", with legend and tooltips mouse-only.

        const q = (sel: string) => ctx.el.querySelector(sel) as HTMLElement | null;

        function renderTable(config: ChartConfig): void {
            const holder = q('.pdx-chart-data');
            if (!holder) return;
            table = chartDataTable(config, hidden, uiString('chart', 'category'));
            holder.replaceChildren();
            if (!table) { ctx.el.removeAttribute('aria-describedby'); return; }
            const t = document.createElement('table');
            if (config.title) t.createCaption().textContent = config.title;
            const head = t.createTHead().insertRow();
            for (const c of table.columns) {
                const th = document.createElement('th');
                th.scope = 'col';
                th.textContent = c;
                head.appendChild(th);
            }
            const body = t.createTBody();
            for (const row of table.rows) {
                const tr = body.insertRow();
                row.forEach((cell, i) => {
                    const td = document.createElement(i === 0 ? 'th' : 'td');
                    if (i === 0) (td as HTMLTableCellElement).scope = 'row';
                    td.textContent = cell;
                    tr.appendChild(td);
                });
            }
            holder.appendChild(t);
            ctx.el.setAttribute('aria-describedby', dataId);
        }

        function renderLegend(config: ChartConfig): void {
            const legend = q('.pdx-chart-legend');
            if (!legend) return;
            const items = engine?.getLegendItems?.() ?? chartSeries(config).map(s => ({ name: s.name, color: '', visible: true }));
            const show = config.legend !== false && items.length > 1 && config.type !== 'gauge';
            legend.hidden = !show;
            legend.replaceChildren();
            if (!show) return;
            for (const item of items) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'pdx-chart-legend-item';
                btn.dataset.part = 'legend-item';
                btn.setAttribute('aria-pressed', String(!hidden.has(item.name)));
                const swatch = document.createElement('span');
                swatch.className = 'pdx-chart-legend-swatch';
                swatch.dataset.part = 'swatch';
                swatch.setAttribute('aria-hidden', 'true');
                if (item.color) swatch.style.background = item.color;
                btn.append(swatch, document.createTextNode(item.name));
                btn.addEventListener('click', () => {
                    const nowHidden = !hidden.has(item.name);
                    if (nowHidden) hidden.add(item.name); else hidden.delete(item.name);
                    btn.setAttribute('aria-pressed', String(!nowHidden));
                    engine?.setSeriesVisible?.(item.name, !nowHidden);
                    renderTable(buildConfig());
                });
                legend.appendChild(btn);
            }
        }

        function announce(text: string): void {
            const live = q('.pdx-chart-live');
            if (live) live.textContent = text;
        }

        function onKeydown(e: KeyboardEvent): void {
            if (e.target !== ctx.el || !table) return;
            const last = table.rows.length - 1;
            let next: number | null = null;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(last, focusIndex + 1);
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, focusIndex - 1);
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = last;
            else if (e.key === 'Escape' && focusIndex >= 0) { e.preventDefault(); clearFocus(); return; }
            if (next === null) return;
            e.preventDefault();
            focusIndex = next;
            engine?.focusPoint?.(focusIndex);
            announce(pointText(table, focusIndex));
        }

        function clearFocus(): void {
            focusIndex = -1;
            engine?.focusPoint?.(null);
            announce('');
        }

        /**
         * The figure's name: its title, its type and its number of points, or for a gauge its
         * reading. The data itself is in the table that describes it (renderTable, above).
         */
        function figureLabel(): string {
            const title = (ctx.title() as string) || '';
            const type = (ctx.type() as string) || 'line';
            if (type === 'gauge') {
                const nf = chartNumbers(resolveLocale(ctx.el, ctx.locale() as string));
                const r = gaugeReading(ctx.value() as number, ctx.min() as number, ctx.max() as number, (ctx.format() as string) || undefined, nf);
                return format(uiString('chart', 'gauge'), { label: title || uiString('chart', 'gaugeLabel'), ...r });
            }
            const n = Array.isArray(ctx.data()) ? (ctx.data() as unknown[]).length : 0;
            return (title ? title + ' — ' : '') + format(uiString('chart', 'summary'), { type }) + (n ? format(uiString('chart', 'points'), { n }) : '');
        }

        function buildConfig(): ChartConfig {
            const data = (ctx.data() as Record<string, unknown>[]) || [];
            const yField = ctx.yField() as string;
            const seriesNames = ctx.seriesNames() as string;

            const chartType = (ctx.type() as ChartConfig['type']) || 'line';
            const seriesConfigStr = ctx.seriesConfig() as string;
            let seriesConfigParsed: ChartConfig['series'] | undefined;
            if (seriesConfigStr) {
                try { seriesConfigParsed = JSON.parse(seriesConfigStr); } catch { /* ignore */ }
            }

            const config: ChartConfig = {
                type: chartType,
                data,
                xField: (ctx.xField() as string) || undefined,
                yField: yField ? yField.split(',').map(s => s.trim()) : undefined,
                series: seriesConfigParsed,
                seriesNames: seriesNames ? seriesNames.split(',').map(s => s.trim()) : undefined,
                title: (ctx.title() as string) || undefined,
                smooth: ctx.smooth() as boolean,
                stacked: ctx.stacked() as boolean,
                tooltip: ctx.tooltip() as boolean,
                legend: ctx.legend() as boolean,
                legendPosition: (ctx.legendPosition() as ChartConfig['legendPosition']) || undefined,
                xAxisName: (ctx.xAxisName() as string) || undefined,
                yAxisName: (ctx.yAxisName() as string) || undefined,
                yAxisRightName: (ctx.yAxisRightName() as string) || undefined,
                xFormat: (ctx.xFormat() as string) || undefined,
                yFormat: (ctx.yFormat() as string) || undefined,
                yRightFormat: (ctx.yRightFormat() as string) || undefined,
                zoom: (ctx.zoom() as string) === 'inside' ? 'inside' : undefined,
                // The page's locale, not the browser's: an English page in an Italian browser
                // would print "24.500".
                locale: resolveLocale(ctx.el, ctx.locale() as string),
                currency: (ctx.currency() as string) || undefined,
            };
            if (chartType === 'gauge') {
                config.gauge = {
                    value: ctx.value() as number,
                    min: ctx.min() as number,
                    max: ctx.max() as number,
                    format: (ctx.format() as string) || undefined,
                    label: (ctx.title() as string) || undefined,
                };
            }
            return config;
        }

        // DataSource integration. createDataSource exposes `data` as a reactive signal (like
        // pdx-data-grid reads) — it has NO `rows` and NO `subscribe`, so checking only those would
        // leave the chart without rows. Support: DataSource `.data` signal,
        // legacy `.rows` (fn or array), `.subscribe`, and a plain static array.
        ctx.track(() => {
            const src = ctx.source() as any;
            if (!src) return;

            const readRows = (): unknown[] => {
                if (typeof src.data === 'function') return src.data() as unknown[]; // DataSource signal
                if (Array.isArray(src.data)) return src.data;
                if (typeof src.rows === 'function') return src.rows() as unknown[];
                if (Array.isArray(src.rows)) return src.rows;
                if (Array.isArray(src)) return src;
                return [];
            };

            const apply = (rows: unknown[]) => {
                if (!engine) return;
                const config = buildConfig();
                config.data = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
                engine.update(config);
            };

            // Read rows NOW — for a DataSource/signal this both fetches the current value AND
            // subscribes the track, so future data changes re-run and repaint the chart.
            const rows = readRows();
            if (engine) apply(rows);
            else requestAnimationFrame(() => apply(readRows()));

            // Legacy imperative transport with no reactive signal.
            if (typeof src.data !== 'function' && typeof src.subscribe === 'function') {
                return src.subscribe(() => apply(readRows()));
            }
        });

        // Main reactive track: rebuild chart on any prop change
        ctx.track(() => {
            // Read all props to create subscriptions
            void ctx.type();
            void ctx.data();
            void ctx.xField();
            void ctx.yField();
            void ctx.seriesNames();
            void ctx.title();
            void ctx.smooth();
            void ctx.stacked();
            void ctx.tooltip();
            void ctx.legend();
            void ctx.height();
            void ctx.xAxisName();
            void ctx.yAxisName();
            void ctx.yAxisRightName();
            void ctx.legendPosition();
            void ctx.xFormat();
            void ctx.yFormat();
            void ctx.yRightFormat();
            void ctx.locale();
            void ctx.currency();
            void ctx.seriesConfig();
            void ctx.zoom();
            void ctx.min();
            void ctx.max();
            void ctx.value();
            void ctx.format();

            // ctx.frame: the frame of a setup a move destroyed would find the new render's canvas
            // host in the same element and draw a second chart into it.
            ctx.frame(() => {
                if (!canvasHost) {
                    canvasHost = ctx.el.querySelector('.pdx-chart-canvas');
                    if (!canvasHost) return;
                }

                // The legend is a DOM row beside the canvas: a flex host, the legend before or after
                // it by position. Inline, like the height below, so it holds without the design CSS.
                const pos = (ctx.legendPosition() as string) || 'top';
                ctx.el.style.display = 'flex';
                ctx.el.style.flexDirection = pos === 'left' || pos === 'right' ? 'row' : 'column';
                const legendEl = q('.pdx-chart-legend');
                if (legendEl) legendEl.style.order = pos === 'bottom' || pos === 'right' ? '2' : '';

                // Apply height
                const h = ctx.height() as string;
                if (h) {
                    canvasHost.style.height = h;
                } else {
                    canvasHost.style.aspectRatio = '16 / 9';
                }

                if (!engine) {
                    engine = new ChartEngine(canvasHost);
                }

                // The legend is the DOM one: the canvas neither draws nor reserves one.
                const config = buildConfig();
                engine.update({ ...config, legend: false });
                // An update rebuilds the series, all visible: the legend's choices are reapplied.
                for (const name of hidden) engine.setSeriesVisible?.(name, false);
                renderLegend(config);
                renderTable(config);
                if (focusIndex > (table?.rows.length ?? 0) - 1) clearFocus();
            });
        });

        // destroy() on unmount: otherwise a ResizeObserver + a MutationObserver
        // on documentElement + the canvas listeners survive every unmount.
        ctx.track(() => () => { engine?.destroy(); engine = null; });

        return { dataId, figureLabel, onKeydown, clearFocus };
    },
    // A figure, named; not role="img", whose children are presentational. Focusable unless it is a
    // gauge, which has no points: the arrow keys walk them, and leaving the chart drops the point.
    host: {
        role: 'figure',
        ':aria-label': (ctx) => ctx.figureLabel(),
        ':tabindex': (ctx) => ctx.type() === 'gauge' ? null : '0',
        '@keydown': (ctx, e) => ctx.onKeydown(e as KeyboardEvent),
        '@focusout': (ctx) => ctx.clearFocus(),
    },
    render: (ctx) => html`
        <div class="pdx-chart-legend" data-part="legend" role="group" :aria-label="${() => uiString('chart', 'legend')}" hidden></div>
        <div class="pdx-chart-canvas" data-part="canvas" aria-hidden="true" style="width:100%;min-height:200px"></div>
        <div class="pdx-sr-only pdx-chart-data" :id="${() => ctx.dataId}"></div>
        <div class="pdx-sr-only pdx-chart-live" aria-live="polite"></div>`,
});
