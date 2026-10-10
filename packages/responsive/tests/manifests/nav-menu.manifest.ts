/**
 * MANIFEST — pdx-nav-menu (Tier 6)
 *
 * NEW contracts, derived by inspecting:
 *  - the source: packages/ui/src/nav-menu/pdx-nav-menu.ts
 *      the HOST <pdx-nav-menu> → in an rAF it adds the class .pdx-nav-menu-root to the host and creates
 *      inside it an INNER <nav class="pdx-nav" role="navigation" aria-label="Navigation">.
 *      Every entry is an <a class="pdx-nav-item"> (when item.href is set and there are no children) or a
 *      <button type="button" class="pdx-nav-item"> (groups, and entries with no href).
 *        - active: the .active class plus aria-current="page" (both there) ✔ a11y.
 *        - disabled: aria-disabled="true" (plus button.disabled).
 *        - a group with children: aria-expanded plus a .pdx-nav-chevron chevron.
 *      Data-driven (the `items` prop). A roving tabindex and the APG disclosure-navigation keys
 *      (not every entry its own Tab stop).
 *      The icon: when item.icon is a name → a <pdx-icon name size=18> inside .pdx-nav-icon; the label
 *      stays in a text span .pdx-nav-label → the accessible name is guaranteed by the entry's text.
 *  - CSS: packages/design/src/components/nav.css
 *      .pdx-nav → display:flex; flex-direction:column; gap:2xs (content-driven height).
 *      .pdx-nav-item → display:flex; align-items:center; width:100%; cursor:pointer;
 *                      border-radius: radius-sm; color:muted; background:transparent.
 *      .pdx-nav-item.active / [aria-current="page"] → background:inset; color:primary; medium.
 *      .pdx-nav-item:disabled / [aria-disabled] → opacity:var(--pdx-opacity-disabled);
 *                      cursor:not-allowed.
 *
 * Conservative rules: invariants true on ALL themes. No exact px.
 * Radius: metro and cyberpunk may zero it → we accept >= 0.
 * States already in the DOM (active/disabled) → STANDALONE rules (no triggered states: it avoids flake).
 * Isolation: the container is content-driven (its height is the sum of the entries, sensitive to the host's line-height)
 *   → skipHeight:true; the radius (a CSS value, not scaled) stays asserted.
 *
 * Accessibility: a <nav> with aria-label="Navigation"; the active entry with aria-current="page";
 *   every entry takes its accessible name from the label's text. No disableRules: accessible by design.
 */
import type { ComponentManifest } from './_types';

