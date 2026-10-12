/**
 * MANIFEST — pdx-tree-select (tier 3, a select with a tree dropdown)
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/tree-select/pdx-tree-select.ts)
 * and the CSS (packages/design/src/components/tree-select.css + cascader.css — the trigger reuses
 * the .pdx-cascader-* classes).
 *
 * ── DOM structure (light DOM, built imperatively in a rAF, pdx-tree-select.ts:209) ──
 *   <pdx-tree-select>                                       ← the host, display:inline-block, position:relative (tree-select.css:3)
 *     <div class="pdx-cascader-trigger pdx-input-wrap [pdx-input-{size}] [disabled]"   ← TRIGGER (it reuses the cascader classes)
 *          role="combobox"                                  ← (src:219)
 *          aria-haspopup="tree"                             ← (src:221)
 *          aria-expanded="false|true"                       ← kept in sync in ctx.track (src:309)
 *          tabindex="0"|"-1">                               ← '-1' when disabled (src:222)
 *       <span class="pdx-cascader-text [pdx-cascader-placeholder]">…</span>  ← the value or the placeholder (src:231, 302)
 *       <button class="pdx-input-clear" style="display:none|''">×</button>?  ← only when clearable (src:236)
 *       <span class="pdx-cascader-icon">▾</span>            ← the chevron (src:246)
 *     <div class="pdx-tree-select-panel" style="display:none|''">   ← the PANEL (src:252; display driven by JS, src:316)
 *       <div class="pdx-tree-select-search"><input …></div>?        ← only when searchable (src:256)
 *       <div class="pdx-tree-select-tree" role="tree">     ← the TREE CONTAINER (src:267-269)
 *         <div class="pdx-tree-node [selected] [disabled]" ← the TREEITEM (src:349)
 *              role="treeitem" aria-selected="…"           ← (src:352-353)
 *              aria-expanded="…">                           ← ONLY on nodes that have children (src:354)
 *           <button class="pdx-tree-toggle [expanded] [leaf]" tabindex="-1">›</button>  ← (src:356)
 *           [ <input type="checkbox"> ]?                    ← ONLY when multiple (src:366)
 *           <span class="pdx-tree-node-label">{label}</span>        ← (src:381)
 *         … child nodes rendered flat (NOT nested in the DOM), indented through paddingLeft (src:351, 390)
 *     [ <input type="hidden" name value> ]?                 ← only when the name prop is filled in (src:277)
 *
 * ── WHERE THE PANEL LIVES (CRITICAL) ──
 *   The panel is a direct child of the HOST in the light DOM (el.appendChild(_panelEl), src:272).
 *   It is NOT portalled onto document.body, it does NOT use usePopover (removed, see the comment at src:8,74).
 *   It is positioned through CSS `position: absolute` (tree-select.css:10) against the containing block
 *   (the pdx-tree-select host, position:relative). Consequence: the panel's selectors stay
 *   section-scoped like every other component's. Visibility is driven by JS: `_panelEl.style.display`
 *   = '' (open) | 'none' (closed) (src:316). There is NO .open class: the panel always carries
 *   the class `.pdx-tree-select-panel`; to measure it open I check `display !== none`.
 *
 * ── HOW IT OPENS (CRITICAL — BUG #1) ──
 *   The openPopover/closePopover functions are RETURNED from setup() (src:396), but the runtime does
 *   `Object.assign(ctx, result)` (core/component.ts:339) → they land on the RENDER ctx, NOT on the
 *   host DOM (ctx.el). There is no `(ctx.el as any).openPopover = …` and no `ctx.expose(...)` in the
 *   source. So `host.openPopover()` from a setup script FAILS (the method is absent from the DOM).
 *   → To open the panel I use a REAL click on the trigger: the click listener (src:223) calls
 *     openPopover()/closePopover() as a toggle. It is deterministic and uses the real DOM.
 *   `expandAll` in the HTML guarantees that the nodes with children start expanded → the child treeitems are
 *   already in the DOM with no further interaction (openPopover expands everything, src:117-129).
 *   openPopover registers the click-outside with a setTimeout(…,0); the setup awaits a microtask
 *   with a BARE `await` (no IIFE) to give ctx.track time to render the nodes.
 *
 * ── Deterministic data ──
 *   `options` is a static Array prop with a fixed tree (Fruits→[Apple,Banana], Vegetables→[Carrot]).
 *   No loadChildren (lazy), no external source → the tree's output is entirely deterministic.
 *
 * ── a11y (verified) ──
 *   Trigger: role="combobox" + aria-haspopup="tree" + aria-expanded. NB: the trigger has NO
 *     aria-label and no aria-controls (the source does not set them) → the accessible name depends on the text of the
 *     value/placeholder. I do NOT disable axe rules: if it reports the missing name or the absence of
 *     aria-controls, that must drive the fix (see BUG #2). The combobox is filled in (placeholder text).
 *   Tree: role="tree" on the container + role="treeitem" + aria-selected on the nodes + aria-expanded
 *     on the expandable ones → the ARIA tree structure is present and verified.
 *
 * ── Contracts: CONSERVATIVE, no theme-specific px. Invariants universal across the 13 themes:
 *   · the trigger is a visible interactive box (cursor pointer, cascader.css:9), radius >= 0;
 *   · open: the panel is VISIBLE (display != none) with an appreciable width (min-width 240px, css:16);
 *   · the panel sits BELOW the trigger (an overlay, no backdrop, no centering);
 *   · the treeitems are contained in the role="tree" container.
 */
