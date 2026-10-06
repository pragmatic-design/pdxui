/**
 * MANIFEST — pdx-mention (tier 2, textarea with @-mention trigger + floating suggestions)
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/mention/pdx-mention.ts)
 * and the CSS (packages/design/src/components/mention.css). Verified: the export in
 * packages/ui/package.json ("./mention", line 214) and the import in packages/ui/src/index.ts
 * (line 53). Registration OK.
 *
 * ── DOM structure (light DOM, BUILT in a requestAnimationFrame, pdx-mention.ts:361) ──
 *   <pdx-mention>                                  ← host, display:block, position:relative (mention.css:3)
 *     <div class="pdx-mention-wrap">               ← wrap, position:relative, display:block (mention.css:8)
 *       <div class="pdx-mention-mirror">           ← a mirror behind the textarea: it highlights the mentions,
 *                                                     position:absolute, color:transparent, pointer-events:none.
 *                                                     it is NOT the editable box (only a visual overlay).
 *       <textarea class="pdx-mention-textarea"      ← THE editable field. min-height 80px (css:46), resize:vertical.
 *               rows="{rows}" placeholder="…"        spellcheck="false". value = prop `value` (ts:383).
 *               spellcheck="false">                  ⚠ NO role, NO aria-* — see the a11y BUG.
 *       <div class="pdx-mention-dropdown"           ← the suggestions PANEL. style.display='none' by default
 *               style="display:none">                 (ts:399). Filled and positioned ONLY when _open && suggestions.
 *                                                     ⚠ NO role="listbox" on the container — see the a11y BUG.
 *         · open → children .pdx-mention-item[role=option][aria-selected] (ts:461-503)
 *           with a .pdx-mention-item-label (plus an optional .pdx-mention-item-desc, .pdx-mention-highlight)
 *       <input type="hidden" name>                  ← ONLY when the `name` prop is set (ts:402)
 *
 * ── WHERE THE PANEL LIVES ──
 *   The dropdown is a child of the wrap in the host's light DOM (NOT portalled to the body) → the selectors
 *   stay section-scoped. It is positioned inline (top/left) relative to the caret through getCaretCoords()
 *   (ts:441-444), which creates and removes a temporary mirror on document.body during the measurement alone.
 *
 * ── OPENING IT (CRITICAL — why the MAIN scenario is CLOSED) ──
 *   Opening the panel is not exposed as a public method: it depends on onInput (ts:282), which:
 *     1. needs a built textarea (the build is in an rAF, ts:361 → a frame must pass);
 *     2. scans backwards from the caret for an '@' trigger that is at the start of the text or preceded
 *        by a space/newline (ts:302-313);
 *     3. opens the dropdown and searches for suggestions (debouncedSearch → searchSuggestions, ts:120).
 *   The panel becomes VISIBLE only when _open && (suggestions.length>0 || loading) (ts:436).
 *   Its position comes from getCaretCoords(), which instantiates a mirror on the body → timing-dependent.
 *   ⇒ The OPEN state can be simulated but it is fragile (a build in rAF, an input event with a caret, a reactive render
 *      and caret-driven positioning). It is included as the ONE open scenario, built in a setup with
 *      a bare `await` (one rAF for the DOM build, set the value and the caret, dispatch 'input', then two rAFs for the
 *      dropdown's reactive render). FIXED data (static items, the query "al" → matching "Alice"/"Albert"),
 *      minLength at its default 0 and debounce 0 for static items (ts:149) → no setTimeout, deterministic.
 *   The CLOSED state (a textarea with text, the dropdown display:none) is fully deterministic and covers
 *   the contract, a11y, isolation and visual dimensions without depending on the popup's timing.
 *
 * ── a11y ──
 *   The textarea has a name (the `label` prop, or else the placeholder), the dropdown is role="listbox"
 *   with options that have ids, and the textarea carries aria-autocomplete="list", aria-controls pointing at the
 *   list and aria-activedescendant pointing at the active option; a live region says how many suggestions there
 *   are, or «No results». NOT aria-expanded: the textbox role does not allow it (axe's
 *   aria-allowed-attr, critical — measured on the open scenario), and role="combobox" on a multiline
 *   textarea would be wrong. axe runs on both the closed and the open scenario.
 *
 * ── Contracts: CONSERVATIVE, no theme-specific px. Invariants that hold on all 13 themes:
 *   · the textarea is a visible editable box (display is not 'none', cursor 'text');
 *   · it has a noticeable height (min-height 80px in the CSS → height > 0, >= 40 to be conservative);
 *   · the wrap's and the textarea's radius is non-negative (the radius-zero themes zero it, never below 0);
 *   · closed: the dropdown is display:none;
 *   · composition: the mirror and the textarea are contained in the wrap (an overlay on top).
 */
