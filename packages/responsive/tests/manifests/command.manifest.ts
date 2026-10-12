/**
 * MANIFEST — pdx-command (command palette ⌘K, tier 3, overlay modale)
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/command/pdx-command.ts)
 * and the CSS (packages/design/src/components/command.css).
 *
 * ── DOM structure (light DOM, render() in pdx-command.ts:175) ──
 *   <pdx-command>                                          ← host
 *     <div class="pdx-command-backdrop" :data-open>        ← BACKDROP: position:fixed, inset:0,
 *          @click=closePalette>                                blur, opacity 0 → 1 with [data-open] (CSS:31-46)
 *     <div class="pdx-command"                             ← the modal PANEL
 *          role="dialog" aria-modal="true"
 *          aria-label="Command palette"                    ← the dialog's accessible name (render:182)
 *          :data-open>                                         CSS: position:fixed, top:20%, left:50%,
 *                                                              transform:translateX(-50%) → centred ONLY
 *                                                              horizontally; opacity 0→1 with [data-open] (CSS:50-76)
 *       <div class="pdx-command-input">                    ← the search row (a flex row)
 *         <span class="pdx-command-search-icon" aria-hidden="true">⌕</span>
 *         <input type="text" role="combobox"               ← the search INPUT, the list's only tab stop
 *                aria-expanded="true" aria-autocomplete="list" aria-label
 *                aria-controls="{uid}-list"                 ← it controls the listbox (only when _open)
 *                aria-activedescendant="{uid}-opt-{i}"      ← the highlighted option
 *                :placeholder :value @input @keydown>
 *         <kbd class="pdx-command-kbd">ESC</kbd>
 *       <span class="pdx-sr-only" role="status" aria-live="polite">N commands available</span>
 *       <div class="pdx-command-list" id="{uid}-list"       ← the RESULTS list, role="listbox" + aria-label
 *            role="listbox">
 *         [ <div role="group" aria-labelledby="{uid}-group-{g}">   ← only when item.group
 *             <span class="pdx-command-group" id aria-hidden>{group}</span> ]?
 *         <div class="pdx-command-item [active]"             ← an OPTION: a div (not a <button>, a tab stop)
 *              role="option" id="{uid}-opt-{i}" :aria-selected
 *              [aria-disabled] [aria-keyshortcuts="Control+P"]
 *              :data-active data-cmd-index="{i}"
 *              @click=selectItem @mouseenter>
 *           <span class="pdx-command-item-icon">{icon}</span>?
 *           <span class="pdx-command-item-label">{label}</span>
 *           <span class="pdx-command-item-shortcut" aria-hidden="true">{shortcut}</span>?
 *         ... | <div class="pdx-command-empty">{emptyText}</div>  ← the empty state when there are 0 results
 *       <div class="pdx-command-footer"> ↑↓ Navigate · ↵ Select · ESC Close </div>
 *
 * ── WHERE THE PANEL LIVES (CRITICAL) ──
 *   The backdrop and the panel are rendered in the HOST's light DOM (NOT portalled to document.body):
 *   they are the two direct children the host's render emits. So the selectors stay
 *   section-scoped like every other component's. The visibility is driven by the [data-open] attribute
 *   (on both the backdrop and the panel), set when _open() is true. The panel is `position: fixed`
 *   with `transform: translateX(-50%) scale(1)` when open.
 *
 * ── Opening (CRITICAL — deterministic through the setup) ──
 *   Three ways, in the source:
 *     1. prop `open` → ctx.track (pdx-command.ts:117) synchronises: open() true → openPalette().
 *     2. the `openPalette` method exposed on the host (the setup's return, pdx-command.ts:170) → host.openPalette().
 *     3. the global hotkey Ctrl/Cmd+K (onGlobalKeydown:108) → toggle.
 *   openPalette() (pdx-command.ts:65) sets _open=true → [data-open] on the backdrop + panel (rAF),
 *   a focusTrap on the `.pdx-command`, and the focus on the input. closePalette sets _open=false.
 *   THE CHOICE: the open scenario uses the `open` prop in the HTML plus a `host.openPalette()` call in the setup as a
 *   guard (it is idempotent: openPalette is safe to call again). ONE open scenario → no collision
 *   between overlapping fixed panels.
 *
 * ── Centring (CRITICAL) ──
 *   CSS:50 → `top: 20%; left: 50%; transform: translateX(-50%)`. It is centred ONLY horizontally
 *   (left/transform-X); vertically it is anchored at 20% from the top. So overlay.centering = 'horizontal',
 *   NOT 'both'. A backdrop is there (hasBackdrop:true).
 *
 * ── a11y (verified) ──
 *   The panel: role="dialog" + aria-modal="true" + aria-label="Command palette" → accessible name OK.
 *   The combobox input: an aria-label, not a placeholder alone.
 *   The listbox: an aria-label.
 *   The options: role="option" + aria-selected are on every .pdx-command-item.
 *
 * ── Contracts: CONSERVATIVE, no theme-specific px. Invariants that hold on all 13 themes:
 *   · the open panel is VISIBLE (opacity ~1), a flex column box, radius >= 0, a measurable width;
 *   · the panel is centred horizontally over a backdrop;
 *   · the search input is there and visible, above the list;
 *   · the options (.pdx-command-item) are contained in the list (the listbox).
 */
