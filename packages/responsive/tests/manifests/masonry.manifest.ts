/**
 * MANIFEST — pdx-masonry
 *
 * Contracts DERIVED by inspecting the source and the CSS:
 *
 *   - Source: packages/ui/src/masonry/pdx-masonry.ts
 *       · render() = <slot></slot>: the children (the items) are projected as DIRECT children
 *         of the HOST <pdx-masonry> (light DOM). There is no inner wrapper.
 *       · Props:
 *           columns      (String, '3' by default)   → the number of fixed columns; 'auto', 0 and any
 *                                                   negative → responsive from columnWidth. A String, because
 *                                                   as a Number the documented 'auto' would become NaN.
 *           columnWidth  (Number, 250 by default) → the minimum column width in px (auto mode only)
 *           gap          (String, default '1rem')
 *       · In a ctx.track() (the `_built` gate) inside requestAnimationFrame the host gets:
 *           - the class `.pdx-masonry`
 *           - CSS var --pdx-masonry-gap = gap
 *           - style.columnCount = String(cols)   (cols = columns, or computed from clientWidth/columnWidth when auto)
 *           - style.columnGap = gap
 *         In responsive mode it registers a ResizeObserver that recomputes columnCount; the
 *         observer follows the MODE, so a component switched to 'auto' after mount watches
 *         its width too.
 *       · ⚠ The DOM work happens in an rAF after a track gate → the runners MUST wait for data-pdx-ready
 *         (the framework sets it after the first flush). Without that wait, columnCount is not applied yet.
 *       · No event is emitted. No keydown handler. No role and no aria (it is pure visual layout,
 *         a presentational container → keyboard 'none', no ARIA to assert).
 *
 *   - CSS: packages/design/src/components/masonry.css
 *       · `pdx-masonry { display: block }` (host element)
 *       · `.pdx-masonry { column-fill: balance }`  → the mechanism is CSS MULTI-COLUMN, not JS positioning.
 *         column-count is inline (from the JS); the columns are rendered by the browser's layout engine.
 *       · `.pdx-masonry > * { break-inside: avoid; margin-bottom: var(--pdx-masonry-gap, 1rem) }`
 *         → every direct child is an "item" that does not break across columns; the bottom margin is the vertical gap.
 *
 * THE LAYOUT MECHANISM — CSS columns (NOT JS absolute positioning):
 *   The items are NOT placed at computed coordinates. The browser distributes them into the
 *   `column-count` columns, filling them top to bottom (column-fill: balance evens the heights out).
 *   What that means for the contracts:
 *     - Which column an item ends up in depends on the items' heights and on the browser's
 *       algorithm (balance). It is NOT asserted (that would be fragile and platform-dependent).
 *     - The invariants that are TRUE and stable, and are asserted:
 *         (a) the host is a block contained within the wrapper's width (600px);
 *         (b) with columns=3, there EXISTS at least one item whose x (left) is > the first item's x
 *             → proof that the content is laid out over MORE than one column (not a single one);
 *         (c) EVERY item is contained horizontally in the container (no overflow on the right).
 *   To guarantee (b) deterministically across themes and platforms, the boxes have FIXED heights
 *   (an inline style) that differ: with short items and column-fill:balance all 3 columns fill up,
 *   so later items land in columns to the right of the first. No images, nothing random.
 *
 * CONSERVATIVE contracts, true on all 13 themes: NO theme-specific px.
 *   masonry has no border, radius or shadow of its own (the CSS is layout only) → no theme-specific assertion.
 *
 * The `masonry-auto` scenario guards `columns="auto"`. As a Number prop, 'auto' coerces to NaN,
 *   `NaN <= 0` is false so the responsive branch never runs, and "NaN" reaches style.columnCount —
 *   where the browser drops an invalid value and lays everything out in ONE column, saying nothing
 *   (a gallery 24,883px tall where three columns were expected). The scenario fails on exactly
 *   that: item-8 (the last, hence in the last column whatever the count) would sit at the same
 *   left as item-0 — `60 > 60` — on all 13 themes.
 */
import type { ComponentManifest } from './_types';

