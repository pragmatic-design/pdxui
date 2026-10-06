// pdx-chart — Declarative chart Web Component.
// Zero dependencies. Canvas-rendered. Design-token native.
// Auto-resize, animated transitions, DataSource binding.

import { component, html } from '@pdxui/core';
import { ChartEngine, type ChartConfig } from './core/engine';
import { chartDataTable, chartSeries, gaugeReading, pointText, type ChartDataTable } from './core/describe';
import { chartNumbers } from './core/numbers';
import { uiString, format, uiAttr} from '../shared/i18n';
import { resolveLocale } from '../shared/locale';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/chart';

let _chartSeq = 0;

/**
 * A zero-dependency chart drawn on a canvas, styled by the design tokens, that resizes itself.
 */
component('pdx-chart', {
    props: {
        /** Chart type: line, bar, area, pie, doughnut, scatter, gauge, radar */
        type: { type: String, default: 'line' },
        /** Data array (array of objects) */
        data: { type: Array, default: [] },
        /** X-axis field name (auto-detected if omitted) */
        xField: { type: String, default: '' },
        /** Y-axis field name(s) — string or comma-separated */
        yField: { type: String, default: '' },
        /** Series display names (comma-separated) */
        seriesNames: { type: String, default: '' },
        /** Chart title */
        title: { type: String, default: '' },
        /** Smooth line interpolation */
        smooth: { type: Boolean, default: false },
        /** Stack series */
        stacked: { type: Boolean, default: false },
        /** Show tooltip on hover */
        tooltip: { type: Boolean, default: true },
        /** Show legend */
        legend: { type: Boolean, default: true },
        /** Legend position: top, bottom, left, right */
        legendPosition: { type: String, default: 'top' },
        /** Chart height (CSS value) */
        height: { type: String, default: '' },
        /** X-axis label */
        xAxisName: { type: String, default: '' },
        /** Y-axis label */
        yAxisName: { type: String, default: '' },
        /** Right Y-axis label (dual axis) */
        yAxisRightName: { type: String, default: '' },
        /** X-axis format: currency, percent, compact, or template '{value}%' */
        xFormat: { type: String, default: '' },
        /** Left Y-axis format */
        yFormat: { type: String, default: '' },
        /** Right Y-axis format */
        yRightFormat: { type: String, default: '' },
        /** Locale the chart prints numbers in (BCP 47). Empty: the nearest `lang`, then the browser. */
        locale: { type: String, default: '' },
        /** Currency of the `currency` format (ISO 4217, e.g. "EUR"). Empty: "USD". */
        currency: { type: String, default: '' },
        /** Enable zoom: 'inside' (mouse wheel + drag pan) */
        zoom: { type: String, default: '' },
        /** Advanced: per-series config JSON string */
        seriesConfig: { type: String, default: '' },
        /** Gauge: minimum value */
        min: { type: Number, default: 0 },
        /** Gauge: maximum value */
        max: { type: Number, default: 100 },
        /** Gauge: current value (alternative to data) */
        value: { type: Number, default: 0 },
        /** Gauge: value format (e.g. "{value}%") */
        format: { type: String, default: '' },
        /** DataSource binding (duck-typed) */
        source: { type: Object, default: null },
    },
    setup(ctx) {
        let engine: ChartEngine | null = null;
        let canvasHost: HTMLElement | null = null;
        const dataId = `pdx-chart-data-${++_chartSeq}`;
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
                btn.setAttribute('aria-pressed', String(!hidden.has(item.name)));
                const swatch = document.createElement('span');
                swatch.className = 'pdx-chart-legend-swatch';
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

        ctx.track(() => {
            const el = ctx.el;
            el.addEventListener('keydown', onKeydown);
            el.addEventListener('focusout', clearFocus);
            return () => { el.removeEventListener('keydown', onKeydown); el.removeEventListener('focusout', clearFocus); };
        });

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

                // A figure, named: title + type + number of points, or for a gauge its reading. The
                // data itself is in the table that describes it (renderTable, below).
                const _t = (ctx.title() as string) || '';
                const _ct = (ctx.type() as string) || 'line';
                const _n = Array.isArray(ctx.data()) ? (ctx.data() as unknown[]).length : 0;
                ctx.el.setAttribute('role', 'figure');
                if (_ct === 'gauge') {
                    const nf = chartNumbers(resolveLocale(ctx.el, ctx.locale() as string));
                    const r = gaugeReading(ctx.value() as number, ctx.min() as number, ctx.max() as number, (ctx.format() as string) || undefined, nf);
                    uiAttr(ctx.el, 'aria-label', () => format(uiString('chart', 'gauge'), { label: _t || uiString('chart', 'gaugeLabel'), ...r }));
                    ctx.el.removeAttribute('tabindex');
                } else {
                    uiAttr(ctx.el, 'aria-label', () => (_t ? _t + ' — ' : '') + format(uiString('chart', 'summary'), { type: _ct }) + (_n ? format(uiString('chart', 'points'), { n: _n }) : ''));
                    ctx.el.tabIndex = 0;   // the points are walked with the arrow keys
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

        return { dataId };
    },
    render: (ctx) => html`
        <div class="pdx-chart-legend" role="group" :aria-label="${() => uiString('chart', 'legend')}" hidden></div>
        <div class="pdx-chart-canvas" aria-hidden="true" style="width:100%;min-height:200px"></div>
        <div class="pdx-sr-only pdx-chart-data" :id="${() => ctx.dataId}"></div>
        <div class="pdx-sr-only pdx-chart-live" aria-live="polite"></div>`,
});
