/**
 * MANIFEST — pdx-col (with pdx-row as the grid context)
 *
 * Contracts DERIVED by inspecting the source and the CSS:
 *
 *   - Source, col: packages/ui/src/col/pdx-col.ts
 *       · render() = <slot></slot>: the children (the content) are projected as DIRECT children
 *         of the HOST <pdx-col> (light DOM). There is no inner wrapper → the geometry is the host's.
 *       · Props:
 *           span    (Number, 12 by default)  → how many of the N columns it takes (1-12, clamped)
 *           sm/md/lg/xl (Number, 0 by default) → they override span at breakpoints >= 640/768/1024/1280px
 *           offset  (Number, 0 by default)  → margin-left = offset/cols*100% (it pushes the column right)
 *           order   (Number, default 0)  → CSS order
 *       · In a ctx.track() (the `_built` gate) inside requestAnimationFrame the host gets:
 *           - the class `.pdx-col`
 *           - style.flex    = `0 0 calc(span / var(--pdx-row-cols,12) * 100% - var(--pdx-row-gutter,0px))`
 *           - style.maxWidth = `calc(span / var(--pdx-row-cols,12) * 100%)`
 *           - style.marginLeft (when offset>0), style.order (when order>0)
 *         It registers matchMedia listeners on the 4 breakpoints, to re-apply the styles on a resize.
 *       · ⚠ The DOM work happens in an rAF after a track gate → the runners MUST wait for data-pdx-ready
 *         (the framework sets it after the first flush). Without that wait, flex and maxWidth are not applied yet.
 *       · No event is emitted. No keydown handler. No role and no aria → it is pure presentational layout
 *         (keyboard 'none', no ARIA to assert).
 *
 *   - Source, row: packages/ui/src/row/pdx-row.ts
 *       · render() = <slot></slot> (light DOM, the direct children are the columns).
 *       · In an rAF (the `_built` gate) the host gets the class `.pdx-row-wc`, display:flex, flex-wrap,
 *         gap = the gutter, plus the CSS vars --pdx-row-cols (12 by default) and --pdx-row-gutter (the resolved gutter)
 *         which the column reads to work out its own width.
 *       · gutter defaults to 'md' → var(--pdx-space-md): the row has a NON-zero gap between the columns.
 *
 *   - CSS: packages/design/src/components/col.css
 *       · `pdx-col { display: block; min-width: 0; transition: flex-basis/max-width/margin-left }`
 *       · `pdx-row.pdx-row-wc { min-width:0; max-width:100% }`
 *       · No border, radius, shadow or colour of its own → no theme-specific assertion.
 *
 * THE WIDTH MECHANISM — FLEXBOX (NOT a CSS grid):
 *   The row is a flex container (display:flex, flex-wrap, gap). Every column is a flex item with
 *   a percentage flex-basis = span/cols of 100%, MINUS the gutter (subtracted inside the flex calc).
 *   A CRITICAL consequence for the contracts: with a gutter != 0, two span=6 columns are NOT exactly half
 *   the row in px: each is (50% - the gutter) and the gap fills the difference. So what is asserted is NOT
 *   "col.width == row.width/2" al px; uso RELAZIONI PROPORZIONALI tolleranti:
 *     - a span=6 column takes "about half": more than 1/3 and less than 6/10 of the row's width;
 *     - two span=6 columns are ~equal to each other (the same span ⇒ the same width, within a % tolerance);
 *     - a span=4 column is NARROWER than a span=8 one in the same row (proportional ordering);
 *     - every column is on the SAME row (the same top, no wrap) and contained in the row.
 *   All of it holds across themes and platforms: no absolute theme-specific px, only ratios.
 *
 * DETERMINISTIC CONTENT: every column holds a box with a FIXED height (an inline style), no
 *   images and nothing random → the height is stable and the visual diff is deterministic.
 *
 * REAL BUGS: none. col and row apply the flex-basis % and the gap as declared.
 *
 * A NOTE on the proportions (for whoever reads the numbers): with cols=12, gutter=md (~16px) and a 600px wrapper:
 *   span=6 → flex-basis = calc(50% - 16px) ≈ 284px; the column/row ratio ≈ 0.47 → which falls inside
 *   asserted band [1/3, 0.6]. span=4 ≈ calc(33.3% - 16px); span=8 ≈ calc(66.6% - 16px): 4 < 8 always.
 */