import type { ComponentManifest } from './_types';

// Fixed static data → with static items minLength=0 and debounce=0 (ts:149): it opens synchronously, deterministically.
const ITEMS = `[{"value":"alice","label":"Alice"},{"value":"albert","label":"Albert"},{"value":"bob","label":"Bob"}]`;

export const mention: ComponentManifest = {
    name: 'mention',
    tag: 'pdx-mention',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/mention'],

    // ── Scenarios ──
    scenarios: [
        {
            // THE MAIN ONE — closed and idle: a textarea with deterministic text, the dropdown display:none.
            // Fully deterministic: it covers contract / a11y / isolation / visual.
            id: 'mention-closed',
            title: 'Mention — Closed (textarea with text, no suggestions panel)',
            html: `
                <pdx-mention data-test="mn"
                    value="Hello team"
                    placeholder="Type @ to mention…"
                    items='${ITEMS}'>
                </pdx-mention>`,
            // The DOM build is in a requestAnimationFrame: a frame is awaited so the textarea and dropdown exist
            // before the measurements. No interaction → a stable closed state.
            setup: `
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));`,
        },
        {
            // Empty, for the keyboard (Dim 4): Tab and then "@al" really typed.
            id: 'mention-type',
            title: 'Mention — Typing a mention',
            html: `
                <pdx-mention data-test="mn-type"
                    label="Comment"
                    items='${ITEMS}'>
                </pdx-mention>`,
        },
        {
            // The ONE open scenario (fragile, see the OPENING comment). Built through the setup:
            //  1) wait an rAF → the textarea exists (the build is in an rAF, ts:361);
            //  2) set the value "@al" and the caret at the end of the text (selectionStart=3);
            //  3) dispatch 'input' → onInput finds the '@' at the start of the text (ts:306), opens the dropdown and
            //     searches for suggestions (static items, debounce 0 → synchronous);
            //  4) wait two rAFs → the reactive track (ts:427) fills and shows the dropdown.
            id: 'mention-open',
            title: 'Mention — Open (suggestions panel visible after typing @)',
            html: `
                <pdx-mention data-test="mn-open"
                    placeholder="Type @ to mention…"
                    items='${ITEMS}'>
                </pdx-mention>`,
            setup: `
                await new Promise(r => requestAnimationFrame(r));
                const host = document.querySelector('section:not([hidden]) [data-test="mn-open"]');
                const ta = host && host.querySelector('textarea.pdx-mention-textarea');
                if (ta) {
                    ta.focus();
                    ta.value = '@al';
                    ta.selectionStart = ta.selectionEnd = 3;
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                }
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'mention-closed': {
                standalone: [
                    {
                        // The textarea is the editable box → visible.
                        selector: 'section:not([hidden]) [data-test="mn"] .pdx-mention-textarea',
                        description: 'editable textarea is a visible box',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // It is a text field → cursor text.
                        selector: 'section:not([hidden]) [data-test="mn"] .pdx-mention-textarea',
                        description: 'textarea shows a text cursor (editable)',
                        cursor: { op: 'is', value: 'text' },
                    },
                    {
                        // min-height 80px in the CSS → a noticeable height. Conservative (>=40) for the density and the theme.
                        selector: 'section:not([hidden]) [data-test="mn"] .pdx-mention-textarea',
                        description: 'textarea has an appreciable multi-line height',
                        height: { op: '>=', value: 40 },
                    },
                    {
                        // A non-negative radius (the radius-zero themes zero it, never below 0).
                        selector: 'section:not([hidden]) [data-test="mn"] .pdx-mention-textarea',
                        description: 'textarea radius is non-negative',
                        radius: {
                            topLeft: { op: '>=', value: 0 },
                            topRight: { op: '>=', value: 0 },
                            bottomLeft: { op: '>=', value: 0 },
                            bottomRight: { op: '>=', value: 0 },
                        },
                    },
                    {
                        // Closed: the dropdown is display:none (an inline style, ts:399 / ts:437).
                        selector: 'section:not([hidden]) [data-test="mn"] .pdx-mention-dropdown',
                        description: 'closed suggestions panel is hidden',
                        display: { op: 'is', value: 'none' },
                    },
                ],
                composition: [
                    {
                        // The mirror (the highlight overlay) is on top of, and contained in, the wrap, like the textarea.
                        description: 'mirror overlay is contained within the wrap',
                        parent: 'section:not([hidden]) [data-test="mn"] .pdx-mention-wrap',
                        children: {
                            wrap: '.pdx-mention-wrap',
                            mirror: '.pdx-mention-mirror',
                        },
                        relations: [
                            { description: 'mirror contained in wrap', left: 'mirror', op: 'contained-in', right: 'wrap' },
                        ],
                    },
                    {
                        description: 'textarea is contained within the wrap',
                        parent: 'section:not([hidden]) [data-test="mn"] .pdx-mention-wrap',
                        children: {
                            wrap: '.pdx-mention-wrap',
                            textarea: '.pdx-mention-textarea',
                        },
                        relations: [
                            { description: 'textarea contained in wrap', left: 'textarea', op: 'contained-in', right: 'wrap' },
                        ],
                    },
                ],
            },

            // Open (through the setup): the panel (display not none) is VISIBLE with a noticeable width
            // (min-width 180px in the CSS:83). An OverlayRule with no backdrop. The options live in the dropdown.
            'mention-open': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="mn-open"] .pdx-mention-dropdown',
                        description: 'open suggestions panel is displayed',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // min-width 180px in the CSS → a noticeable width.
                        selector: 'section:not([hidden]) [data-test="mn-open"] .pdx-mention-dropdown',
                        description: 'open suggestions panel has an appreciable width',
                        width: { op: '>=', value: 80 },
                    },
                ],
                overlay: [
                    {
                        description: 'open mention shows the suggestions panel without a backdrop',
                        trigger: { selector: 'section:not([hidden]) [data-test="mn-open"] .pdx-mention-textarea', action: 'call' },
                        panel: 'section:not([hidden]) [data-test="mn-open"] .pdx-mention-dropdown',
                        hasBackdrop: false,
                    },
                ],
                composition: [
                    {
                        // The filtered options live inside the dropdown.
                        description: 'suggestion items are contained within the dropdown panel',
                        parent: 'section:not([hidden]) [data-test="mn-open"] .pdx-mention-dropdown',
                        // Scoped like the parent: bare classes find the first dropdown in the
                        // document, in a hidden scenario (0×0).
                        children: {
                            panel: 'section:not([hidden]) [data-test="mn-open"] .pdx-mention-dropdown',
                            item: 'section:not([hidden]) [data-test="mn-open"] .pdx-mention-item',
                        },
                        relations: [
                            { description: 'first item within panel', left: 'item', op: 'contained-in', right: 'panel' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // No disableRule: a textarea with no accessible name (no aria-label, no labelledby, no <label>; a placeholder
    // alone does not count) MUST surface as a failure (axe's aria-input-field-name). See the a11y comment in the header.
    a11y: {
        scenarios: ['mention-closed', 'mention-open'],
    },

    // ── Dim. 3: style isolation ──
    // The textarea must keep its box under hostile global CSS. skipHeight: its height is content-, resize- and
    // density-driven (the min-height plus the host's line-height) → not a clean structural invariant; the radius
    // (a CSS value, not scaled) stays asserted.
    isolation: {
        scenario: 'mention-closed',
        targets: [
            { selector: 'section:not([hidden]) [data-test="mn"] .pdx-mention-textarea', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard ──
    // A deterministic base state: Tab puts the focus on the textarea (the only focusable element while closed).
    // The full listbox pattern is not used: the dropdown is navigated with ArrowUp/Down plus Enter/Tab (onKeydown,
    // ts:325) ONLY while _open, and the opening is timing-dependent (see OPENING IT) → not reliable as a
    // universal assertion. What is checked is the stable invariant: the textarea is reachable from the keyboard.
    // Typing "@al" makes the textarea point (with aria-activedescendant) at the active option, and ↓
    // moves it. The empty scenario: the caret is at the end and the trigger is at the start of the text.
    keyboard: {
        scenario: 'mention-type',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="mn-type"] .pdx-mention-textarea' },
            { key: '@' },
            { key: 'a' },
            { key: 'l', expectActiveDescendant: { selector: 'section:not([hidden]) [data-test="mn-type"] .pdx-mention-textarea', target: '.pdx-mention-item:nth-child(1)' } },
            { key: 'ArrowDown', expectActiveDescendant: { selector: 'section:not([hidden]) [data-test="mn-type"] .pdx-mention-textarea', target: '.pdx-mention-item:nth-child(2)' } },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — the open state only (what the maths does not catch: the list's style) ──
    visual: {
        scenarios: ['mention-open'],
        // The blinking caret in the textarea is masked, for a stable screenshot.
        mask: ['section:not([hidden]) [data-test="mn-open"] .pdx-mention-textarea'],
    },
};

export default mention;
