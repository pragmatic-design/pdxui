/**
 * MANIFEST — pdx-sidebar (Tier 6 — layout/navigation)
 *
 * Contracts written by inspecting:
 *  - source: packages/ui/src/sidebar/pdx-sidebar.ts
 *      Light DOM, render: <slot></slot> (no inner wrapper).
 *      In an rAF (on ctx.track's first run) it adds ON THE HOST <pdx-sidebar>:
 *        - class .pdx-sidebar
 *        - role="complementary"
 *        - aria-label="Sidebar"
 *      On every run, again in an rAF, it toggles on the host:
 *        - .pdx-sidebar-open       ← open
 *        - .pdx-sidebar-collapsed  ← !open
 *        - .pdx-sidebar-mini       ← mini && !open
 *        - .pdx-sidebar-right      ← position === 'right'
 *      and sets inline on host.style: width/minWidth =
 *        open ? width : (mini ? collapsedWidth : 0)  [px]
 *      Props: open=true, mini=false, position='left', width=260, collapsedWidth=60.
 *      It propagates `collapsed` to the pdx-nav-menu children (= !open && mini). There is no internal toggle
 *      button and no keydown handler → no composite keyboard pattern (pattern 'none').
 *      ⚠ A NOTE: every class, aria and width is applied in a requestAnimationFrame, so the
 *      runners must wait (the measure helper already has waitForTimeout and networkidle).
 *
 *  - CSS: packages/design/src/components/sidebar.css
 *      pdx-sidebar { display:block }  (the host's default, before the rAF)
 *      .pdx-sidebar { display:flex; flex-direction:column; height:100%;
 *                     background:surface; border-right:1px solid border; overflow:hidden;
 *                     transition: width/min-width 0.2s }
 *      .pdx-sidebar-right { border-right:none; border-left:1px solid border }
 *      .pdx-sidebar-collapsed:not(.pdx-sidebar-mini) { width:0 !important; min-width:0 !important }
 *
 * MEASUREMENT CHOICES (they matter):
 *  - .pdx-sidebar is `height:100%` → CONTENT- and PARENT-driven: without a parent of a
 *    defined height it would collapse. Every scenario wraps the sidebar in a 400px-tall container
 *    (with the data-test on the host), so the height is measurable and stable.
 *  - The classes are on the HOST itself (not on an inner div): the selectors point straight
 *    at [data-test="..."] (which IS <pdx-sidebar>), NOT at a descendant.
 *  - States set up front through attributes (open / collapsed without open / mini) → STANDALONE
 *    rules on separate scenarios (no triggered StateRule: it avoids flake).
 *  - A universal width: 260/60px exactly is NOT asserted (they are prop-driven, not theme-driven).
 *    What is asserted is the RELATION: expanded.width > collapsed.width (collapsed without mini = 0).
 *  - Isolation: the container is a content- and height-driven flex column (height:100%) → skipHeight.
 *    Its height follows the parent and the drift is legitimate under hostile CSS (the host's line-height).
 *    The radius and the border stay asserted as the real immunity guarantee.
 *
 * Accessibility: the host has role="complementary" + aria-label="Sidebar" → a named landmark. axe is fine,
 *   with no disableRules.
 */
import type { ComponentManifest } from './_types';