import type { ComponentManifest } from './_types';

// A deterministic tree reused across the scenarios (Fruits with 2 children, Vegetables with 1).
const TREE = `[
    {"value":"fruits","label":"Fruits","children":[
        {"value":"apple","label":"Apple"},
        {"value":"banana","label":"Banana"}
    ]},
    {"value":"veg","label":"Vegetables","children":[
        {"value":"carrot","label":"Carrot"}
    ]}
]`;

export const treeSelect: ComponentManifest = {
    name: 'tree-select',
    tag: 'pdx-tree-select',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/tree-select'],

    // ── Scenarios ──
    scenarios: [
        {
            // Closed with a value selected → the trigger shows the node's label ("Apple").
            id: 'tree-select-closed',
            title: 'Tree Select — Closed with a selected value',
            html: `
                <pdx-tree-select data-test="ts"
                    placeholder="Select…"
                    value="apple"
                    options='${TREE}'>
                </pdx-tree-select>`,
        },
        {
            // The ONLY open scenario. A CSS-absolute panel, sibling of the trigger in the light DOM.
            // expandAll → the nodes with children start expanded (the child treeitems are already in the DOM).
            // Opened through a REAL click on the trigger (BUG #1: openPopover is NOT exposed on ctx.el).
            // A BARE await (no IIFE) to wait for the microtask: the click calls openPopover,
            // then the component's ctx.track renders the nodes.
            id: 'tree-select-open',
            title: 'Tree Select — Open (tree panel visible below trigger)',
            // Room for the panel. Without it the section ends 16px into a 158px panel, and the visual
            // baseline is the trigger plus the panel's top edge — the same crop defect as the date
            // picker's. Measured in Chromium: the panel spills 142–144px below the section.
            // 200px leaves it inside with margin.
            html: `
                <div style="padding-bottom: 200px;">
                    <pdx-tree-select data-test="ts-open"
                        placeholder="Select…"
                        expandAll
                        options='${TREE}'>
                    </pdx-tree-select>
                </div>`,
            setup: `
                const host = document.querySelector('section:not([hidden]) [data-test="ts-open"]');
                const trigger = host && host.querySelector('.pdx-cascader-trigger');
                if (trigger) trigger.click();
                await new Promise((r) => setTimeout(r, 0));`,
        },
        {
            id: 'tree-select-disabled',
            title: 'Tree Select — Disabled',
            html: `
                <pdx-tree-select data-test="ts-dis"
                    placeholder="Select…"
                    disabled
                    options='${TREE}'>
                </pdx-tree-select>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'tree-select-closed': {
                standalone: [
                    {
                        // The trigger reuses .pdx-input-wrap + .pdx-cascader-trigger → a visible box.
                        selector: 'section:not([hidden]) [data-test="ts"] .pdx-cascader-trigger',
                        description: 'trigger is a visible box',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // cascader.css:9 → .pdx-cascader-trigger { cursor: pointer } → interactive.
                        selector: 'section:not([hidden]) [data-test="ts"] .pdx-cascader-trigger',
                        description: 'trigger is interactive (cursor pointer)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // The trigger's radius is non-negative (zero-radius themes zero it, never < 0).
                        selector: 'section:not([hidden]) [data-test="ts"] .pdx-cascader-trigger',
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
                        // The value text and the chevron are contained in the trigger (the layout holds).
                        description: 'value text and chevron are contained within the trigger box',
                        parent: 'section:not([hidden]) [data-test="ts"] .pdx-cascader-trigger',
                        // Scoped like the parent: bare classes find the first cascader trigger in the
                        // document, in a hidden scenario (0×0).
                        children: {
                            trigger: 'section:not([hidden]) [data-test="ts"] .pdx-cascader-trigger',
                            text: 'section:not([hidden]) [data-test="ts"] .pdx-cascader-text',
                            icon: 'section:not([hidden]) [data-test="ts"] .pdx-cascader-icon',
                        },
                        relations: [
                            { description: 'value text within trigger', left: 'text', op: 'contained-in', right: 'trigger' },
                            { description: 'chevron within trigger', left: 'icon', op: 'contained-in', right: 'trigger' },
                            { description: 'chevron is to the right of the value text', left: 'text.left', op: '<=', right: 'icon.left' },
                        ],
                    },
                ],
            },

            // Open: the panel (display != none through JS) sits BELOW the trigger. An overlay with no backdrop.
            // The panel is ALREADY open from the setup (a click on the trigger) → overlay action:'call' = a state already
            // activated, the runner measures the panel with no further interaction.
            'tree-select-open': {
                standalone: [
                    {
                        // tree-select.css:19 → .pdx-tree-select-panel { display:flex } when style.display=''.
                        selector: 'section:not([hidden]) [data-test="ts-open"] .pdx-tree-select-panel',
                        description: 'open tree panel is displayed (not none)',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // tree-select.css:16 → min-width:240px → an appreciable width at a 1280 viewport.
                        selector: 'section:not([hidden]) [data-test="ts-open"] .pdx-tree-select-panel',
                        description: 'open tree panel has an appreciable width',
                        width: { op: '>=', value: 200 },
                    },
                ],
                overlay: [
                    {
                        // A floating panel (CSS absolute), no backdrop in the source.
                        description: 'open tree-select shows the tree panel without a backdrop',
                        trigger: { selector: 'section:not([hidden]) [data-test="ts-open"] .pdx-cascader-trigger', action: 'call' },
                        panel: 'section:not([hidden]) [data-test="ts-open"] .pdx-tree-select-panel',
                        hasBackdrop: false,
                    },
                ],
                composition: [
                    {
                        // The panel (sibling of the trigger, position:absolute) sits BELOW the trigger.
                        description: 'tree panel sits below the trigger',
                        parent: 'section:not([hidden]) [data-test="ts-open"]',
                        // Scoped like the parent: the bare trigger class finds a hidden scenario's
                        // trigger (0×0), and `0 <= panel.top` holds without measuring.
                        children: {
                            trigger: 'section:not([hidden]) [data-test="ts-open"] .pdx-cascader-trigger',
                            panel: 'section:not([hidden]) [data-test="ts-open"] .pdx-tree-select-panel',
                        },
                        relations: [
                            { description: 'panel.top >= trigger.bottom (below)', left: 'trigger.bottom', op: '<=', right: 'panel.top', tolerance: 2 },
                        ],
                    },
                    {
                        // The treeitems live inside the role="tree" container.
                        description: 'tree items are contained within the tree container',
                        parent: 'section:not([hidden]) [data-test="ts-open"] .pdx-tree-select-tree',
                        // Scoped like the parent: bare classes find the first tree in the document,
                        // in a hidden scenario (0×0).
                        children: {
                            tree: 'section:not([hidden]) [data-test="ts-open"] .pdx-tree-select-tree',
                            item: 'section:not([hidden]) [data-test="ts-open"] .pdx-tree-node',
                        },
                        relations: [
                            { description: 'first tree item within tree', left: 'item', op: 'contained-in', right: 'tree' },
                        ],
                    },
                ],
            },

            // Disabled: prop statica → standalone.
            'tree-select-disabled': {
                standalone: [
                    {
                        // cascader.css:21-24 → .pdx-cascader-trigger.disabled { cursor: not-allowed }.
                        selector: 'section:not([hidden]) [data-test="ts-dis"] .pdx-cascader-trigger',
                        description: 'disabled trigger is not clickable (no pointer cursor)',
                        cursor: { op: 'isNot', value: 'pointer' },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // Closed: trigger role="combobox" + aria-haspopup="tree" + aria-expanded + aria-controls + aria-label.
    // Open: a named tree (the trigger's name) with role="treeitem" + aria-selected + aria-level/
    // setsize/posinset + aria-expanded "true"/"false" on the expandable nodes (never "").
    // No disableRule, so as not to mask real bugs.
    a11y: {
        scenarios: ['tree-select-closed', 'tree-select-open'],
    },

    // ── Dim. 3: style isolation ──
    // The trigger (.pdx-input-wrap + .pdx-cascader-trigger) must keep its box under hostile CSS.
    // skipHeight: the height is content/line-height-driven (padding + the value's text) → not a clean
    //   structural invariant; the radius (a CSS value, not scaled) stays asserted.
    isolation: {
        scenario: 'tree-select-closed',
        targets: [
            { selector: 'section:not([hidden]) [data-test="ts"] .pdx-cascader-trigger', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (a WAI-ARIA tree inside a combobox) ──
    // The APG tree model, driven from the trigger with aria-activedescendant: once open, the tree
    // answers the keys, and Enter replaces the placeholder with the choice. Scenario opened with
    // expandAll: Fruits › Apple, Banana · Vegetables › Carrot. Home → Fruits, ↓ → Apple, ← → back to the
    // parent, ← → closes Fruits, End → Carrot, Enter → chooses Carrot and closes, focus on the trigger.
    keyboard: {
        scenario: 'tree-select-open',
        initialFocus: 'section:not([hidden]) [data-test="ts-open"] .pdx-cascader-trigger',
        steps: [
            {
                key: 'Home',
                expectAttr: { selector: 'section:not([hidden]) [data-test="ts-open"] .pdx-cascader-trigger', name: 'aria-expanded', value: 'true' },
                expectActiveDescendant: {
                    selector: 'section:not([hidden]) [data-test="ts-open"] .pdx-cascader-trigger',
                    target: 'section:not([hidden]) [data-test="ts-open"] [role="treeitem"][aria-level="1"][aria-posinset="1"]',
                },
            },
            {
                key: 'ArrowDown',
                expectActiveDescendant: {
                    selector: 'section:not([hidden]) [data-test="ts-open"] .pdx-cascader-trigger',
                    target: 'section:not([hidden]) [data-test="ts-open"] [role="treeitem"][aria-level="2"][aria-posinset="1"]',
                },
            },
            {
                key: 'ArrowLeft',
                expectActiveDescendant: {
                    selector: 'section:not([hidden]) [data-test="ts-open"] .pdx-cascader-trigger',
                    target: 'section:not([hidden]) [data-test="ts-open"] [role="treeitem"][aria-level="1"][aria-posinset="1"]',
                },
            },
            {
                key: 'ArrowLeft',
                expectAttr: { selector: 'section:not([hidden]) [data-test="ts-open"] [role="treeitem"][aria-level="1"][aria-posinset="1"]', name: 'aria-expanded', value: 'false' },
            },
            {
                key: 'End',
                expectActiveDescendant: {
                    selector: 'section:not([hidden]) [data-test="ts-open"] .pdx-cascader-trigger',
                    target: 'section:not([hidden]) [data-test="ts-open"] [role="treeitem"][aria-level="2"][aria-posinset="1"]',
                },
            },
            {
                key: 'Enter',
                expectAttr: { selector: 'section:not([hidden]) [data-test="ts-open"] .pdx-cascader-trigger', name: 'aria-expanded', value: 'false' },
                expectFocus: 'section:not([hidden]) [data-test="ts-open"] .pdx-cascader-trigger',
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — a single scenario (open, showing the expanded tree) ──
    visual: {
        scenarios: ['tree-select-open'],
    },
};

export default treeSelect;
