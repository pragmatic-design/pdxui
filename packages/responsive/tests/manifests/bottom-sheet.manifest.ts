/**
 * MANIFEST — pdx-bottom-sheet (Tier 2A, overlay)
 *
 * Contracts written by inspecting the source (packages/ui/src/bottom-sheet/pdx-bottom-sheet.ts) and the CSS
 * (packages/design/src/components/bottom-sheet.css).
 *
 * DOM structure (NOT portalled): the custom element <pdx-bottom-sheet> renders, inside its own host
 * (light DOM, ctx.el), TWO direct children:
 *   - <div class="pdx-bottom-sheet-backdrop">
 *   - <div class="pdx-bottom-sheet" role="dialog" aria-modal="true" :aria-label>
 * → the selectors stay scoped to `section:not([hidden]) [data-test="sheet"] [data-part=…]`: the parts
 * (#288) are `backdrop`, `root` (the sheet, class `.pdx-bottom-sheet`), `handle`, `header`, `close`,
 * `body`, `footer`.
 *
 * OPENING through the attribute: the scenario mounts the host with `open`. On open=true the custom element's
 * ctx.track() puts the host in :state(open) (#288) (visibility:visible, transform:translateY(0)) and calls snapTo(initialDetent),
 * setting an inline height in px. `assertOverlay` with `action:'call'` does NOT click: it settles (2 rAF) and measures.
 *
 * GEOMETRY: anchored at the BOTTOM.
 *  - Desktop (the test viewport is ≥641px): centred horizontally (left:50% + translateX(-50%)),
 *    max-width 640px, radius-xl top. Checked: hasBackdrop + centering:'horizontal' + standalone
 *    (opacity==1, radius>=0, maxWidth<=640) + composition bottom-flush.
 *  - We do NOT use centering 'both' (it is stuck to the bottom, not centred vertically).
 *  - height: snapTo sets an inline height in px (detent * vh); >= 100 is the conservative, robust form.
 *
 * A11Y: the panel is role="dialog" + aria-modal="true" + aria-label ("Filters" from the scenario, otherwise
 * "Bottom sheet" by default). The accessible name is there → no a11y bug found.
 * The handle is a role="slider" with tabindex=0, named "Sheet height", and aria-valuenow = the detent's index,
 * so the detents are not for the pointer only.
 */
import type { ComponentManifest } from './_types';