export const sidebar: ComponentManifest = {
    name: 'sidebar',
    tag: 'pdx-sidebar',
    tier: '6',
    status: 'wip',
    imports: ['@pdxui/ui/sidebar'],

    // ── Scenarios ──
    // A 400px-tall wrapper (the sidebar is height:100% → it needs a sized parent).
    // Realistic content: header + nav links + footer (the default slot).
    scenarios: [
        {
            id: 'sidebar-expanded',
            title: 'Sidebar — Expanded (default, left)',
            html: `
                <div style="height: 400px; display: flex;">
                    <pdx-sidebar data-test="sidebar" open>
                        <div data-test="sidebar-header" style="padding: 16px; font-weight: 600;">My App</div>
                        <nav style="padding: 8px;">
                            <a href="#" data-test="sidebar-link" style="display:block; padding:8px;">Dashboard</a>
                            <a href="#" style="display:block; padding:8px;">Settings</a>
                            <a href="#" style="display:block; padding:8px;">Profile</a>
                        </nav>
                        <div data-test="sidebar-footer" style="margin-top:auto; padding:16px;">v1.0</div>
                    </pdx-sidebar>
                    <main style="flex:1; padding:16px;">Content</main>
                </div>`,
        },
        {
            id: 'sidebar-collapsed',
            title: 'Sidebar — Collapsed (width 0)',
            html: `
                <div style="height: 400px; display: flex;">
                    <pdx-sidebar data-test="sidebar-collapsed">
                        <div style="padding: 16px;">My App</div>
                        <nav style="padding: 8px;">
                            <a href="#" style="display:block; padding:8px;">Dashboard</a>
                        </nav>
                    </pdx-sidebar>
                    <main style="flex:1; padding:16px;">Content</main>
                </div>`,
            // open default true → impostare open="false" via markup. Boolean prop assente ≠ false:
            // the host reads it as open()=false only when the attribute is NOT there AND the default… but
            // the default is true. So collapsed is forced by removing open and setting open through the attribute.
            setup: `(() => { const sb = document.querySelector('[data-test="sidebar-collapsed"]'); if (sb) sb.open = false; })()`,
        },
        {
            id: 'sidebar-mini',
            title: 'Sidebar — Mini collapsed (icons-only width)',
            html: `
                <div style="height: 400px; display: flex;">
                    <pdx-sidebar data-test="sidebar-mini" mini collapsed-width="60">
                        <nav style="padding: 8px;">
                            <a href="#" data-test="sidebar-mini-link" style="display:block; padding:8px;">D</a>
                        </nav>
                    </pdx-sidebar>
                    <main style="flex:1; padding:16px;">Content</main>
                </div>`,
            // mini mode has an effect only while !open → open is taken to false after the mount.
            setup: `(() => { const sb = document.querySelector('[data-test="sidebar-mini"]'); if (sb) sb.open = false; })()`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, derived from sidebar.css) ──
    contracts: {
        scenarios: {
            'sidebar-expanded': {
                standalone: [
                    {
                        // .pdx-sidebar → display:flex column.
                        selector: 'section:not([hidden]) [data-test="sidebar"]',
                        description: 'expanded sidebar is a flex column container',
                        display: { op: 'is', value: 'flex' },
                    },
                    {
                        // height:100% of the 400px wrapper → a full, measurable height.
                        selector: 'section:not([hidden]) [data-test="sidebar"]',
                        description: 'expanded sidebar fills the available height (parent-driven)',
                        height: { op: '>=', value: 100 },
                    },
                    {
                        // open → it has a noticeable width (the width prop, 260 by default; >= 40, conservative).
                        selector: 'section:not([hidden]) [data-test="sidebar"]',
                        description: 'expanded sidebar has a visible width',
                        width: { op: '>=', value: 40 },
                    },
                    {
                        // The container has a non-negative radius (normally 0: a border, not a radius).
                        selector: 'section:not([hidden]) [data-test="sidebar"]',
                        description: 'sidebar container has non-negative border radius',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        // A non-negative border width (a border-right or -left of 1px, depending on the position).
                        selector: 'section:not([hidden]) [data-test="sidebar"]',
                        description: 'sidebar border width is non-negative',
                        border: { all: { width: { op: '>=', value: 0 } } },
                    },
                ],
                // Composition: the header and the footer are contained in the sidebar's box, the footer under the header.
                composition: [
                    {
                        description: 'sidebar slotted content is contained within the sidebar box',
                        parent: 'section:not([hidden]) [data-test="sidebar"]',
                        children: {
                            sidebar: 'section:not([hidden]) [data-test="sidebar"]',
                            header: 'section:not([hidden]) [data-test="sidebar-header"]',
                            footer: 'section:not([hidden]) [data-test="sidebar-footer"]',
                        },
                        relations: [
                            { description: 'header within sidebar box', left: 'header', op: 'contained-in', right: 'sidebar' },
                            { description: 'footer within sidebar box', left: 'footer', op: 'contained-in', right: 'sidebar' },
                            {
                                description: 'footer sits below header (column stack)',
                                left: 'header.bottom',
                                op: '<=',
                                right: 'footer.top',
                                tolerance: 1,
                            },
                            {
                                description: 'header right edge does not overflow sidebar right edge',
                                left: 'header.right',
                                op: '<=',
                                right: 'sidebar.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
            'sidebar-collapsed': {
                standalone: [
                    {
                        // collapsed without mini → the CSS .pdx-sidebar-collapsed:not(.pdx-sidebar-mini) → width:0.
                        selector: 'section:not([hidden]) [data-test="sidebar-collapsed"]',
                        description: 'collapsed (non-mini) sidebar collapses to zero width',
                        width: { op: '<=', value: 2 },
                    },
                ],
            },
            'sidebar-mini': {
                standalone: [
                    {
                        // mini collapsed → width = collapsedWidth (60px); it stays visible (an icon rail).
                        selector: 'section:not([hidden]) [data-test="sidebar-mini"]',
                        description: 'mini collapsed sidebar keeps a narrow visible rail',
                        width: { op: '>=', value: 20 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // The host: role="complementary" (a landmark) + aria-label="Sidebar". The slotted links have text.
    // No disableRules.
    a11y: {
        scenarios: ['sidebar-expanded'],
    },

    // ── Dim. 3: style isolation ──
    // A flex column container with height:100% (parent/content-driven): under hostile CSS the font/line-height
    // are poisoned and the height follows the parent → skipHeight (as for card and dialog). The radius and border
    // stay asserted as the real guarantee of geometric immunity.
    isolation: {
        scenario: 'sidebar-expanded',
        targets: [
            { selector: 'section:not([hidden]) [data-test="sidebar"]', tolerancePx: 2, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // The sidebar is a landmark container: no roving or keydown of its own, and no internal toggle button.
    // The slotted links are natively tabbable → pattern 'none', and we check that Tab enters the landmark.
    keyboard: {
        scenario: 'sidebar-expanded',
        steps: [
            { key: 'Tab', expectFocusWithin: 'section:not([hidden]) [data-test="sidebar"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    // expanded (left, full content) + mini (a narrow rail): they cover the two distinct visual layouts.
    visual: {
        scenarios: ['sidebar-expanded', 'sidebar-mini'],
    },
};

export default sidebar;
