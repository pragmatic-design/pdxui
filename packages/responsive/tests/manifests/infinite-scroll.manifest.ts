/**
 * MANIFEST — pdx-infinite-scroll (Tier 5B — data/utility container)
 *
 * Contracts written by inspecting:
 *  - source: packages/ui/src/infinite-scroll/pdx-infinite-scroll.ts
 *      Light DOM, render: <slot></slot>. The content (the items) is slotted as direct
 *      children of the host <pdx-infinite-scroll>. On ctx.track's FIRST run, inside a
 *      requestAnimationFrame, the setup builds the internal structure ONCE (_built):
 *        1. it adds .pdx-infinite-scroll-root ON THE HOST (ctx.el);
 *        2. it APPENDS to the host (after the slotted items), in this order:
 *             <div class="pdx-infinite-scroll-sentinel" aria-hidden="true">   (height:1px)
 *             <div class="pdx-infinite-scroll-loading" role="status" aria-live="polite"
 *                  style="display:none">  → <pdx-spinner size="sm"> + <span class="pdx-infinite-scroll-text">
 *             <div class="pdx-infinite-scroll-end" role="status" style="display:none">
 *        3. it creates an IntersectionObserver on the sentinel (root = the first scrollable ancestor)
 *           which calls loadMore() when the sentinel enters the viewport.
 *      loadMore() emits `pdx-load-more` (unless disabled, loading or atEnd).
 *      Props: source(DataSource)=null, threshold=200, disabled=false, loading=false,
 *             endMessage='No more data', loadingMessage='Loading...', showEndMessage=true.
 *      The indicators' visibility (re-evaluated in an rAF on every track run):
 *        the loading element → display='' ONLY when isCurrentlyLoading() (ctx.loading() OR ds.isLoading());
 *        the end element     → display='' ONLY when atEnd && showEndMessage; atEnd = ds && !ds.hasMore().
 *
 *  - CSS: packages/design/src/components/infinite-scroll.css
 *      .pdx-infinite-scroll-root     { position:relative; display:block }
 *      .pdx-infinite-scroll-sentinel { height:1px; pointer-events:none }
 *      .pdx-infinite-scroll-loading  { display:flex; align-items/justify:center; gap; padding }
 *      .pdx-infinite-scroll-text     { color:muted; font-size:sm }
 *      .pdx-infinite-scroll-end      { text-align:center; padding; color:muted; border-top dashed }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM — how the scenario is made stable and measurable:
 *
 *  • THE IDLE STATE, no DataSource: the scenario passes static slotted items ONLY and NO
 *    `source`. With source=null and loading=false:
 *        - isCurrentlyLoading() = false  → the loading element stays display:none (the ANIMATED
 *          <pdx-spinner> is NOT rendered or visible → no animation, no
 *          flakiness, no mask needed);
 *        - resolveDS() = null → isAtEnd() = false → the end element stays display:none.
 *    So at rest what is VISIBLE is only: the slotted items (a fixed inline height) plus the
 *    sentinel (height:1px). Fully deterministic geometry.
 *
 *  • NO SCROLL AND NO LOAD in the test: the host is NOT inside a scrollable ancestor (the
 *    IntersectionObserver's root = null → the viewport) and the content is short, but to be safe nothing
 *    scrolls and nothing is hovered: at rest the sentinel must NOT trigger loadMore. And even if
 *    the observer marked the sentinel as intersecting, loadMore() is a no-op without a DataSource
 *    (ds null → no ds.loadMore; it only emits the event, which does not change the DOM). The state
 *    stays idle → repeatable measurements.
 *
 *  • FIXED CONTENT: items with an explicit inline height (44px) and static text → the host's
 *    content-driven height does not depend on theme-specific fonts or line-heights at the thresholds used.
 *
 *  • rAF: the whole internal structure (the host class, the sentinel, the indicators) is applied in a
 *    requestAnimationFrame → the runners wait (the measure helper uses networkidle plus a
 *    waitForTimeout). The assertions point at the real classes created there.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * MEASUREMENT CHOICES:
 *  - UNIVERSAL RULES, no theme-specific px. The host is a content-driven display:block →
 *    what is asserted is display=block, a height >= a low threshold (it holds the items), and a non-negative
 *    radius and border (the base CSS has neither, but a theme may add them).
 *  - THE SENTINEL: the primitive that characterises the component. It is .pdx-infinite-scroll-sentinel, height:1px,
 *    aria-hidden, pointer-events:none. What is asserted is that it exists, that it is short (height <= 4: 1px plus
 *    a sub-pixel tolerance) and that it does NOT catch the pointer (pointer-events:none) — invariants
 *    that hold across themes. It is the only idle marker "of the component" that is always there.
 *  - LOADING and END at rest: display:none → 0×0, NOT measurable as boxes. They are not asserted
 *    here (the rules would be degenerate). Their semantics (role=status) and the aria-busy bug are covered
 *    in the a11y section and in REAL BUGS, not as geometric contracts.
 *  - COMPOSITION: the slotted items are stacked vertically and contained horizontally
 *    in the host's box (the root); the sentinel sits UNDER the last item (appended at the end). That proves
 *    the component wraps the content without clipping it and puts the trigger at the bottom.
 *
 * ACCESSIBILITY: at rest (idle) there is NO visible indicator → no violation is expected.
 *   The slotted items carry their own semantics (text). axe scans the idle scenario;
 *   no disableRules. The note on what happens while loading is in REAL BUGS below.
 *
 * KEYBOARD: there is no keydown handler in the source; the loading is automatic, through the
 *   IntersectionObserver on the native scroll. The component is not a focusable interactive
 *   widget. pattern 'none', no focus step asserted.
 *
 * ISOLATION: a content-driven host (its height is the sum of the items, sensitive to the host's line-height
 *   under hostile CSS) → skipHeight, as for list, card and scroll-area. The radius and the border stay asserted
 *   as the guarantee of geometric immunity.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REAL BUGS found in the source (NOT fixed here — only written down):
 *
 *  [B1] Accessibility — `aria-busy` is never set while loading.
 *       packages/ui/src/infinite-scroll/pdx-infinite-scroll.ts:154-159
 *       When isCurrentlyLoading() turns true, the setup only shows the loading element
 *       (display=''). It NEVER sets aria-busy="true" on a container (the host, or the results
 *       region) for the duration of the load, and never removes it afterwards. WAI-ARIA: a
 *       region whose content is updated or loaded dynamically should expose
 *       aria-busy="true" while it loads, so assistive technology does not announce partial content.
 *       The loading element does carry role="status" + aria-live="polite" (it announces the "Loading…" text),
 *       but the aria-busy flag on the busy container is missing.
 *       The suggested FIX (in the update rAF, beside the _loadingEl.style.display toggle):
 *         ctx.el.setAttribute('aria-busy', currentlyLoading ? 'true' : 'false');
 *       → It is not asserted as an invariant (the loading state is not in the scenario, for determinism,
 *         see above: the spinner is animated); written down here.
 *
 *  [B2] (minor) Accessibility — the sentinel is `aria-hidden="true"` on an empty, non-focusable div.
 *       packages/ui/src/infinite-scroll/pdx-infinite-scroll.ts:96
 *       Harmless (the div has no content and no focusable descendant), so it is NOT a defect
 *       axe reports; noted for completeness only. No fix needed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { ComponentManifest } from './_types';

// Static items, a fixed inline height (44px) → deterministic content-driven geometry,
// independent of the theme's font and line-height at the thresholds used.
const ITEMS = `
    <div data-test="is-items" style="display:flex; flex-direction:column;">
        <div class="is-item" data-test="is-item-0" style="height:44px;">Item 1</div>
        <div class="is-item" style="height:44px;">Item 2</div>
        <div class="is-item" style="height:44px;">Item 3</div>
        <div class="is-item" data-test="is-item-last" style="height:44px;">Item 4</div>
    </div>`;

export const infiniteScroll: ComponentManifest = {
    name: 'infinite-scroll',
    tag: 'pdx-infinite-scroll',
    tier: '5B',
    status: 'wip',
    imports: ['@pdxui/ui/infinite-scroll'],

    // ── Scenarios ──
    // The IDLE state: static items and no `source` → no visible indicator (loading and end
    // stay display:none), only the idle sentinel at the end. A fixed-width wrapper (480px)
    // makes the horizontal containment deterministic. NOT scrollable (no overflow
    // on the wrapper) → the sentinel triggers no load (and loadMore is a no-op without a DataSource anyway).
    scenarios: [
        {
            id: 'infinite-scroll-idle',
            title: 'InfiniteScroll — Idle (slotted items, sentinel at end, no loading)',
            html: `
                <div style="width: 480px;">
                    <pdx-infinite-scroll data-test="infinite-scroll">
                        ${ITEMS}
                    </pdx-infinite-scroll>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal) ──
    contracts: {
        scenarios: {
            'infinite-scroll-idle': {
                standalone: [
                    {
                        // Host: .pdx-infinite-scroll-root → display:block (post-rAF).
                        selector: 'section:not([hidden]) [data-test="infinite-scroll"]',
                        description: 'infinite-scroll host is a block container',
                        display: { op: 'is', value: 'block' },
                    },
                    {
                        // A content-driven host: tall enough to hold the items (4×44 = 176px).
                        selector: 'section:not([hidden]) [data-test="infinite-scroll"]',
                        description: 'infinite-scroll host wraps the slotted items (content-driven height)',
                        height: { op: '>=', value: 120 },
                    },
                    {
                        // The host: a non-negative radius (it has none of its own; a theme may add one).
                        selector: 'section:not([hidden]) [data-test="infinite-scroll"]',
                        description: 'infinite-scroll host has non-negative border radius',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        // The host: a non-negative border width.
                        selector: 'section:not([hidden]) [data-test="infinite-scroll"]',
                        description: 'infinite-scroll host border width is non-negative',
                        border: { all: { width: { op: '>=', value: 0 } } },
                    },
                    {
                        // Sentinel: the defining primitive, always there at rest. It stays short (1px).
                        selector: 'section:not([hidden]) [data-test="infinite-scroll"] .pdx-infinite-scroll-sentinel',
                        description: 'sentinel is a thin trigger element (does not occupy visible space)',
                        height: { op: '<=', value: 4 },
                    },
                    {
                        // The sentinel: it does not catch the pointer (pointer-events:none) → it does not block clicks on the items.
                        selector: 'section:not([hidden]) [data-test="infinite-scroll"] .pdx-infinite-scroll-sentinel',
                        description: 'sentinel does not capture pointer events',
                        pointerEvents: { op: 'is', value: 'none' },
                    },
                ],
                // Composition: the slotted items are stacked and contained horizontally in the host's
                // box; the sentinel is appended AFTER the last item (the trigger at the bottom).
                composition: [
                    {
                        description: 'slotted items are stacked and contained in the host, sentinel sits after the last item',
                        parent: 'section:not([hidden]) [data-test="infinite-scroll"]',
                        children: {
                            host: 'section:not([hidden]) [data-test="infinite-scroll"]',
                            first: 'section:not([hidden]) [data-test="is-item-0"]',
                            last: 'section:not([hidden]) [data-test="is-item-last"]',
                            sentinel: 'section:not([hidden]) [data-test="infinite-scroll"] .pdx-infinite-scroll-sentinel',
                        },
                        relations: [
                            {
                                description: 'first item is contained within the host box',
                                left: 'first',
                                op: 'contained-in',
                                right: 'host',
                            },
                            {
                                description: 'first item right edge does not overflow the host right edge',
                                left: 'first.right',
                                op: '<=',
                                right: 'host.right',
                                tolerance: 1,
                            },
                            {
                                description: 'first item sits above the last item (vertical stacking)',
                                left: 'first.bottom',
                                op: '<=',
                                right: 'last.bottom',
                                tolerance: 1,
                            },
                            {
                                description: 'sentinel sits at/after the last item (trigger placed at the end)',
                                left: 'sentinel.top',
                                op: '>=',
                                right: 'last.top',
                                tolerance: 1,
                            },
                            {
                                description: 'sentinel stays within the host box',
                                left: 'sentinel.bottom',
                                op: '<=',
                                right: 'host.bottom',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // The idle scenario: no visible indicator, only text items. The component introduces
    // no role or aria of its own that is visible at rest (the sentinel is aria-hidden). No
    // disableRules. The missing aria-busy while loading is REAL BUG [B1].
    a11y: {
        scenarios: ['infinite-scroll-idle'],
    },

    // ── Dim. 3: style isolation ──
    // A content-driven host (height = the sum of the items, sensitive to the host line-height under
    // hostile CSS) → skipHeight, as for list, card and scroll-area. The radius and border stay asserted.
    isolation: {
        scenario: 'infinite-scroll-idle',
        targets: [
            { selector: 'section:not([hidden]) [data-test="infinite-scroll"]', tolerancePx: 12, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'borderTopColor'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // No keydown handler; the loading is automatic, through the IntersectionObserver. It is not a
    // focusable interactive widget → pattern 'none', with no focus step asserted.
    keyboard: {
        scenario: 'infinite-scroll-idle',
    },

    // ── Dim. 5: visual regression (Docker) ──
    // One scenario: the idle state (the items plus the sentinel, no indicator). Deterministic,
    // with no animated spinner visible → no mask needed.
    visual: {
        scenarios: ['infinite-scroll-idle'],
    },
};

export default infiniteScroll;
