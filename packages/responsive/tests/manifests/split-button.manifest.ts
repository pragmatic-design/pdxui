/**
 * MANIFEST — pdx-split-button (tier 1A, button-pair + portaled dropdown menu)
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/split-button/pdx-split-button.ts)
 * and the CSS (packages/design/src/components/split-button.css plus surfaces/buttons.css for .pdx-{variant}).
 *
 * ── DOM structure (built imperatively in an rAF inside ctx.track) ──
 *   <pdx-split-button class="pdx-split-button">        ← host, display:inline-block (CSS), the class added in an rAF
 *     <div class="pdx-split-button-group">             ← inline-flex, align-items:stretch (both halves share a height)
 *       <button type="button" class="pdx-{variant} pdx-split-primary" [size]>{icon?}{label}</button>
 *       <button type="button" class="pdx-{variant} pdx-split-arrow" [size]
 *               aria-haspopup="menu" aria-expanded="false"><svg chevron/></button>
 *
 *   The menu's PANEL is PORTALLED to document.body (NOT inside the host):
 *   <div class="pdx-split-button-panel pdx-menu" role="menu" style="display:none">   ← appended to document.body
 *     <button class="pdx-menu-item" role="menuitem" data-menu-key>…</button>         ← built on opening (buildMenuItems)
 *
 * ── What that means for the SELECTORS (verified in the source) ──
 *   - The two halves (primary and arrow) live in the host → section-scoped selectors, like the other manifests'.
 *   - The menu panel is on document.body → NOT section-scoped. To avoid ambiguity between scenarios,
 *     ONE interactive scenario (split-menu) is used for the menu's overlay and keyboard, and the
 *     panel is selected with '.pdx-split-button-panel' (global, not scoped to a section).
 *
 * ── The group's geometry (CSS) ──
 *   - .pdx-split-button-group: inline-flex plus align-items:stretch → the primary and the arrow share a HEIGHT.
 *   - .pdx-split-primary: right-radius 0, border-right:none → it joins the chevron (a joined seam on the right).
 *   - .pdx-split-arrow: left-radius 0, a separating border-left, min-width:auto → the narrow half on the right.
 *   - The group's outer radius = var(--pdx-radius-sm) on the wrapper (overflow:hidden); the radius-zero themes → 0.
 *   The contracts are CONSERVATIVE: no theme-specific px. Invariants universal to all 13 themes:
 *     · the primary and the arrow have the SAME height (stretch);
 *     · they are FLUSH and joined (arrow.left <= primary.right, no gap; the same top);
 *     · the arrow is TO THE RIGHT of the primary;
 *     · the primary has its right radius zeroed, the arrow its left radius (the inner seam);
 *     · both halves have cursor pointer (they are interactive).
 *
 * ── Opening the menu ──
 *   open() needs an rAF to position, plus an auto-focus on the first menuitem and a focusGroup (vertical, wrap).
 *   The panel starts at display:none; a click on the arrow makes it visible (display:'' plus position:fixed).
 *   The overlay trigger action:'click' on the arrow → the runner clicks and waits for the panel to be visible.
 *   close() on Escape, a click outside or a selection; on close the focus returns to the arrow.
 *
 * ── Preset states ──
 *   loading and disabled are static props → dedicated standalone scenarios (split-disabled), not stateRules.
 */
import type { ComponentManifest } from './_types';

