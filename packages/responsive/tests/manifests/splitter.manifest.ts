/**
 * MANIFEST — pdx-splitter
 *
 * Contracts DERIVED by inspecting the source and the CSS (they are NOT in universal.ts):
 *
 *   - Source: packages/ui/src/splitter/pdx-splitter.ts
 *       · render() = <slot></slot>: the children (the panes) are projected as direct children
 *         of the HOST <pdx-splitter> (light DOM). There is NO extra wrapper.
 *       · The build happens in `requestAnimationFrame(() => initPanes())` inside ctx.track
 *         (pdx-splitter.ts:284-292). So the handles and the classes do NOT exist on the first tick:
 *         the scenario needs a `setup` that waits 2 rAFs before the measurement.
 *       · initPanes (pdx-splitter.ts:66) needs >= 2 children (count < 2 → it returns, and nothing is built).
 *       · On the host: the classes `.pdx-splitter` + `.pdx-splitter-<orientation>` (line 103).
 *       · On every pane child: the class `.pdx-splitter-pane` plus the attribute `data-pane-index` (lines 110-111).
 *         The panes get an inline `flex-basis: calc(N% - their share of the gutters)`, `flex-grow:0`, `flex-shrink:0` (applySizes).
 *       · Between the panes (never after the last) a <div class="pdx-splitter-handle"> is inserted
 *         with: role="separator", tabindex="0", aria-orientation=<orientation>,
 *         aria-valuenow=<round(size)>, data-handle-index (lines 116-122).
 *         Inline cursor: `col-resize` (horizontal) o `row-resize` (vertical); an inline width or
 *         height = gutterSize (6px by default) (lines 124-130).
 *       · The keyboard on the handle (keydown, line 167): horizontal ArrowLeft/ArrowRight, vertical
 *         ArrowUp/ArrowDown resize (the step is keyboardStep, 2% by default); Home → the left pane's max,
 *         End → its min. aria-valuenow is updated ONLY during a drag (line 268),
 *         NOT in the keydown (see BUG #2). The events emitted: pdx-resize, pdx-resize-start, pdx-resize-end.
 *
 *   - CSS: packages/design/src/components/splitter.css
 *       · `pdx-splitter { display:block }` (host element default).
 *       · `.pdx-splitter { display:flex; width:100%; height:100%; overflow:hidden }`.
 *       · `.pdx-splitter-horizontal { flex-direction:row }`, `.pdx-splitter-vertical { flex-direction:column }`.
 *       · `.pdx-splitter-pane { overflow:auto; position:relative; min-width:0; min-height:0 }`.
 *       · `.pdx-splitter-handle { flex-shrink:0; display:flex; align-items:center; justify-content:center;
 *         background: var(--pdx-color-border); user-select:none; touch-action:none }`. The col-resize
 *         and row-resize cursor is INLINE from the JS, not in the CSS. No border-radius is declared on the
 *         handle (0 by default) → radius >= 0 is the conservative invariant across themes.
 *       · `.pdx-splitter-handle:focus-visible { outline: 2px solid primary }` (focus visibile).
 *       · The `::after` dot indicator (2x20px horizontal / 20x2px vertical) — decorative, not measured.
 *
 *   ⚠ REAL BUGS (written down, NOT fixed — see the report):
 *
 *   BUG #1 — a focusable separator WITHOUT aria-valuemin / aria-valuemax.
 *     The handle has role="separator" + tabindex="0" + aria-valuenow (pdx-splitter.ts:118-121) but
 *     it sets neither aria-valuemin nor aria-valuemax. The WAI-ARIA "Window Splitter" pattern
 *     (separator focalizzabile e ridimensionabile) richiede aria-valuenow + aria-valuemin +
 *     aria-valuemax. Without a min and a max, the current value cannot be interpreted by assistive technology.
 *     The suggested fix: pdx-splitter.ts:121 — after aria-valuenow, add
 *       handle.setAttribute('aria-valuemin', String(paneConfigs[idx]?.min ?? 5));
 *       handle.setAttribute('aria-valuemax', String(paneConfigs[idx]?.max ?? 95));
 *     This manifest asserts aria-valuenow (which is there) and does NOT assert the min and max (which are not):
 *     when the bug is fixed, add an expectAttr or a standalone rule on valuemin and valuemax.
 *
 *   BUG #2 — aria-valuenow is NOT updated on a keyboard resize.
 *     In a drag (pointermove) the handle calls handle.setAttribute('aria-valuenow', ...) (pdx-splitter.ts:268),
 *     but the keydown branch (lines 167-210) updates _sizes, applySizes and the emit, and NEVER aria-valuenow.
 *     Pressing ArrowRight or ArrowLeft resizes the pane visibly, but the ARIA value stays
 *     put → assistive technology is out of step with the real state.
 *     A suggested fix: pdx-splitter.ts:204 (the `if (changed)` branch) — add
 *       handle.setAttribute('aria-valuenow', String(Math.round(currentSizes[idx])));
 *     THAT is why the keyboard step below is checked with `expectGeometryChange` on the pane
 *     (the resize really happens) and NOT with `expectAttr` on aria-valuenow (which would stay
 *     put → the test would fail because of the bug). Noted as an improvement blocked by the bug.
 *
 *   BUG #3 — a focusable separator with no accessible name.
 *     The handle has no aria-label and no aria-labelledby. An element with role="separator" + tabindex="0"
 *     should expose a name ("Resize panels"). axe may not flag it as a hard error
 *     (a separator is not universally name-required), so no rule is disabled: if axe
 *     reports a finding we treat it as real.
 *     Fix suggerito: pdx-splitter.ts:118 — handle.setAttribute('aria-label', 'Resize panels');
 *
 * CONSERVATIVE contracts, true on all 13 themes: NO theme-specific px.
 *   - host display flex; the orientation through flex-direction (row/column), verified geometrically
 *     (panes side by side when horizontal, stacked when vertical), rather than reading flex-direction.
 *   - handle cursor col-resize/row-resize (inline, from the JS → invariant across themes).
 *   - the handle's radius >= 0 (none is declared → 0 in every theme, conservatively).
 *   - composition: pane1 to the left of the handle, the handle to the left of pane2 (horizontal);
 *     the panes share a height (a row, with an implicit align stretch) and are contained in the parent.
 *
 * A SCENARIO REQUIREMENT: the .pdx-splitter host is `height:100%/width:100%` → it needs an explicitly
 *   sized WRAPPER (width 600px, height 300px) or it collapses to 0. So the parent is
 *   "parent-driven": the isolation skips the height (skipHeight), because the container's geometry
 *   depends on the host wrapper, not on an internal invariant of the component.
 */
