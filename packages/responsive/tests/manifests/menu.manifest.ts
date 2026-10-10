/**
 * MANIFEST — pdx-menu (tier 2, a standalone data-driven menu — NOT a dropdown)
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/menu/pdx-menu.ts)
 * and the CSS (packages/design/src/components/menu.css → .pdx-menu / .pdx-menu-item).
 *
 * ── WHAT IT IS (verified) ──
 *   It is the menus' data-driven "rendering engine": the `items` prop (an array of MenuItem) → it builds the DOM.
 *   pdx-dropdown-menu and pdx-context-menu use it internally, but it is exported and usable on its own.
 *   Unlike dropdown and context-menu, pdx-menu portals NOTHING: the panel lives INSIDE the host
 *   (ctx.el.appendChild(menu), src:375) → light DOM, section-scoped. No trigger, no backdrop.
 *
 * ── INLINE or opened through a setup? → INLINE, but `open` is needed (verified, CRITICAL) ──
 *   render() returns html`` (empty). The whole DOM is created by hand in the first rAF inside ctx.track (src:364-400).
 *   The `open` prop defaults to false (src:39). At mount the setup does `ctx.el.style.display = isOpen ? '' : 'none'`
 *   (src:390): with open=false the HOST is display:none → the menu is invisible and measures 0px.
 *   → So a "menu always visible" scenario only needs the `open` attribute on the host: NO method to call,
 *     NO JS setup. It is inline-visible as soon as open is truthy. When open=true, in a second rAF the first
 *     menuitem takes the focus (src:393-398) — useful for the keyboard test.
 *
 * ── DOM structure (built imperatively, src:57-169) ──
 *   <pdx-menu open ...>                                  ← the HOST (ctx.el). style.display='' when open
 *     <div class="pdx-menu" role="menu" style="min-width:{minWidth}px">   ← buildMenu (src:58-61)
 *       <button class="pdx-menu-item" role="menuitem" data-menu-key="{key}">
 *         <span class="pdx-menu-icon">…</span>?          ← when item.icon
 *         <span class="pdx-menu-item-label">{label}</span>
 *         <span class="pdx-menu-shortcut">{shortcut}</span>?   ← when item.shortcut
 *       </button>
 *       <hr class="pdx-menu-separator" role="separator">       ← item.type==='separator' (src:64-69)
 *       <div class="pdx-menu-label" role="presentation">…</div>   ← item.type==='label' (src:72-78)
 *   checkbox→role="menuitemcheckbox"+aria-checked; radio→role="menuitemradio"+aria-checked; submenu→aria-haspopup="menu".
 *
 *   CAREFUL, a class collision: the HOST is <pdx-menu> and the inner panel has class="pdx-menu" — the SAME name.
 *   It is always disambiguated by the inner tag: the selector `div.pdx-menu` (the host is not a div). The menuitems (buttons)
 *   are unambiguous.
 *
 * ── Keyboard (verified, src:381-387) ──
 *   focusGroup(menu, { selector:'.pdx-menu-item:not([disabled])', orientation:'vertical', wrap:true, typeAhead:true }).
 *   → a vertical roving tabindex: ArrowDown/Up move between the menuitems (with wrap), type-ahead, Enter/onSelect→click.
 *   On opening (open=true) the first menuitem is already focused (src:393-398). NO Tab (it is roving).
 *   Escape: handled (src:338-349) but on an inline menu with no submenu open it calls closeAll()→emit('pdx-close')
 *   (src:298-301), which does NOT hide the panel (no listener reduces the display) → not asserted by the keyboard rules.
 *
 * ── Contracts: CONSERVATIVE, no theme-specific px. Invariants that hold on all 13 themes:
 *   · the inner div.pdx-menu panel is VISIBLE (display flex) with a noticeable width (min-width 10rem from the CSS plus
 *     the inline min-width from the minWidth prop, 180px by default), and a non-negative radius (the radius-zero themes zero it, never below 0);
 *   · the menuitems are interactive (cursor pointer) and contained in the panel, stacked vertically
 *     (flex-direction:column → item[1].top >= item[0].bottom, the stacking hierarchy).
 *
 * ── REAL BUGS ──
 *   None blocking. A minor note (NOT a certifiable bug): Escape on a standalone inline menu emits
 *   'pdx-close' (src:347→298-301) but the component has no logic to hide itself (that is the owner's —
 *   dropdown or context-menu — job). Expected for a rendering engine; not asserted on the keyboard side.
 *   A submenu measured before it is positioned is a block at the end of <body>, as wide as the
 *   body — so the flip always fires and it opens over or left of the menu. Held by the
 *   'menu-submenu' positioning rule.
 */
import type { ComponentManifest } from './_types';

// A deterministic scenario: 4 items plus 1 separator plus 2 items (at least 3 real menuitems), no submenu and no random icon.
const ITEMS = `[
    {"key":"new","label":"New file","shortcut":"Ctrl+N"},
    {"key":"open","label":"Open","shortcut":"Ctrl+O"},
    {"key":"save","label":"Save","shortcut":"Ctrl+S"},
    {"type":"separator"},
    {"key":"rename","label":"Rename"},
    {"key":"delete","label":"Delete","danger":true}
]`;

const SUBMENU_ITEMS = `[
    {"key":"open","label":"Open"},
    {"key":"more","type":"submenu","label":"More","children":[
        {"key":"rename","label":"Rename"},
        {"key":"delete","label":"Delete"}
    ]}
]`;

