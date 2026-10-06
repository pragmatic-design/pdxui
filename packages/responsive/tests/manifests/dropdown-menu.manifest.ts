/**
 * MANIFEST — pdx-dropdown-menu (tier 1A, button trigger + portaled floating menu)
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/dropdown-menu/pdx-dropdown-menu.ts)
 * and the CSS (packages/design/src/components/menu.css).
 *
 * ── DOM structure (built imperatively in an rAF inside ctx.track, NOT in the render) ──
 *   render() returns html`` (empty): the whole DOM is created by hand in the first rAF (pdx-dropdown-menu.ts:366).
 *
 *   1) TRIGGER — appended to the HOST (ctx.el, light DOM) (pdx-dropdown-menu.ts:380):
 *      <pdx-dropdown-menu>                                ← host, display:inline-block, position:relative (menu.css:166)
 *        <button type="button" class="pdx-{variant}" [size]
 *                aria-haspopup="menu" aria-expanded="false|true"   ← :373-374, toggle in open()/close()
 *                [disabled] [aria-label="Menu" when icon-only]>      ← the aria-label ONLY for an icon with no label (:449)
 *          {icon?}{ ' label ' (text node) }<span class="pdx-dropdown-chevron"><svg/></span>   ← updateTriggerLabel(:429)
 *
 *   2) THE PANEL — PORTALLED to document.body (NOT inside the host) (pdx-dropdown-menu.ts:395):
 *      <div class="pdx-dropdown-menu-panel pdx-menu" role="menu" style="display:none">   ← appended a document.body al mount
 *        <button class="pdx-menu-item" role="menuitem" data-menu-key>{icon?}{label}{shortcut?}</button>   ← buildMenuItems(:35)
 *        <hr class="pdx-menu-separator" role="separator">          ← for item.type==='separator'
 *        <div class="pdx-menu-label" role="presentation">…</div>   ← for item.type==='label'
 *      (checkbox→role="menuitemcheckbox", radio→role="menuitemradio", submenu→aria-haspopup="menu")
 *
 * ── WHERE THE PANEL LIVES (CRITICAL) ──
 *   The panel is PORTALLED to document.body (pdx-dropdown-menu.ts:395, `document.body.appendChild(_panelEl)`),
 *   NOT inside the host. And it is appended AT MOUNT (inside the build's first rAF), staying display:none
 *   until it opens. What that means for the selectors:
 *     - The TRIGGER lives in the host (ctx.el) → a section-scoped selector, like the other manifests'.
 *     - The PANEL is on document.body → NOT section-scoped. A GLOBAL selector, '.pdx-dropdown-menu-panel'.
 *       To avoid collisions between several instances on the body, a SINGLE "open" scenario is used (dd-open).
 *
 * ── Opening ──
 *   - Mouse: a click on the trigger → toggle() → open() (:376, :284).
 *   - Keyboard: ArrowDown on the trigger (while closed) → open('first'); ArrowUp → open('last').
 *     While open, the trigger carries aria-controls = the panel's id; Tab closes it without preventing the Tab.
 *   - Programmatic: the host EXPOSES the API on `(ctx.el).__dropdownMenu = { open, close, toggle }` (:468) —
 *     It is NOT a direct method on the host. The setup calls `host.__dropdownMenu.open()`.
 *   open() (:235): aria-expanded='true', display='', positionMenu() (position:fixed, under the trigger through
 *   placement 'bottom-start', offset 4 → :303), an rAF focus on the first menuitem (:249), click-outside (mousedown)
 *   and Escape (a capture keydown) to close. close() (:271): aria-expanded='false', display:none, focus back to the trigger.
 *
 * ── a11y (verified) ──
 *   The trigger: aria-haspopup="menu" + aria-expanded; its accessible name comes from the `label` text (the scenarios always
 *   set `label` on the trigger so it has a real name; an icon-only trigger gets aria-label="Menu" :449).
 *   The panel: role="menu"; its button.pdx-menu-item children are role="menuitem" with text → the accessible name is fine.
 *   Note: the menu panel is ALWAYS on document.body, even while closed (display:none) → axe scans it
 *   in the open scenario only; while closed it is not visible and raises no naming violation (display:none).
 *
 * ── States set up front → standalone rules (NOT stateRules) ──
 *   disabled is a static prop → a dedicated scenario (dd-disabled), asserting the cursor (button:disabled → not-allowed
 *   through the UA's :disabled and pointer-events). aria-expanded while open is checked through the keyboard and overlay rules on the open scenario.
 *
 * ── Contracts: CONSERVATIVE, no theme-specific px. Invariants that hold on all 13 themes:
 *   · the trigger is a box (display is not 'none') that is interactive (cursor pointer), with radius >= 0;
 *   · open: the panel is VISIBLE (display flex through .pdx-menu), of a noticeable width, UNDER the trigger
 *     (an overlay with no backdrop, no centring);
 *   · the menuitems are contained in the menu panel.
 *
 * ── REAL BUGS ──
 *   1) ORPHAN PANEL LEAK on document.body (pdx-dropdown-menu.ts:395):
 *      The panel is appended to document.body AT MOUNT (inside the first rAF) for EVERY instance and stays there
 *      (display:none) until the destroy. So every dropdown leaves an orphan node on the body even if it is never opened;
 *      with N instances on the page → N panels on the body. The cleanup (:459-466) removes _panelEl when the custom element is
 *      destroyed, so it is not a permanent leak, BUT it is inconsistent with select.ts (which does NOT portal) and it makes the
 *      selectors ambiguous (several '.pdx-dropdown-menu-panel' on the body at once). The proposed fix: append the panel to the body
 *      LAZILY in open() (and remove it in close()), or keep it in the host as pdx-select does. For the manifest:
 *      it is mitigated by using a SINGLE open scenario and the global selector '.pdx-dropdown-menu-panel'.
 *   2) THE ESCAPE LISTENER is not removed by the cleanup directly (minor): close() removes _escHandler, and the track's
 *      cleanup (:459) calls close() → covered. No fix needed.
 */
