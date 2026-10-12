/**
 * MANIFEST — pdx-autocomplete (tier 2, combobox text input + suggestions listbox)
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/autocomplete/pdx-autocomplete.ts)
 * and the CSS (packages/design/src/components/autocomplete.css).
 *
 * ── DOM structure (light DOM, render() in pdx-autocomplete.ts:375) ──
 *   <pdx-autocomplete>                                  ← host, display:block, position:relative (CSS autocomplete.css:4)
 *     <div class="pdx-autocomplete pdx-input-wrap [pdx-input-{size}] [state] [focused]">  ← wrap = trigger; box/height from .pdx-input-wrap
 *       <input class="pdx-input pdx-autocomplete-input"  ← FREE TEXT input
 *              type="text"
 *              role="combobox"                            ← ALWAYS a combobox (render:379)
 *              autocomplete="off"
 *              :value="{_query}"
 *              :aria-expanded="false|true"                ← String(_open()) (render:385)
 *              :aria-controls="{uid}-lb"                  ← points at the listbox (render:386)
 *              :aria-activedescendant="{uid}-sug-{idx}|—" ← only when _activeIndex >= 0 (render:387)
 *              :aria-label="{label}|—"                    ← ONLY when the `label` prop is set (render:391) ⚠ see a11y
 *              aria-haspopup="listbox"
 *              aria-autocomplete="list">
 *       <button class="pdx-input-clear">×</button>        ← only when clearable && _query
 *       <span class="pdx-input-spinner"></span>           ← only when isLoading
 *       <input type="hidden" name value>                  ← form participation (formAssociated)
 *     <div class="pdx-autocomplete-dropdown [open]">       ← THE PANEL: display:none → .open makes it display:block (CSS:65-69)
 *       <span class="pdx-sr-only" role="status" aria-live="polite">N results available</span>
 *       <div class="pdx-autocomplete-list" role="listbox" id="{uid}-lb">  ← ALWAYS in the DOM (parent display:none when closed)
 *         <div class="pdx-autocomplete-option [active]" role="option"
 *              id="{uid}-sug-{i}" data-suggestion-index="{i}"
 *              aria-selected="true|false">…</div>          ← one per filtered item (at most maxItems, 10 by default)
 *
 * ── WHERE THE PANEL LIVES (CRITICAL) ──
 *   The dropdown is NOT portalled to document.body. usePopover is created with `container: ctx.el`
 *   (pdx-autocomplete.ts:316) → the wrap (the trigger) and the `.pdx-autocomplete-dropdown` are
 *   SIBLINGS in the host's light DOM. So the panel's selectors CAN stay section-scoped like every
 *   other element (no global selector on the body is needed — the same as pdx-select).
 *   usePopover sets `position`/`top`/`left` inline (placement 'bottom-start', offset 4, flip) and
 *   `width` = wrap.offsetWidth (open(), pdx-autocomplete.ts:330), so the panel FLOATS under the
 *   trigger, as wide as the input. dismissOnOutside:true; dismissOnEscape:false (Escape via onKeydown).
 *   A PRECAUTION: a SINGLE "open" scenario is used (autocomplete-open), so there are never two open
 *   dropdowns fighting over selectors and positioning.
 *
 * ── Opening it (CRITICAL — calling open() is not enough) ──
 *   `open()` is exposed (ctx.expose, pdx-autocomplete.ts:357) but only sets _open=true. The listbox
 *   is EMPTY until filteredItems() has items: it needs _query.length >= minLength (1 by default) AND
 *   a match in the suggestions (filteredItems, :144). And the dropdown's CSS .open is driven by
 *   `_open()`. The REALISTIC and reliable path is the user's own:
 *     1. set the value on the native input,
 *     2. dispatch an 'input' event → onInput (:177) updates _query, evaluates filteredItems,
 *        and when length>=min && matches>0 calls open() (:205) → the panel opens with its options.
 *   The setup does exactly that (input value = "It" against country suggestions → matches "Italy").
 *   It waits a microtask and an rAF, because the popover is initialised in queueMicrotask (:304) and
 *   the list render is reactive.
 *
 * ── a11y (verified) ──
 *   role="combobox" is ALWAYS on the input. The combobox's ACCESSIBLE NAME comes from `aria-label`,
 *   which is rendered ONLY when the `label` prop is set (render:391, `ctx.label() || null`).
 *   ⇒ the scenarios ALWAYS set `label`, to guarantee the accessible name (an input with no text label
 *   bound to it would be a combobox without a name). role="listbox", role="option" and aria-selected
 *   are there; aria-controls points at the listbox's id (always in the DOM). NO disableRule.
 *
 * ── States set up front → standalone rules (NOT stateRules) ──
 *   The value is free text → set through the `value` prop (synced to _query, :113). The closed scenario
 *   has a value and no open panel (a visible input, a display:none dropdown). The open scenario is produced
 *   from the setup (see above).
 *
 * ── Contracts: CONSERVATIVE, no theme-specific px. Invariants that hold on all 13 themes:
 *   · the input (the combobox) is a visible interactive box (cursor text — it is a text field);
 *   · the wrap has radius >= 0 (the radius-zero themes zero it, never below);
 *   · open: the dropdown is VISIBLE (display block), wider than 0 (width = the wrap) and sits UNDER the trigger
 *     (overlay, no backdrop, no centering);
 *   · the options are contained in the listbox.
 */