import type { ComponentManifest } from './_types';

// A double rAF: initPanes runs in one rAF inside ctx.track; we wait 2 frames + a microtask
// to be sure the handles, the classes and the flex-basis are applied before the measurement.
const WAIT_BUILT = `
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
`;

export const splitter: ComponentManifest = {
    name: 'splitter',
    tag: 'pdx-splitter',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/splitter'],

    // ── Scenarios ──
    // Two panes plus (the handle the JS inserts between them) inside a sized wrapper.
    // The wrapper gives the .pdx-splitter (width/height 100%) a concrete box to fill.
    scenarios: [
        {
            id: 'splitter-horizontal',
            title: 'Splitter — horizontal (side-by-side panes + handle)',
            html: `
                <div style="width: 600px; height: 300px;">
                    <pdx-splitter data-test="splitter" orientation="horizontal"
                        panes='[{"defaultSize":50},{"defaultSize":50}]'>
                        <div data-test="pane-1" style="padding: 8px;">Left pane</div>
                        <div data-test="pane-2" style="padding: 8px;">Right pane</div>
                    </pdx-splitter>
                </div>`,
            setup: WAIT_BUILT,
        },
        {
            id: 'splitter-vertical',
            title: 'Splitter — vertical (stacked panes + handle)',
            html: `
                <div style="width: 600px; height: 300px;">
                    <pdx-splitter data-test="splitter-v" orientation="vertical"
                        panes='[{"defaultSize":50},{"defaultSize":50}]'>
                        <div data-test="vpane-1" style="padding: 8px;">Top pane</div>
                        <div data-test="vpane-2" style="padding: 8px;">Bottom pane</div>
                    </pdx-splitter>
                </div>`,
            setup: WAIT_BUILT,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'splitter-horizontal': {
                standalone: [
                    {
                        // The host gets .pdx-splitter → display flex.
                        selector: 'section:not([hidden]) [data-test="splitter"]',
                        description: 'splitter host renders as flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // The host fills the 600x300 wrapper → a noticeable height.
                        selector: 'section:not([hidden]) [data-test="splitter"]',
                        description: 'splitter host has a measurable height (fills sized wrapper)',
                        height: { op: '>=', value: 100 },
                    },
                    {
// Handle: cursor col-resize (inline, from the JS, invariant across themes).
                        selector: 'section:not([hidden]) [data-test="splitter"] .pdx-splitter-handle',
                        description: 'horizontal handle uses col-resize cursor',
                        cursor: { op: 'is', value: 'col-resize' },
                    },
                    {
                        // The handle: no radius is declared → 0 in every theme (conservatively).
                        selector: 'section:not([hidden]) [data-test="splitter"] .pdx-splitter-handle',
                        description: 'handle has non-negative border radius',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        // The handle is visible as a strip: it has a measurable width (gutterSize, 6px by default, > 0).
                        selector: 'section:not([hidden]) [data-test="splitter"] .pdx-splitter-handle',
                        description: 'horizontal handle has a measurable width',
                        width: { op: '>', value: 0 },
                    },
                ],
                composition: [
                    {
                        // The panes and the handle are CONTAINED in the host and ordered in a row:
                        // pane1 .right <= handle .left <= pane2 .left (left-to-right).
                        description: 'horizontal: pane1 | handle | pane2 ordered left-to-right and contained',
                        parent: 'section:not([hidden]) [data-test="splitter"]',
                        children: {
                            host: 'section:not([hidden]) [data-test="splitter"]',
                            pane1: 'section:not([hidden]) [data-test="pane-1"]',
                            handle: 'section:not([hidden]) [data-test="splitter"] .pdx-splitter-handle',
                            pane2: 'section:not([hidden]) [data-test="pane-2"]',
                        },
                        relations: [
                            { description: 'pane1 contained in host', left: 'pane1', op: 'contained-in', right: 'host' },
                            { description: 'pane2 contained in host', left: 'pane2', op: 'contained-in', right: 'host' },
                            { description: 'handle contained in host', left: 'handle', op: 'contained-in', right: 'host' },
                            { description: 'pane1.right <= handle.left (pane1 left of handle)', left: 'pane1.right', op: '<=', right: 'handle.left', tolerance: 2 },
                            { description: 'handle.right <= pane2.left (handle left of pane2)', left: 'handle.right', op: '<=', right: 'pane2.left', tolerance: 2 },
                        ],
                    },
                    {
                        // The two panes and the handle share the same height (a row, stretched vertically).
                        description: 'horizontal: panes and handle share the same height',
                        parent: 'section:not([hidden]) [data-test="splitter"]',
                        children: {
                            pane1: 'section:not([hidden]) [data-test="pane-1"]',
                            pane2: 'section:not([hidden]) [data-test="pane-2"]',
                            handle: 'section:not([hidden]) [data-test="splitter"] .pdx-splitter-handle',
                        },
                        relations: [
                            { description: 'pane1.height == pane2.height', left: 'pane1.height', op: '==', right: 'pane2.height', tolerance: 2 },
                            { description: 'handle.height == pane1.height (stretched to row height)', left: 'handle.height', op: '==', right: 'pane1.height', tolerance: 2 },
                            { description: 'pane1.top == pane2.top (same row)', left: 'pane1.top', op: '==', right: 'pane2.top', tolerance: 2 },
                        ],
                    },
                ],
            },
            'splitter-vertical': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="splitter-v"]',
                        description: 'vertical splitter host renders as flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // The handle: a row-resize cursor (inline from the JS) for the vertical orientation.
                        selector: 'section:not([hidden]) [data-test="splitter-v"] .pdx-splitter-handle',
                        description: 'vertical handle uses row-resize cursor',
                        cursor: { op: 'is', value: 'row-resize' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="splitter-v"] .pdx-splitter-handle',
                        description: 'vertical handle has a measurable height (gutter)',
                        height: { op: '>', value: 0 },
                    },
                ],
                composition: [
                    {
                        // Vertical: the panes are stacked. vpane1 above the handle, the handle above vpane2.
                        description: 'vertical: vpane1 / handle / vpane2 stacked top-to-bottom and contained',
                        parent: 'section:not([hidden]) [data-test="splitter-v"]',
                        children: {
                            host: 'section:not([hidden]) [data-test="splitter-v"]',
                            vpane1: 'section:not([hidden]) [data-test="vpane-1"]',
                            handle: 'section:not([hidden]) [data-test="splitter-v"] .pdx-splitter-handle',
                            vpane2: 'section:not([hidden]) [data-test="vpane-2"]',
                        },
                        relations: [
                            { description: 'vpane1 contained in host', left: 'vpane1', op: 'contained-in', right: 'host' },
                            { description: 'vpane2 contained in host', left: 'vpane2', op: 'contained-in', right: 'host' },
                            { description: 'vpane1.bottom <= handle.top (vpane1 above handle)', left: 'vpane1.bottom', op: '<=', right: 'handle.top', tolerance: 2 },
                            { description: 'handle.bottom <= vpane2.top (handle above vpane2)', left: 'handle.bottom', op: '<=', right: 'vpane2.top', tolerance: 2 },
                            { description: 'vpane1.left == vpane2.left (same column)', left: 'vpane1.left', op: '==', right: 'vpane2.left', tolerance: 2 },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // The handle has role="separator" + aria-orientation + aria-valuenow but lacks valuemin and valuemax
    // (BUG #1) and an accessible name (BUG #3). No rule is disabled: any axe finding is
    // real and points at the fix in the source, rather than being silenced here.
    a11y: {
        scenarios: ['splitter-horizontal', 'splitter-vertical'],
    },

    // ── Dim. 3: style isolation ──
    // The target is the handle (a stable geometric box: a fixed gutterSize, a token background).
    // skipHeight: the handle's height = the row's height = dictated by the host WRAPPER (600x300),
    // not by an internal invariant of the component → parent-driven. The width, radius and border stay
    // asserted as the guarantee of immunity to external style.
    isolation: {
        scenario: 'splitter-horizontal',
        targets: [
            { selector: 'section:not([hidden]) [data-test="splitter"] .pdx-splitter-handle', tolerancePx: 4, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'borderTopWidth', 'borderTopStyle', 'borderTopColor'] }] },
        ],
    },

    // ── Dim. 4: keyboard ──
    // The handle HAS role="separator" + tabindex="0" plus the arrows (the WAI-ARIA Window Splitter); the steps
    // are aimed at this single focusable separator:
    //   1. Tab → the focus enters the handle (a tabbable separator).
    //   2. ArrowRight (horizontal) → it resizes: the left pane CHANGES geometry.
    //      expectGeometryChange on pane-1 is used (the resize really happens) and NOT expectAttr on
    //      aria-valuenow, because the keydown does NOT update aria-valuenow (BUG #2): an assertion on
    //      aria-valuenow would fail because of the bug. When BUG #2 is fixed → add
    //      expectAttr { selector: handle, name: 'aria-valuenow', value: ... }.
    keyboard: {
        scenario: 'splitter-horizontal',
        // The handle (role=separator, tabindex=0) is focused directly through initialFocus: Tab is NOT
        // used (it would move the focus away from the handle). ArrowRight resizes → the pane
        // changes geometry (and aria-valuenow now updates too, the red→green fix of the keyboard bug).
        initialFocus: 'section:not([hidden]) [data-test="splitter"] .pdx-splitter-handle',
        steps: [
            { key: 'ArrowRight', expectGeometryChange: 'section:not([hidden]) [data-test="pane-1"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    // One scenario: horizontal shows the host, the handle and the two panes (the whole layout). The vertical one
    // is already covered by the maths (the stacked composition) → no redundant screenshot.
    visual: {
        scenarios: ['splitter-horizontal'],
    },
};

export default splitter;
