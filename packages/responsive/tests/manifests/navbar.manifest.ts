/**
 * MANIFEST — pdx-navbar (Tier 6)
 *
 * Contracts derived by inspecting:
 *  - source: packages/ui/src/navbar/pdx-navbar.ts
 *      the HOST <pdx-navbar>: in an rAF it adds the class .pdx-navbar plus role="banner" (NOT "navigation":
 *      the host is the banner landmark; the real nav is a child). Optionally .pdx-navbar-sticky /
 *      .pdx-navbar-compact from a prop.
 *      The structure is built imperatively inside the host:
 *        <div class="pdx-navbar-bar">                      ← INNER bar, geometria stabile (h:56px)
 *          [<div class="pdx-navbar-brand">…]               ← only with the brand/brandIcon prop
 *          <button class="pdx-navbar-hamburger"            ← ALWAYS created; aria-label="Toggle menu",
 *                  type=button aria-expanded="false">         aria-expanded toggled by toggleMobile().
 *                                                             CSS: display:none ≥768px, flex <768px.
 *          <nav class="pdx-navbar-nav" role="navigation"   ← landmark navigazione + aria-label
 *               aria-label="Main navigation">                 "Main navigation". display:flex ≥768px,
 *            <a class="pdx-navbar-link" data-nav-key=…>        display:none <768px.
 *              [.active + aria-current="page" when item.active]  Data-driven links from the `items` prop.
 *          <div class="pdx-navbar-spacer">                  ← flex:1
 *          [<div class="pdx-navbar-actions">…]              ← only when the host had children (the actions slot)
 *        <div class="pdx-navbar-drawer">                    ← the mobile nav (display:none, flex when -open)
 *          <a class="pdx-navbar-link">…                        it duplicates the items for the drawer.
 *      Events: it emits 'pdx-select' {key,item} when a link is clicked. No keydown handler and no
 *      roving tabindex: the hamburger is a native <button> and the links are native <a>s → tabbable →
 *      pattern keyboard 'none'.
 *
 *  - CSS: packages/design/src/components/navbar.css
 *      pdx-navbar → display:block; background:surface; border-bottom:1px solid border.
 *      .pdx-navbar-bar → display:flex; align-items:center; gap; height:56px; padding 0 md.
 *                        (.pdx-navbar-compact → 48px). A FIXED height → a stable isolation target.
 *      .pdx-navbar-brand → display:flex; align-items:center; flex-shrink:0.
 *      .pdx-navbar-hamburger → display:none (default desktop); flex <768px; cursor:pointer.
 *      .pdx-navbar-nav → display:flex; align-items:center (default desktop); display:none <768px.
 *      .pdx-navbar-link → display:inline-flex; cursor:pointer; color:muted.
 *      .pdx-navbar-link.active → color:primary.
 *      .pdx-navbar-spacer → flex:1.
 *
 * Robustness choices:
 *  - Universal rules: true on ALL themes, no theme-specific px. The only px measurements are
 *    conservative minimum thresholds (height >= 40px on a bar that is 56px in the CSS).
 *  - States set up front: the active item is set through items[].active in the scenario → a
 *    STANDALONE rule (.pdx-navbar-link.active is already there), no triggered StateRule (it avoids flake).
 *  - The DEFAULT 1280px viewport: on the desktop the .pdx-navbar-nav is flex and the hamburger is display:none.
 *    The rules on .pdx-navbar-nav hold at the desktop viewport only → a scenario at 1280.
 *  - Isolation: the host is display:block, its width viewport-driven (a full-width border-bottom) and
 *    its height content-driven → NOT a clean geometry. The target is .pdx-navbar-bar (a fixed height:56px).
 *    A wide tolerancePx (12), because the padding and the gap use tokens the hostile CSS could brush.
 *
 * Accessibility:
 *  - Host role="banner" (landmark banner) ✔; <nav role="navigation" aria-label="Main navigation"> ✔;
 *    the hamburger <button> has aria-label="Toggle menu" plus aria-expanded ✔; the active item has
 *    aria-current="page" ✔; the links take their accessible name from the label's text ✔.
 *  - Note: at the desktop viewport (1280) the hamburger is display:none → axe does not evaluate it as visible;
 *    no disableRules is needed.
 */