export const menu: ComponentManifest = {
    name: 'menu',
    tag: 'pdx-menu',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/menu'],

    // ── Scenarios ──
    scenarios: [
        {
            // A standalone menu that is ALWAYS visible: the host carries the `open` attribute (false by default → invisible).
            // INLINE: no JS setup, the panel is built in the first rAF inside the host (light DOM).
            id: 'menu-open',
            title: 'Menu — Standalone, visible inline (open)',
            html: `
                <pdx-menu data-test="menu" open items='${ITEMS}'></pdx-menu>`,
        },
        {
            // A submenu, drawn on <body> beside its item. MEASURED before it is positioned, a block
            // at the end of <body> is as wide as the body, so the flip would always fire and the
            // submenu would open off the left edge of the screen.
            id: 'menu-submenu',
            title: 'Menu — a submenu beside its item',
            // In a 240px column, as a menu sits in an app: a menu as wide as the page leaves its
            // submenu no side to open on.
            html: `
                <div style="width: 240px">
                    <pdx-menu data-test="menu" open items='${SUBMENU_ITEMS}'></pdx-menu>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'menu-open': {
                standalone: [
                    {
                        // The inner div.pdx-menu panel → display:flex (column). Disambiguated by the `div` tag (the host is <pdx-menu>).
                        selector: 'section:not([hidden]) [data-test="menu"] div.pdx-menu',
                        description: 'menu panel is displayed (flex column)',
                        display: { op: 'oneOf', value: ['flex', 'block'] },
                    },
                    {
// .pdx-menu min-width 10rem (160px) + inline minWidth from the prop (default 180) → a measurable width.
                        selector: 'section:not([hidden]) [data-test="menu"] div.pdx-menu',
                        description: 'menu panel has an appreciable width',
                        width: { op: '>=', value: 120 },
                    },
                    {
                        // .pdx-menu border-radius: var(--pdx-radius-md); the radius-zero themes zero it, never below 0.
                        selector: 'section:not([hidden]) [data-test="menu"] div.pdx-menu',
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
                        selector: 'section:not([hidden]) [data-test="menu"] .pdx-menu-item',
                        description: 'menu items are interactive (cursor pointer)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                composition: [
                    {
                        // The menuitems (buttons) live inside the menu panel (the layout holds).
                        description: 'menu items are contained within the menu panel',
                        parent: 'section:not([hidden]) [data-test="menu"] div.pdx-menu',
                        children: {
                            menu: 'section:not([hidden]) [data-test="menu"] div.pdx-menu',
                            item: 'section:not([hidden]) [data-test="menu"] .pdx-menu-item',
                        },
                        relations: [
                            { description: 'first menuitem within the menu panel', left: 'item', op: 'contained-in', right: 'menu' },
                        ],
                    },
                    {
                        // flex-direction:column → the menuitems are STACKED: the 2nd sits under the 1st.
                        description: 'menu items are stacked vertically',
                        parent: 'section:not([hidden]) [data-test="menu"] div.pdx-menu',
                        children: {
                            first: 'section:not([hidden]) [data-test="menu"] [data-menu-key="new"]',
                            second: 'section:not([hidden]) [data-test="menu"] [data-menu-key="open"]',
                        },
                        relations: [
                            { description: 'second item below the first', left: 'first.bottom', op: '<=', right: 'second.top', tolerance: 2 },
                        ],
                    },
                ],
            },
            'menu-submenu': {
                positioning: [
                    {
                        // Beside its item, on screen. Red while the submenu was measured before it
                        // was fixed: its width was the body's, the flip fired, and it opened at a
                        // negative `left`.
                        description: 'submenu opens to the right of its item, within the viewport',
                        trigger: { selector: 'section:not([hidden]) [data-test="menu"] [data-menu-key="more"]', action: 'hover' },
                        floating: '[data-submenu-key="more"]',
                        placement: 'right',
                        withinViewport: true,
                        tolerance: 6,
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // The panel is role="menu" with role="menuitem" button children (text from .pdx-menu-item-label) → accessible name OK.
    // role="menu" is not a landmark or a region: WCAG and axe do not ask for an accessible name on the container (as for context-menu).
    // No disableRule.
    a11y: {
        scenarios: ['menu-open'],
    },

    // ── Dim. 3: style isolation ──
    // The menu panel must keep its box (width and radius) under hostile global CSS.
    // skipHeight: the panel's height is content-driven (the sum of the menuitems plus the padding, sensitive to the
    //   host's line-height) → not a clean structural invariant; the radius (a CSS value, not scaled) stays asserted.
    isolation: {
        scenario: 'menu-open',
        targets: [
            { selector: 'section:not([hidden]) [data-test="menu"] div.pdx-menu', tolerancePx: 10, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA menu, roving) ──
    // focusGroup(vertical, wrap, typeAhead) → a roving tabindex across the menuitems (src:381-387).
    // On opening (open=true) the first menuitem is already focused (src:393-398) → initialFocus on it.
    // NO Tab (it is roving). ArrowDown → the next menuitem; expectFocus on the 2nd item (deterministic,
    // with no disabled item and no submenu in between). ArrowUp goes back to the 1st.
    // No trapContainer: a menu does not trap focus, Tab leaves it (WAI-ARIA APG menu): Tab from the
    // first item goes to <body>.
    keyboard: {
        scenario: 'menu-open',
        initialFocus: 'section:not([hidden]) [data-test="menu"] [data-menu-key="new"]',
        steps: [
            // ArrowDown → focusGroup muove al menuitem successivo (key "open").
            { key: 'ArrowDown', expectFocus: 'section:not([hidden]) [data-test="menu"] [data-menu-key="open"]' },
            // ArrowUp → torna al primo menuitem (key "new").
            { key: 'ArrowUp', expectFocus: 'section:not([hidden]) [data-test="menu"] [data-menu-key="new"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — one scenario (the maths does not catch the shortcut, the separator or the danger item) ──
    visual: {
        scenarios: ['menu-open'],
    },
};

export default menu;
