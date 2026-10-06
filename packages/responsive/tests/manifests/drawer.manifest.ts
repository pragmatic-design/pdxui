/**
 * MANIFEST — pdx-drawer (Tier 2A, overlay)
 *
 * Contracts written by inspecting the source (packages/ui/src/drawer/pdx-drawer.ts) and the CSS
 * (packages/design/src/components/drawer.css).
 *
 * DOM structure (NOT portalled): the custom element <pdx-drawer> renders, inside its own host
 * (light DOM, ctx.el), TWO direct children:
 *   - <div class="pdx-drawer-backdrop">
 *   - <div class="pdx-drawer" role="dialog" aria-modal="true" :aria-label>
 * → the selectors stay scoped to `section:not([hidden]) [data-test="drw"] .pdx-drawer`.
 *
 * CAREFUL: the PANEL's class is `.pdx-drawer` (NOT `.pdx-drawer-panel`). The backdrop is `.pdx-drawer-backdrop`.
 *
 * OPENING through the attribute: the scenario mounts the host with `open`. On open=true the custom element's
 * ctx.track() applies `[data-open]` (and the position/size attributes) to the backdrop and the panel → the panel
 * becomes visible (visibility:visible, transform:translateX(0)) and opaque. `assertOverlay` with
 * `action:'call'` does NOT click: it waits for the settle (2 rAF) and measures the panel already open.
 *
 * GEOMETRY (a right drawer, the scenario's default position):
 *  - anchored to the RIGHT, NOT centred → no centering 'both'. What is checked:
 *      a) hasBackdrop:true + standalone (opacity==1, radius>=0, a constrained width)
 *      b) composition: the panel's right edge is flush with the viewport's right edge
 *  - width: sm=280, md=380 (the default), lg=520 px. Mobile (<=640px) → 100%. On the test viewport (1280)
 *    md means 380px, but a conservative bound (>=200) is kept, for robustness across themes and densities.
 *
 * A11Y: the panel is role="dialog" + aria-modal="true" + aria-label ("Menu" from the scenario, otherwise
 * "Drawer" by default). The accessible name is there → no a11y bug found.
 */
import type { ComponentManifest } from './_types';

export const drawer: ComponentManifest = {
    name: 'drawer',
    tag: 'pdx-drawer',
    tier: '2A',
    status: 'wip',
    imports: ['@pdxui/ui/drawer'],

    // ── Scenarios (the host mounted OPEN through the `open` attribute) ──
    scenarios: [
        {
            id: 'drawer-right',
            title: 'Drawer — Right (open)',
            html: `
                <pdx-drawer data-test="drw" open position="right" size="md" label="Menu">
                    <div slot="header" data-test="drw-header">Menu</div>
                    <p>Drawer body content.</p>
                    <button data-test="drw-action" type="button">Do something</button>
                </pdx-drawer>`,
        },
        {
            id: 'drawer-left',
            title: 'Drawer — Left (open)',
            html: `
                <pdx-drawer data-test="drw" open position="left" size="md" label="Menu">
                    <div slot="header">Menu</div>
                    <p>Drawer body content.</p>
                    <button data-test="drw-action" type="button">Do something</button>
                </pdx-drawer>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'drawer-right': {
                // overlay: the panel is already open through the attribute (action:'call' → no click, just the measurement).
                overlay: [
                    {
                        description: 'drawer right: panel open with backdrop, width constrained',
                        trigger: { selector: 'section:not([hidden]) [data-test="drw"]', action: 'call' },
                        panel: 'section:not([hidden]) [data-test="drw"] .pdx-drawer',
                        backdrop: 'section:not([hidden]) [data-test="drw"] .pdx-drawer-backdrop',
                        hasBackdrop: true,
                        width: { op: '>=', value: 200 },
                    },
                ],
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="drw"] .pdx-drawer',
                        description: 'open drawer panel is fully opaque',
                        opacity: { op: '==', value: 1 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="drw"] .pdx-drawer',
                        description: 'drawer panel has non-negative border radius (metro/cyberpunk may zero it)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="drw"] .pdx-drawer',
                        description: 'drawer panel is a flex column container',
                        display: { op: 'oneOf', value: ['flex', 'block', 'grid'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="drw"] .pdx-drawer',
                        description: 'drawer panel spans full viewport height',
                        height: { op: '>=', value: 400 },
                    },
                ],
                // Anchored right: the panel's right edge is flush with the viewport's right edge.
                composition: [
                    {
                        description: 'right drawer is flush to the right viewport edge',
                        parent: 'section:not([hidden]) [data-test="drw"] .pdx-drawer',
                        children: {
                            panel: 'section:not([hidden]) [data-test="drw"] .pdx-drawer',
                            backdrop: 'section:not([hidden]) [data-test="drw"] .pdx-drawer-backdrop',
                        },
                        relations: [
                            {
                                description: 'panel right edge reaches backdrop (viewport) right edge',
                                left: 'panel.right',
                                op: '>=',
                                right: 'backdrop.right',
                                tolerance: 2,
                            },
                            {
                                description: 'panel top is at/below backdrop top (contained vertically)',
                                left: 'panel.top',
                                op: '>=',
                                right: 'backdrop.top',
                                tolerance: 2,
                            },
                        ],
                    },
                ],
            },
            'drawer-left': {
                // Anchored left: the panel's left edge is flush with the viewport's left edge.
                composition: [
                    {
                        description: 'left drawer is flush to the left viewport edge',
                        parent: 'section:not([hidden]) [data-test="drw"] .pdx-drawer',
                        children: {
                            panel: 'section:not([hidden]) [data-test="drw"] .pdx-drawer',
                            backdrop: 'section:not([hidden]) [data-test="drw"] .pdx-drawer-backdrop',
                        },
                        relations: [
                            {
                                description: 'panel left edge reaches backdrop (viewport) left edge',
                                left: 'panel.left',
                                op: '<=',
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
        // The drawer open: the panel is role=dialog + aria-modal + aria-label → an accessible name.
        scenarios: ['drawer-right'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'drawer-right',
        targets: [
            // The panel: a box of a fixed size (a width per size) → a generous overlay tolerance.
            { selector: 'section:not([hidden]) [data-test="drw"] .pdx-drawer', tolerancePx: 12 },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        // The drawer is already open: the initial focus is on the action inside, and Tab stays INSIDE the panel.
        // We do NOT test Esc (overlayStack handles it, outside the scope of the keyboard-navigation contract).
        // trapContainer: after the steps, 10 Tabs and 10 Shift+Tabs stay in the drawer.
        scenario: 'drawer-right',
        initialFocus: 'section:not([hidden]) [data-test="drw-action"]',
        trapContainer: 'section:not([hidden]) [data-test="drw"] .pdx-drawer',
        steps: [
            { key: 'Tab', expectFocusWithin: 'section:not([hidden]) [data-test="drw"] .pdx-drawer' },
        ],
    },

    // ── Dim. 5: visual regression (Docker), the open scenario ──
    visual: {
        scenarios: ['drawer-right'],
        // Measured floor, not a guess. At maxDiffPixelRatio 0 the whole visual
        // dimension has 25 failures out of 1591, and they are not spread across the suite — they
        // come from FOUR scenarios that carry state or movement. This is one of them: the drawer animates as it opens.
        // Worst observed difference: 505 pixels.
        //
        // Everything else runs at 0, so a 2px border (about 2400 pixels on a wide section, and
        // 0.34% of them — under a 1% allowance) is caught. Here it would not be, and that is
        // the deliberate trade: this scenario keeps a tolerance and says why.
        maxDiffPixelRatio: 0.005,
    },
};

export default drawer;