import type { ComponentManifest } from './_types';

export const dropdownMenu: ComponentManifest = {
    name: 'dropdown-menu',
    tag: 'pdx-dropdown-menu',
    tier: '1A',
    status: 'wip',
    imports: ['@pdxui/ui/dropdown-menu'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'dd-closed',
            title: 'Dropdown Menu — Trigger closed',
            html: `
                <pdx-dropdown-menu data-test="dd"
                    label="Actions"
                    variant="outline"
                    size="sm"
                    items='[{"key":"new","label":"New"},{"key":"open","label":"Open"},{"type":"separator"},{"key":"del","label":"Delete","danger":true}]'>
                </pdx-dropdown-menu>`,
        },
        {
            // The ONE open scenario: the panel is portalled to document.body. It is opened programmatically
            // through the API exposed on the host (__dropdownMenu.open). The await waits for the positioning rAF.
            id: 'dd-open',
            title: 'Dropdown Menu — Open (menu panel visible below trigger)',
            // Room for the panel, as the cascader, the tree-select and the date picker have. Without it
            // the section ends just under the trigger and the visual baseline holds the first pixels of
            // the menu in every theme.
            html: `
                <div style="padding-bottom: 180px;">
                    <pdx-dropdown-menu data-test="dd-open"
                        label="Actions"
                        variant="outline"
                        size="sm"
                        items='[{"key":"new","label":"New"},{"key":"open","label":"Open"},{"type":"separator"},{"key":"del","label":"Delete","danger":true}]'>
                    </pdx-dropdown-menu>
                </div>`,
            setup: `
                const host = document.querySelector('section:not([hidden]) [data-test="dd-open"]');
                if (host && host.__dropdownMenu && typeof host.__dropdownMenu.open === 'function') host.__dropdownMenu.open();
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));`,
        },
        {
            // The trigger is the author's element in `slot="trigger"`, here an avatar-like
            // span. Opened by the setup, like dd-open, so the panel can be placed against it.
            id: 'dd-custom-trigger',
            title: 'Dropdown Menu — Custom trigger (slot="trigger")',
            html: `
                <pdx-dropdown-menu data-test="dd-custom"
                    items='[{"key":"profile","label":"Profile"},{"key":"out","label":"Sign out"}]'>
                    <span slot="trigger" data-test="dd-avatar" aria-label="Account"
                        style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:var(--pdx-color-primary);color:var(--pdx-color-primary-text);cursor:pointer">AS</span>
                </pdx-dropdown-menu>`,
            setup: `
                const host = document.querySelector('section:not([hidden]) [data-test="dd-custom"]');
                if (host && typeof host.open === 'function') host.open();
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));`,
        },
        {
            id: 'dd-disabled',
            title: 'Dropdown Menu — Disabled',
            html: `
                <pdx-dropdown-menu data-test="dd-dis"
                    label="Actions"
                    variant="outline"
                    size="sm"
                    disabled
                    items='[{"key":"new","label":"New"}]'>
                </pdx-dropdown-menu>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'dd-closed': {
                standalone: [
                    {
                        // Trigger = button.pdx-{variant} in the host; a visible box.
                        selector: 'section:not([hidden]) [data-test="dd"] button[aria-haspopup="menu"]',
                        description: 'trigger button is a visible box',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // CSS button: cursor pointer → interactive.
                        selector: 'section:not([hidden]) [data-test="dd"] button[aria-haspopup="menu"]',
                        description: 'trigger button is interactive (cursor pointer)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // A non-negative radius (the radius-zero themes zero it, never below 0).
                        selector: 'section:not([hidden]) [data-test="dd"] button[aria-haspopup="menu"]',
                        description: 'trigger radius is non-negative',
                        radius: {
                            topLeft: { op: '>=', value: 0 },
                            topRight: { op: '>=', value: 0 },
                            bottomLeft: { op: '>=', value: 0 },
                            bottomRight: { op: '>=', value: 0 },
                        },
                    },
                ],
                composition: [
                    {
                        // The chevron is contained in the trigger (the layout holds).
                        description: 'chevron is contained within the trigger button',
                        parent: 'section:not([hidden]) [data-test="dd"] button[aria-haspopup="menu"]',
                        children: {
                            trigger: 'button[aria-haspopup="menu"]',
                            chevron: '.pdx-dropdown-chevron',
                        },
                        relations: [
                            { description: 'chevron within trigger', left: 'chevron', op: 'contained-in', right: 'trigger' },
                        ],
                    },
                ],
            },

            // Open: the panel (portalled to the body, .pdx-menu → display:flex) is VISIBLE and UNDER the trigger.
            // A GLOBAL selector (not section-scoped), because the panel lives on document.body.
            'dd-open': {
                standalone: [
                    {
                        selector: '.pdx-dropdown-menu-panel',
                        description: 'open menu panel is displayed (flex column via .pdx-menu)',
                        display: { op: 'oneOf', value: ['flex', 'block'] },
                    },
                    {
// .pdx-menu min-width 10rem (160px) + inline minWidth from the prop (default 200) → a measurable width.
                        selector: '.pdx-dropdown-menu-panel',
                        description: 'open menu panel has an appreciable width',
                        width: { op: '>=', value: 120 },
                    },
                    {
                        selector: '.pdx-dropdown-menu-panel',
                        description: 'open menu panel radius is non-negative',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                overlay: [
                    {
                        // Opened by the setup (__dropdownMenu.open) → action:'call' = the state is already on, and the runner
                        // does NOT click; it measures the panel. The panel is on the body → a global selector. No backdrop.
                        description: 'open dropdown shows the menu panel without a backdrop',
                        trigger: { selector: 'section:not([hidden]) [data-test="dd-open"] button[aria-haspopup="menu"]', action: 'call' },
                        panel: '.pdx-dropdown-menu-panel',
                        hasBackdrop: false,
                        minWidth: { op: '>=', value: 120 },
                    },
                ],
                composition: [
                    {
                        // The panel (position:fixed, placement 'bottom-start', offset 4) sits UNDER the trigger.
                        // parent = body: both the trigger (through the host in the light DOM) and the panel are descendants of the body.
                        description: 'menu panel sits below the trigger',
                        parent: 'body',
                        children: {
                            trigger: 'section:not([hidden]) [data-test="dd-open"] button[aria-haspopup="menu"]',
                            panel: '.pdx-dropdown-menu-panel',
                        },
                        relations: [
                            { description: 'panel.top >= trigger.bottom (below)', left: 'trigger.bottom', op: '<=', right: 'panel.top', tolerance: 6 },
                        ],
                    },
                    {
                        // The menuitems live inside the menu panel.
                        description: 'menu items are contained within the menu panel',
                        parent: '.pdx-dropdown-menu-panel',
                        children: {
                            panel: '.pdx-dropdown-menu-panel',
                            item: '.pdx-menu-item',
                        },
                        relations: [
                            { description: 'first menu item within panel', left: 'item', op: 'contained-in', right: 'panel' },
                        ],
                    },
                ],
            },

            // The slotted trigger IS the menu button: it carries the ARIA, no button of the component is
            // built beside it, and the menu opens under it.
            'dd-custom-trigger': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="dd-custom"] [data-test="dd-avatar"][role="button"][aria-haspopup="menu"][aria-expanded="true"][tabindex="0"]',
                        description: 'the slotted trigger is the menu button, and says it is open',
                        count: { op: '==', value: 1 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="dd-custom"] button',
                        description: 'no built-in button beside the slotted trigger',
                        count: { op: '==', value: 0 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="dd-custom"] slot',
                        description: 'no empty <slot> left in the host',
                        count: { op: '==', value: 0 },
                    },
                    {
                        selector: '.pdx-dropdown-menu-panel',
                        description: 'the menu opened from the slotted trigger is displayed',
                        display: { op: 'oneOf', value: ['flex', 'block'] },
                    },
                ],
                composition: [
                    {
                        description: 'menu panel sits below the slotted trigger',
                        parent: 'body',
                        children: {
                            trigger: 'section:not([hidden]) [data-test="dd-avatar"]',
                            panel: '.pdx-dropdown-menu-panel',
                        },
                        relations: [
                            { description: 'panel.top >= trigger.bottom (below)', left: 'trigger.bottom', op: '<=', right: 'panel.top', tolerance: 6 },
                        ],
                    },
                ],
            },

            // Disabled: prop statica → standalone.
            'dd-disabled': {
                standalone: [
                    {
                        // button:disabled → cursor not-allowed (UA + .pdx-* button styles).
                        selector: 'section:not([hidden]) [data-test="dd-dis"] button[aria-haspopup="menu"]',
                        description: 'disabled trigger is not clickable (no pointer cursor)',
                        cursor: { op: 'isNot', value: 'pointer' },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // Closed: a trigger button with the `label` text (its accessible name) + aria-haspopup="menu" + aria-expanded="false".
    // Open: a role="menu" panel with menuitems (buttons with text) → the accessible name is fine.
    // No disableRule: the scenarios always set `label` on the trigger.
    a11y: {
        scenarios: ['dd-closed', 'dd-open', 'dd-custom-trigger'],
    },

    // ── Dim. 3: style isolation ──
    // The trigger (a design-system button) keeps its geometry under hostile global CSS.
    // skipHeight: the button's height is content- and min-height-driven (the padding plus the host's line-height) → not a clean
    //   structural invariant under hostile CSS; the radius (a CSS value, not scaled) stays asserted.
    isolation: {
        scenario: 'dd-closed',
        targets: [
            { selector: 'section:not([hidden]) [data-test="dd"] button[aria-haspopup="menu"]', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) — menu ──
    // Pattern 'menu'. The scenario is already open from the setup (__dropdownMenu.open) → in the opening rAF the focus goes
    // to the first menuitem (pdx-dropdown-menu.ts:249) and focusGroup (vertical, wrap, typeAhead) handles ArrowUp/Down.
    // initialFocus on the first menuitem (already focused by the opening). ArrowDown moves inside the panel; Escape closes
    // → aria-expanded goes back to false on the trigger and the focus returns to it. Then the APG menu button:
    // ArrowUp on the trigger opens with the focus on the LAST enabled item, and Tab closes (it does not trap: no
    // trapContainer — the focus carries on from the trigger).
    keyboard: {
        scenario: 'dd-open',
        initialFocus: '.pdx-dropdown-menu-panel .pdx-menu-item:not([disabled])',
        steps: [
            // Open: the focus must be INSIDE the menu panel.
            { key: 'ArrowDown', expectFocusWithin: '.pdx-dropdown-menu-panel' },
            // Escape closes it → aria-expanded goes back to false on the trigger.
            { key: 'Escape', expectAttr: { selector: 'section:not([hidden]) [data-test="dd-open"] button[aria-haspopup="menu"]', name: 'aria-expanded', value: 'false' } },
            // …and the focus returns to the trigger (close() → _triggerEl.focus()).
            { key: 'Escape', expectFocus: 'section:not([hidden]) [data-test="dd-open"] button[aria-haspopup="menu"]' },
            // ArrowUp on the closed trigger → it opens on the last item ("Delete"; the separator is not an item).
            { key: 'ArrowUp', expectFocus: '.pdx-dropdown-menu-panel .pdx-menu-item[data-menu-key="del"]' },
// Tab from the open menu → closes it.
            { key: 'Tab', expectAttr: { selector: 'section:not([hidden]) [data-test="dd-open"] button[aria-haspopup="menu"]', name: 'aria-expanded', value: 'false' } },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — closed + open ──
    visual: {
        scenarios: ['dd-closed', 'dd-open'],
        // Measured floor, not a guess. The open menu is a fixed panel on <body> drawn over the
        // trigger's soft double shadow, and in neumorphic about one run in twenty under a full
        // parallel load rasterises 3 pixels of the panel's rounded top corners differently — out
        // of 350,400. The geometry does not move: the panel's position read in 20 loaded runs was
        // the same to the subpixel every time.
        //
        // 0.00005 is about 17 pixels on this section: the corners' antialiasing passes, while a 2px
        // border (thousands of pixels) or any shift of the panel still fails.
        maxDiffPixelRatio: 0.00005,
    },
};

export default dropdownMenu;
