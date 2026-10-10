/**
 * MANIFEST — pdx-context-menu (tier 2, right-click context menu, cursor-positioned, portaled menu)
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/context-menu/pdx-context-menu.ts)
 * and the CSS (packages/design/src/components/menu.css → .pdx-menu / .pdx-menu-item).
 *
 * ── DOM structure ──
 *   <pdx-context-menu>                          ← host, style.display='contents' (set in an rAF inside ctx.track)
 *     <slot></slot>                             ← it wraps the target to right-click on
 *
 *   The menu's PANEL is PORTALLED to document.body (NOT inside the host, see the source lines 217-222):
 *   <div class="pdx-context-menu-panel pdx-menu" role="menu" style="display:none">   ← appended a document.body
 *     <button class="pdx-menu-item" role="menuitem" data-menu-key>…</button>          ← built ONLY on opening (buildMenuItems, src:33)
 *     <hr class="pdx-menu-sep" role="separator"> / <div class="pdx-menu-label" role="presentation">
 *   I menuitem checkbox/radio usano role="menuitemcheckbox"/"menuitemradio" + aria-checked.
 *
 * ── WHERE THE PANEL LIVES (CRITICAL) ──
 *   The panel is appended to document.body (src:222) → it is NOT section-scoped. Its selectors are
 *   GLOBAL ('.pdx-context-menu-panel'). To avoid two open panels fighting over the selectors,
 *   a SINGLE "open" scenario is used (ctxmenu-open). The panel is UNIQUE per host: it is created once
 *   in an rAF and reused; close() only sets display:none (it does not remove it), destroy() removes it on disconnect.
 *
 * ── HOW IT OPENS (CRITICAL for the setup) ──
 *   There is no public `open()` method on the host like openSelect(); the host exposes
 *   `(ctx.el).__contextMenu = { open: openAt, close }` (src:272). Opening:
 *     1. a real right-click: dispatching a 'contextmenu' MouseEvent on the target (clientX/clientY) → openAt(x,y).
 *     2. a touch long-press (500ms) or Shift+F10 from the keyboard → openAt(...).
 *   openAt() (src:124):
 *     - _open=true, buildMenuItems(items, panel)  ← the items exist ONLY after this
 *     - panel.style.display='' (→ flex from .pdx-menu), position:fixed, zIndex 1020, minWidth = prop+'px'
 *     - it positions at (clientX,clientY) in an rAF, then flips if it would leave the viewport (visibility hidden→visible)
 *     - focus on the first [role="menuitem"]:not(:disabled) + focusGroup(vertical, wrap) for ArrowUp/Down
 *     - click-outside (mousedown, after a 10ms setTimeout) / scroll / resize / Escape → close()
 *   THE SETUP used: dispatching a 'contextmenu' MouseEvent on the host (the bubbling reaches the listener on ctx.el),
 *   with clientX/clientY at the target's centre, then an `await` for ~2 rAFs plus the outside-handler's setTimeout(10),
 *   so the measurement happens with the panel positioned and the items built.
 *
 * ── Contracts: CONSERVATIVE, no theme-specific px. Invariants that hold on all 13 themes:
 *   · open: the panel is VISIBLE (display flex, not 'none') with a noticeable width (min-width 180px from a prop),
 *     and a non-negative radius (the radius-zero themes zero it, never below 0);
 *   · an overlay with no backdrop (a floating menu, no dim layer);
 *   · the menuitems are contained in the menu panel.
 *
 * ── Static states → the closed scenario ──
 *   `disabled` stops it opening (src:226). With the panel closed, the panel on the body is display:none and empty,
 *   so there is nothing measurable when "closed" beyond the host (display:contents → a 0px box): no standalone
 *   contract is added for the closed state. The closed scenario is only a reference, and a minimal visual.
 */
import type { ComponentManifest } from './_types';

const ITEMS = `[
    {"key":"cut","label":"Cut","shortcut":"Ctrl+X"},
    {"key":"copy","label":"Copy","shortcut":"Ctrl+C"},
    {"key":"paste","label":"Paste","shortcut":"Ctrl+V"},
    {"type":"separator"},
    {"key":"delete","label":"Delete","danger":true}
]`;

