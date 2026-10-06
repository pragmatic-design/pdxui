// pdx-col — Responsive grid column with animated span transitions.
// Works inside pdx-row (WC) or any flex container. 12-column system.
// Breakpoint props (sm/md/lg/xl) override span at viewport thresholds.

import { component, html } from '@pdxui/core';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/col';

// Breakpoints aligned with design system (px)
const BP = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

/**
 * A column of a 12-column grid, inside `pdx-row` or any flex container, whose span can change at
 * each breakpoint.
 */
component('pdx-col', {
    props: {
        /** Column span 1-12 (default: 12 = full width) */
        span: { type: Number, default: 12 },
        /** Span override at >= 640px */
        sm: { type: Number, default: 0 },
        /** Span override at >= 768px */
        md: { type: Number, default: 0 },
        /** Span override at >= 1024px */
        lg: { type: Number, default: 0 },
        /** Span override at >= 1280px */
        xl: { type: Number, default: 0 },
        /** Column offset (0-11) — pushes column to the right */
        offset: { type: Number, default: 0 },
        /** CSS order override */
        order: { type: Number, default: 0 },
    },
    setup(ctx) {
        let _built = false;
        let _mqCleanups: (() => void)[] = [];

        /** Resolve effective span: largest matching breakpoint, or base span. */
        function getEffectiveSpan(): number {
            const w = window.innerWidth;
            const xlVal = ctx.xl() as number;
            const lgVal = ctx.lg() as number;
            const mdVal = ctx.md() as number;
            const smVal = ctx.sm() as number;
            const base = ctx.span() as number;

            if (xlVal > 0 && w >= BP.xl) return xlVal;
            if (lgVal > 0 && w >= BP.lg) return lgVal;
            if (mdVal > 0 && w >= BP.md) return mdVal;
            if (smVal > 0 && w >= BP.sm) return smVal;
            return base;
        }

        function applyStyles(): void {
            const el = ctx.el;
            const span = Math.max(1, Math.min(12, getEffectiveSpan()));
            const offset = ctx.offset() as number;
            const order = ctx.order() as number;
            // Parent provides --pdx-row-cols (default 12) and --pdx-row-gutter
            const pct = `calc(${span} / var(--pdx-row-cols, 12) * 100%)`;
            const gutter = `var(--pdx-row-gutter, 0px)`;

            el.style.flex = `0 0 calc(${pct} - ${gutter})`;
            el.style.maxWidth = pct;

            if (offset > 0) {
                el.style.marginLeft = `calc(${offset} / var(--pdx-row-cols, 12) * 100%)`;
            } else {
                el.style.marginLeft = '';
            }

            if (order > 0) {
                el.style.order = String(order);
            } else {
                el.style.order = '';
            }
        }

        /** Set up matchMedia listeners for breakpoint changes. */
        function setupBreakpointListeners(): void {
            cleanupListeners();
            for (const [, px] of Object.entries(BP)) {
                const mql = window.matchMedia(`(min-width: ${px}px)`);
                const handler = () => requestAnimationFrame(applyStyles);
                mql.addEventListener('change', handler);
                _mqCleanups.push(() => mql.removeEventListener('change', handler));
            }
        }

        function cleanupListeners(): void {
            _mqCleanups.forEach(fn => fn());
            _mqCleanups = [];
        }

        ctx.track(() => {
            // Read all props to subscribe
            void ctx.span();
            void ctx.sm();
            void ctx.md();
            void ctx.lg();
            void ctx.xl();
            void ctx.offset();
            void ctx.order();

            if (!_built) {
                _built = true;
                requestAnimationFrame(() => {
                    ctx.el.classList.add('pdx-col');
                    applyStyles();
                    setupBreakpointListeners();
                });
                return;
            }

            requestAnimationFrame(applyStyles);
        });

        return {};
    },
    render: () => html`<slot></slot>`,
});
