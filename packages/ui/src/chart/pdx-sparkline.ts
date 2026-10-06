// pdx-sparkline — Inline mini chart for tables, cards, KPIs.
// Minimal: just a line/area/bar in a small space. No axes, no tooltip.

import { component, html } from '@pdxui/core';
import { resolveTheme } from './core/theme';
import { uiString, format } from '../shared/i18n';
import { resolveLocale } from '../shared/locale';

/**
 * A tiny inline trend chart for tables, cards and KPIs: a line, area or bar with no axes, tooltip
 * or legend.
 */
component('pdx-sparkline', {
    props: {
        /** Comma-separated values or array */
        data: { type: String, default: '' },
        /** Chart type: line, area, bar */
        type: { type: String, default: 'line' },
        /** Width (CSS) */
        width: { type: String, default: '120px' },
        /** Height (CSS) */
        height: { type: String, default: '32px' },
        /** Line/fill color (CSS color or design token name) */
        color: { type: String, default: '' },
        /** Smooth line */
        smooth: { type: Boolean, default: true },
        /** Accessible name. Empty: the series in words, from the data. */
        label: { type: String, default: '' },
    },
    setup(ctx) {
        let canvas: HTMLCanvasElement | null = null;

        function parseData(): number[] {
            const raw = ctx.data();
            if (Array.isArray(raw)) return (raw as number[]);
            if (typeof raw === 'string' && raw) {
                return raw.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
            }
            return [];
        }

        function draw(): void {
            if (!canvas) return;
            const values = parseData();
            if (!values.length) return;

            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            const w = Math.round(rect.width);
            const h = Math.round(rect.height);
            if (w === 0 || h === 0) return;

            canvas.width = w * dpr;
            canvas.height = h * dpr;
            const c = canvas.getContext('2d')!;
            c.setTransform(dpr, 0, 0, dpr, 0, 0);

            const theme = resolveTheme(ctx.el);
            let color = ctx.color() as string;
            if (!color) color = theme.palette[0];
            // Resolve CSS color if needed
            if (color.startsWith('--')) {
                const tmp = document.createElement('div');
                tmp.style.color = `var(${color})`;
                ctx.el.appendChild(tmp);
                color = getComputedStyle(tmp).color;
                tmp.remove();
            }

            const pad = 2;
            const plotW = w - pad * 2;
            const plotH = h - pad * 2;
            // Iterative min/max: the spread blows the stack on large datasets
            let min = Infinity;
            let max = -Infinity;
            for (const v of values) {
                if (v < min) min = v;
                if (v > max) max = v;
            }
            const range = max - min || 1;

            const type = ctx.type() as string;

            if (type === 'bar') {
                const barW = plotW / values.length;
                const gap = Math.max(1, barW * 0.15);
                for (let i = 0; i < values.length; i++) {
                    const barH = ((values[i] - min) / range) * plotH;
                    const x = pad + i * barW + gap / 2;
                    const y = pad + plotH - barH;
                    c.fillStyle = color;
                    c.fillRect(x, y, barW - gap, barH);
                }
                return;
            }

            // Line / area
            const pts: { x: number; y: number }[] = values.map((v, i) => ({
                x: pad + (i / (values.length - 1 || 1)) * plotW,
                y: pad + (1 - (v - min) / range) * plotH,
            }));

            const smooth = ctx.smooth() as boolean;

            // Area fill
            if (type === 'area' || type === 'line') {
                c.beginPath();
                c.moveTo(pts[0].x, h);
                drawPath(c, pts, smooth);
                c.lineTo(pts[pts.length - 1].x, h);
                c.closePath();
                c.fillStyle = color;
                c.globalAlpha = 0.12;
                c.fill();
                c.globalAlpha = 1;
            }

            // Line
            c.beginPath();
            drawPath(c, pts, smooth);
            c.strokeStyle = color;
            c.lineWidth = 1.5;
            c.lineJoin = 'round';
            c.lineCap = 'round';
            c.stroke();

            // End dot
            const last = pts[pts.length - 1];
            c.beginPath();
            c.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
            c.fillStyle = color;
            c.fill();
        }

        function drawPath(c: CanvasRenderingContext2D, pts: { x: number; y: number }[], smooth: boolean): void {
            c.moveTo(pts[0].x, pts[0].y);
            if (!smooth || pts.length < 3) {
                for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
                return;
            }
            for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[Math.max(0, i - 1)];
                const p1 = pts[i];
                const p2 = pts[i + 1];
                const p3 = pts[Math.min(pts.length - 1, i + 2)];
                c.bezierCurveTo(
                    p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
                    p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
                    p2.x, p2.y,
                );
            }
        }

        /**
         * The text alternative: the canvas says nothing to a screen reader (WCAG 1.1.1). Up to 12
         * values are read out with the last one named; a longer series is summarised by its count,
         * first, last, low and high. The `label` prop replaces it.
         */
        function describe(values: number[]): string {
            const own = ctx.label() as string;
            if (own) return own;
            if (!values.length) return uiString('sparkline', 'empty');
            const nf = new Intl.NumberFormat(resolveLocale(ctx.el, ''), { maximumFractionDigits: 2 });
            const n = (v: number): string => nf.format(v);
            const last = values[values.length - 1];
            if (values.length <= 12) {
                return format(uiString('sparkline', 'summary'), {
                    values: values.map(n).join(uiString('sparkline', 'separator')),
                    last: n(last),
                });
            }
            let min = Infinity;
            let max = -Infinity;
            for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
            return format(uiString('sparkline', 'summaryLong'), {
                n: values.length, first: n(values[0]), last: n(last), min: n(min), max: n(max),
            });
        }

        ctx.track(() => {
            void ctx.label();
            ctx.el.setAttribute('role', 'img');
            ctx.el.setAttribute('aria-label', describe(parseData()));
        });

        ctx.track(() => {
            void ctx.data();
            void ctx.type();
            void ctx.color();
            void ctx.smooth();
            void ctx.width();
            void ctx.height();

            requestAnimationFrame(() => {
                if (!canvas) {
                    canvas = ctx.el.querySelector('canvas');
                    if (!canvas) return;
                }
                const w = ctx.width() as string;
                const h = ctx.height() as string;
                canvas.style.width = w;
                canvas.style.height = h;
                draw();
            });
        });

        // Re-render on theme/scheme change. Disconnected on destroy: otherwise every unmounted
        // instance would leave an active observer on <html> that holds on to the canvas
        // forever.
        const themeObs = new MutationObserver(() => requestAnimationFrame(draw));
        themeObs.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['pdx-theme', 'pdx-scheme'],
        });
        ctx.track(() => () => themeObs.disconnect());

        return {};
    },
    // `width` is a size to draw at, not to overflow at: in a narrower box the canvas shrinks to it
    // (draw() reads the rendered size). A fixed 140px line would run past a phone's edge.
    render: () => html`<canvas style="display:block;max-width:100%"></canvas>`,
});
