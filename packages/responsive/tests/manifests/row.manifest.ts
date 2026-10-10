/**
 * MANIFEST — pdx-row (with pdx-col)
 *
 * Contracts DERIVED by inspecting the source and the CSS (they are NOT in universal.ts):
 *
 *   - Source, row: packages/ui/src/row/pdx-row.ts
 *       · render() = <slot></slot>: the pdx-col children are projected as DIRECT children
 *         of the HOST <pdx-row> (light DOM, no Shadow DOM).
 *       · In an rAF (ctx.track) the host gets an INLINE STYLE (not CSS classes):
 *           - the class `.pdx-row-wc` (the only class the WC adds)
 *           - el.style.display = 'flex'
 *           - el.style.flexWrap = wrap ? 'wrap' : 'nowrap'   (prop wrap, default true)
 *           - el.style.gap = gutterCss                        (prop gutter, default 'md')
 *           - el.style.setProperty('--pdx-row-cols', cols)    (prop cols, default 12)
 *           - el.style.setProperty('--pdx-row-gutter', gutterCss)
 *           - when the align prop → el.style.alignItems = ALIGN[align] || align
 *           - when the justify prop → el.style.justifyContent = JUSTIFY[justify] || justify
 *         The `gutter` prop 'md' resolves to `var(--pdx-space-md)` = calc(1rem * density) ≈ 16px (> 0).
 *       · No event is emitted. No keydown handler. No role and no aria. → keyboard 'none'.
 *
 *   - Source, col: packages/ui/src/col/pdx-col.ts
 *       · render() = <slot></slot>. In an rAF it adds the class `.pdx-col` and an INLINE STYLE:
 *           - flex = `0 0 calc(<span>/var(--pdx-row-cols,12)*100% - var(--pdx-row-gutter,0px))`
 *           - maxWidth = `calc(<span>/var(--pdx-row-cols,12)*100%)`
 *           - offset>0 → marginLeft; order>0 → order.
 *         the span is clamped to 1..12. The breakpoint props (sm/md/lg/xl) override the span at px thresholds.
 *
 *   - CSS: packages/design/src/layout.css (CSS-only pdx-row) + components/col.css
 *       · `pdx-row { display:flex; flex-wrap:wrap; align-items:center }` (base CSS-only).
 *       · `pdx-row.pdx-row-wc { min-width:0; max-width:100% }` (override WC).
 *       · `pdx-col { display:block; min-width:0; transition flex-basis/max-width/margin-left }`.
 *
 * THE SCENARIO: one <pdx-row gutter="md"> with 3 <pdx-col span="4"> inside a wrapper of a
 *   FIXED 600px width. span=4 ×3 = 12 = cols → the three columns sit on ONE row
 *   (a basis of 33.33% - the gutter, plus 2 gaps = exactly 100%, so no wrap even with wrap=true).
 *   Deterministic content (the static labels "A"/"B"/"C", no random font).
 *
 * CONSERVATIVE contracts, true on all 13 themes: NO theme-specific px, only relations
 *   PROPORZIONALI/geometriche.
 *   - the row: display flex (an inline style, the web component's invariant), height >= 0.
 *   - the columns: the 3 side-by-side columns share the same top (a single row) and are
 *     contained in the row's box (containment).
 *   - the gutter: there is horizontal room between adjacent columns → colB.left > colA.right (the md gap > 0).
 *     A proportional relation (gap > 0), not an absolute px value.
 *
 * REAL BUGS: none. Subtracting the gutter from each column's flex-basis (`pct - gutter`)
 *   together with the row's `gap` is the grid system's CORRECT behaviour (the gap fills
 *   exactly the space subtracted, and the sum is 100%), NOT a regression.
 */
import type { ComponentManifest } from './_types';