import type { ComponentManifest } from './_types';

const SUGGESTIONS = `["Italy","Iceland","India","Indonesia","Ireland","France","Spain","Germany"]`;

export const autocomplete: ComponentManifest = {
    name: 'autocomplete',
    tag: 'pdx-autocomplete',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/autocomplete'],

    // ── Scenarios ──
    scenarios: [
        {
            // Closed: an input with a value (free text), a display:none dropdown.
            // `label` is set → the combobox input has an accessible name (see a11y).
            id: 'autocomplete-closed',
            title: 'Autocomplete — Closed with a typed value',
            html: `
                <pdx-autocomplete data-test="ac"
                    label="Country"
                    placeholder="Type a country…"
                    value="Italy"
                    suggestions='${SUGGESTIONS}'>
                </pdx-autocomplete>`,
        },
        {
            // The ONE open scenario: the floating panel is made visible by the setup.
            // The exposed open() only sets _open; the realistic path is setting the input and
            // dispatching 'input' (onInput → filteredItems>0 → open()). Then it waits for the popover
            // (initialised in queueMicrotask) and for the list's reactive render.
            id: 'autocomplete-open',
            title: 'Autocomplete — Open (suggestions listbox visible below the input)',
            html: `
                <pdx-autocomplete data-test="ac-open"
                    label="Country"
                    placeholder="Type a country…"
                    suggestions='${SUGGESTIONS}'>
                </pdx-autocomplete>`,
            setup: `
                const host = document.querySelector('section:not([hidden]) [data-test="ac-open"]');
                const input = host && host.querySelector('input.pdx-autocomplete-input');
                if (input) {
                    input.focus();
                    input.value = 'It';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'autocomplete-closed': {
                standalone: [
                    {
                        // The wrap reuses .pdx-input-wrap → a visible box (display is not 'none').
                        selector: 'section:not([hidden]) [data-test="ac"] .pdx-autocomplete',
                        description: 'input wrap is a visible box',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // It is a text field → cursor text on the input.
                        selector: 'section:not([hidden]) [data-test="ac"] .pdx-autocomplete-input',
                        description: 'text input shows a text cursor',
                        cursor: { op: 'is', value: 'text' },
                    },
                    {
                        // The wrap's radius is non-negative (the radius-zero themes zero it, never below 0).
                        selector: 'section:not([hidden]) [data-test="ac"] .pdx-autocomplete',
                        description: 'input wrap radius is non-negative',
                        radius: {
                            topLeft: { op: '>=', value: 0 },
                            topRight: { op: '>=', value: 0 },
                            bottomLeft: { op: '>=', value: 0 },
                            bottomRight: { op: '>=', value: 0 },
                        },
                    },
                    {
                        // Closed: the panel is display:none (CSS:65) — not visible until .open is there.
                        selector: 'section:not([hidden]) [data-test="ac"] .pdx-autocomplete-dropdown',
                        description: 'closed dropdown panel is hidden',
                        display: { op: 'is', value: 'none' },
                    },
                ],
            },

            // Open: the panel (display:block through .open) sits UNDER the trigger. An overlay with no backdrop.
            // The panel is ALREADY open from the setup → action:'call' = the state is already on, and the runner
            // measures without interacting further. OverlayRule has no 'placement' (that belongs to
            // PositioningRule), so "under the trigger" is checked by the composition.
            'autocomplete-open': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="ac-open"] .pdx-autocomplete-dropdown.open',
                        description: 'open dropdown panel is displayed as a block',
                        display: { op: 'oneOf', value: ['block', 'flex'] },
                    },
                    {
                        // open() sets width = wrap.offsetWidth inline → a measurable width.
                        selector: 'section:not([hidden]) [data-test="ac-open"] .pdx-autocomplete-dropdown.open',
                        description: 'open dropdown panel has an appreciable width (matches the input)',
                        width: { op: '>=', value: 80 },
                    },
                ],
                overlay: [
                    {
                        description: 'open autocomplete shows the suggestions panel without a backdrop',
                        trigger: { selector: 'section:not([hidden]) [data-test="ac-open"] .pdx-autocomplete', action: 'call' },
                        panel: 'section:not([hidden]) [data-test="ac-open"] .pdx-autocomplete-dropdown.open',
                        hasBackdrop: false,
                    },
                ],
                composition: [
                    {
                        // The panel (a sibling of the wrap in the light DOM, positioned by usePopover with
                        // placement 'bottom-start') sits UNDER the trigger.
                        description: 'dropdown panel sits below the input',
                        parent: 'section:not([hidden]) [data-test="ac-open"]',
                        // Scoped like the parent: the bare trigger class finds a hidden scenario's
                        // input (0×0), and `0 <= panel.top` holds without measuring anything.
                        children: {
                            trigger: 'section:not([hidden]) [data-test="ac-open"] .pdx-autocomplete',
                            panel: 'section:not([hidden]) [data-test="ac-open"] .pdx-autocomplete-dropdown.open',
                        },
                        relations: [
                            { description: 'panel.top >= input.bottom (below)', left: 'trigger.bottom', op: '<=', right: 'panel.top', tolerance: 2 },
                        ],
                    },
                    {
                        // The filtered options live inside the listbox.
                        description: 'options are contained within the listbox',
                        parent: 'section:not([hidden]) [data-test="ac-open"] .pdx-autocomplete-list',
                        // Scoped like the parent: bare classes find the first list in the document,
                        // in a hidden scenario (0×0).
                        children: {
                            list: 'section:not([hidden]) [data-test="ac-open"] .pdx-autocomplete-list',
                            option: 'section:not([hidden]) [data-test="ac-open"] .pdx-autocomplete-option',
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
    // Closed: the input has role="combobox" with an accessible name from aria-label (the `label` prop is set) +
    //   aria-haspopup + aria-controls pointing at the listbox (always in the DOM). Open: role="listbox" + role="option"
    //   + aria-selected. No disableRule: the scenarios set `label` to guarantee the accessible name.
    a11y: {
        scenarios: ['autocomplete-closed', 'autocomplete-open'],
    },

    // ── Dim. 3: style isolation ──
    // The input wrap (.pdx-autocomplete = .pdx-input-wrap) must keep its box under hostile global CSS.
    // skipHeight: the wrap's height is content- and line-height-driven (padding plus the input) → not a clean
    //   structural invariant; the radius (a CSS value, not scaled) stays asserted.
    isolation: {
        scenario: 'autocomplete-closed',
        targets: [
            { selector: 'section:not([hidden]) [data-test="ac"] .pdx-autocomplete', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA combobox/listbox) ──
    // The editing combobox pattern: the focus stays on the input (the combobox) and the arrows move the active
    // descendant in the listbox. onKeydown (pdx-autocomplete.ts:241): ArrowDown opens and navigates, Escape closes.
    // It starts from the open scenario (the setup types "It" → the panel is open). initialFocus = the input.
    // aria-expanded is checked with expectAttr. Escape closes (aria-expanded → false), and the focus stays on the input.
    keyboard: {
        scenario: 'autocomplete-open',
        initialFocus: 'section:not([hidden]) [data-test="ac-open"] .pdx-autocomplete-input',
        steps: [
            // Open (through the setup): aria-expanded must be true.
            { key: 'ArrowDown', expectAttr: { selector: 'section:not([hidden]) [data-test="ac-open"] .pdx-autocomplete-input', name: 'aria-expanded', value: 'true' } },
            // Escape closes it → aria-expanded goes back to false; the focus stays on the input (the combobox).
            { key: 'Escape', expectAttr: { selector: 'section:not([hidden]) [data-test="ac-open"] .pdx-autocomplete-input', name: 'aria-expanded', value: 'false' } },
            { key: 'Escape', expectFocus: 'section:not([hidden]) [data-test="ac-open"] .pdx-autocomplete-input' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — the open state only (what the maths does not catch: the list's style) ──
    visual: {
        scenarios: ['autocomplete-open'],
        // The text input can show a blinking caret → masked, for stability.
        mask: ['section:not([hidden]) [data-test="ac-open"] .pdx-autocomplete-input'],
    },
};

export default autocomplete;
