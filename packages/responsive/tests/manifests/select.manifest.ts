/**
 * MANIFEST — pdx-select (tier 2, a combobox/listbox with a floating dropdown)
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/select/pdx-select.ts)
 * and the CSS (packages/design/src/components/select.css).
 *
 * ── DOM structure (light DOM, render() in pdx-select.ts:628) ──
 *   <pdx-select>                                        ← host, display:block, position:relative (CSS select.css:4);
 *                                                         its states are custom states, :state(open), :state(invalid)… (#287)
 *     <div class="pdx-select-trigger pdx-input-wrap" data-part="root"  ← box/height from .pdx-input-wrap; no state class
 *          role="combobox"                              ← the combobox is the element that takes the focus: the trigger,
 *                                                         or the search input when it sits in the trigger (and then
 *                                                         the trigger has no role)
 *          aria-haspopup="listbox"
 *          aria-expanded="false|true"
 *          aria-controls="{uid}-lb"
 *          aria-activedescendant="{uid}-opt-{i}"|—      ← the highlighted option, only while the list is open
 *          aria-label="{label}"                         ← there only when the label prop is set
 *          aria-disabled="true"|—
 *          tabindex="-1"|"0">                           ← '-1' when the search input is in the trigger, otherwise '0'
 *       <span class="pdx-select-value [pdx-select-placeholder]">…</span>   ← non-searchable: the label or the placeholder
 *       <span class="pdx-input-loading" role="status">…</span>            ← only while loading
 *       <span class="pdx-select-caret"><svg/></span>                       ← the chevron; it turns 180° when aria-expanded
 *     <input type="hidden" name value>                  ← form participation (formAssociated)
 *     <div class="pdx-select-dropdown" data-part="popup">  ← THE PANEL: display:none → the host's :state(open) makes it display:block
 *       <span class="pdx-sr-only" role="status" aria-live="polite">N options available</span>
 *       <div class="pdx-select-list" data-part="list" role="listbox" id="{uid}-lb"
 *            aria-multiselectable="true"|—>             ← 'true' only when multiple
 *         <div class="pdx-select-option [active]" data-part="option" role="option"
 *              id="{uid}-opt-{i}" data-option-index="{i}"
 *              aria-selected="true|false">…</div>        ← one per option (flat, grouped or virtual)
 *
 * ── WHERE THE PANEL LIVES (CRITICAL) ──
 *   The dropdown is NOT portalled to document.body. usePopover is created with `container: ctx.el`
 *   (pdx-select.ts:491) → the trigger and the `.pdx-select-dropdown` are SIBLINGS in the host's light DOM.
 *   So the panel's selectors CAN stay section-scoped like every other element's.
 *   usePopover sets inline `position`/`top`/`left` all the same (placement 'bottom-start', offset 4, flip),
 *   so the panel FLOATS, positioned under the trigger.
 *   A PRECAUTION: a SINGLE "open" scenario is used (select-open) for the overlay and the keyboard, so there are never
 *   two open dropdowns at once fighting over the selectors and the positioning.
 *
 * ── Opening ──
 *   open() on a click on the trigger (onTriggerClick → toggle, render:637) or from the keyboard (ArrowDown/Enter/Space,
 *   onTriggerKeydown:384). It sets _open=true → the host's :state(open), `open-change` { value: true }, and an
 *   effect syncs popover.open() + width = trigger.offsetWidth (pdx-select.ts:506). dismissOnOutside:true (a click outside closes it),
 *   dismissOnEscape:false → Escape is handled by onTriggerKeydown (close).
 *
 * ── a11y (verified) ──
 *   The combobox takes its name from the `label` prop (aria-label), or from an external label: pdx-form-field and
 *   pdx-label give it an aria-labelledby. The scenarios ALWAYS set `label`: without it, a combobox with
 *   search has no name (axe's aria-input-field-name) and a plain one would be named by its value.
 *   role="listbox" + role="option" + aria-selected are there. aria-controls points at the listbox's id
 *   (always in the DOM, parent display:none).
 *
 * ── States set up front → standalone rules (NOT stateRules) ──
 *   disabled is a static prop → a dedicated scenario (select-disabled), asserting the cursor and aria-disabled.
 *   The selected value is set up front through the `value` prop → a standalone rule on select-closed.
 *
 * ── Contracts: CONSERVATIVE, no theme-specific px. Invariants that hold on all 13 themes:
 *   · the trigger is a box (display block or flex, through .pdx-input-wrap) that is interactive (cursor pointer);
 *   · the trigger has radius >= 0 (the radius-zero themes zero it, never below);
 *   · open: the dropdown is VISIBLE and sits UNDER the trigger (an overlay, no backdrop, no centring);
 *   · the options are contained in the listbox.
 */