export const row: ComponentManifest = {
    name: 'row',
    tag: 'pdx-row',
    tier: '3',
    status: 'wip',
    // Both row and col must be registered: the scenario uses both custom elements.
    // Verified: the './row' and './col' exports in ui/package.json + the imports in ui/src/index.ts (lines 81-82).
    imports: ['@pdxui/ui/row', '@pdxui/ui/col'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'row-cols',
            title: 'Row — 3 columns side by side (span 4, gutter md)',
// A wrapper of FIXED width, 600px: a deterministic surplus, independent of the viewport.
            // 3 columns with span=4 (= 12 = the default cols) → one row; gutter "md" → a visible gap between them.
            // Static, deterministic content in every column.
            html: `
                <div style="width: 600px; max-width: 100%;">
                    <pdx-row data-test="row" gutter="md">
                        <pdx-col data-test="col-a" span="4">
                            <div style="height: 32px;">A</div>
                        </pdx-col>
                        <pdx-col data-test="col-b" span="4">
                            <div style="height: 32px;">B</div>
                        </pdx-col>
                        <pdx-col data-test="col-c" span="4">
                            <div style="height: 32px;">C</div>
                        </pdx-col>
                    </pdx-row>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'row-cols': {
                standalone: [
                    {
                        // The row host: the web component forces display:flex through an inline style → an invariant across themes.
                        selector: 'section:not([hidden]) [data-test="row"]',
                        description: 'row host renders as flex (inline style set by WC)',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // The row holds 3 columns whose content is 32px tall → a noticeable height.
                        selector: 'section:not([hidden]) [data-test="row"]',
                        description: 'row has a measurable height (holds its columns)',
                        height: { op: '>=', value: 20 },
                    },
                    {
                        // The columns must have a width > 0 (a flex-basis of about a third of the row).
                        selector: 'section:not([hidden]) [data-test="col-a"]',
                        description: 'a column takes up horizontal space (flex-basis > 0)',
                        width: { op: '>', value: 0 },
                    },
                ],
                composition: [
                    {
                        // Containment: all 3 columns sit INSIDE the row's box.
                        description: 'columns are contained within the row box',
                        parent: 'section:not([hidden]) [data-test="row"]',
                        children: {
                            row: 'section:not([hidden]) [data-test="row"]',
                            a: 'section:not([hidden]) [data-test="col-a"]',
                            b: 'section:not([hidden]) [data-test="col-b"]',
                            c: 'section:not([hidden]) [data-test="col-c"]',
                        },
                        relations: [
                            { description: 'col A within row', left: 'a', op: 'contained-in', right: 'row' },
                            { description: 'col B within row', left: 'b', op: 'contained-in', right: 'row' },
                            { description: 'col C within row', left: 'c', op: 'contained-in', right: 'row' },
                            {
                                description: 'last column right edge does not overflow row right edge',
                                left: 'c.right',
                                op: '<=',
                                right: 'row.right',
                                tolerance: 2,
                            },
                        ],
                    },
                    {
                        // A single row: the 3 side-by-side columns share the same top (no wrap, span 4×3=12).
                        description: 'columns sit on the same row (same top)',
                        parent: 'section:not([hidden]) [data-test="row"]',
                        children: {
                            a: 'section:not([hidden]) [data-test="col-a"]',
                            b: 'section:not([hidden]) [data-test="col-b"]',
                            c: 'section:not([hidden]) [data-test="col-c"]',
                        },
                        relations: [
                            { description: 'A.top == B.top', left: 'a.top', op: '==', right: 'b.top', tolerance: 3 },
                            { description: 'B.top == C.top', left: 'b.top', op: '==', right: 'c.top', tolerance: 3 },
                        ],
                    },
                    {
                        // Horizontal order plus the gutter: A is to the left of B, and there is ROOM (the md gap > 0)
                        // between A's right edge and B's left edge → a proportional relation.
                        description: 'gutter creates horizontal space between adjacent columns',
                        parent: 'section:not([hidden]) [data-test="row"]',
                        children: {
                            a: 'section:not([hidden]) [data-test="col-a"]',
                            b: 'section:not([hidden]) [data-test="col-b"]',
                            c: 'section:not([hidden]) [data-test="col-c"]',
                        },
                        relations: [
                            // gutter > 0: B starts strictly AFTER A ends, and likewise C after B.
                            { description: 'B.left > A.right (gutter md > 0)', left: 'b.left', op: '>', right: 'a.right' },
                            { description: 'C.left > B.right (gutter md > 0)', left: 'c.left', op: '>', right: 'b.right' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // pdx-row and pdx-col are pure LAYOUT containers: no role, no aria, no interactive
    // control, and static text content → no WCAG violation is expected.
    // No disableRules: there is no known false positive.
    a11y: {
        scenarios: ['row-cols'],
    },

    // ── Dim. 3: style isolation ──
    // The target is the row host: the width is the clean structural invariant (it follows the 600px wrapper,
    // with max-width:100% from .pdx-row-wc). skipHeight: the row's height is CONTENT-DRIVEN (the sum
    // of the columns' content, sensitive to the host font and line-height injected by the hostile CSS) →
    // not a clean geometric invariant across platforms (as for card and toolbar). The width stays
    // asserted as the immunity guarantee. The row has no border or radius of its own (an inline display plus gap).
    isolation: {
        scenario: 'row-cols',
        targets: [
            { selector: 'section:not([hidden]) [data-test="row"]', tolerancePx: 10, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'borderTopColor'] }] },
        ],
    },

    // ── Dim. 4: keyboard ──
    // Pattern 'none': pdx-row and pdx-col are layout containers, NOT interactive components
    // (no keydown handler, no tabindex, no role in the source). There is nothing to test
    // from the keyboard: the focus depends on the projected content, not on the row or the column.
    keyboard: {
        scenario: 'row-cols',
    },

    // ── Dim. 5: visual regression (Docker) ──
    // One scenario: the 3-column layout with its gutter (what the maths does not catch:
    // how the gap and the alignment render per theme).
    visual: {
        scenarios: ['row-cols'],
    },
};

export default row;
