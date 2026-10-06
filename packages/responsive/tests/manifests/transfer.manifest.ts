/**
 * MANIFEST — pdx-transfer (dual-list shuttle / transfer)
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/transfer/pdx-transfer.ts)
 * and the CSS (packages/design/src/components/transfer.css). An INLINE component: always
 * visible (no overlay), its DOM is built once in a requestAnimationFrame and
 * updated reactively. There is NO real render() (render: () => html``).
 *
 * ── DOM structure (light DOM, built in a rAF — pdx-transfer.ts:350) ──
 *   <pdx-transfer>                                          ← host
 *     <div class="pdx-transfer [pdx-transfer-{size}] [disabled] [pdx-transfer-draggable]"
 *          role="group" aria-label="Transfer">              ← ROOT: display inline-flex (CSS:4), align stretch
 *
 *       <!-- SOURCE PANEL (left) -->
 *       <div class="pdx-transfer-panel" role="listbox" aria-label="{sourceTitle|'Source'}">  ← CSS:17 flex column, border, radius, min-width 220, min-height 280
 *         <div class="pdx-transfer-header">
 *           <!-- mode 'checkbox' (the default): -->
 *           <label>                                          ← clickable, wraps select-all + the title
 *             <input type="checkbox" class="pdx-transfer-select-all">
 *             <span>{title}</span>                           ← THIS is the visible title text
 *           </label>
 *           <!-- mode 'simple'/'direct': <span class="pdx-transfer-title">{title}</span> -->
 *           <span class="pdx-transfer-count">N/M</span>      ← the "checked/total" counter
 *         </div>
 *         <!-- with searchable: <div class="pdx-transfer-search"><input type="text"></div> -->
 *         <div class="pdx-transfer-list" role="listbox">     ← the INNER list, flex:1, overflow-y auto (CSS:79)
 *           <div class="pdx-transfer-item [checked] [disabled] [clickable]"
 *                role="option" aria-selected="true|false">   ← one per item NOT in the target
 *             <input type="checkbox" tabindex="-1">           ← only in mode 'checkbox'
 *             <span class="pdx-transfer-item-label">{label}</span>
 *           <!-- or .pdx-transfer-empty when the list is empty -->
 *
 *       <!-- ACTIONS (centre) — absent in mode 'direct' -->
 *       <div class="pdx-transfer-actions">                   ← CSS:134 flex column, center
 *         <!-- with showAllButtons: <button class="pdx-transfer-btn" aria-label="Move all to target">»</button> -->
 *         <button class="pdx-transfer-btn" aria-label="Move to target">›</button>    ← move RIGHT (source→target)
 *         <button class="pdx-transfer-btn" aria-label="Move to source">‹</button>    ← move LEFT  (target→source)
 *         <!-- with showAllButtons: <button class="pdx-transfer-btn" aria-label="Move all to source">«</button> -->
 *
 *       <!-- TARGET PANEL (right) — the same structure as the source -->
 *       <div class="pdx-transfer-panel" role="listbox" aria-label="{targetTitle|'Target'}"> ...
 *
 *       <!-- with name: <input type="hidden"> -->
 *
 * ── DETERMINISTIC DATA ──
 *   `items` and `value` are Array props. The core (component.ts:379) parses JSON from the
 *   attribute string: `case Array: JSON.parse(value)`. So I pass the data AS inline JSON
 *   ATTRIBUTES in the scenario's html — nothing async, nothing random, no JS setup:
 *     items='[{"value":"a","label":"Apple"},...]'  value='["banana"]'
 *   `value` = the keys that live in the TARGET panel (right). 4 items in total, 1 in the target →
 *   3 on the left (source), 1 on the right (target). Deterministic and stable in every theme.
 *   NB: the move RIGHT/LEFT buttons start `disabled` (no item is checked) — CSS opacity 0.3,
 *   cursor not-allowed. That does NOT change the geometry or layout, only the button's state.
 *   Should I use mode 'direct' for the contracts on the buttons' cursor? NO: in 'direct' the buttons do
 *   not exist. I keep the default mode (checkbox) and assert `cursor: not-allowed` on the button that is
 *   disabled at rest (a static state → standalone, not a state rule).
 *
 * ── a11y (verified) ── A REAL BUG: NESTED LISTBOX ──
 *   Every .pdx-transfer-panel has role="listbox" (pdx-transfer.ts:518) and CONTAINS
 *   .pdx-transfer-list which has role="listbox" TOO (pdx-transfer.ts:564) → two nested
 *   listboxes. WAI-ARIA: a listbox may contain ONLY role="option" (or "group"), NEVER another
 *   listbox. axe-core reports it (aria-required-children / nested-interactive style). Documented
 *   in the report; NOT fixed (the task = the manifest only). So as not to fail the whole axe dimension on
 *   a known and already tracked bug, I disable only the rules that catch it, WITH A REASON.
 *   The lists do have an accessible name anyway: the outer PANEL has aria-label={title}.
 *   The INNER list has no name of its own (it inherits the panel's context). The move buttons are
 *   icon-only (›/‹) with a correct aria-label (makeBtn → setAttribute('aria-label', label),
 *   pdx-transfer.ts:573) → accessible name OK. The select-all checkbox is inside a <label> carrying
 *   the title text → labelled OK.
 *
 * ── Contracts: CONSERVATIVE, no theme-specific px. Invariants universal across the 13 themes ──
 *   · the root .pdx-transfer is a flex box (inline-flex/flex);
 *   · there are TWO listbox panels;
 *   · the move buttons have cursor != default (pointer when enabled, not-allowed when disabled at rest);
 *   · layout: the source panel LEFT of the buttons; the buttons LEFT of the target panel;
 *   · the items are contained in their own lists; the two panels have the same height
 *     (align-items: stretch on the flex root → the same cross size).
 */
