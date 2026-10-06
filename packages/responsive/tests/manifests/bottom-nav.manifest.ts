/**
 * MANIFEST — pdx-bottom-nav (Tier 6)
 *
 * NEW contracts, derived by inspecting:
 *  - source: packages/ui/src/bottom-nav/pdx-bottom-nav.ts
 *      HOST <pdx-bottom-nav> → in an rAF it adds the class .pdx-bottom-nav to the host +
 *      role="navigation" + aria-label="Bottom navigation". Inside it, it creates an INNER
 *      <div class="pdx-bottom-nav-bar"> with N <button type="button" class="pdx-bottom-nav-item">.
 *        - active: the .active class ONLY  →  ⚠ NO aria-current, no aria-selected (see the BUG below).
 *        - icon: a <pdx-icon name size=22> inside .pdx-bottom-nav-icon (no aria-hidden).
 *        - label: a text span .pdx-bottom-nav-label → the button's accessible name.
 *      Data-driven (the `items` prop). No keydown handler, no roving tabindex: the buttons are
 *      nativamente tabbabili → pattern keyboard 'none'.
 *  - CSS: packages/design/src/components/bottom-nav.css
 *      .pdx-bottom-nav → position:fixed; bottom:0; left:0; right:0 (full-width viewport-driven).
 *      .pdx-bottom-nav-bar → display:flex; justify-content:space-around; align-items:center;
 *                            height:56px.
 *      .pdx-bottom-nav-item → display:flex; flex-direction:column; align-items:center;
 *                             flex:1 (→ the same width); cursor:pointer; color:muted.
 *      .pdx-bottom-nav-item.active → color: primary.
 *
 * Conservative rules: invariants true on ALL themes. No exact px.
 * States that are already in the DOM (the active item) → a STANDALONE rule (no triggered state: it avoids flake).
 * The bar has a FIXED height (56px) but the host is position:fixed and full-width → the isolation
 *   target is .pdx-bottom-nav-bar (a stable geometry) with a 12px tolerance.
 *
 * Accessibility: the <nav> has aria-label="Bottom navigation" ✔; every item takes its accessible name
 *   from its label text ✔.
 *   ⚠ a11y BUG: the active item is marked with the .active class ALONE, with no aria-current and no
 *   aria-selected → the "active" state is not exposed to assistive technology. aria-current="page"
 *   should be added to the active item in the source (see the report). axe does not report it (it is
 *   not a hard WCAG violation), so no disableRules is needed.
 */
import type { ComponentManifest } from './_types';

export const bottomNav: ComponentManifest = {
    name: 'bottom-nav',
    tag: 'pdx-bottom-nav',
    tier: '6',
    status: 'wip',
    imports: ['@pdxui/ui/bottom-nav'],

    // ── Scenarios ──
    // items are JSON-driven (the model requires an icon). One active entry (activeKey) to exercise .active.
    scenarios: [
        {
            id: 'bottom-nav-basic',
            title: 'Bottom Nav — Basic',
            html: `<pdx-bottom-nav data-test="bottom-nav" active-key="home" items='[{"key":"home","label":"Home","icon":"home"},{"key":"search","label":"Search","icon":"search"},{"key":"profile","label":"Profile","icon":"user"}]'></pdx-bottom-nav>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, derived from bottom-nav.css) ──
    contracts: {
        scenarios: {
            'bottom-nav-basic': {
                standalone: [
                    {
                        // INNER bar: display flex (item distribuiti space-around).
                        selector: 'section:not([hidden]) [data-test="bottom-nav"] .pdx-bottom-nav-bar',
                        description: 'bottom nav bar is flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // The bar has a noticeable height (56px in the CSS).
                        selector: 'section:not([hidden]) [data-test="bottom-nav"] .pdx-bottom-nav-bar',
                        description: 'bottom nav bar has height >= 40px',
                        height: { op: '>=', value: 40 },
                    },
                    {
                        // The active item is interactive → cursor pointer.
                        selector: 'section:not([hidden]) [data-test="bottom-nav"] .pdx-bottom-nav-item.active',
                        description: 'active item cursor = pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // The active item (not disabled) → opaque.
                        selector: 'section:not([hidden]) [data-test="bottom-nav"] .pdx-bottom-nav-item.active',
                        description: 'active item opacity = 1',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                ],
                composition: [
                    {
                        // flex:1 → every item is the same width.
                        description: 'bottom nav items have consistent width (flex:1)',
                        parent: '[data-test="bottom-nav"] .pdx-bottom-nav-bar',
                        children: {
                            active: '[data-test="bottom-nav"] .pdx-bottom-nav-item.active',
                            inactive: '[data-test="bottom-nav"] .pdx-bottom-nav-item:not(.active)',
                        },
                        relations: [
                            {
                                description: 'active and inactive item same width',
                                left: 'active.width',
                                op: '==',
                                right: 'inactive.width',
                                tolerance: 2,
                            },
                            {
                                description: 'active and inactive item same height',
                                left: 'active.height',
                                op: '==',
                                right: 'inactive.height',
                                tolerance: 4,
                            },
                        ],
                    },
                    // Note: there is no "item height <= bar height" relation: the bar has a fixed height
                    // (56px, Material) while the height of the icon plus the label varies with the theme's font
                    // and can go over by a few px — it is not a clean cross-theme invariant. The invariants that
                    // matter (items of the same width, a flex bar, aria-current on the active one) stay.
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // A <nav> with aria-label="Bottom navigation"; every item takes its accessible name from its label text.
    // No disableRules (the aria-current BUG on the active item is not a hard WCAG violation for axe).
    a11y: {
        scenarios: ['bottom-nav-basic'],
    },

    // ── Dim. 3: style isolation ──
    // The target is the bar (a fixed 56px height, a stable geometry). The host is position:fixed, full-width.
    isolation: {
        scenario: 'bottom-nav-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="bottom-nav"] .pdx-bottom-nav-bar', tolerancePx: 12 },
        ],
    },

    // ── Dim. 4: keyboard (native buttons → 'none') ──
    // No roving and no keydown: the buttons are tabbable. Tab enters the bar.
    keyboard: {
        scenario: 'bottom-nav-basic',
        steps: [
            { key: 'Tab', expectFocusWithin: '[data-test="bottom-nav"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['bottom-nav-basic'],
    },
};

export default bottomNav;