export const bottomSheet: ComponentManifest = {
    name: 'bottom-sheet',
    tag: 'pdx-bottom-sheet',
    tier: '2A',
    status: 'wip',
    imports: ['@pdxui/ui/bottom-sheet'],

    // ── Scenarios (the host mounted OPEN through the `open` attribute) ──
    scenarios: [
        {
            id: 'bottom-sheet-open',
            title: 'Bottom Sheet — Open',
            html: `
                <pdx-bottom-sheet data-test="sheet" open label="Filters">
                    <div slot="header" data-test="sheet-header">Filters</div>
                    <p>Bottom sheet body content.</p>
                    <button data-test="sheet-action" type="button">Apply</button>
                </pdx-bottom-sheet>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'bottom-sheet-open': {
                // Open is a custom state of the host (#288), what a theme selects; the sheet has no
                // attribute for it.
                states: [
                    {
                        description: 'open is the custom state :state(open), and the sheet is drawn from it',
                        selector: 'section:not([hidden]) [data-test="sheet"] [data-part="root"]',
                        trigger: 'attribute',
                        customState: { host: 'section:not([hidden]) [data-test="sheet"]', name: 'open' },
                        changes: { opacity: { op: '>=', value: 0.99 } },
                    },
                ],
                // overlay: the panel is already open through the attribute (action:'call' → no click, just the measurement).
                overlay: [
                    {
                        description: 'bottom sheet open with backdrop, horizontally centered (desktop)',
                        trigger: { selector: 'section:not([hidden]) [data-test="sheet"]', action: 'call' },
                        panel: 'section:not([hidden]) [data-test="sheet"] [data-part="root"]',
                        backdrop: 'section:not([hidden]) [data-test="sheet"] [data-part="backdrop"]',
                        hasBackdrop: true,
                        centering: 'horizontal',
                        maxWidth: { op: '<=', value: 640, tolerance: 1 },
                    },
                ],
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="sheet"] [data-part="root"]',
                        description: 'open bottom sheet panel is fully opaque',
                        opacity: { op: '==', value: 1 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="sheet"] [data-part="root"]',
                        description: 'bottom sheet panel has non-negative border radius (top corners; metro may zero it)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="sheet"] [data-part="root"]',
                        description: 'bottom sheet panel is a flex column container',
                        display: { op: 'oneOf', value: ['flex', 'block', 'grid'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="sheet"] [data-part="root"]',
                        description: 'bottom sheet panel has measurable height (snapped to detent)',
                        height: { op: '>=', value: 100 },
                    },
                ],
                // Anchored to the bottom: the panel's bottom edge is flush with the backdrop's (the viewport's).
                composition: [
                    {
                        description: 'bottom sheet is flush to the bottom viewport edge',
                        parent: 'section:not([hidden]) [data-test="sheet"] [data-part="root"]',
                        children: {
                            panel: 'section:not([hidden]) [data-test="sheet"] [data-part="root"]',
                            backdrop: 'section:not([hidden]) [data-test="sheet"] [data-part="backdrop"]',
                        },
                        relations: [
                            {
                                description: 'panel bottom edge reaches backdrop (viewport) bottom edge',
                                left: 'panel.bottom',
                                op: '>=',
                                right: 'backdrop.bottom',
                                tolerance: 2,
                            },
                            {
                                description: 'panel left is at/after backdrop left (contained horizontally)',
                                left: 'panel.left',
                                op: '>=',
                                right: 'backdrop.left',
                                tolerance: 2,
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (the open scenario) ──
    a11y: {
        // The sheet open: the panel is role=dialog + aria-modal + aria-label → an accessible name.
        scenarios: ['bottom-sheet-open'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'bottom-sheet-open',
        targets: [
            // The panel: a JS-driven height + max-width 640 → a generous overlay tolerance.
            { selector: 'section:not([hidden]) [data-test="sheet"] [data-part="root"]', tolerancePx: 12 },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        // The sheet is already open: the initial focus is on the action inside, and Tab stays INSIDE the panel.
        // We do NOT test Esc (overlayStack handles it, outside the scope of the keyboard-navigation contract).
        // The handle is a slider over the detents: it is the panel's first tab stop, so
        // Shift+Tab from "Apply" reaches it; ArrowUp goes up to detent 1, Home goes back to 0.
        // trapContainer: after the steps, 10 Tabs and 10 Shift+Tabs stay in the sheet.
        scenario: 'bottom-sheet-open',
        initialFocus: 'section:not([hidden]) [data-test="sheet-action"]',
        trapContainer: 'section:not([hidden]) [data-test="sheet"] [data-part="root"]',
        steps: [
            { key: 'Tab', expectFocusWithin: 'section:not([hidden]) [data-test="sheet"] [data-part="root"]' },
            { key: 'Shift+Tab', expectFocusWithin: 'section:not([hidden]) [data-test="sheet"] [data-part="root"]' },
            { key: 'Shift+Tab', expectFocus: 'section:not([hidden]) [data-test="sheet"] [data-part="handle"]' },
            {
                key: 'ArrowUp',
                expectAttr: { selector: 'section:not([hidden]) [data-test="sheet"] [data-part="handle"]', name: 'aria-valuenow', value: '1' },
            },
            {
                key: 'Home',
                expectAttr: { selector: 'section:not([hidden]) [data-test="sheet"] [data-part="handle"]', name: 'aria-valuenow', value: '0' },
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker), the open scenario ──
    visual: {
        scenarios: ['bottom-sheet-open'],
        // Drawn position: fixed, outside its section: shot as the viewport (#714).
        viewportScenarios: ['bottom-sheet-open'],
    },
};

export default bottomSheet;
