/**
 * MANIFEST — pdx-menubar (tier 3, a horizontal menu bar of the File | Edit | View … kind)
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/menubar/pdx-menubar.ts)
 * and the CSS (packages/design/src/components/menu.css).
 *
 * ── Props ──
 *   · items:   Array  (default []) — the top-level entries [{ key, label, children?, disabled?, mega?, megaColumns? }]
 *              passed as a JSON attribute: items='[…]'.
 *   · trigger: String (default 'click') — 'click' opens on a click and the pointer
 *     then moves the open menu; 'hover' opens on mouseenter alone.
 *
 * ── Events ── ctx.emit('pdx-select', {key,item}) and ctx.emit('pdx-check', {key,checked,…}) on the items
 *   OF THE PANELS (not on the bar). The top-level bar emits no event of its own.
 *
 * ── DOM structure (light DOM, built imperatively in an rAF — pdx-menubar.ts:477-542) ──
 *   render() = html`` (empty). The DOM is created in ctx.track → requestAnimationFrame:
 *     <pdx-menubar class="pdx-menubar" items='…'>          ← host, CSS: display:block (menu.css:210)
 *       <div class="pdx-menubar-bar" role="menubar" aria-label="Menu">   ← BARRA top-level
 *                                                          CSS: display:flex; align-items:center (menu.css:214)
 *                                                          → ALWAYS horizontal (a row). Stable geometry.
 *         <button class="pdx-menubar-trigger" type="button"
 *                 role="menuitem"                          ← a menuitem inside a menubar = the correct WAI-ARIA structure
 *                 data-menubar-key="{key}"
 *                 aria-haspopup="menu"
 *                 aria-expanded="false|true"               ← 'true' when its panel is open
 *                 [disabled]>{label}</button>              ← one per top-level entry
 *
 * ── WHERE THE PANELS LIVE (CRITICAL) ──
 *   openMenu() (pdx-menubar.ts:58) creates a `.pdx-menubar-panel[role=menu]` and calls
 *   `document.body.appendChild(_panelEl)` (line 96) → THE PANEL IS PORTALLED TO document.body,
 *   it is neither a child of the host nor inside the scenario's <section>. Measuring it needs GLOBAL
 *   SELECTORS (`.pdx-menubar-panel`), NOT section-scoped ones. The same for the submenus
 *   (`[data-submenu-key]`, also appended to the body — line 374).
 *   The panel is `position:fixed`, placed under the trigger (top = trigger.bottom + 2, left = trigger.left;
 *   flip up / a horizontal clamp on overflow — positionPanel:194).
 *   The panel's entries: <button class="pdx-menu-item" role="menuitem|menuitemcheckbox|menuitemradio">.
 *
 * ── Opening ── a click on the trigger (toggle) or a hover (when trigger='hover'). openMenu and closeMenu are exposed
 *   on `host.__menubar` (pdx-menubar.ts:587) → programmatic opening in the "open" scenario through the setup.
 *
 * ── Keyboard (verified in the source) ──
 *   · The bar: a horizontal focusGroup with roving and wrap (pdx-menubar.ts:532-541, orientation:'horizontal').
 *     ArrowLeft/Right move the focus between the top-level triggers (focusGroup handles the roving tabindex).
 *     focusGroup needs an element of the group to have the focus ALREADY → initialFocus on the first trigger.
 *   · The open panel: onPanelKeydown (pdx-menubar.ts:421) — ArrowLeft/Right switch the top-level menu to
 *     the adjacent one, ArrowRight on a submenu entry opens it; a vertical focusGroup inside the panel
 *     (Up/Down plus type-ahead). Escape closes (the submenu first, then the menu, refocusing the trigger).
 *   → keyboard pattern 'roving' on the bar (ArrowRight is tested with expectFocus on the second trigger).
 *
 * ── Testing choices ──
 *   · The BAR is always visible (a stable geometry) → the base contracts need no opening.
 *   · ONE "open" scenario (menubar-open) with a setup (openMenu, programmatically) to measure the
 *     panel portalled to the body, plus axe and the visual. The panel's selectors are GLOBAL.
 *   · CONSERVATIVE contracts: no theme-specific px. Invariants that hold on all 13 themes:
 *       - the bar is display flex + height > 0;
 *       - the triggers are aligned in a row (the same top, ordered left to right);
 *       - open: the panel is visible, under the first trigger.
 *
 * ── REAL BUGS ── none. role="menubar" + role="menuitem" + aria-haspopup + aria-expanded are there;
 *   horizontal roving with the arrows is implemented; Escape is handled. The WAI-ARIA menubar structure is right.
 */
