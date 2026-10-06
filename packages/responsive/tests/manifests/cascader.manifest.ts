/**
 * MANIFEST — pdx-cascader (tier 3, a hierarchical drill-down selection in columns)
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/cascader/pdx-cascader.ts)
 * and the CSS (packages/design/src/components/cascader.css).
 *
 * ── DOM structure (light DOM, built imperatively in an rAF, pdx-cascader.ts:225) ──
 *   <pdx-cascader>                                          ← host (CSS:3 display:inline-block, position:relative)
 *     <div class="pdx-cascader-trigger pdx-input-wrap [pdx-input-{size}] [disabled]"  ← TRIGGER (box from .pdx-input-wrap)
 *          role="combobox"                                  ← (pdx-cascader.ts:235)
 *          aria-expanded="false|true"                       ← synchronised in ctx.track (pdx-cascader.ts:327)
 *          aria-haspopup="listbox"
 *          tabindex="0|-1">                                    '-1' only when disabled
 *       <span class="pdx-cascader-text [pdx-cascader-placeholder]">…</span>   ← text: the joined path label, or the placeholder
 *       [ <button class="pdx-input-clear" type="button">×</button> ]?         ← clear (only when clearable; display:none with no value)
 *       <span class="pdx-cascader-icon [open]">▾</span>     ← the chevron; .open turns it 180° when open (CSS:47)
 *     <div class="pdx-cascader-panel">                      ← THE PANEL: position:absolute, display:none → '' on open (CSS:52)
 *       [ <div class="pdx-cascader-search"><input type="text"></div> ]?       ← search (only when searchable)
 *       <div class="pdx-cascader-content">                  ← the content is rebuilt on every track (pdx-cascader.ts:341)
 *         <div style="display:flex">                        ← the columns wrapper (an inline style in the source, pdx-cascader.ts:370)
 *           <div class="pdx-cascader-column" role="listbox">  ← one COLUMN per level (CSS:65 min-width:160px)
 *             <div class="pdx-cascader-item [active] [disabled]"  ← one OPTION per node
 *                  role="option" aria-selected="true|false">
 *               <span class="pdx-cascader-item-label">{label}</span>
 *               [ <span class="pdx-cascader-item-arrow">›|⋯</span> ]?          ← a chevron only when the node has children
 *     [ <input type="hidden" name value> ]?                 ← form participation (only when the name prop is set)
 *
 * ── WHERE THE PANEL LIVES (CRITICAL) ──
 *   The `.pdx-cascader-panel` is NOT portalled to document.body, and it does NOT use usePopover
 *   (the panel is pure CSS position:absolute).
 *   The trigger and the panel are SIBLINGS in the host's light DOM (both appended to ctx.el: ts:267,288).
 *   The panel is `position:absolute` (CSS:53) anchored to the host (the containing block is pdx-cascader,
 *   position:relative). There is NO inline top/left → the panel falls by default under (or over) the trigger
 *   by the absolute flow (top:auto → right under the trigger's line in the inline-block host).
 *   Its visibility is driven by `_panelEl.style.display = open ? '' : 'none'` (pdx-cascader.ts:332).
 *   No backdrop (it closes through a document mousedown outside-handler, pdx-cascader.ts:142).
 *   So the selectors stay section-scoped like every other component's. ONE open scenario only
 *   → no two panels fighting over selectors and positioning.
 *
 * ── HOW IT OPENS (CRITICAL — verified in the source) ──
 *   The setup's return `{ openPopover, closePopover }` lands on the INTERNAL `ctx` object, NOT on
 *   `ctx.el` (the host): the host carries `openCascader`/`closeCascader`, assigned explicitly.
 *   The ways a user opens it, in the source:
 *     · a click on the trigger → toggle open/close (pdx-cascader.ts:239-241);
 *     · Enter or Space keydown on the trigger → openPopover (pdx-cascader.ts:243).
 *   THE CHOICE for the open scenario: the setup fires a SYNTHETIC `.click()` on the trigger
 *   (`.pdx-cascader-trigger`). The click handler calls openPopover() → _open=true → the reactive track
 *   (ts:303) builds the columns and sets `display:''` on the panel. The outside-handler is registered in a
 *   setTimeout(0) (ts:141) and ignores the synthetic click → the panel stays open. The setup uses a BARE `await`
 *   (no IIFE), as the generator's convention requires.
 *
 * ── DETERMINISM (CRITICAL) ──
 *   options = a fixed two-level tree (Country → Region), value=["it"] in every scenario →
 *   the trigger shows "Italy" (the joined path, displayText ts:101) and, on opening, _activePath is
 *   initialised from the value (openPopover ts:138 → _activePath=[...value]) → TWO columns are rendered
 *   (the root and Italy's children), stably. searchable is NOT set → no search input,
 *   no focus()/setTimeout on that input → deterministic measurements. No loadChildren (nothing lazy or async).
 *   The DOM is built in an rAF (the host) plus a reactive track: the runner waits for networkidle and the standard
 *   timeout before measuring; the open scenario clicks the trigger in the post-mount setup.
 *
 * ── a11y (verified) ──
 *   The trigger is role="combobox" + aria-haspopup="listbox" + aria-expanded, with an aria-label (the
 *   `label` prop, or the placeholder) — a combobox with no accessible name is an axe failure — and
 *   aria-controls pointing at the panel, which has an id. Open: every column has role="listbox", every
 *   item role="option" + aria-selected and an id.
 *   No axe rule is disabled: a regression must surface.
 *
 * ── Contracts: CONSERVATIVE, no theme-specific px. Invariants that hold on all 13 themes:
 *   · the trigger is a visible interactive box (cursor pointer, from .pdx-cascader-trigger CSS:9-13);
 *   · the trigger's radius is non-negative (the radius-zero themes zero it, never below 0);
 *   · open: the panel is VISIBLE (display flex), with a measurable width (min-width:180px CSS:61);
 *   · an overlay with no backdrop;
 *   · the first column's options are contained in the column (the listbox).
 */
