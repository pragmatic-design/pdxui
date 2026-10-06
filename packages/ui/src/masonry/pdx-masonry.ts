// pdx-masonry — Pinterest-style masonry grid layout.
// Uses CSS columns for simple, SSR-friendly masonry. Items flow top-to-bottom per column.
// Props: columns (responsive), gap. Auto-adjusts via ResizeObserver.

import { component, html, DEV } from '@pdxui/core';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/masonry';

/**
 * The column count `columns` asks for, or null for responsive — compute it from the width.
 *
 * `columns` is declared String so the documented `columns="auto"` survives the trip: as a Number
 * prop it coerces to NaN, `NaN <= 0` is false so the responsive branch is skipped, and `"NaN"`
 * reaches `style.columnCount`, where the browser drops an invalid value and lays the whole grid out
 * in one column, silently: a gallery 24,883px tall where three columns were expected.
 *
 * A property assignment — `:columns="3"` — passes a non-string through untouched, so a number
 * arrives as a number. Both spellings are read here, in one place.
 *
 * Responsive is 'auto', and also 0 and any negative, so an app written against the implementation
 * rather than the documentation keeps working. Anything else is a mistake worth saying out loud.
 */
function requestedColumns(raw: unknown): number | null {
    if (typeof raw === 'string' && raw.trim().toLowerCase() === 'auto') return null;
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
    if (!Number.isFinite(n)) {
        if (DEV) console.warn(`[pdx-masonry] columns="${String(raw)}" is neither a number nor "auto": `
            + 'laying the items out responsively from columnWidth. '
            + 'A value the browser cannot use renders one column and says nothing.');
        return null;
    }
    return n > 0 ? Math.floor(n) : null;
}

/**
 * A masonry grid: items of different heights flow top to bottom down each column.
 */
component('pdx-masonry', {
    props: {
        /**
         * Number of columns, or 'auto' to fit as many columns of `columnWidth` as the width allows.
         * 0 and negatives mean 'auto' too. Anything else warns and is treated as 'auto'.
         * @type number | 'auto'
         */
        columns: { type: String, default: '3' },
        /** Minimum column width for auto mode (px) */
        columnWidth: { type: Number, default: 250 },
        /** Gap between items (CSS value) */
        gap: { type: String, default: '1rem' },
    },
    setup(ctx) {
        let _built = false;
        let _resizeObserver: ResizeObserver | null = null;

        /** Writes the count, and answers whether it was computed from the width (responsive). */
        function updateColumns(): boolean {
            const el = ctx.el;
            const asked = requestedColumns(ctx.columns());
            const colWidth = ctx.columnWidth() as number;
            const gapVal = ctx.gap() as string;

            // Responsive: as many columns of colWidth as the container holds, at least one.
            const cols = asked ?? Math.max(1, Math.floor(el.clientWidth / colWidth));

            el.style.columnCount = String(cols);
            el.style.columnGap = gapVal;
            return asked === null;
        }

        /**
         * The observer follows the MODE, not the first render. Attached inside the one-time build
         * gate, a component that becomes responsive later — `columns` set to 'auto' after mount —
         * would never watch its own width.
         */
        function syncObserver(responsive: boolean): void {
            if (responsive && !_resizeObserver) {
                _resizeObserver = new ResizeObserver(() => updateColumns());
                _resizeObserver.observe(ctx.el);
            } else if (!responsive && _resizeObserver) {
                _resizeObserver.disconnect();
                _resizeObserver = null;
            }
        }

        ctx.track(() => {
            // Read for the subscription, before the frame: a value read inside the rAF subscribes
            // to nothing and the track never runs again (the pattern in docs/architecture/core.md).
            void ctx.columns();
            void ctx.columnWidth();
            const gapVal = ctx.gap() as string;

            requestAnimationFrame(() => {
                if (!_built) {
                    _built = true;
                    ctx.el.classList.add('pdx-masonry');
                }
                // Gap as row-gap via CSS variable
                ctx.el.style.setProperty('--pdx-masonry-gap', gapVal);
                // One read of `columns` per update, so a value that warns warns once.
                syncObserver(updateColumns());
            });
        });

        // Disconnected on destroy, or it stays active forever.
        ctx.track(() => () => { _resizeObserver?.disconnect(); _resizeObserver = null; });

        return {};
    },
    render: () => html`<slot></slot>`,
});