import type { ComponentManifest } from './_types';

export const command: ComponentManifest = {
    name: 'command',
    tag: 'pdx-command',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/command'],

    // ── Scenarios ──
    scenarios: [
        {
            // The ONE open scenario: it is opened by the setup ALONE (host.openPalette()), NOT through the
            // `open` attribute. That attribute would open the palette when the custom element upgrades (before the
            // generator removes [open] from the hidden sections) → the focus trap would set aria-hidden on EVERY
            // section of the tier page, failing its neighbours' a11y (toolbar, splitter, menubar) with
            // aria-hidden-focus. The setup runs for the ACTIVE section only, after it is activated.
            // The items carry groups and shortcuts, to exercise the group label, the item icon and the item shortcut.
            id: 'command-open',
            title: 'Command Palette — Open (search + grouped results)',
            html: `
                <pdx-command data-test="cmd"
                    placeholder="Type a command..."
                    items='[
                        {"id":"dash","label":"Go to Dashboard","group":"Navigation","shortcut":"Ctrl+D"},
                        {"id":"proj","label":"Go to Projects","group":"Navigation","shortcut":"Ctrl+P"},
                        {"id":"new","label":"New File","group":"Actions","shortcut":"Ctrl+N"},
                        {"id":"settings","label":"Open Settings","group":"Actions"}
                    ]'>
                </pdx-command>`,
            setup: `
                const host = document.querySelector('section:not([hidden]) [data-test="cmd"]');
                if (host && typeof host.openPalette === 'function') host.openPalette();`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'command-open': {
                standalone: [
                    {
                        // [data-open] brings opacity to 1 (CSS:71-76). The panel is fully visible.
                        selector: 'section:not([hidden]) [data-test="cmd"] .pdx-command',
                        description: 'open command palette panel is fully visible (opacity 1)',
                        opacity: { op: '>=', value: 0.99 },
                    },
                    {
                        // CSS:63 → display:flex, flex-direction:column (input / list / footer impilati).
                        selector: 'section:not([hidden]) [data-test="cmd"] .pdx-command',
                        description: 'command palette panel is a flex column box',
                        display: { op: 'is', value: 'flex' },
                    },
                    {
                        // A non-negative radius (metro and cyberpunk may zero it, never below 0).
                        selector: 'section:not([hidden]) [data-test="cmd"] .pdx-command',
                        description: 'command palette panel has non-negative radius',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        // CSS:56-57 → width:90%, max-width:36rem → a measurable width at a 1280 viewport.
                        selector: 'section:not([hidden]) [data-test="cmd"] .pdx-command',
                        description: 'command palette panel has an appreciable width',
                        width: { op: '>=', value: 200 },
                    },
                    {
                        // The search input is there and visible (the flex input row).
                        selector: 'section:not([hidden]) [data-test="cmd"] .pdx-command-input input',
                        description: 'search input is displayed (not none)',
                        display: { op: 'isNot', value: 'none' },
                    },
                ],
                // Overlay: the panel is centred HORIZONTALLY (CSS top:20% → not vertically), with a backdrop.
                overlay: [
                    {
                        description: 'open command palette is centered horizontally over a backdrop',
                        // action:'call' → the state is already on from the setup (openPalette); the runner does NOT click.
                        trigger: { selector: 'section:not([hidden]) [data-test="cmd"]', action: 'call' },
                        panel: 'section:not([hidden]) [data-test="cmd"] .pdx-command',
                        backdrop: 'section:not([hidden]) [data-test="cmd"] .pdx-command-backdrop',
                        centering: 'horizontal',
                        hasBackdrop: true,
                    },
                ],
                composition: [
                    {
                        // The input (the search row) sits ABOVE the list in the flex-column panel.
                        description: 'search input row sits above the results list within the panel',
                        parent: 'section:not([hidden]) [data-test="cmd"] .pdx-command',
                        children: {
                            panel: 'section:not([hidden]) [data-test="cmd"] .pdx-command',
                            input: 'section:not([hidden]) [data-test="cmd"] .pdx-command-input',
                            list: 'section:not([hidden]) [data-test="cmd"] .pdx-command-list',
                        },
                        relations: [
                            { description: 'input row within panel', left: 'input', op: 'contained-in', right: 'panel' },
                            { description: 'list within panel', left: 'list', op: 'contained-in', right: 'panel' },
                            { description: 'input row above the list (stacked column)', left: 'input.bottom', op: '<=', right: 'list.top', tolerance: 1 },
                        ],
                    },
                    {
                        // The options (button.pdx-command-item) live inside the listbox.
                        description: 'command options are contained within the listbox',
                        parent: 'section:not([hidden]) [data-test="cmd"] .pdx-command-list',
                        children: {
                            list: 'section:not([hidden]) [data-test="cmd"] .pdx-command-list',
                            option: 'section:not([hidden]) [data-test="cmd"] .pdx-command-item',
                        },
                        relations: [
                            { description: 'first option within listbox', left: 'option', op: 'contained-in', right: 'list' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // The panel is role="dialog" + aria-modal + aria-label="Command palette" → accessible name OK.
    // The combobox input and the listbox carry an aria-label. The axe rules are NOT disabled: an input named by a
    // placeholder only, or a listbox with no accessible name, must fail. No disableRule, so no real bug is masked.
    a11y: {
        scenarios: ['command-open'],
    },

    // ── Dim. 3: style isolation ──
    // A modal panel with transform: translateX(-50%) scale(1) → getBoundingClientRect feels the transform,
    // and the height is content-driven (the input, the list, the footer) → skipHeight. The radius (a CSS value, not scaled)
    // stays asserted; a generous tolerance on the box.
    isolation: {
        scenario: 'command-open',
        targets: [
            { selector: 'section:not([hidden]) [data-test="cmd"] .pdx-command', tolerancePx: 4, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA combobox/listbox) ──
    // The initial focus is on the input (the focusTrap and input.focus() in the component's setup, and openPalette in the scenario).
    // onKeydown on the input (pdx-command.ts:88): ArrowDown/ArrowUp move _activeIndex (aria-selected="true"
    // on the active option, render:220), Enter selects and closes, Escape closes. The navigation is checked through
    // aria-selected (deterministic and readable from the DOM); the initial active one is index 0.
    // Note: Escape→close is NOT asserted: closePalette removes the [data-open] attribute (it sets it to null,
    //   render:183) → expectAttr cannot match an attribute that is not there, and KeyStep exposes no check on
    //   opacity or visibility. Closing with Escape stays covered by the component's unit test.
    // Pattern 'listbox'. The focus stays in the input: the highlighted option is its aria-activedescendant
    // (without it, the arrows announce nothing). Tab does not enter the list:
    // the options are not <button>s, which Tab would walk one by one.
    // trapContainer: after the steps, 10 Tabs and 10 Shift+Tabs stay in the palette.
    keyboard: {
        scenario: 'command-open',
        initialFocus: 'section:not([hidden]) [data-test="cmd"] .pdx-command-input input',
        trapContainer: 'section:not([hidden]) [data-test="cmd"] .pdx-command',
        steps: [
            // ArrowDown: from index 0 → the second option (data-cmd-index="1") becomes active.
            { key: 'ArrowDown',
                expectAttr: { selector: 'section:not([hidden]) [data-test="cmd"] [data-cmd-index="1"]', name: 'aria-selected', value: 'true' },
                expectActiveDescendant: { selector: 'section:not([hidden]) [data-test="cmd"] .pdx-command-input input', target: '[role="option"][data-cmd-index="1"]' } },
            // ArrowUp: back to the first option (data-cmd-index="0").
            { key: 'ArrowUp',
                expectAttr: { selector: 'section:not([hidden]) [data-test="cmd"] [data-cmd-index="0"]', name: 'aria-selected', value: 'true' },
                expectActiveDescendant: { selector: 'section:not([hidden]) [data-test="cmd"] .pdx-command-input input', target: '[role="option"][data-cmd-index="0"]' } },
            // Tab: no option is a tab stop; the focus trap brings it back to the input.
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="cmd"] .pdx-command-input input' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — one scenario (the open one) ──
    // The input is masked (a blinking caret), to avoid a spurious diff.
    visual: {
        scenarios: ['command-open'],
        mask: ['section:not([hidden]) [data-test="cmd"] .pdx-command-input input'],
    },
};

export default command;