import type { ComponentManifest } from './_types';

export const select: ComponentManifest = {
    name: 'select',
    tag: 'pdx-select',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/select'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'select-closed',
            title: 'Select — Closed with a selected value',
            html: `
                <pdx-select data-test="sel"
                    label="Country"
                    value="it"
                    options='[{"label":"Italy","value":"it"},{"label":"France","value":"fr"},{"label":"Spain","value":"es"},{"label":"Germany","value":"de"}]'>
                </pdx-select>`,
        },
        {
            // The ONE open scenario: the floating panel is made visible by the setup (opened programmatically).
            // show() is exposed on the host, the overlay verb (#287). Called after the mount.
            id: 'select-open',
            title: 'Select — Open (listbox panel visible below trigger)',
            html: `
                <pdx-select data-test="sel-open"
                    label="Country"
                    value="it"
                    options='[{"label":"Italy","value":"it"},{"label":"France","value":"fr"},{"label":"Spain","value":"es"},{"label":"Germany","value":"de"}]'>
                </pdx-select>`,
            setup: `
                const host = document.querySelector('section:not([hidden]) [data-test="sel-open"]');
                if (host && typeof host.show === 'function') host.show();`,
        },
        {
            // The combobox is the search input: named by the `label` prop. Without it, a select with
            // search is a combobox with no name.
            id: 'select-searchable',
            title: 'Select — Searchable (the search input is the combobox)',
            html: `
                <pdx-select data-test="sel-search"
                    label="Country"
                    searchable
                    placeholder="Search…"
                    options='[{"label":"Italy","value":"it"},{"label":"France","value":"fr"},{"label":"Spain","value":"es"},{"label":"Germany","value":"de"}]'>
                </pdx-select>`,
        },
        {
            id: 'select-disabled',
            title: 'Select — Disabled',
            html: `
                <pdx-select data-test="sel-dis"
                    label="Country"
                    disabled
                    placeholder="Select…"
                    options='[{"label":"Italy","value":"it"},{"label":"France","value":"fr"}]'>
                </pdx-select>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'select-closed': {
                standalone: [
                    {
                        // The trigger reuses .pdx-input-wrap → it is a visible box (display is not 'none').
                        selector: 'section:not([hidden]) [data-test="sel"] [data-part="root"]',
                        description: 'trigger is a visible box',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // CSS: .pdx-select-trigger { cursor: pointer } → interactive.
                        selector: 'section:not([hidden]) [data-test="sel"] [data-part="root"]',
                        description: 'trigger is interactive (cursor pointer)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // The trigger's radius is non-negative (the radius-zero themes zero it, never below 0).
                        selector: 'section:not([hidden]) [data-test="sel"] [data-part="root"]',
                        description: 'trigger radius is non-negative',
                        radius: {
                            topLeft: { op: '>=', value: 0 },
                            topRight: { op: '>=', value: 0 },
                            bottomLeft: { op: '>=', value: 0 },
                            bottomRight: { op: '>=', value: 0 },
                        },
                    },
                ],
                // The DISTANCE the panel opens at. The
                // `select-open` scenario is certified on axe, isolation, keyboard and visual, and
                // none of those looks at geometry — so a dropdown opening over its own trigger, or
                // 200px below it, would pass everything. `pdx-select.ts:529` carries the claim "No
                // offset: the gap comes from `--pdx-float-offset`", and a claim like that can be
                // false in a browser while every contract stays green.
                //
                // Measured (13 themes, viewport 1280): the token is
                // 4px everywhere and the gap is 4 everywhere. `usePopover` is created without an
                // `offset` (`pdx-select.ts:526-533`), so the value comes from `readFloatOffset`,
                // whose fallback is 8 — which is what makes the mutation visible: making it ignore
                // the token turns 4 into 8 and a tolerance of 1 refuses it.
                //
                // ── Why this rule lives on the CLOSED scenario ──
                // The rule needs `action: 'click'` to have a wait that means something, and on
                // `select-open` the panel is already open by the scenario's setup: measured, a
                // click there TOGGLES IT SHUT (`:state(open)` gone, Playwright reports
                // it not visible), so the rule could not run at all. Here the panel is
                // `display:none` at 0x0 before the click and `assertPositioning`'s
                // `waitFor({state:'visible'})` is a real wait: the click is what satisfies it.
                positioning: [
                    {
                        description: 'select dropdown opens below the trigger, one float-offset away',
                        trigger: { selector: 'section:not([hidden]) [data-test="sel"] [data-part="root"]', action: 'click' },
                        floating: 'section:not([hidden]) [data-test="sel"] [data-part="popup"]',
                        placement: 'bottom',
                        gap: { op: '==', value: 4, tolerance: 1 },
                        withinViewport: true,
                        tolerance: 6,
                    },
                ],
                composition: [
                    {
                        // The caret and the value are contained in the trigger (the layout holds).
                        description: 'value and caret are contained within the trigger box',
                        parent: 'section:not([hidden]) [data-test="sel"] [data-part="root"]',
                        // Scoped like the parent: bare classes could each find a different select in
                        // the document.
                        children: {
                            trigger: 'section:not([hidden]) [data-test="sel"] [data-part="root"]',
                            value: 'section:not([hidden]) [data-test="sel"] .pdx-select-value',
                            caret: 'section:not([hidden]) [data-test="sel"] .pdx-select-caret',
                        },
                        relations: [
                            { description: 'value within trigger', left: 'value', op: 'contained-in', right: 'trigger' },
                            { description: 'caret within trigger', left: 'caret', op: 'contained-in', right: 'trigger' },
                            { description: 'caret is to the right of the value', left: 'value.left', op: '<=', right: 'caret.left' },
                        ],
                    },
                ],
            },

            // Open: the panel (display:block through :state(open)) sits UNDER the trigger. An overlay with no backdrop.
            // The panel is ALREADY open from the setup (show()) → action:'call' = the state is on,
            // and the runner measures the panel without interacting further. OverlayRule has no 'placement'
            // (that belongs to PositioningRule), so "under the trigger" is checked by the composition below.
            'select-open': {
                // The panel sets its `width` to the trigger's width (open() → dropdownEl.style.width),
                // NOT a CSS min-width → what is checked is its VISIBILITY (display block plus a noticeable width)
                // in a standalone rule, not the overlay's `minWidth` (which would read the CSS min-width = auto = 0).
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="sel-open"] [data-part="popup"]',
                        description: 'open dropdown panel is displayed as a block',
                        display: { op: 'oneOf', value: ['block', 'flex'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="sel-open"] [data-part="popup"]',
                        description: 'open dropdown panel has an appreciable width (matches the trigger)',
                        width: { op: '>=', value: 80 },
                    },
                ],
                // Open is a custom state of the host (#287), what a theme selects; the panel has no class for it.
                states: [
                    {
                        description: 'open is the custom state :state(open)',
                        selector: 'section:not([hidden]) [data-test="sel-open"] [data-part="popup"]',
                        trigger: 'attribute',
                        customState: { host: 'section:not([hidden]) [data-test="sel-open"]', name: 'open' },
                        changes: {},
                    },
                ],
                overlay: [
                    {
                        description: 'open select shows the listbox dropdown panel without a backdrop',
                        trigger: { selector: 'section:not([hidden]) [data-test="sel-open"] [data-part="root"]', action: 'call' },
                        panel: 'section:not([hidden]) [data-test="sel-open"] [data-part="popup"]',
                        hasBackdrop: false,
                    },
                ],
                composition: [
                    {
                        // The panel (a sibling of the trigger in the light DOM, positioned by usePopover with
                        // placement 'bottom-start') sits UNDER the trigger. The trigger and the dropdown are
                        // both children of the pdx-select host.
                        description: 'dropdown panel sits below the trigger',
                        parent: 'section:not([hidden]) [data-test="sel-open"]',
                        // Scoped like the parent: the bare trigger class finds a hidden scenario's
                        // trigger (0×0), and `0 <= panel.top` holds without measuring.
                        children: {
                            trigger: 'section:not([hidden]) [data-test="sel-open"] [data-part="root"]',
                            panel: 'section:not([hidden]) [data-test="sel-open"] [data-part="popup"]',
                        },
                        relations: [
                            { description: 'panel.top >= trigger.bottom (below)', left: 'trigger.bottom', op: '<=', right: 'panel.top', tolerance: 2 },
                        ],
                    },
                    {
                        // Every option lives inside the listbox.
                        description: 'options are contained within the listbox',
                        parent: 'section:not([hidden]) [data-test="sel-open"] [data-part="list"]',
                        // Scoped like the parent: bare classes find the first list in the document,
                        // in a hidden scenario (0×0).
                        children: {
                            list: 'section:not([hidden]) [data-test="sel-open"] [data-part="list"]',
                            option: 'section:not([hidden]) [data-test="sel-open"] [data-part="option"]',
                        },
                        relations: [
                            { description: 'first option within listbox', left: 'option', op: 'contained-in', right: 'list' },
                        ],
                    },
                ],
            },

            // Disabled: prop statica → standalone.
            'select-disabled': {
                standalone: [
                    {
                        // CSS: :state(disabled) > .pdx-select-trigger { cursor: not-allowed }.
                        selector: 'section:not([hidden]) [data-test="sel-dis"] [data-part="root"]',
                        description: 'disabled trigger is not clickable (no pointer cursor)',
                        cursor: { op: 'isNot', value: 'pointer' },
                    },
                ],
                states: [
                    {
                        description: 'disabled is the custom state :state(disabled)',
                        selector: 'section:not([hidden]) [data-test="sel-dis"] [data-part="root"]',
                        trigger: 'attribute',
                        customState: { host: 'section:not([hidden]) [data-test="sel-dis"]', name: 'disabled' },
                        changes: { cursor: { op: 'is', value: 'not-allowed' } },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // Closed: the trigger is role="combobox" with an accessible name from the `label` prop (aria-label) plus aria-haspopup
    //   and aria-controls pointing at the listbox (always in the DOM). Open: role="listbox" + role="option" + aria-selected.
    // Searchable: the combobox is the input, and the trigger around it has no role.
    // No disableRule: the scenarios set `label`, to guarantee the accessible name.
    a11y: {
        scenarios: ['select-closed', 'select-open', 'select-searchable'],
    },

    // ── Dim. 3: style isolation ──
    // The trigger (.pdx-input-wrap) must keep its box under hostile global CSS.
    // skipHeight: the trigger's height is content- and line-height-driven (the padding plus the value) → not a clean
    //   structural invariant; the radius (a CSS value, not scaled) stays asserted.
    isolation: {
        scenario: 'select-closed',
        targets: [
            { selector: 'section:not([hidden]) [data-test="sel"] [data-part="root"]', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (APG select-only combobox) ──
    // A non-searchable trigger: tabindex="0", focusable directly. Closed with the value "Italy":
    //   ↓ opens ON THE SELECTED OPTION, and aria-activedescendant names it (opening with nothing
    //   highlighted would make moving silent); ↓ goes to the next one; Escape closes and the
    //   focus stays on the trigger; a letter with the list closed picks the next option starting
    //   with it, the way a native <select> does.
    keyboard: {
        scenario: 'select-closed',
        initialFocus: 'section:not([hidden]) [data-test="sel"] [data-part="root"]',
        steps: [
            {
                key: 'ArrowDown',
                expectAttr: { selector: 'section:not([hidden]) [data-test="sel"] [data-part="root"]', name: 'aria-expanded', value: 'true' },
                expectActiveDescendant: {
                    selector: 'section:not([hidden]) [data-test="sel"] [data-part="root"]',
                    target: 'section:not([hidden]) [data-test="sel"] [role="option"][aria-selected="true"]',
                },
            },
            {
                key: 'ArrowDown',
                expectActiveDescendant: {
                    selector: 'section:not([hidden]) [data-test="sel"] [data-part="root"]',
                    target: 'section:not([hidden]) [data-test="sel"] [data-option-index="1"]',
                },
            },
            {
                key: 'Escape',
                expectAttr: { selector: 'section:not([hidden]) [data-test="sel"] [data-part="root"]', name: 'aria-expanded', value: 'false' },
                expectFocus: 'section:not([hidden]) [data-test="sel"] [data-part="root"]',
            },
            // Type-ahead with the list closed: "s" from Italy → Spain, exactly one value-change (its
            // model, #481).
            {
                key: 's',
                expectEvent: { selector: 'section:not([hidden]) [data-test="sel"]', name: 'value-change' },
                expectAttr: { selector: 'section:not([hidden]) [data-test="sel"] [data-option-index="2"]', name: 'aria-selected', value: 'true' },
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — closed + open ──
    visual: {
        scenarios: ['select-closed', 'select-open'],
        // Drawn position: fixed, outside its section: shot as the viewport (#714).
        viewportScenarios: ['select-open'],
    },
};

export default select;