import type { ComponentManifest } from './_types';

export const navbar: ComponentManifest = {
    name: 'navbar',
    tag: 'pdx-navbar',
    tier: '6',
    status: 'wip',
    imports: ['@pdxui/ui/navbar'],

    // ── Scenarios ──
    // A brand plus items (one active) plus a child as the actions area. The default desktop viewport (1280):
    // on the desktop the nav is flex and the hamburger is hidden — the canonical "app header" configuration.
    scenarios: [
        {
            id: 'navbar-basic',
            title: 'Navbar — Basic (desktop)',
            html: `<pdx-navbar data-test="navbar" brand="Acme" brand-icon="box" items='[{"key":"home","label":"Home","href":"#","active":true},{"key":"docs","label":"Docs","href":"#"},{"key":"about","label":"About","href":"#"}]'><button class="pdx-navbar-icon-btn" type="button" aria-label="Settings">S</button></pdx-navbar>`,
        },
        {
            // A 600px column at a desktop viewport. A collapse driven by a media query on the
            // viewport would not happen here, and the actions would leave the container.
            id: 'navbar-narrow',
            title: 'Navbar — Narrow container (600px, desktop viewport)',
            html: `<div style="width: 600px"><pdx-navbar data-test="navbar-narrow" brand="Acme" brand-icon="box" items='[{"key":"home","label":"Home","href":"#","active":true},{"key":"docs","label":"Documentation","href":"#"},{"key":"components","label":"Components","href":"#"},{"key":"playground","label":"Playground","href":"#"},{"key":"integration","label":"Integration","href":"#"},{"key":"pricing","label":"Pricing","href":"#"}]'><button class="pdx-navbar-icon-btn" type="button" aria-label="Settings">S</button><button class="pdx-navbar-icon-btn" type="button" aria-label="Help">?</button></pdx-navbar></div>`,
        },
        {
            // A phone column. Collapsed, the links go behind the toggle, but the actions
            // (a search field, two icon buttons, a named user button) on one row would run past the
            // edge: 655 at 390px.
            id: 'navbar-phone',
            title: 'Navbar — collapsed, actions wider than what is left of the bar',
            html: `<div data-test="nav-box" style="width: 320px"><pdx-navbar data-test="navbar-phone" brand="Enterprise" brand-icon="box" label="App" items='[{"key":"home","label":"Home","href":"#","active":true},{"key":"docs","label":"Documentation","href":"#"}]'><div class="pdx-input-wrap" style="max-width: 220px"><input class="pdx-input" type="text" placeholder="Search..." aria-label="Search"></div><button class="pdx-navbar-icon-btn" type="button" aria-label="Notifications">N</button><button class="pdx-navbar-icon-btn" type="button" aria-label="Settings">S</button><button class="pdx-ghost pdx-btn-sm" type="button" data-test="nav-user">John Doe</button></pdx-navbar></div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, derived from navbar.css) ──
    contracts: {
        scenarios: {
            'navbar-basic': {
                standalone: [
                    {
                        // The INNER bar: flex (brand/nav/spacer/actions aligned in a row).
                        selector: 'section:not([hidden]) [data-test="navbar"] .pdx-navbar-bar',
                        description: 'navbar bar is flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // The bar has a noticeable height (56px in the CSS, 48 when compact).
                        selector: 'section:not([hidden]) [data-test="navbar"] .pdx-navbar-bar',
                        description: 'navbar bar has height >= 40px',
                        height: { op: '>=', value: 40 },
                    },
                    {
                        // The nav landmark: at a desktop viewport it is flex (display:none only below 768px).
                        selector: 'section:not([hidden]) [data-test="navbar"] .pdx-navbar-nav',
                        description: 'desktop nav is flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // The active link (not disabled) → opaque.
                        selector: 'section:not([hidden]) [data-test="navbar"] .pdx-navbar-link.active',
                        description: 'active link opacity = 1',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                    {
                        // The link is interactive → cursor pointer.
                        selector: 'section:not([hidden]) [data-test="navbar"] .pdx-navbar-link.active',
                        description: 'active link cursor = pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                composition: [
                    {
                        // The bar holds the brand and the nav on the same row: the same vertical centre.
                        description: 'navbar bar vertically centers brand and nav',
                        parent: '[data-test="navbar"] .pdx-navbar-bar',
                        children: {
                            brand: '[data-test="navbar"] .pdx-navbar-brand',
                            nav: '[data-test="navbar"] .pdx-navbar-nav',
                        },
                        relations: [
                            {
                                description: 'brand and nav share the same vertical center',
                                left: 'brand.centerY',
                                op: '==',
                                right: 'nav.centerY',
                                tolerance: 4,
                            },
                            {
                                description: 'nav sits to the right of the brand',
                                left: 'brand.right',
                                op: '<=',
                                right: 'nav.left',
                                tolerance: 4,
                            },
                        ],
                    },
                ],
            },
            // It collapses on its own width — the hamburger visible, the links in the menu, and nothing
            // leaving the host.
            'navbar-narrow': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="navbar-narrow"] .pdx-navbar-hamburger',
                        description: 'narrow container: the menu toggle shows',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="navbar-narrow"] .pdx-navbar-nav',
                        description: 'narrow container: the inline links are behind the toggle',
                        display: { op: 'is', value: 'none' },
                    },
                ],
                composition: [
                    {
                        description: 'narrow container: nothing runs past the navbar',
                        parent: 'section:not([hidden]) [data-test="navbar-narrow"]',
                        children: {
                            bar: 'section:not([hidden]) [data-test="navbar-narrow"] .pdx-navbar-bar',
                            actions: 'section:not([hidden]) [data-test="navbar-narrow"] .pdx-navbar-actions',
                        },
                        relations: [
                            { description: 'actions end inside the navbar', left: 'actions.right', op: '<=', right: 'parent.right', tolerance: 1 },
                            { description: 'the bar ends inside the navbar', left: 'bar.right', op: '<=', right: 'parent.right', tolerance: 1 },
                        ],
                    },
                ],
            },
            // Collapsed and still too narrow for its actions, the bar takes a second row
            // for them instead of running past its edge.
            'navbar-phone': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="navbar-phone"] .pdx-navbar-hamburger',
                        description: 'phone column: the menu toggle shows',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                ],
                composition: [
                    {
                        // Numeric edges, not `contained-in`: see pagination-narrow.
                        description: 'phone column: every action stays inside the box',
                        parent: 'section:not([hidden]) [data-test="nav-box"]',
                        children: {
                            box: 'section:not([hidden]) [data-test="nav-box"]',
                            actions: 'section:not([hidden]) [data-test="navbar-phone"] .pdx-navbar-actions',
                            user: 'section:not([hidden]) [data-test="nav-user"]',
                            navbar: 'section:not([hidden]) [data-test="navbar-phone"]',
                        },
                        relations: [
                            { description: 'actions end inside the box', left: 'actions.right', op: '<=', right: 'box.right', tolerance: 1 },
                            { description: 'the last action ends inside the box', left: 'user.right', op: '<=', right: 'box.right', tolerance: 1 },
                            { description: 'the last action is inside the navbar', left: 'user.bottom', op: '<=', right: 'navbar.bottom', tolerance: 1 },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // role="banner" + <nav role="navigation" aria-label> + links with text + a hamburger button with an
    // aria-label. No disableRules: no known false positive.
    a11y: {
        scenarios: ['navbar-basic', 'navbar-narrow'],
    },

    // ── Dim. 3: style isolation ──
    // The host is full-width (display:block plus a border-bottom) with a content-driven height → NOT measurable
    // cleanly. Target = .pdx-navbar-bar (a fixed height:56px). A wide tolerance (gap/padding from tokens).
    isolation: {
        scenario: 'navbar-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="navbar"] .pdx-navbar-bar', tolerancePx: 12 },
        ],
    },

    // ── Dim. 4: keyboard (native links/buttons → 'none') ──
    // No roving and no keydown handler: Tab enters the header and reaches the native links and actions.
    keyboard: {
        scenario: 'navbar-basic',
        steps: [
            { key: 'Tab', expectFocusWithin: '[data-test="navbar"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['navbar-basic'],
    },
};

export default navbar;