import type { ComponentManifest } from './_types';

// A deterministic box inside every column: a fixed height, no images and nothing random.
const box = (label: string, h = 80, bg = '#cfe8ff') =>
    `<div data-test="content-${label}" style="height:${h}px;background:${bg};">${label}</div>`;

export const col: ComponentManifest = {
    name: 'col',
    tag: 'pdx-col',
    tier: '3',
    status: 'wip',
    // row + col: without the row's context the column has no --pdx-row-cols/--pdx-row-gutter
    // (it would fall back to the defaults), and the realistic scenario is a col INSIDE a row.
    imports: ['@pdxui/ui/row', '@pdxui/ui/col'],

    // ── Scenarios ──
    // A FIXED-width wrapper (600px), to constrain the geometry. cols=12 by default.
    // Two span=6 columns (half each) for the symmetric case, plus an asymmetric 4/8 variant.
    scenarios: [
        {
            id: 'col-halves',
            title: 'Col — two span=6 columns (halves) in a row',
            viewport: 1280,
            html: `
                <div style="width: 600px; max-width: 100%;">
                    <pdx-row data-test="row">
                        <pdx-col data-test="col-a" span="6">${box('A')}</pdx-col>
                        <pdx-col data-test="col-b" span="6">${box('B', 80, '#ffd9cf')}</pdx-col>
                    </pdx-row>
                </div>`,
        },
        {
            id: 'col-asymmetric',
            title: 'Col — span=4 + span=8 (narrow + wide) in a row',
            viewport: 1280,
            html: `
                <div style="width: 600px; max-width: 100%;">
                    <pdx-row data-test="row2">
                        <pdx-col data-test="col-narrow" span="4">${box('N')}</pdx-col>
                        <pdx-col data-test="col-wide" span="8">${box('W', 80, '#d7f5cf')}</pdx-col>
                    </pdx-row>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'col-halves': {
                standalone: [
                    {
                        // The col host: display block (the CSS rule `pdx-col { display:block }`).
                        selector: 'section:not([hidden]) [data-test="col-a"]',
                        description: 'col host renders as a block-level flex item',
                        display: { op: 'oneOf', value: ['block', 'flow-root'] },
                    },
                    {
                        // span=6 takes "about half": the box never exceeds the wrapper (600px).
                        // A generous upper bound: 50% plus room for the theme's padding and gap.
                        selector: 'section:not([hidden]) [data-test="col-a"]',
                        description: 'span=6 column width is at most ~half the wrapper (constrained by flex-basis)',
                        width: { op: '<=', value: 360 }, // 0.6 * 600: banda alta, tema-tollerante
                    },
                    {
                        // The lower bound: well beyond a third of the wrapper (which proves it has NOT collapsed
                        // and is not one full column). A third of 600 = 200.
                        selector: 'section:not([hidden]) [data-test="col-a"]',
                        description: 'span=6 column is wider than a third of the wrapper (not collapsed to 1 col)',
                        width: { op: '>=', value: 200 },
                    },
                ],
                composition: [
                    {
                        // Containment and the same row: the two columns are INSIDE the row, on the same top,
                        // with no overflow on the right. col-b starts to the right of col-a.
                        description: 'two halves sit on the same row, contained, side by side',
                        parent: 'section:not([hidden]) [data-test="row"]',
                        children: {
                            row: 'section:not([hidden]) [data-test="row"]',
                            a: 'section:not([hidden]) [data-test="col-a"]',
                            b: 'section:not([hidden]) [data-test="col-b"]',
                        },
                        relations: [
                            { description: 'col-a within row', left: 'a', op: 'contained-in', right: 'row' },
                            { description: 'col-b within row', left: 'b', op: 'contained-in', right: 'row' },
                            {
                                description: 'both columns share the same top (no wrap to next line)',
                                left: 'a.top',
                                op: '==',
                                right: 'b.top',
                                tolerance: 1,
                            },
                            {
                                description: 'col-b starts to the right of col-a (side by side, not stacked)',
                                left: 'b.left',
                                op: '>',
                                right: 'a.left',
                                tolerance: 0,
                            },
                            {
                                description: 'col-b right edge does not overflow the row',
                                left: 'b.right',
                                op: '<=',
                                right: 'row.right',
                                tolerance: 1,
                            },
                            {
                                // The same span ⇒ the same width: the two halves are equal to each other
                                // (within a tolerance for the flex's sub-pixel rounding).
                                description: 'equal spans ⇒ equal widths (both ~half)',
                                left: 'a.width',
                                op: '==',
                                right: 'b.width',
                                tolerance: 2,
                            },
                        ],
                    },
                ],
            },
            'col-asymmetric': {
                composition: [
                    {
                        // Proportional to the span: span=4 is narrower than span=8, on the same row, contained.
                        description: 'span=4 column is narrower than span=8 column (width scales with span)',
                        parent: 'section:not([hidden]) [data-test="row2"]',
                        children: {
                            row: 'section:not([hidden]) [data-test="row2"]',
                            narrow: 'section:not([hidden]) [data-test="col-narrow"]',
                            wide: 'section:not([hidden]) [data-test="col-wide"]',
                        },
                        relations: [
                            { description: 'narrow within row', left: 'narrow', op: 'contained-in', right: 'row' },
                            { description: 'wide within row', left: 'wide', op: 'contained-in', right: 'row' },
                            {
                                description: 'both columns share the same top (no wrap)',
                                left: 'narrow.top',
                                op: '==',
                                right: 'wide.top',
                                tolerance: 1,
                            },
                            {
                                description: 'span=4 width < span=8 width (proportional to span)',
                                left: 'narrow.width',
                                op: '<',
                                right: 'wide.width',
                                tolerance: 0,
                            },
                            {
                                description: 'wide column right edge does not overflow the row',
                                left: 'wide.right',
                                op: '<=',
                                right: 'row.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // col and row are pure presentational containers (no role and no aria in the source). The scenarios'
    // content is <div>s with text → no known false positive. No disableRules:
    // the invariant is "the layout introduces NO a11y violation".
    a11y: {
        scenarios: ['col-halves'],
    },

    // ── Dim. 3: style isolation ──
    // The column's WIDTH is the clean structural invariant: it comes from the percentage flex-basis, constrained by
    // the fixed wrapper (600px) and by the row, NOT by the content → it stays stable under hostile CSS.
    // The height, on the other hand, is CONTENT-DRIVEN (the inner box's height plus the injected host line-height) →
    // skipHeight, as for masonry and card. A column has no radius and no border (the CSS is layout only):
    // the runner checks them as a no-op at 0 → they stay asserted as an immunity guarantee.
    isolation: {
        scenario: 'col-halves',
        targets: [
            { selector: 'section:not([hidden]) [data-test="col-a"]', tolerancePx: 2, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'borderTopColor'] }] },
        ],
    },

    // ── Dim. 4: keyboard ──
    // Pattern 'none': col and row have no keyboard interaction (no keydown handler, no
    // tabindex, no role in the source). It is pure layout — the columns are not focusable in themselves.
    keyboard: {
        scenario: 'col-halves',
    },

    // ── Dim. 5: visual regression (Docker) ──
    // One scenario, with deterministic content (boxes of fixed heights, NO images and nothing random)
    // → the diff catches the side-by-side column layout that the maths does not pin to the pixel.
    visual: {
        scenarios: ['col-halves'],
    },
};

export default col;
