/**
 * MANIFEST — pdx-pagination
 *
 * Contracts written by inspecting the source (packages/ui/src/pagination/pdx-pagination.ts)
 * and the CSS (packages/design/src/components/pagination.css).
 *
 * DOM structure (host vs inner):
 *   - The host <pdx-pagination> → `display: block` (CSS), with no class applied to the host.
 *   - The custom element builds an INNER box imperatively (rebuild(), in an rAF):
 *       <nav class="pdx-pagination" role="navigation" aria-label="Pagination"> (display:flex, gap).
 *     The contracts on the nav's and the buttons' geometry must be scoped INSIDE the host.
 *   - The prev/next/first/last/number buttons: <button class="pdx-page" type="button"> (NOT the host).
 *       · display: inline-flex, min-width/min-height 2.75rem, cursor pointer, radius md.
 *       · prev/next are disabled on page 1 and on the last one → a native <button disabled> with
 *         `opacity: var(--pdx-opacity-disabled)` + cursor not-allowed (NO aria-disabled,
 *         is a native <button disabled> → fine for a11y).
 *   - The active page: its button gets the class `.pdx-page-active` plus the attribute `aria-current="page"`;
 *     the filled style (a primary background) is applied through the `.pdx-page[aria-current="page"]` selector.
 *
 * A NOTE on the asynchronous build: the nav is built in a requestAnimationFrame after the mount.
 *   The scenario pins `total`/`page-size`/`page` through props, so the build is deterministic.
 *   With total=50 and page-size=10 → 5 pages (<=7 → no ellipsis, every number visible).
 *   page=1 → prev and first are DISABLED (for the standalone opacity contract).
 *
 * CONSERVATIVE contracts (no exact px, valid on every theme):
 *   - nav display flex; button cursor pointer; radius >= 0 (metro/cyberpunk zero it).
 *   - "the same height" and "the same row" are universal geometric invariants.
 *   - the disabled button (prev on page 1): opacity < 1 → a STANDALONE rule
 *     (the disabled state is already in the markup, through page=1, NOT a reactive runtime trigger).
 */
import type { ComponentManifest } from './_types';