export const contextMenu: ComponentManifest = {
    name: 'context-menu',
    tag: 'pdx-context-menu',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/context-menu'],

    // ── Scenarios ──
    scenarios: [
        {
            // The ONE open scenario: the panel (portalled to the body) is made visible by the setup,
            // simulating a real right-click (dispatching a 'contextmenu' MouseEvent on the target).
            id: 'ctxmenu-open',
            title: 'Context Menu — Open (menu panel at cursor)',
            html: `
                <pdx-context-menu data-test="cm" items='${ITEMS}'>
                    <div data-test="cm-target" style="width:240px;height:120px;display:flex;align-items:center;justify-content:center;border:1px solid #ccc;">
                        Right-click here
                    </div>
                </pdx-context-menu>`,
            // The 'contextmenu' event bubbles from the target to the listener on ctx.el (the host).
            // openAt uses one rAF to position and a setTimeout(10) to register the outside-handler:
            // it waits 2 rAFs plus ~30ms, so the measurement falls with the panel positioned and the items built.
            setup: `
                const host = document.querySelector('section:not([hidden]) [data-test="cm"]');
                const target = document.querySelector('section:not([hidden]) [data-test="cm-target"]');
                if (host && target) {
                    const r = target.getBoundingClientRect();
                    const x = Math.round(r.left + r.width / 2);
                    const y = Math.round(r.top + r.height / 2);
                    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
                    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
                    await new Promise((res) => setTimeout(res, 30));
                }`,
        },
        {
            // Opened from the keyboard, not by a dispatched contextmenu: the area is focusable, as
            // the component asks, so Shift+F10 reaches it and focus has somewhere to return to.
            id: 'ctxmenu-keyboard',
            title: 'Context Menu — From the keyboard (focusable area)',
            html: `
                <pdx-context-menu data-test="cm-kb" items='${ITEMS}'>
                    <div data-test="cm-kb-target" tabindex="0" role="group" aria-label="Document area" style="width:240px;height:120px;display:flex;align-items:center;justify-content:center;border:1px solid #ccc;">
                        Shift+F10 here
                    </div>
                </pdx-context-menu>`,
        },
        {
            id: 'ctxmenu-closed',
            title: 'Context Menu — Closed (host wraps target, no panel visible)',
            html: `
                <pdx-context-menu data-test="cm-closed" items='${ITEMS}'>
                    <div data-test="cm-closed-target" style="width:240px;height:120px;display:flex;align-items:center;justify-content:center;border:1px solid #ccc;">
                        Right-click here
                    </div>
                </pdx-context-menu>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'ctxmenu-open': {
                // The panel is on document.body → GLOBAL selectors (not section-scoped).
                standalone: [
                    {
                        selector: '.pdx-context-menu-panel.pdx-menu',
                        description: 'open context menu panel is displayed (flex, not none)',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // min-width = prop minWidth (default 180px) set inline by openAt → a measurable width.
                        selector: '.pdx-context-menu-panel.pdx-menu',
                        description: 'open menu panel has an appreciable width',
                        width: { op: '>=', value: 120 },
                    },
                    {
                        // .pdx-menu border-radius: var(--pdx-radius-md); the radius-zero themes zero it, never below 0.
                        selector: '.pdx-context-menu-panel.pdx-menu',
                        description: 'menu panel radius is non-negative',
                        radius: {
                            topLeft: { op: '>=', value: 0 },
                            topRight: { op: '>=', value: 0 },
                            bottomLeft: { op: '>=', value: 0 },
                            bottomRight: { op: '>=', value: 0 },
                        },
                    },
                    {
                        // .pdx-menu-item { cursor: pointer } → menuitem interattivi.
                        selector: '.pdx-context-menu-panel .pdx-menu-item',
                        description: 'menu items are interactive (cursor pointer)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                overlay: [
                    {
                        // The panel is ALREADY open from the setup (the contextmenu dispatch) → action:'call':
                        // the runner measures without interacting further. A floating menu → no backdrop.
                        description: 'context menu shows a floating menu panel without a backdrop',
                        trigger: { selector: 'section:not([hidden]) [data-test="cm-target"]', action: 'call' },
                        panel: '.pdx-context-menu-panel.pdx-menu',
                        hasBackdrop: false,
                    },
                ],
                composition: [
                    {
                        // The menuitems (buttons) live inside the menu panel (the layout holds).
                        description: 'menu items are contained within the menu panel',
                        parent: '.pdx-context-menu-panel.pdx-menu',
                        // The item is looked up INSIDE the panel: a bare `.pdx-menu-item` finds the
                        // first one in the document, in a hidden scenario (0×0 at the origin), and
                        // the relation would measure that.
                        children: {
                            menu: '.pdx-context-menu-panel.pdx-menu',
                            item: '.pdx-context-menu-panel.pdx-menu .pdx-menu-item',
                        },
                        relations: [
                            { description: 'first menuitem within the menu panel', left: 'item', op: 'contained-in', right: 'menu' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // Open: a role="menu" panel with role="menuitem" children (buttons with text) → a valid ARIA structure.
    // The menuitems take their accessible name from the text (.pdx-menu-item-label). The role="menu" panel does not
    // expose an aria-label or aria-labelledby, but WCAG and axe do not ask for an accessible name on role="menu"
    // (it is not a landmark or a region) → no disableRule.
    a11y: {
        scenarios: ['ctxmenu-open'],
    },

    // ── Dim. 3: style isolation ──
    // The menu panel must keep its box (width and radius) under hostile global CSS.
    // skipHeight: the panel's height is content-driven (the sum of the menuitems plus the padding, sensitive to the
    //   host's line-height) → not a clean structural invariant; the radius (a CSS value, not scaled) stays asserted.
    isolation: {
        scenario: 'ctxmenu-open',
        targets: [
            { selector: '.pdx-context-menu-panel.pdx-menu', tolerancePx: 10, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA menu) ──
    // The whole keyboard path, from the focusable area. Selectors match the FOCUSED
    // element, so the other context menus' hidden panels on the same page cannot satisfy them.
    // The last step, focus back on the area, is only reachable when Enter on an item selects it
    // and the choice closes the menu.
    keyboard: {
        scenario: 'ctxmenu-keyboard',
        initialFocus: 'section:not([hidden]) [data-test="cm-kb-target"]',
        steps: [
            { key: 'Shift+F10', expectFocus: '.pdx-context-menu-panel [data-menu-key="cut"]' },
            { key: 'ArrowDown', expectFocus: '.pdx-context-menu-panel [data-menu-key="copy"]' },
            { key: 'Enter', expectFocus: 'section:not([hidden]) [data-test="cm-kb-target"]' },
            // Opens again from the ContextMenu key; Escape closes and returns focus the same way.
            { key: 'ContextMenu', expectFocus: '.pdx-context-menu-panel [data-menu-key="cut"]' },
            { key: 'Escape', expectFocus: 'section:not([hidden]) [data-test="cm-kb-target"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — the open state only (the maths does not catch the icons, shortcuts and separators) ──
    visual: {
        scenarios: ['ctxmenu-open'],
    },
};

export default contextMenu;