// Deterministic boxes: FIXED heights that differ (no images, nothing random). Widths at 100% of the
// column. The colours are inline and serve the visual diff alone (they are deterministic).
// 9 items with 3 columns (the default) → each column gets about 3, which guarantees items in several columns.
const ITEMS = [
    { h: 80, bg: '#cfe8ff' },
    { h: 140, bg: '#ffd9cf' },
    { h: 60, bg: '#d7f5cf' },
    { h: 120, bg: '#f5cfe8' },
    { h: 90, bg: '#fff2cf' },
    { h: 160, bg: '#cfd7f5' },
    { h: 70, bg: '#cff5ef' },
    { h: 110, bg: '#e8cff5' },
    { h: 100, bg: '#f5e3cf' },
]
    .map(
        (it, i) =>
            `<div class="masonry-item" data-test="item-${i}" style="height:${it.h}px;background:${it.bg};">${i}</div>`,
    )
    .join('\n                    ');

export const masonry: ComponentManifest = {
    name: 'masonry',
    tag: 'pdx-masonry',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/masonry'],

    // ── Scenarios ──
    // A FIXED-width wrapper (600px), to constrain the geometry. columns=3, explicitly.
    // A fixed gap. Items with deterministic inline heights.
    scenarios: [
        {
            id: 'masonry-columns',
            title: 'Masonry — 3 columns, fixed-height items',
            viewport: 1280,
            html: `
                <div style="width: 600px; max-width: 100%;">
                    <pdx-masonry data-test="masonry" columns="3" gap="1rem">
                    ${ITEMS}
                    </pdx-masonry>
                </div>`,
        },
        {
            // The DOCUMENTED responsive form. Same wrapper, same items: only the value of `columns`
            // differs, so a failure here is about that value and nothing else. 600px of wrapper over
            // a columnWidth of 250 is 2 columns — more than one, which is the whole assertion.
            // With `columns` as a Number prop this renders ONE column: "auto" becomes NaN, and
            // "NaN" reaches style.columnCount where the browser drops it.
            id: 'masonry-auto',
            title: 'Masonry — columns="auto", responsive from columnWidth',
            viewport: 1280,
            html: `
                <div style="width: 600px; max-width: 100%;">
                    <pdx-masonry data-test="masonry" columns="auto" gap="1rem">
                    ${ITEMS}
                    </pdx-masonry>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'masonry-columns': {
                standalone: [
                    {
                        // Host element: display block (the CSS rule `pdx-masonry { display:block }`).
                        selector: 'section:not([hidden]) [data-test="masonry"]',
                        description: 'masonry host renders as a block-level container',
                        display: { op: 'oneOf', value: ['block', 'flow-root'] },
                    },
                    {
                        // The width is constrained by the 600px wrapper: the host must not exceed it.
                        // (== 600 exactly is not asserted: a theme's padding or margin could change the box;
                        // the invariant is "contained within the wrapper".)
                        selector: 'section:not([hidden]) [data-test="masonry"]',
                        description: 'masonry width is constrained within the fixed wrapper (<= 600px)',
                        width: { op: '<=', value: 600 },
                    },
                    {
                        // It has content → a noticeable height (the per-column sum; > 0, well over a low threshold).
                        selector: 'section:not([hidden]) [data-test="masonry"]',
                        description: 'masonry has a measurable height (items laid out)',
                        height: { op: '>=', value: 40 },
                    },
                ],
                composition: [
                    {
                        // Containment: every item sits INSIDE the container's box, with no overflow on the right.
                        description: 'masonry items are contained within the container width',
                        parent: 'section:not([hidden]) [data-test="masonry"]',
                        children: {
                            masonry: 'section:not([hidden]) [data-test="masonry"]',
                            first: 'section:not([hidden]) [data-test="item-0"]',
                            last: 'section:not([hidden]) [data-test="item-8"]',
                        },
                        relations: [
                            { description: 'first item within masonry box', left: 'first', op: 'contained-in', right: 'masonry' },
                            { description: 'last item within masonry box', left: 'last', op: 'contained-in', right: 'masonry' },
                            {
                                description: 'first item right edge does not overflow container',
                                left: 'first.right',
                                op: '<=',
                                right: 'masonry.right',
                                tolerance: 1,
                            },
                            {
                                description: 'last item right edge does not overflow container',
                                left: 'last.right',
                                op: '<=',
                                right: 'masonry.right',
                                tolerance: 1,
                            },
                        ],
                    },
                    {
                        // Multi-column: with columns=3 and short items, there EXISTS an item to the right of the first
                        // (column 2 or 3). item-0 (the top of column 1) is compared with item-5: with balance and 9 short
                        // items over 3 columns, item-5 falls in a column to the right → a greater left.
                        // It catches the "everything in one column" regression (columnCount not applied, say).
                        description: 'columns>1: at least one item sits in a column to the right of the first',
                        parent: 'section:not([hidden]) [data-test="masonry"]',
                        children: {
                            first: 'section:not([hidden]) [data-test="item-0"]',
                            sixth: 'section:not([hidden]) [data-test="item-5"]',
                        },
                        relations: [
                            {
                                // > with a tolerance: the x of an item in a column to the right is beyond the first one's.
                                description: 'item-5.left > item-0.left (laid out across multiple columns)',
                                left: 'sixth.left',
                                op: '>',
                                right: 'first.left',
                                tolerance: 0,
                            },
                        ],
                    },
                ],
            },
            'masonry-auto': {
                composition: [
                    {
                        // The point of the scenario: `columns="auto"` lays the items out over MORE
                        // than one column. item-8 is the last item, so column-fill: balance puts it
                        // in the last column whatever the count is — its left is beyond item-0's for
                        // any layout with more than one column, and equal to it for exactly one.
                        description: 'columns="auto": the items are laid out over more than one column',
                        parent: 'section:not([hidden]) [data-test="masonry"]',
                        children: {
                            first: 'section:not([hidden]) [data-test="item-0"]',
                            last: 'section:not([hidden]) [data-test="item-8"]',
                        },
                        relations: [
                            {
                                description: 'item-8.left > item-0.left (auto resolved to more than one column)',
                                left: 'last.left',
                                op: '>',
                                right: 'first.left',
                                tolerance: 0,
                            },
                        ],
                    },
                    {
                        // And the items still stay inside the box: an auto count computed from the
                        // wrong width would overflow rather than under-fill.
                        description: 'columns="auto": items are contained within the container width',
                        parent: 'section:not([hidden]) [data-test="masonry"]',
                        children: {
                            masonry: 'section:not([hidden]) [data-test="masonry"]',
                            last: 'section:not([hidden]) [data-test="item-8"]',
                        },
                        relations: [
                            { description: 'last item within masonry box', left: 'last', op: 'contained-in', right: 'masonry' },
                            {
                                description: 'last item right edge does not overflow container',
                                left: 'last.right',
                                op: '<=',
                                right: 'masonry.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // masonry is a pure presentational container (no role and no aria in the source). The scenario's
    // items are plain <div>s with text → no known false positive. No disableRules.
    a11y: {
        scenarios: ['masonry-columns'],
    },

    // ── Dim. 3: style isolation ──
    // The container's height is CONTENT-DRIVEN (the sum of the per-column heights, sensitive to the
    // line-height and font of the injected host CSS) → skipHeight. The WIDTH, on the other hand, is constrained by the
    // fixed wrapper and stays a clean invariant; masonry has no radius or border (the CSS is layout
    // only) but the runner checks them as a no-op at 0 → they stay asserted as an immunity guarantee.
    isolation: {
        scenario: 'masonry-columns',
        targets: [
            { selector: 'section:not([hidden]) [data-test="masonry"]', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard ──
    // Pattern 'none': masonry has no keyboard interaction (no keydown handler, no
    // tabindex, no role in the source). It is pure layout — the items are not focusable in themselves.
    keyboard: {
        scenario: 'masonry-columns',
    },

    // ── Dim. 5: visual regression (Docker) ──
    // One scenario, with deterministic content (coloured boxes of fixed heights, NO images and nothing random)
    // → the diff catches the column layout that the maths does not pin to the pixel.
    visual: {
        scenarios: ['masonry-columns'],
    },
};

export default masonry;