export const splitButton: ComponentManifest = {
    name: 'split-button',
    tag: 'pdx-split-button',
    tier: '1A',
    status: 'wip',
    imports: ['@pdxui/ui/split-button'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'split-basic',
            title: 'Split Button — Primary + chevron (closed)',
            html: `
                <pdx-split-button data-test="sb"
                    label="Save"
                    variant="primary"
                    size="md"
                    items='[{"key":"draft","label":"Save as draft"},{"key":"copy","label":"Save a copy"},{"type":"separator"},{"key":"export","label":"Export","danger":true}]'>
                </pdx-split-button>`,
        },
        {
            id: 'split-menu',
            title: 'Split Button — Dropdown menu open (after click on chevron)',
            html: `
                <pdx-split-button data-test="sb-menu"
                    label="Actions"
                    variant="primary"
                    size="md"
                    items='[{"key":"draft","label":"Save as draft"},{"key":"copy","label":"Save a copy"},{"type":"separator"},{"key":"export","label":"Export","danger":true}]'>
                </pdx-split-button>`,
        },
        {
            // The scenario Dimension 5 photographs for the OPEN state. `split-menu`'s own title
            // says "Dropdown menu open (after click on chevron)" and nobody ever clicks it: the
            // visual runner screenshots at rest (`visual-runner.spec.ts:77-90`), so its baselines
            // show a closed button. Measured: `.pdx-split-button-panel` does not exist
            // at all until first opened.
            //
            // Two things make this component different from the popover and the tooltip, and both
            // were measured rather than assumed:
            //
            // 1. It exposes no imperative API (no `ctx.expose` in `pdx-split-button.ts`), so the
            //    setup has to click the chevron — `.pdx-split-arrow`, the element that carries the
            //    click listener (`pdx-split-button.ts:232`).
            // 2. The panel is appended to `document.body` (`:114`), NOT to the host — so it is not
            //    inside the `section[data-scenario]` the runner photographs. That does not stop it
            //    being in the picture, because the screenshot is a CROP of the section's box and
            //    the panel is positioned `fixed` just under the trigger — but it does mean the
            //    section has to be tall enough to contain it. Measured without the padding: panel
            //    160x139 at y=140, section 118px tall ending at y=158, so 18 of 139 pixels landed
            //    in the crop. Hence the padding below.
            id: 'split-open',
            title: 'Split Button — Open (the menu is in the picture)',
            html: `
                <div style="padding: 8px 8px 180px;">
                    <pdx-split-button data-test="sb-open"
                        label="Actions"
                        variant="primary"
                        size="md"
                        items='[{"key":"draft","label":"Save as draft"},{"key":"copy","label":"Save a copy"},{"type":"separator"},{"key":"export","label":"Export","danger":true}]'>
                    </pdx-split-button>
                </div>`,
            setup: `
                const arrow = document.querySelector('section:not([hidden]) [data-test="sb-open"] .pdx-split-arrow');
                if (arrow) arrow.click();`,
        },
        {
            id: 'split-disabled',
            title: 'Split Button — Disabled',
            html: `
                <pdx-split-button data-test="sb-dis"
                    label="Save"
                    variant="primary"
                    size="md"
                    disabled
                    items='[{"key":"a","label":"Action A"}]'>
                </pdx-split-button>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'split-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="sb"] .pdx-split-button-group',
                        description: 'split button group is an inline-flex row',
                        display: { op: 'is', value: 'inline-flex' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="sb"] .pdx-split-primary',
                        description: 'primary half is interactive (cursor pointer)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="sb"] .pdx-split-arrow',
                        description: 'chevron half is interactive (cursor pointer)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // The CSS forces a right radius of 0 on the primary (it seams with the chevron).
                        selector: 'section:not([hidden]) [data-test="sb"] .pdx-split-primary',
                        description: 'primary half has no right-side radius (joined seam)',
                        radius: { topRight: { op: '<=', value: 1 }, bottomRight: { op: '<=', value: 1 } },
                    },
                    {
                        // The CSS forces a left radius of 0 on the chevron (it seams with the primary).
                        selector: 'section:not([hidden]) [data-test="sb"] .pdx-split-arrow',
                        description: 'chevron half has no left-side radius (joined seam)',
                        radius: { topLeft: { op: '<=', value: 1 }, bottomLeft: { op: '<=', value: 1 } },
                    },
                    {
                        // The group's outer halves stay non-negative (the radius-zero themes zero them).
                        selector: 'section:not([hidden]) [data-test="sb"] .pdx-split-primary',
                        description: 'primary left radius is non-negative',
                        radius: { topLeft: { op: '>=', value: 0 }, bottomLeft: { op: '>=', value: 0 } },
                    },
                ],
                composition: [
                    {
                        // The same height: the group is align-items:stretch.
                        description: 'primary and chevron halves share the same height (stretch)',
                        parent: 'section:not([hidden]) [data-test="sb"] .pdx-split-button-group',
                        children: {
                            primary: '.pdx-split-primary',
                            arrow: '.pdx-split-arrow',
                        },
                        relations: [
                            { description: 'primary == arrow height', left: 'primary.height', op: '==', right: 'arrow.height', tolerance: 1 },
                        ],
                    },
                    {
                        // Aligned on the same row (the same top) — a horizontal row.
                        description: 'halves are aligned on the same row (same top)',
                        parent: 'section:not([hidden]) [data-test="sb"] .pdx-split-button-group',
                        children: {
                            primary: '.pdx-split-primary',
                            arrow: '.pdx-split-arrow',
                        },
                        relations: [
                            { description: 'primary.top == arrow.top', left: 'primary.top', op: '==', right: 'arrow.top', tolerance: 2 },
                        ],
                    },
                    {
                        // Flush and joined: the arrow starts where the primary ends, with no gap.
                        description: 'chevron is flush to the right of the primary (no gap)',
                        parent: 'section:not([hidden]) [data-test="sb"] .pdx-split-button-group',
                        children: {
                            primary: '.pdx-split-primary',
                            arrow: '.pdx-split-arrow',
                        },
                        relations: [
                            { description: 'arrow.left <= primary.right (touching)', left: 'arrow.left', op: '<=', right: 'primary.right', tolerance: 2 },
                            { description: 'arrow is to the right of primary', left: 'primary.left', op: '<=', right: 'arrow.left' },
                        ],
                    },
                    {
                        // Both are contained in the group's wrapper.
                        description: 'both halves are contained within the group wrapper',
                        parent: 'section:not([hidden]) [data-test="sb"] .pdx-split-button-group',
                        children: {
                            group: '.pdx-split-button-group',
                            primary: '.pdx-split-primary',
                            arrow: '.pdx-split-arrow',
                        },
                        relations: [
                            { description: 'primary within group', left: 'primary', op: 'contained-in', right: 'group' },
                            { description: 'arrow within group', left: 'arrow', op: 'contained-in', right: 'group' },
                        ],
                    },
                ],
            },

            // The menu open: the panel is portalled to the body, role="menu", visible after the click on the arrow.
            'split-menu': {
                overlay: [
                    {
                        // trigger = a click on the arrow; the runner clicks and waits for the panel to be visible.
                        // The panel is on document.body (NOT section-scoped) → a global selector.
                        description: 'clicking the chevron opens the dropdown menu panel',
                        trigger: { selector: 'section:not([hidden]) [data-test="sb-menu"] .pdx-split-arrow', action: 'click' },
                        panel: '.pdx-split-button-panel',
                        hasBackdrop: false,
                        minWidth: { op: '>=', value: 160 },
                    },
                ],
            },

            // Disabled: a static prop → a standalone rule (pointer-events and the cursor on the disabled primary).
            'split-disabled': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="sb-dis"] .pdx-split-primary',
                        description: 'disabled primary half is not clickable (no pointer cursor)',
                        cursor: { op: 'isNot', value: 'pointer' },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // Closed: the arrow has aria-haspopup="menu" + aria-expanded="false"; the primary has text (the label) → an accessible name.
    // The chevron-only arrow is named by the `menuLabel` prop (default 'More actions'), forwarded as
    //   its aria-label, plus an aria-hidden svg (pdx-split-button.ts); without it axe reports "button-name".
    //   No disableRule: the arrow has a real accessible name.
    // The menu open: a role="menu" panel with menuitems (buttons with text) → fine for axe.
    a11y: {
        scenarios: ['split-basic', 'split-menu'],
    },

    // ── Dim. 3: style isolation ──
    // The primary keeps its height (the design system's min-height) under hostile global CSS.
    isolation: {
        scenario: 'split-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="sb"] .pdx-split-primary', tolerancePx: 10, leaks: [{ issue: 170, properties: ['letterSpacing'], themes: ['neutral'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) — menu ──
    // The arrow opens the menu; on opening the focus goes to the first menuitem (an rAF) and focusGroup (vertical, wrap)
    // handles ArrowUp/Down; the panel is on the body.
    // initialFocus = the arrow; the runner opens it from the keyboard (Enter or Space on the native button).
    // No trapContainer: a menu does not trap focus (WAI-ARIA APG), and after the last step the
    // choice has closed it.
    keyboard: {
        scenario: 'split-menu',
        initialFocus: 'section:not([hidden]) [data-test="sb-menu"] .pdx-split-arrow',
        steps: [
            // After the opening and its rAF the focus must be INSIDE the menu panel (the first menuitem).
            // aria-expanded follows the menu: 'true' while it is open, 'false' once it closes.
            {
                key: 'Enter', expectFocusWithin: '.pdx-split-button-panel',
                expectAttr: { selector: 'section:not([hidden]) [data-test="sb-menu"] .pdx-split-arrow', name: 'aria-expanded', value: 'true' },
            },
            {
                key: 'Escape', expectFocus: 'section:not([hidden]) [data-test="sb-menu"] .pdx-split-arrow',
                expectAttr: { selector: 'section:not([hidden]) [data-test="sb-menu"] .pdx-split-arrow', name: 'aria-expanded', value: 'false' },
            },
            // Choosing an item from the keyboard. focusGroup cancels Enter, so the menu needs an
            // onSelect: without one, Enter on "Save a copy" does nothing, focus stays on the item and
            // the menu stays open. A choice closes the menu and returns focus to the arrow.
            { key: 'Enter', expectFocus: '.pdx-split-button-panel [data-menu-key="draft"]' },
            { key: 'ArrowDown', expectFocus: '.pdx-split-button-panel [data-menu-key="copy"]' },
            {
                key: 'Enter', expectFocus: 'section:not([hidden]) [data-test="sb-menu"] .pdx-split-arrow',
                expectAttr: { selector: 'section:not([hidden]) [data-test="sb-menu"] .pdx-split-arrow', name: 'aria-expanded', value: 'false' },
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — closed (the group) + the menu open ──
    // `split-basic` stays: a closed split button is a real resting state, and photographing it is
    // correct. The open menu is `split-open`, not `split-menu` — that one promises the open menu in its
    // own title and, at rest, shows the closed button.
    visual: {
        scenarios: ['split-basic', 'split-open'],
    },
};

export default splitButton;