import type { ComponentManifest } from './_types';

// The top-level entries reused in both scenarios. "File" has children (an openable submenu), "Edit"/"View"/"Help".
const ITEMS = `[
    {"key":"file","label":"File","children":[
        {"key":"new","label":"New","type":"item","shortcut":"Ctrl+N"},
        {"key":"open","label":"Open","type":"item","shortcut":"Ctrl+O"},
        {"key":"sep1","type":"separator"},
        {"key":"exit","label":"Exit","type":"item"}
    ]},
    {"key":"edit","label":"Edit","children":[
        {"key":"undo","label":"Undo","type":"item"},
        {"key":"redo","label":"Redo","type":"item"}
    ]},
    {"key":"view","label":"View","children":[
        {"key":"zoom","label":"Zoom In","type":"item"}
    ]},
    {"key":"help","label":"Help","children":[
        {"key":"about","label":"About","type":"item"}
    ]}
]`;

export const menubar: ComponentManifest = {
    name: 'menubar',
    tag: 'pdx-menubar',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/menubar'],

    // ── Scenarios ──
    scenarios: [
        {
            // The closed bar: always visible, a stable geometry. The base for the contract, isolation and keyboard rules.
            id: 'menubar-closed',
            title: 'Menubar — Closed top-level bar (File | Edit | View | Help)',
            html: `
                <div style="width: 600px; max-width: 100%;">
                    <pdx-menubar data-test="mb" trigger="click" items='${ITEMS}'></pdx-menubar>
                </div>`,
        },
        {
            // The ONE open scenario: it opens the "file" menu programmatically → the panel is portalled to the body.
            // openMenu is exposed on host.__menubar (pdx-menubar.ts:587). Called after the mount (the build's rAF).
            id: 'menubar-open',
            title: 'Menubar — Open (File menu panel visible below trigger)',
            html: `
                <div style="width: 600px; max-width: 100%;">
                    <pdx-menubar data-test="mb-open" trigger="click" items='${ITEMS}'></pdx-menubar>
                </div>`,
            // The bar is built in an rAF; two rAFs guarantee that __menubar and the triggers exist.
            setup: `
                const host = document.querySelector('section:not([hidden]) [data-test="mb-open"]');
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                if (host && host.__menubar && typeof host.__menubar.openMenu === 'function') {
                    host.__menubar.openMenu('file');
                }
                await new Promise(r => requestAnimationFrame(r));`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'menubar-closed': {
                standalone: [
                    {
                        // The bar is a flex row (menu.css:214-216).
                        selector: 'section:not([hidden]) [data-test="mb"] .pdx-menubar-bar',
                        description: 'menubar bar renders as a flex row',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // The bar holds the triggers (sm buttons) → a noticeable height.
                        selector: 'section:not([hidden]) [data-test="mb"] .pdx-menubar-bar',
                        description: 'menubar bar has a measurable height',
                        height: { op: '>', value: 0 },
                    },
                ],
                composition: [
                    {
                        // The top-level triggers are contained in the bar and aligned in a row.
                        description: 'top-level triggers are contained in the bar and aligned on one row',
                        parent: 'section:not([hidden]) [data-test="mb"] .pdx-menubar-bar',
                        children: {
                            bar: 'section:not([hidden]) [data-test="mb"] .pdx-menubar-bar',
                            file: 'section:not([hidden]) [data-test="mb"] [data-menubar-key="file"]',
                            edit: 'section:not([hidden]) [data-test="mb"] [data-menubar-key="edit"]',
                            help: 'section:not([hidden]) [data-test="mb"] [data-menubar-key="help"]',
                        },
                        relations: [
                            { description: 'file trigger within bar', left: 'file', op: 'contained-in', right: 'bar' },
                            { description: 'help trigger within bar', left: 'help', op: 'contained-in', right: 'bar' },
                            // Row alignment: every trigger shares the top (flex align-items:center, one row).
                            { description: 'file.top == edit.top (same row)', left: 'file.top', op: '==', right: 'edit.top', tolerance: 2 },
                            { description: 'file.top == help.top (same row)', left: 'file.top', op: '==', right: 'help.top', tolerance: 2 },
                            // Ordered left to right: edit follows file horizontally.
                            { description: 'edit is to the right of file', left: 'file.right', op: '<=', right: 'edit.left', tolerance: 2 },
                        ],
                    },
                ],
            },

            // Open: the panel (portalled to the body) is VISIBLE and sits UNDER the "file" trigger.
            // GLOBAL SELECTORS for the panel — it is NOT inside the <section>.
            'menubar-open': {
                standalone: [
                    {
                        // The panel exists in the DOM and is rendered (display is not 'none').
                        selector: '.pdx-menubar-panel',
                        description: 'open menu panel is displayed (not none)',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        selector: '.pdx-menubar-panel',
                        description: 'open menu panel has an appreciable width',
                        width: { op: '>=', value: 80 },
                    },
                ],
                overlay: [
                    {
                        // An overlay with no backdrop: the menubar does not dim the background.
                        description: 'open menu shows the dropdown panel without a backdrop',
                        trigger: { selector: 'section:not([hidden]) [data-test="mb-open"] [data-menubar-key="file"]', action: 'call' },
                        panel: '.pdx-menubar-panel',
                        hasBackdrop: false,
                    },
                ],
                composition: [
                    {
                        // The panel (position:fixed, top = trigger.bottom + 2) sits UNDER the "file" trigger.
                        // parent = body because the panel is portalled; the trigger stays section-scoped.
                        description: 'panel sits below the file trigger',
                        parent: 'body',
                        children: {
                            trigger: 'section:not([hidden]) [data-test="mb-open"] [data-menubar-key="file"]',
                            panel: '.pdx-menubar-panel',
                        },
                        relations: [
                            { description: 'panel.top >= trigger.bottom (below)', left: 'trigger.bottom', op: '<=', right: 'panel.top', tolerance: 4 },
                        ],
                    },
                    {
                        // The menu's entries live inside the panel.
                        description: 'menu items are contained within the panel',
                        parent: '.pdx-menubar-panel',
                        children: {
                            panel: '.pdx-menubar-panel',
                            item: '.pdx-menubar-panel .pdx-menu-item',
                        },
                        relations: [
                            { description: 'first menu item within panel', left: 'item', op: 'contained-in', right: 'panel' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // Closed: role="menubar" + aria-label="Menu" on the bar; the triggers are role="menuitem" with text (their
    //   accessible name) + aria-haspopup + aria-expanded. Open: the panel is role="menu" + entries role="menuitem".
    // No disableRule: a complete WAI-ARIA structure, with no known false positive.
    a11y: {
        scenarios: ['menubar-closed', 'menubar-open'],
    },

    // ── Dim. 3: style isolation ──
    // The target is the bar: a geometric box (flex, fixed padding, a border-bottom). skipHeight: its height follows
    //   the content (the triggers, with the theme's font and line-height) → not a clean invariant across platforms;
    //   the width and the radius stay asserted as the guarantee of immunity to hostile CSS.
    isolation: {
        scenario: 'menubar-closed',
        targets: [
            { selector: 'section:not([hidden]) [data-test="mb"] .pdx-menubar-bar', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA menubar — roving orizzontale) ──
    // The bar uses a focusGroup with orientation:'horizontal' and wrap (pdx-menubar.ts:532) → a roving tabindex.
    // initialFocus = the first trigger (focusGroup needs an element of the group already focused).
    // ArrowRight moves the focus to the adjacent trigger ("edit"); ArrowLeft goes back ("file", with wrap).
    keyboard: {
        scenario: 'menubar-closed',
        initialFocus: 'section:not([hidden]) [data-test="mb"] [data-menubar-key="file"]',
        steps: [
            { key: 'ArrowRight', expectFocus: 'section:not([hidden]) [data-test="mb"] [data-menubar-key="edit"]' },
            { key: 'ArrowLeft', expectFocus: 'section:not([hidden]) [data-test="mb"] [data-menubar-key="file"]' },
            // ArrowDown opens the menu with the focus inside (the APG menubar, not Enter and Space alone).
            {
                key: 'ArrowDown',
                expectAttr: { selector: 'section:not([hidden]) [data-test="mb"] [data-menubar-key="file"]', name: 'aria-expanded', value: 'true' },
                expectFocusWithin: '.pdx-menubar-panel',
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — closed (the bar) + open (the panel) ──
    visual: {
        scenarios: ['menubar-closed', 'menubar-open'],
    },
};

export default menubar;