export const pagination: ComponentManifest = {
    name: 'pagination',
    tag: 'pdx-pagination',
    tier: '6',
    status: 'wip',
    imports: ['@pdxui/ui/pagination'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'pagination-basic',
            title: 'Pagination — 5 pages, on page 1',
            // total=50 / page-size=10 → 5 pages (no ellipsis). page=1 → prev/first disabled.
            html: `
                <pdx-pagination data-test="pg" total="50" page-size="10" page="1"></pdx-pagination>`,
        },
        {
            id: 'pagination-narrow',
            title: 'Pagination — in a box narrower than its row',
            // ~300px of controls in 220px: a phone-width data-grid footer. Without flex-wrap the row
            // runs past the edge, where overflow-x: clip makes it unreachable.
            html: `
                <div data-test="pg-box" style="width: 220px">
                    <pdx-pagination data-test="pg" total="50" page-size="10" page="3"></pdx-pagination>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'pagination-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="pg"] .pdx-pagination',
                        description: 'pagination nav renders as flex row',
                        display: { op: 'is', value: 'flex' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="pg"] .pdx-page[aria-current="page"]',
                        description: 'active page button is interactive (cursor pointer)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="pg"] .pdx-page[aria-current="page"]',
                        description: 'page button has non-negative radius (metro/cyberpunk may zero it)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        // prev on page 1 = a native <button disabled> → a reduced opacity.
                        // A state ALREADY in the markup (page=1), so a standalone rule (no reactive trigger).
                        selector: 'section:not([hidden]) [data-test="pg"] .pdx-page[aria-label="Previous page"]',
                        description: 'disabled prev button has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="pg"] .pdx-page[aria-label="Previous page"]',
                        description: 'disabled prev button shows not-allowed cursor',
                        cursor: { op: 'is', value: 'not-allowed' },
                    },
                ],
                // A composition's children are looked up in the document, not inside `parent`: they must be
                // scoped to the scenario. Written relative (`.pdx-page[…]`), they first find the
                // pager of a data-grid in a hidden section of the same tier-6 page (0×0).
                composition: [
                    {
                        // The page buttons must share the same height (a row of controls).
                        description: 'page buttons share the same height',
                        parent: 'section:not([hidden]) [data-test="pg"] .pdx-pagination',
                        children: {
                            prev: 'section:not([hidden]) [data-test="pg"] .pdx-page[aria-label="Previous page"]',
                            active: 'section:not([hidden]) [data-test="pg"] .pdx-page[aria-current="page"]',
                            next: 'section:not([hidden]) [data-test="pg"] .pdx-page[aria-label="Next page"]',
                        },
                        relations: [
                            { description: 'prev == active height', left: 'prev.height', op: '==', right: 'active.height', tolerance: 1 },
                            { description: 'active == next height', left: 'active.height', op: '==', right: 'next.height', tolerance: 1 },
                        ],
                    },
                    {
                        // Aligned on the same row: the same top.
                        description: 'page buttons are aligned on the same row (same top)',
                        parent: 'section:not([hidden]) [data-test="pg"] .pdx-pagination',
                        children: {
                            prev: 'section:not([hidden]) [data-test="pg"] .pdx-page[aria-label="Previous page"]',
                            next: 'section:not([hidden]) [data-test="pg"] .pdx-page[aria-label="Next page"]',
                        },
                        relations: [
                            { description: 'prev.top == next.top', left: 'prev.top', op: '==', right: 'next.top', tolerance: 2 },
                        ],
                    },
                    {
                        // The active page is styled differently: a filled background → full opacity, against the disabled prev.
                        description: 'active page is more opaque than disabled prev (different state)',
                        parent: 'section:not([hidden]) [data-test="pg"] .pdx-pagination',
                        children: {
                            prev: 'section:not([hidden]) [data-test="pg"] .pdx-page[aria-label="Previous page"]',
                            active: 'section:not([hidden]) [data-test="pg"] .pdx-page[aria-current="page"]',
                        },
                        relations: [
                            { description: 'active.opacity > prev.opacity', left: 'active.opacity', op: '>', right: 'prev.opacity' },
                        ],
                    },
                ],
            },
            'pagination-narrow': {
                composition: [
                    {
                        // Numeric edges, not `contained-in`: the runner's contained-in compares the
                        // resolved values only when they are numbers, and two bare names are not.
                        description: 'the pagination wraps inside a box narrower than its row',
                        parent: 'section:not([hidden]) [data-test="pg-box"]',
                        children: {
                            box: 'section:not([hidden]) [data-test="pg-box"]',
                            nav: 'section:not([hidden]) [data-test="pg"] .pdx-pagination',
                            next: 'section:not([hidden]) [data-test="pg"] .pdx-page[aria-label="Next page"]',
                        },
                        relations: [
                            { description: 'nav right edge within the box', left: 'nav.right', op: '<=', right: 'box.right' },
                            { description: 'next button right edge within the box', left: 'next.right', op: '<=', right: 'box.right' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        // <nav role="navigation" aria-label="Pagination">; the buttons have aria-labels (prev/next/first/last)
        // and text for the numbers; the active page has aria-current="page". WCAG clean.
        scenarios: ['pagination-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'pagination-basic',
        targets: [
            // The page button keeps its min-height even under hostile global CSS.
            { selector: 'section:not([hidden]) [data-test="pg"] .pdx-page[aria-current="page"]', tolerancePx: 10, leaks: [{ issue: 170, properties: ['letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // The buttons are native <button>s → natively tabbable. No roving pattern.
    keyboard: {
        scenario: 'pagination-basic',
        steps: [
            { key: 'Tab', expectFocusWithin: 'section:not([hidden]) [data-test="pg"]' },
            { key: 'Tab', expectFocusWithin: 'section:not([hidden]) [data-test="pg"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['pagination-basic'],
        // The one focus baseline that gates the focus-width token directly: `.pdx-page:focus-visible`
        // draws a real `outline: var(--pdx-focus-width) solid`, with no component override — unlike
        // the button, whose ring is a box-shadow. Change that token by a pixel and this screenshot
        // moves.
        //
        // `[aria-current]` on purpose: at page 1 the "previous" control is disabled, and a disabled
        // control cannot take focus — the current page always can.
        focus: [{ scenario: 'pagination-basic', selector: 'section:not([hidden]) .pdx-page[aria-current]' }],
    },
};

export default pagination;
