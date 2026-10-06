// pdx-row — Responsive row container for pdx-col columns.
// Provides 12-column grid context via CSS custom properties.
// Enhances CSS-only pdx-row with gutter, column count, and alignment props.

import { component, html } from '@pdxui/core';

/**
 * A responsive row that lays out pdx-col columns on a 12-column grid, with gutter, column count and
 * alignment.
 */
component('pdx-row', {
    props: {
        /** Number of columns in the grid system (default: 12) */
        cols: { type: Number, default: 12 },
        /** Gutter between columns: 2xs|xs|sm|md|lg|xl|2xl or CSS value */
        gutter: { type: String, default: 'md' },
        /** Vertical alignment of children */
        align: { type: String, default: '' },
        /** Horizontal distribution */
        justify: { type: String, default: '' },
        /** Allow wrapping (default: true) */
        wrap: { type: Boolean, default: true },
    },
    setup(ctx) {
        // Named spacing tokens → CSS values
        const SPACING: Record<string, string> = {
            '2xs': 'var(--pdx-space-2xs)',
            'xs': 'var(--pdx-space-xs)',
            'sm': 'var(--pdx-space-sm)',
            'md': 'var(--pdx-space-md)',
            'lg': 'var(--pdx-space-lg)',
            'xl': 'var(--pdx-space-xl)',
            '2xl': 'var(--pdx-space-2xl)',
        };

        const ALIGN: Record<string, string> = {
            start: 'flex-start', center: 'center', end: 'flex-end',
            baseline: 'baseline', stretch: 'stretch',
        };

        const JUSTIFY: Record<string, string> = {
            start: 'flex-start', center: 'center', end: 'flex-end',
            between: 'space-between', around: 'space-around', evenly: 'space-evenly',
        };

        let _built = false;

        ctx.track(() => {
            const cols = ctx.cols() as number;
            const gutter = ctx.gutter() as string;
            const align = ctx.align() as string;
            const justify = ctx.justify() as string;
            const wrap = ctx.wrap() as boolean;

            const gutterCss = SPACING[gutter] || gutter || '0px';

            if (!_built) {
                _built = true;
                requestAnimationFrame(() => {
                    const el = ctx.el;
                    el.classList.add('pdx-row-wc');
                    el.style.display = 'flex';
                    el.style.flexWrap = wrap ? 'wrap' : 'nowrap';
                    el.style.gap = gutterCss;
                    // Provide context to pdx-col children
                    el.style.setProperty('--pdx-row-cols', String(cols));
                    el.style.setProperty('--pdx-row-gutter', gutterCss);

                    if (align) el.style.alignItems = ALIGN[align] || align;
                    if (justify) el.style.justifyContent = JUSTIFY[justify] || justify;
                });
                return;
            }

            requestAnimationFrame(() => {
                const el = ctx.el;
                el.style.flexWrap = wrap ? 'wrap' : 'nowrap';
                el.style.gap = gutterCss;
                el.style.setProperty('--pdx-row-cols', String(cols));
                el.style.setProperty('--pdx-row-gutter', gutterCss);
                el.style.alignItems = align ? (ALIGN[align] || align) : '';
                el.style.justifyContent = justify ? (JUSTIFY[justify] || justify) : '';
            });
        });

        return {};
    },
    render: () => html`<slot></slot>`,
});