export const navMenu: ComponentManifest = {
    name: 'nav-menu',
    tag: 'pdx-nav-menu',
    tier: '6',
    status: 'wip',
    imports: ['@pdxui/ui/nav-menu'],

    // ── Scenarios ──
    // JSON-driven items. One active entry (activeKey), to exercise the active state and aria-current.
    scenarios: [
        {
            id: 'nav-menu-basic',
            title: 'Nav Menu — Basic',
            html: `<pdx-nav-menu data-test="nav-menu" active-key="dashboard" items='[{"key":"dashboard","label":"Dashboard"},{"key":"projects","label":"Projects"},{"key":"settings","label":"Settings","disabled":true}]'></pdx-nav-menu>`,
        },
        {
            // A section header (`type: 'header'` → .pdx-nav-heading), the smallest text the nav
            // draws: 12px uppercase. Painted with --pdx-color-subtle it would be 2.07–2.89:1 on the
            // page, so its contrast is measured in the browser.
            id: 'nav-menu-heading',
            title: 'Nav Menu — Section headings',
            html: `<pdx-nav-menu data-test="nav-menu-hdr" active-key="dashboard" items='[{"type":"header","label":"General"},{"key":"dashboard","label":"Dashboard"},{"type":"header","label":"System"},{"key":"settings","label":"Settings"}]'></pdx-nav-menu>`,
        },
        {
            // A heading that FOLDS its group: a button, open by default, the reference's
            // `sidemenu/grouping`. The entries live in a `role="group"` it controls.
            id: 'nav-menu-folding',
            title: 'Nav Menu — A group heading that folds',
            html: `<pdx-nav-menu data-test="nav-menu-fold" active-key="dashboard" items='[{"key":"work","type":"header","label":"Work","children":[{"key":"dashboard","label":"Dashboard"},{"key":"board","label":"Board"}]},{"key":"account","label":"Account"}]'></pdx-nav-menu>`,
        },
        {
            // COLLAPSED to icons, a group opens in a FLYOUT beside its icon: the only
            // way a second level is reachable in an 80px rail.
            id: 'nav-menu-flyout',
            title: 'Nav Menu — Collapsed, a group in a flyout',
            html: `<div style="width: 64px"><pdx-nav-menu data-test="nav-menu-fly" collapsed items='[{"key":"dashboard","label":"Dashboard","icon":"<svg viewBox=\\"0 0 24 24\\"><rect x=\\"4\\" y=\\"4\\" width=\\"16\\" height=\\"16\\"/></svg>"},{"key":"tickets","label":"Tickets","icon":"<svg viewBox=\\"0 0 24 24\\"><circle cx=\\"12\\" cy=\\"12\\" r=\\"8\\"/></svg>","children":[{"key":"all","label":"All tickets"},{"key":"mine","label":"Mine"}]}]'></pdx-nav-menu></div>`,
        },
        {
            // The looks an app shell would otherwise reach through the internal classes. `size="sm"`
            // beside the default, the same entries: a dense sidebar's menu.
            id: 'nav-menu-sm',
            title: 'Nav Menu — size="sm" beside the default',
            html: `<div style="display: flex; gap: 24px; width: 520px"><div style="flex: 1"><pdx-nav-menu data-test="nav-md" active-key="dashboard" items='[{"key":"dashboard","label":"Dashboard","icon":"<svg viewBox=\\"0 0 24 24\\"><rect x=\\"4\\" y=\\"4\\" width=\\"16\\" height=\\"16\\"/></svg>"},{"key":"tickets","label":"Tickets","icon":"<svg viewBox=\\"0 0 24 24\\"><circle cx=\\"12\\" cy=\\"12\\" r=\\"8\\"/></svg>"}]'></pdx-nav-menu></div><div style="flex: 1"><pdx-nav-menu data-test="nav-sm" size="sm" active-key="dashboard" items='[{"key":"dashboard","label":"Dashboard","icon":"<svg viewBox=\\"0 0 24 24\\"><rect x=\\"4\\" y=\\"4\\" width=\\"16\\" height=\\"16\\"/></svg>"},{"key":"tickets","label":"Tickets","icon":"<svg viewBox=\\"0 0 24 24\\"><circle cx=\\"12\\" cy=\\"12\\" r=\\"8\\"/></svg>"}]'></pdx-nav-menu></div></div>`,
        },
        {
            // `indicator="border"`: the current entry carries a bar on its start edge, and every entry
            // keeps the bar's width so a label does not move when the current one changes.
            id: 'nav-menu-border',
            title: 'Nav Menu — indicator="border"',
            html: `<div style="width: 260px"><pdx-nav-menu data-test="nav-border" indicator="border" active-key="dashboard" items='[{"key":"dashboard","label":"Dashboard"},{"key":"projects","label":"Projects"}]'></pdx-nav-menu></div>`,
        },
        {
            // `chevron="end"`: a group's chevron at the end of its row, beside the default's at the start.
            id: 'nav-menu-chevron',
            title: 'Nav Menu — chevron="start" and chevron="end"',
            html: `<div style="display: flex; gap: 24px; width: 560px"><div style="flex: 1"><pdx-nav-menu data-test="nav-chev-start" items='[{"key":"tickets","label":"Tickets","children":[{"key":"all","label":"All tickets"}]}]'></pdx-nav-menu></div><div style="flex: 1"><pdx-nav-menu data-test="nav-chev-end" chevron="end" items='[{"key":"tickets","label":"Tickets","children":[{"key":"all","label":"All tickets"}]}]'></pdx-nav-menu></div></div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, derived from nav.css) ──
    contracts: {
        scenarios: {
            'nav-menu-basic': {
                standalone: [
                    {
                        // The navigation's rhythm.
                        //
                        // An item's content measures 37.59 to 43.19 across the 13 themes — a function
                        // of each theme's type scale. It reads `--pdx-nav-item-height`, whose
                        // default (36) is below every one of those; what it buys is that an
                        // application states 40 and every item is 40.
                        //
                        // Asserted as the floor and a band, not an exact number, because the
                        // DEFAULT deliberately leaves each theme its own type: the rule is that an
                        // item is at least the rhythm and never a surface of its own invention.
                        selector: '[data-test="nav-menu"] .pdx-nav-item',
                        description: 'a nav item is at least the declared rhythm (36)',
                        height: { op: '>=', value: 36 },
                    },
                    {
                        selector: '[data-test="nav-menu"] .pdx-nav-item',
                        description: 'and within a type scale of it, not a value of its own',
                        height: { op: '<=', value: 44 },
                    },
                    {
                        // INNER nav: display flex column.
                        selector: 'section:not([hidden]) [data-test="nav-menu"] .pdx-nav',
                        description: 'nav list is flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // The active entry: .pdx-nav-item.active → border-radius (sm), metro/cyberpunk → >= 0.
                        selector: 'section:not([hidden]) [data-test="nav-menu"] .pdx-nav-item.active',
                        description: 'active nav item radius >= 0',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        // The active entry is interactive → cursor pointer.
                        selector: 'section:not([hidden]) [data-test="nav-menu"] .pdx-nav-item.active',
                        description: 'active nav item cursor = pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // The active entry (not disabled) → opaque.
                        selector: 'section:not([hidden]) [data-test="nav-menu"] .pdx-nav-item.active',
                        description: 'active nav item opacity = 1',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                    {
                        // A disabled entry (a state already in the DOM) → a reduced opacity.
                        selector: 'section:not([hidden]) [data-test="nav-menu"] .pdx-nav-item[aria-disabled="true"]',
                        description: 'disabled nav item has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                ],
                composition: [
                    {
                        // Entries aligned in the same column → the same width (width:100%).
                        description: 'nav items share the same width (left-aligned column)',
                        parent: '[data-test="nav-menu"] .pdx-nav',
                        children: {
                            active: '[data-test="nav-menu"] .pdx-nav-item.active',
                            other: '[data-test="nav-menu"] .pdx-nav-item:not(.active):not([aria-disabled="true"])',
                        },
                        relations: [
                            {
                                description: 'active and non-active item same width',
                                left: 'active.width',
                                op: '==',
                                right: 'other.width',
                                tolerance: 2,
                            },
                        ],
                    },
                    {
                        // The entry is contained in the nav (no horizontal overflow).
                        description: 'nav item contained in nav list',
                        parent: 'body',
                        children: {
                            nav: '[data-test="nav-menu"] .pdx-nav',
                            item: '[data-test="nav-menu"] .pdx-nav-item.active',
                        },
                        relations: [
                            {
                                description: 'item width <= nav width',
                                left: 'item.width',
                                op: '<=',
                                right: 'nav.width',
                                tolerance: 2,
                            },
                        ],
                    },
                ],
            },
            // A nav section label is text: WCAG AA on the page, in every theme and both schemes.
            'nav-menu-heading': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="nav-menu-hdr"] .pdx-nav-heading',
                        description: 'section heading text is legible (AA)',
                        contrast: { op: '>=', value: 4.5 },
                    },
                ],
            },
            // Beside the icon, on screen — styled before it is measured.
            'nav-menu-flyout': {
                positioning: [
                    {
                        description: 'a collapsed group opens a flyout to the right of its icon, within the viewport',
                        trigger: { selector: 'section:not([hidden]) [data-test="nav-menu-fly"] [data-nav-key="tickets"]', action: 'hover' },
                        floating: '.pdx-nav-flyout',
                        placement: 'right',
                        withinViewport: true,
                        tolerance: 6,
                    },
                ],
            },
            // `size="sm"` is smaller in every part a dense sidebar needs smaller.
            'nav-menu-sm': {
                composition: [
                    {
                        description: 'size="sm" is denser than the default, the same entries',
                        parent: 'section:not([hidden])',
                        children: {
                            md: 'section:not([hidden]) [data-test="nav-md"] [data-nav-key="tickets"]',
                            sm: 'section:not([hidden]) [data-test="nav-sm"] [data-nav-key="tickets"]',
                            mdIcon: 'section:not([hidden]) [data-test="nav-md"] [data-nav-key="tickets"] .pdx-nav-icon',
                            smIcon: 'section:not([hidden]) [data-test="nav-sm"] [data-nav-key="tickets"] .pdx-nav-icon',
                        },
                        relations: [
                            { description: 'a sm entry is shorter', left: 'sm.height', op: '<', right: 'md.height' },
                            { description: 'a sm icon is smaller', left: 'smIcon.width', op: '<', right: 'mdIcon.width' },
                        ],
                    },
                ],
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="nav-sm"] [data-nav-key="tickets"] .pdx-nav-label',
                        description: 'a sm entry\'s label is smaller than the default text (0.8rem)',
                        fontSize: { op: '<=', value: 13 },
                    },
                ],
            },
            // The bar is on the current entry only, and costs no label its place.
            'nav-menu-border': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="nav-border"] .pdx-nav-item.active',
                        description: 'the current entry carries a 3px solid bar on its start edge',
                        border: { left: { width: { op: '==', value: 3, tolerance: 0.5 }, style: { op: 'is', value: 'solid' } } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="nav-border"] .pdx-nav-item:not(.active)',
                        description: 'another entry keeps the bar\'s width, transparent',
                        border: { left: { width: { op: '==', value: 3, tolerance: 0.5 }, color: { op: 'is', value: 'rgba(0, 0, 0, 0)' } } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="nav-border"] .pdx-nav-item.active',
                        description: 'a bar on a square entry: no radius',
                        radius: { all: { op: '==', value: 0, tolerance: 0.5 } },
                    },
                ],
                composition: [
                    {
                        description: 'the labels stay in one column, current or not',
                        parent: 'section:not([hidden]) [data-test="nav-border"]',
                        children: {
                            current: 'section:not([hidden]) [data-test="nav-border"] .pdx-nav-item.active .pdx-nav-label',
                            other: 'section:not([hidden]) [data-test="nav-border"] .pdx-nav-item:not(.active) .pdx-nav-label',
                        },
                        relations: [{ description: 'same label start', left: 'current.left', op: '==', right: 'other.left', tolerance: 1 }],
                    },
                ],
            },
            // The chevron's side, measured against the group's label.
            'nav-menu-chevron': {
                composition: [
                    {
                        description: 'chevron="start" draws the chevron before the label',
                        parent: 'section:not([hidden]) [data-test="nav-chev-start"]',
                        children: {
                            chevron: 'section:not([hidden]) [data-test="nav-chev-start"] .pdx-nav-group-trigger > .pdx-nav-chevron',
                            label: 'section:not([hidden]) [data-test="nav-chev-start"] .pdx-nav-group-trigger > .pdx-nav-label',
                        },
                        relations: [{ description: 'chevron ends before the label starts', left: 'chevron.right', op: '<=', right: 'label.left' }],
                    },
                    {
                        description: 'chevron="end" draws it after the label, at the row\'s end',
                        parent: 'section:not([hidden]) [data-test="nav-chev-end"]',
                        children: {
                            chevron: 'section:not([hidden]) [data-test="nav-chev-end"] .pdx-nav-group-trigger > .pdx-nav-chevron',
                            label: 'section:not([hidden]) [data-test="nav-chev-end"] .pdx-nav-group-trigger > .pdx-nav-label',
                        },
                        relations: [{ description: 'chevron starts after the label ends', left: 'chevron.left', op: '>=', right: 'label.right' }],
                    },
                ],
            },
            // The folding heading is a control, and it still reads as a heading.
            'nav-menu-folding': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="nav-menu-fold"] .pdx-nav-heading-toggle',
                        description: 'a folding heading says it can be clicked',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="nav-menu-fold"] .pdx-nav-heading-toggle',
                        description: 'a folding heading is legible (AA), as a plain one is',
                        contrast: { op: '>=', value: 4.5 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // A <nav> with aria-label="Navigation"; the active entry with aria-current="page"; the accessible name
    // comes from the label's text. No disableRules.
    a11y: {
        // The folding one too: a button heading with aria-expanded and an aria-controls that must
        // point at an element that exists.
        scenarios: ['nav-menu-basic', 'nav-menu-folding'],
    },

    // ── Dim. 3: style isolation ──
    // A content-driven container (height = the sum of the entries) → skipHeight; the radius stays asserted.
    isolation: {
        scenario: 'nav-menu-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="nav-menu"] .pdx-nav-item.active', tolerancePx: 12, skipHeight: true, leaks: [{ issue: 170, properties: ['letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard — the APG disclosure navigation, roving tabindex ──
    // Tab does not walk every entry: the menu is ONE Tab stop and the arrows move
    // inside it; the disabled «Settings» is skipped and the arrows do not wrap. The groups' keys
    // (ArrowRight/Left) are in `nav-menu-keyboard.test.ts`: this scenario has no group.
    keyboard: {
        scenario: 'nav-menu-basic',
        initialFocus: 'section:not([hidden]) [data-test="nav-menu"] [data-nav-key="dashboard"]',
        steps: [
            { key: 'ArrowDown', expectFocus: 'section:not([hidden]) [data-test="nav-menu"] [data-nav-key="projects"]' },
            { key: 'ArrowDown', expectFocus: 'section:not([hidden]) [data-test="nav-menu"] [data-nav-key="projects"]' },
            { key: 'Home', expectFocus: 'section:not([hidden]) [data-test="nav-menu"] [data-nav-key="dashboard"]' },
            { key: 'End', expectFocus: 'section:not([hidden]) [data-test="nav-menu"] [data-nav-key="projects"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['nav-menu-basic'],
    },
};

export default navMenu;