import type { ComponentManifest } from './_types';

export const cascader: ComponentManifest = {
    name: 'cascader',
    tag: 'pdx-cascader',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/cascader'],

    // ── Scenarios ──
    scenarios: [
        {
            // CLOSED: the trigger with a fixed value ["it"] → it shows "Italy" (the joined path). A deterministic two-level tree.
            id: 'cascader-closed',
            title: 'Cascader — Closed (trigger with a selected path)',
            html: `
                <pdx-cascader data-test="casc"
                    value='["it"]'
                    options='[
                        {"value":"it","label":"Italy","children":[{"value":"lz","label":"Lazio"},{"value":"to","label":"Tuscany"}]},
                        {"value":"fr","label":"France","children":[{"value":"idf","label":"Ile-de-France"},{"value":"pac","label":"Provence"}]}
                    ]'>
                </pdx-cascader>`,
        },
        {
            // The ONE open scenario: the panel (position:absolute) is made visible by the setup.
            // It is opened with a SYNTHETIC click on the trigger, the user's path
            // (the click handler calls openPopover, pdx-cascader.ts:239-241). value=["it"] → _activePath is
            // initialised to ["it"] (ts:138) → two columns rendered (the root and Italy's children), stably.
            // A bare await (no IIFE), as the generator's convention requires.
            id: 'cascader-open',
            title: 'Cascader — Open (cascading columns panel)',
            // Room for the panel. Without it the section ends 16px into a ~100px panel, and the visual
            // baseline is the trigger plus the panel's top edge — the same crop as the date picker's.
            // Measured in Chromium: the panel spills 82–87px below the section.
            // 140px leaves it inside with margin.
            html: `
                <div style="padding-bottom: 140px;">
                    <pdx-cascader data-test="casc-open"
                        value='["it"]'
                        options='[
                            {"value":"it","label":"Italy","children":[{"value":"lz","label":"Lazio"},{"value":"to","label":"Tuscany"}]},
                            {"value":"fr","label":"France","children":[{"value":"idf","label":"Ile-de-France"},{"value":"pac","label":"Provence"}]}
                        ]'>
                    </pdx-cascader>
                </div>`,
            setup: `
                const host = document.querySelector('section:not([hidden]) [data-test="casc-open"]');
                const trigger = host && host.querySelector('.pdx-cascader-trigger');
                if (trigger) trigger.click();
                await new Promise(r => requestAnimationFrame(r));`,
        },
        {
            // DISABLED: a static prop → a standalone rule (the cursor is not pointer, and it does not open).
            id: 'cascader-disabled',
            title: 'Cascader — Disabled',
            html: `
                <pdx-cascader data-test="casc-dis"
                    value='["it"]'
                    disabled
                    options='[{"value":"it","label":"Italy"},{"value":"fr","label":"France"}]'>
                </pdx-cascader>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'cascader-closed': {
                standalone: [
                    {
                        // .pdx-cascader-trigger { display: inline-flex } (CSS:11) → box visibile.
                        selector: 'section:not([hidden]) [data-test="casc"] .pdx-cascader-trigger',
                        description: 'trigger is a visible box',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // CSS:10 → cursor: pointer → interactive.
                        selector: 'section:not([hidden]) [data-test="casc"] .pdx-cascader-trigger',
                        description: 'trigger is interactive (cursor pointer)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // The trigger's radius (from .pdx-input-wrap) is non-negative (the radius-zero themes zero it, never below 0).
                        selector: 'section:not([hidden]) [data-test="casc"] .pdx-cascader-trigger',
                        description: 'trigger radius is non-negative',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                composition: [
                    {
                        // The text and the chevron are contained in the trigger (the layout holds), the chevron to the right of the text.
                        description: 'text and chevron are contained within the trigger box',
                        parent: 'section:not([hidden]) [data-test="casc"] .pdx-cascader-trigger',
                        children: {
                            trigger: '.pdx-cascader-trigger',
                            text: '.pdx-cascader-text',
                            icon: '.pdx-cascader-icon',
                        },
                        relations: [
                            { description: 'text within trigger', left: 'text', op: 'contained-in', right: 'trigger' },
                            { description: 'chevron within trigger', left: 'icon', op: 'contained-in', right: 'trigger' },
                            { description: 'chevron is to the right of the text', left: 'text.left', op: '<=', right: 'icon.left' },
                        ],
                    },
                ],
            },

            // Open: the panel (display:'' through the track) is VISIBLE. An overlay with no backdrop. The panel is
            // ALREADY open from the setup (the synthetic click) → action:'call' = the state is on, and the runner does not click.
            'cascader-open': {
                standalone: [
                    {
                        // _panelEl.style.display='' (ts:332) → torna al display CSS .pdx-cascader-panel { display:flex } (CSS:55).
                        selector: 'section:not([hidden]) [data-test="casc-open"] .pdx-cascader-panel',
                        description: 'open columns panel is displayed (not none)',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // CSS:61 → min-width: 180px → a measurable width at a 1280 viewport.
                        selector: 'section:not([hidden]) [data-test="casc-open"] .pdx-cascader-panel',
                        description: 'open columns panel has an appreciable width',
                        width: { op: '>=', value: 120 },
                    },
                    {
                        // CSS:58 → border-radius: var(--pdx-radius-md) → non-negative (the radius-zero themes zero it).
                        selector: 'section:not([hidden]) [data-test="casc-open"] .pdx-cascader-panel',
                        description: 'open columns panel has non-negative radius',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                overlay: [
                    {
                        // A dropdown-style CSS absolute: a floating panel, no backdrop. action:'call' → already opened by the setup.
                        description: 'open cascader shows the columns panel without a backdrop',
                        trigger: { selector: 'section:not([hidden]) [data-test="casc-open"] .pdx-cascader-trigger', action: 'call' },
                        panel: 'section:not([hidden]) [data-test="casc-open"] .pdx-cascader-panel',
                        hasBackdrop: false,
                    },
                ],
                composition: [
                    {
                        // The FIRST column's options are contained in the column (the listbox).
                        // Scoped to the first .pdx-cascader-column / the first .pdx-cascader-item, to avoid any ambiguity
                        // with the second column (the children) rendered beside it.
                        description: 'first-column options are contained within the column (listbox)',
                        parent: 'section:not([hidden]) [data-test="casc-open"] .pdx-cascader-column:first-child',
                        children: {
                            column: '.pdx-cascader-column:first-child',
                            option: '.pdx-cascader-column:first-child .pdx-cascader-item:first-child',
                        },
                        relations: [
                            { description: 'first option within the first column', left: 'option', op: 'contained-in', right: 'column' },
                        ],
                    },
                ],
            },

            // Disabled: prop statica → standalone.
            'cascader-disabled': {
                standalone: [
                    {
                        // .pdx-cascader-trigger.disabled { cursor: not-allowed } (CSS:22).
                        selector: 'section:not([hidden]) [data-test="casc-dis"] .pdx-cascader-trigger',
                        description: 'disabled trigger is not clickable (no pointer cursor)',
                        cursor: { op: 'isNot', value: 'pointer' },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // Closed: trigger role="combobox" + aria-haspopup. Open: columns role="listbox", items role="option" + aria-selected.
    // A trigger with no accessible name, or no aria-controls / no listbox id: if axe reports them they must
    // fail. No disableRule, so no real bug is masked.
    a11y: {
        scenarios: ['cascader-closed', 'cascader-open'],
    },

    // ── Dim. 3: style isolation ──
    // The target: the trigger (.pdx-cascader-trigger, an inline-flex box). skipHeight: its height is content- and
    //   line-height-driven (padding, the text, the chevron), not a clean structural invariant; the radius (a CSS value) stays asserted.
    isolation: {
        scenario: 'cascader-closed',
        targets: [
            { selector: 'section:not([hidden]) [data-test="casc"] .pdx-cascader-trigger', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA combobox/listbox) ──
    // The combobox trigger is tabindex="0" and focusable. keydown on the trigger (pdx-cascader.ts:242-245):
    //   Enter/Space → openPopover (when closed); Escape → closePopover (when open). aria-expanded is synchronised
    //   in the track (ts:327). It starts from the open scenario (the click in the setup): first the open state is
    //   asserted, then the close through Escape. Pattern 'listbox'. initialFocus = the trigger.
    // The APG combobox + listbox model on the columns. The focus stays on the trigger
    //   (aria-activedescendant on the active option); the active path follows the cursor, so
    //   the option one is on has aria-selected="true". Opened with the click (value ["it"]): the cursor is on
    //   Italy. ArrowDown → France; ArrowRight → the first child (Ile-de-France); Enter selects it and closes.
    //   The arrows are what this checks: Enter/Space/Escape alone would leave the columns unreachable.
    keyboard: {
        scenario: 'cascader-open',
        initialFocus: 'section:not([hidden]) [data-test="casc-open"] .pdx-cascader-trigger',
        steps: [
            {
                key: 'ArrowDown',
                expectFocus: 'section:not([hidden]) [data-test="casc-open"] .pdx-cascader-trigger',
                expectAttr: { selector: 'section:not([hidden]) [data-test="casc-open"] .pdx-cascader-column:nth-child(1) [role="option"]:nth-child(2)', name: 'aria-selected', value: 'true' },
            },
            {
                key: 'ArrowRight',
                expectAttr: { selector: 'section:not([hidden]) [data-test="casc-open"] .pdx-cascader-column:nth-child(2) [role="option"]:nth-child(1)', name: 'aria-selected', value: 'true' },
            },
            {
                // Enter on the leaf: one pdx-change, the panel closes, the focus stays on the trigger.
                key: 'Enter',
                expectEvent: { selector: 'section:not([hidden]) [data-test="casc-open"]', name: 'pdx-change' },
                expectAttr: { selector: 'section:not([hidden]) [data-test="casc-open"] .pdx-cascader-trigger', name: 'aria-expanded', value: 'false' },
                expectFocus: 'section:not([hidden]) [data-test="casc-open"] .pdx-cascader-trigger',
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — one scenario (the open one: the columns are what the maths does not catch) ──
    visual: {
        scenarios: ['cascader-open'],
    },
};

export default cascader;
