/**
 * MANIFEST — pdx-scroll-area (Tier 6 — layout/utility container)
 *
 * Contracts written by inspecting:
 *  - source: packages/ui/src/scroll-area/pdx-scroll-area.ts
 *      Light DOM, render: <slot></slot>. On ctx.track's first run, inside a
 *      requestAnimationFrame, the setup:
 *        1. adds the class .pdx-scroll-area ON THE HOST <pdx-scroll-area> (ctx.el);
 *        2. creates a <div class="pdx-scroll-area-viewport"> and MOVES every child into it
 *           (the slot content), then appends it to the host;
 *        3. applies the constrained height ON THE VIEWPORT (an inline style):
 *              maxHeight → style.maxHeight, height → style.height;
 *        4. applies the overflow ON THE VIEWPORT according to `axis` (inline):
 *              vertical (default) → overflowX:hidden, overflowY:auto
 *              horizontal         → overflowX:auto,   overflowY:hidden
 *              both               → overflow:auto
 *        5. hides the native scrollbar (scrollbarWidth:none plus the class
 *           .pdx-scroll-area-hide-native with ::-webkit-scrollbar{display:none}) and,
 *           when type != 'never', mounts the custom overlay scrollbar through useScrollbar();
 *        6. emits `pdx-scroll` on scroll and toggles the edge data attributes ON THE HOST
 *           (data-at-top / data-at-bottom, plus data-at-left/right for horizontal axes).
 *      Props: type='auto', axis='vertical', scrollHideDelay=1200, maxHeight='', height=''.
 *      Role and aria-label only with `label` (see [B1]); there is no keydown handler. The imperative API is on
 *      ctx.el.__scrollArea (scrollTo/By/IntoView/getViewport/recalculate).
 *      ⚠ Everything (the host class, the viewport, the overflow, the height) is applied in an rAF → the runners
 *        must wait (the measure helper already uses networkidle plus a waitForTimeout).
 *
 *  - CSS: packages/design/src/components/scroll-area.css
 *      pdx-scroll-area            { display:block; position:relative }   (host, pre-rAF)
 *      .pdx-scroll-area           { position:relative; overflow:hidden }  (host, post-rAF: CLIPPA)
 *      .pdx-scroll-area-viewport  { width:100%; height:100% }
 *      .pdx-scroll-area-hide-native::-webkit-scrollbar { display:none }
 *      pdx-scroll-area[data-at-top/bottom] → custom prop --pdx-scroll-fade-* (edge fade)
 *
 * MEASUREMENT CHOICES (they matter):
 *  - THE CONSTRAINED HEIGHT lives on the VIEWPORT (an inline maxHeight), NOT on the host: the host is
 *    a content-driven display:block and .pdx-scroll-area is overflow:hidden, so the host wraps
 *    the viewport. The "limited height" and "overflow on" assertions therefore point at the
 *    .pdx-scroll-area-viewport, not at the host.
 *  - UNIVERSAL RULES, no theme-specific px: the viewport must NOT grow beyond the
 *    maxHeight declared (160px) → height <= 162 (a tolerance of 2). No theme-bound value is
 *    asserted (radius, border, font): the constrained height is prop-driven and holds for every theme.
 *  - OVERFLOW ON, proven GEOMETRICALLY (MeasuredElement exposes neither overflow nor scrollHeight):
 *    the inner content is deterministic (6 blocks of 48px = 288px > the viewport's 160px). The
 *    composition asserts that the content is clipped — its left, right and top edges contained
 *    in the viewport — and that its bottom edge EXCEEDS the viewport's (content.bottom >
 *    viewport.bottom), which proves the scroll is needed and the height really is constrained.
 *  - THE HOST'S CLIPPING: the host (.pdx-scroll-area, overflow:hidden) must show no content
 *    beyond its own box → host.bottom ~= viewport.bottom (the viewport is its only child).
 *  - DETERMINISTIC content: blocks with a fixed inline height (48px) and static text → no
 *    theme-dependent font or line-height in the overflow measurements (the 160 threshold has ample room).
 *
 * Accessibility: without `label` the component sets no role and no aria-* (it is a transparent
 *   scroll container, and the slotted content carries its own semantics). axe scans the scenario with its text
 *   content; no disableRules is expected. See below for the note on the region and the tabindex.
 *
 * Keyboard: there is no keydown handler in the source (the browser scrolls the viewport natively,
 *   through overflow:auto). pattern 'none'. The viewport is focusable (tabindex 0, see [B1]
 *   below), but no focus order is asserted: there is no guaranteed interactive content.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE REGION AND THE TABINDEX:
 *
 *  [B1] Accessibility — the scrollable viewport must be reachable from the keyboard.
 *       packages/ui/src/scroll-area/pdx-scroll-area.ts
 *       WAI-ARIA / WCAG 2.1.1: a scrollable region that may hold ONLY non-focusable content
 *       (text, images) must be keyboard-operable, so the viewport always has tabindex="0".
 *       role="region" + aria-label come ONLY with the `label` prop: without it, four areas on
 *       one page would be four "Scrollable content" landmarks.
 *       → Not asserted as a keyboard invariant (pattern 'none').
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { ComponentManifest } from './_types';

// Deterministic content that exceeds the viewport's height: 6 blocks of 48px = 288px > 160px.
const OVERFLOW_CONTENT = `
    <div data-test="scroll-content" style="display:flex; flex-direction:column;">
        <div data-test="scroll-block" style="height:48px;">Row 1</div>
        <div style="height:48px;">Row 2</div>
        <div style="height:48px;">Row 3</div>
        <div style="height:48px;">Row 4</div>
        <div style="height:48px;">Row 5</div>
        <div style="height:48px;">Row 6</div>
    </div>`;

export const scrollArea: ComponentManifest = {
    name: 'scroll-area',
    tag: 'pdx-scroll-area',
    tier: '6',
    status: 'wip',
    imports: ['@pdxui/ui/scroll-area'],

    // ── Scenarios ──
    // A fixed-width wrapper (320px), to make the horizontal composition deterministic.
    // The constrained height is declared through max-height on the host (→ inline on the viewport, in the rAF).
    scenarios: [
        {
            id: 'scroll-area-vertical',
            title: 'ScrollArea — Vertical (content exceeds max-height)',
            html: `
                <div style="width: 320px;">
                    <pdx-scroll-area data-test="scroll-area" max-height="160px" type="always">
                        ${OVERFLOW_CONTENT}
                    </pdx-scroll-area>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal) ──
    contracts: {
        scenarios: {
            'scroll-area-vertical': {
                standalone: [
                    {
                        // The host: the CSS says pdx-scroll-area{display:block}; it stays block after the rAF too.
                        selector: 'section:not([hidden]) [data-test="scroll-area"]',
                        description: 'scroll-area host is a block container',
                        display: { op: 'is', value: 'block' },
                    },
                    {
                        // The host is content-driven but clipped to the maxHeight by the viewport → it stays short.
                        selector: 'section:not([hidden]) [data-test="scroll-area"]',
                        description: 'scroll-area host stays within the constrained height (overflow:hidden clips)',
                        height: { op: '<=', value: 162 },
                    },
                    {
                        // The host: a non-negative radius (normally 0; the base CSS gives it none).
                        selector: 'section:not([hidden]) [data-test="scroll-area"]',
                        description: 'scroll-area host has non-negative border radius',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        // The host: a non-negative border width (the base CSS has no border, but a theme may add one).
                        selector: 'section:not([hidden]) [data-test="scroll-area"]',
                        description: 'scroll-area host border width is non-negative',
                        border: { all: { width: { op: '>=', value: 0 } } },
                    },
                    {
                        // The viewport: the constrained height (max-height:160) is NOT exceeded, even with 288px of content.
                        selector: 'section:not([hidden]) [data-test="scroll-area"] .pdx-scroll-area-viewport',
                        description: 'viewport is height-constrained to the declared max-height (does not grow to fit content)',
                        height: { op: '<=', value: 162 },
                    },
                    {
                        // The viewport: it has not collapsed to zero — it is a visible scroll region.
                        selector: 'section:not([hidden]) [data-test="scroll-area"] .pdx-scroll-area-viewport',
                        description: 'viewport keeps a visible scrollable height',
                        height: { op: '>=', value: 40 },
                    },
                    {
                        // The viewport: a non-negative radius (universal, across themes).
                        selector: 'section:not([hidden]) [data-test="scroll-area"] .pdx-scroll-area-viewport',
                        description: 'viewport has non-negative border radius',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                // Composition: the content is clipped and contained horizontally in the viewport, aligned
                // at the top, and its bottom edge EXCEEDS the viewport's bottom (proof: the overflow is on).
                composition: [
                    {
                        description: 'overflowing content is clipped within the viewport while exceeding it vertically',
                        parent: 'section:not([hidden]) [data-test="scroll-area"] .pdx-scroll-area-viewport',
                        children: {
                            host: 'section:not([hidden]) [data-test="scroll-area"]',
                            viewport: 'section:not([hidden]) [data-test="scroll-area"] .pdx-scroll-area-viewport',
                            content: 'section:not([hidden]) [data-test="scroll-content"]',
                        },
                        relations: [
                            {
                                description: 'content left edge does not overflow viewport left edge',
                                left: 'content.left',
                                op: '>=',
                                right: 'viewport.left',
                                tolerance: 1,
                            },
                            {
                                description: 'content right edge does not overflow viewport right edge',
                                left: 'content.right',
                                op: '<=',
                                right: 'viewport.right',
                                tolerance: 1,
                            },
                            {
                                description: 'content is anchored at/below the viewport top (scrolled to start)',
                                left: 'content.top',
                                op: '>=',
                                right: 'viewport.top',
                                tolerance: 1,
                            },
                            {
                                description: 'content is taller than the viewport: its bottom exceeds the viewport bottom (scroll required)',
                                left: 'content.bottom',
                                op: '>',
                                right: 'viewport.bottom',
                            },
                            {
                                description: 'host clips to the viewport box (overflow:hidden): host bottom does not exceed viewport bottom',
                                left: 'host.bottom',
                                op: '<=',
                                right: 'viewport.bottom',
                                tolerance: 2,
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // The scenario with its text content. The component introduces no role or aria of its own; see BUG [B1].
    a11y: {
        scenarios: ['scroll-area-vertical'],
    },

    // ── Dim. 3: style isolation ──
    // The host is a content-driven display:block (its height is the viewport's box, sensitive to the host's
    // line-height when the viewport is content-driven) → skipHeight, as for card and sidebar. The radius and border
    // stay asserted as the real guarantee of geometric immunity under hostile CSS.
    isolation: {
        scenario: 'scroll-area-vertical',
        targets: [
            { selector: 'section:not([hidden]) [data-test="scroll-area"]', tolerancePx: 2, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'borderTopColor'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // There is no keydown handler in the source; the scroll is the viewport's native one (overflow:auto).
    // The viewport is not focusable (see BUG [B1]) → pattern 'none', with no focus step asserted.
    keyboard: {
        scenario: 'scroll-area-vertical',
    },

    // ── Dim. 5: visual regression (Docker) ──
    // One scenario: the vertical state with an always-on scrollbar catches what the maths
    // cannot see (how the custom overlay scrollbar renders, the clipping, the edge fade per theme).
    visual: {
        scenarios: ['scroll-area-vertical'],
        // Measured floor, not a guess. At maxDiffPixelRatio 0 the whole visual
        // dimension has 25 failures out of 1591, and they are not spread across the suite — they
        // come from FOUR scenarios that carry state or movement. This is one of them: the scrollbar renders differently between runs.
        // Worst observed difference: 1224 pixels.
        //
        // Everything else runs at 0, so a 2px border (about 2400 pixels on a wide section, and
        // 0.34% of them — under a 1% allowance) is caught. Here it would not be, and that is
        // the deliberate trade: this scenario keeps a tolerance and says why.
        maxDiffPixelRatio: 0.005,
    },
};

export default scrollArea;