import type { ComponentManifest } from './_types';

// A deterministic dataset: 4 items, 1 of them in the target ('banana'). The same markup in every scenario.
const ITEMS = `[{"value":"apple","label":"Apple"},{"value":"banana","label":"Banana"},{"value":"cherry","label":"Cherry"},{"value":"date","label":"Date"}]`;

export const transfer: ComponentManifest = {
    name: 'transfer',
    tag: 'pdx-transfer',
    tier: '5B',
    status: 'wip',
    imports: ['@pdxui/ui/transfer'],

    // ── Scenarios ──
    scenarios: [
        {
            // A sized wrapper: the component is inline-flex with min-width 220 panels + the actions.
            // Wide enough not to wrap. Data through JSON attributes (deterministic).
            id: 'transfer-basic',
            title: 'Transfer — Checkbox mode (4 items, 1 in target)',
            html: `
                <div style="width: 640px;">
                    <pdx-transfer data-test="tr"
                        source-title="Available"
                        target-title="Selected"
                        items='${ITEMS}'
                        value='["banana"]'>
                    </pdx-transfer>
                </div>`,
        },
        {
            // Two 220px lists side by side need ~490px. In a 320px box — a phone column — side by
            // side they run past the edge, cut off by the page's overflow-x: clip.
            id: 'transfer-narrow',
            title: 'Transfer — in a box narrower than its two lists',
            html: `
                <div data-test="trn-box" style="width: 320px;">
                    <pdx-transfer data-test="trn"
                        source-title="Available"
                        target-title="Selected"
                        items='${ITEMS}'
                        value='["banana"]'>
                    </pdx-transfer>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    // The DOM is built in a rAF: the runner waits for the standard networkidle/timeout as it does for
    // the other rAF components (select, for instance). Every selector is section-scoped.
    contracts: {
        scenarios: {
            'transfer-basic': {
                standalone: [
                    {
                        // ROOT: display inline-flex (CSS:4) → a flex box, not 'none'.
                        selector: 'section:not([hidden]) [data-test="tr"] .pdx-transfer',
                        description: 'transfer root is a flex box',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // The two panels are flex column boxes (CSS:17). I assert on the first one (source).
                        selector: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-panel',
                        description: 'panel is a flex column box',
                        display: { op: 'is', value: 'flex' },
                    },
                    {
                        // A content-driven panel, but with min-height 280 + min-width 220 (CSS:23-24).
                        selector: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-panel',
                        description: 'panel is tall enough to hold the list (min-height)',
                        height: { op: '>=', value: 100 },
                    },
                    {
                        // The move-right button at rest: no item is checked → disabled (render:453).
                        // CSS .pdx-transfer-btn:disabled { cursor: not-allowed } (CSS:163).
                        selector: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-actions .pdx-transfer-btn:first-child',
                        description: 'move button at rest (no selection) shows not-allowed cursor',
                        cursor: { op: 'is', value: 'not-allowed' },
                    },
                    {
                        // The panel's radius is non-negative (metro/cyberpunk zero it, never < 0).
                        selector: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-panel',
                        description: 'panel radius is non-negative',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                composition: [
                    {
                        // Layout orizzontale: source | actions | target.
                        // source.right <= actions.left <= target.left → the source left of the buttons,
                        // the buttons left of the target. The two panels share the same height
                        // (align-items: stretch on the inline-flex root, CSS:6).
                        description: 'source panel is left of the move buttons, buttons left of target panel; panels same height',
                        parent: 'section:not([hidden]) [data-test="tr"] .pdx-transfer',
                        children: {
                            source: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-panel:nth-of-type(1)',
                            actions: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-actions',
                            target: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-actions + .pdx-transfer-panel',
                        },
                        relations: [
                            { description: 'source panel ends at/left of the actions column', left: 'source.right', op: '<=', right: 'actions.left', tolerance: 2 },
                            { description: 'actions column ends at/left of the target panel', left: 'actions.right', op: '<=', right: 'target.left', tolerance: 2 },
                            { description: 'source and target panels have the same height (stretch)', left: 'source.height', op: '==', right: 'target.height', tolerance: 2 },
                        ],
                    },
                    {
                        // The source items (3: apple/cherry/date) are contained in the source list.
                        description: 'source items are contained within the source list',
                        parent: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-panel:nth-of-type(1) .pdx-transfer-list',
                        children: {
                            list: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-panel:nth-of-type(1) .pdx-transfer-list',
                            item: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-panel:nth-of-type(1) .pdx-transfer-item:first-child',
                        },
                        relations: [
                            { description: 'first source item within the source list', left: 'item', op: 'contained-in', right: 'list' },
                        ],
                    },
                    {
                        // The target item ('banana') is contained in the target list.
                        description: 'target item is contained within the target list',
                        parent: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-actions + .pdx-transfer-panel .pdx-transfer-list',
                        children: {
                            list: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-actions + .pdx-transfer-panel .pdx-transfer-list',
                            item: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-actions + .pdx-transfer-panel .pdx-transfer-item:first-child',
                        },
                        relations: [
                            { description: 'target item within the target list', left: 'item', op: 'contained-in', right: 'list' },
                        ],
                    },
                ],
            },
            // Under the width of its two lists, the transfer stacks them — measured on its
            // own width (a container query), not the viewport's.
            'transfer-narrow': {
                composition: [
                    {
                        // Numeric edges, not `contained-in`: see pagination-narrow.
                        description: 'narrow box: the lists stack, source above target, both inside the box',
                        parent: 'section:not([hidden]) [data-test="trn-box"]',
                        children: {
                            box: 'section:not([hidden]) [data-test="trn-box"]',
                            source: 'section:not([hidden]) [data-test="trn"] .pdx-transfer-panel:nth-of-type(1)',
                            actions: 'section:not([hidden]) [data-test="trn"] .pdx-transfer-actions',
                            target: 'section:not([hidden]) [data-test="trn"] .pdx-transfer-actions + .pdx-transfer-panel',
                        },
                        relations: [
                            { description: 'source right edge within the box', left: 'source.right', op: '<=', right: 'box.right', tolerance: 1 },
                            { description: 'target right edge within the box', left: 'target.right', op: '<=', right: 'box.right', tolerance: 1 },
                            { description: 'the move buttons sit below the source list', left: 'actions.top', op: '>=', right: 'source.bottom', tolerance: 1 },
                            { description: 'the target list sits below the move buttons', left: 'target.top', op: '>=', right: 'actions.bottom', tolerance: 1 },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // The panels have role="listbox" + aria-label (title). The items role="option" + aria-selected.
    // Icon-only move buttons with a correct aria-label. The select-all checkbox inside a <label> with text.
    // No nested listboxes: the .pdx-transfer-panel is role=group (not listbox); the
    // real listbox is the inner .pdx-transfer-list (with an aria-label). No disableRule needed.
    a11y: {
        scenarios: ['transfer-basic'],
    },

    // ── Dim. 3: style isolation ──
    // skipHeight: the panel's height is content-driven (the list + min-height, sensitive to the host's
    // line-height under hostile CSS). The radius (a CSS value, not scaled) and width/border stay asserted.
    isolation: {
        scenario: 'transfer-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-panel', tolerancePx: 12, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA listbox, roving) ──
    // One list = ONE tab stop, not one per option, and the rebuild after a click or a Space keeps
    // the focus on the row instead of dropping it on <body>. I start from the source's first option (the tab stop): ↓ moves the
    // focus and the tab stop onto the second; Space selects it and the focus stays there (on the recreated row);
// Tab leaves the list and reaches "Move to target", now enabled.
    keyboard: {
        scenario: 'transfer-basic',
        initialFocus: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-panel:first-child [role="option"][tabindex="0"]',
        steps: [
            {
                key: 'ArrowDown',
                expectFocus: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-panel:first-child [role="option"]:nth-child(2)',
                expectAttr: { selector: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-panel:first-child [role="option"]:nth-child(1)', name: 'tabindex', value: '-1' },
            },
            {
                key: 'Space',
                expectFocus: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-panel:first-child [role="option"]:nth-child(2)',
                expectAttr: { selector: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-panel:first-child [role="option"]:nth-child(2)', name: 'aria-selected', value: 'true' },
            },
            {
                key: 'Tab',
                expectFocus: 'section:not([hidden]) [data-test="tr"] .pdx-transfer-btn[aria-label="Move to target"]',
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — 1 scenario ──
    visual: {
        scenarios: ['transfer-basic'],
    },
};

export default transfer;
