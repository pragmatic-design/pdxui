/**
 * MANIFEST — pdx-list
 *
 * Contracts written by inspecting the source (packages/ui/src/list/pdx-list.ts) and the CSS
 * (packages/design/src/components/list.css, the .pdx-list* block).
 *
 * DOM structure (host vs inner):
 *   <pdx-list>                          ← HOST: :state(bordered) (the default), :state(dividers) — no class (#292)
 *     <div data-part="overlay">          ← the loading overlay (display:none at rest)
 *     <div data-part="empty">            ← the empty state (display:none when there are items)
 *     <div data-part="list" role="list"> ← the INNER box: a flex column, the items' container
 *       <div data-part="item" role="listitem" data-list-index="0"> ... </div>
 *       ...
 *
 * CRITICAL, host vs inner:
 *   - the border and the radius (:state(bordered)) are on the HOST <pdx-list>, NOT on the list part.
 *   - display:flex / role="list" are on the list part.
 *   - the item parts (role="listitem", flex, align-items:center, min-height:40px)
 *     hold avatar+text+action aligned horizontally.
 *   So: the radius and the border → measure the HOST [data-test="list"]; the items' layout → the list part.
 *
 * Content-driven (a list of items, its height the sum of the rows) → isolation with skipHeight: true.
 *
 * STATES in the markup: clickable is a prop on the component (every item becomes clickable),
 * not a per-item state in the markup → a dedicated standalone scenario (cursor pointer), not a state rule.
 *
 * a11y / KEYBOARD — A BUG FOUND: the clickable items get cursor:pointer and emit
 * pdx-click through event delegation, BUT they have no tabindex, no role="button" and no keydown handler
 * (see defaultRenderItem/wrapInListItem/onListClick in the source). So they are MOUSE-ONLY:
 * not focusable and not activatable from the keyboard (it breaks WAI-ARIA / WCAG 2.1.1 Keyboard).
 * → The keyboard dimension is OMITTED (Tab would not take the focus into the list → it would fail).
 *   Reported as an a11y bug in the report.
 */
import type { ComponentManifest } from './_types';

export const list: ComponentManifest = {
    name: 'list',
    tag: 'pdx-list',
    tier: '5B',
    status: 'wip',
    imports: ['@pdxui/ui/list'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'list-basic',
            title: 'List — Basic (bordered, dividers)',
            html: `
                <div style="max-width: 480px;">
                    <pdx-list
                        data-test="list"
                        dividers
                        items='[
                            {"id":1,"name":"Alice Johnson"},
                            {"id":2,"name":"Bob Martin"},
                            {"id":3,"name":"Carol White"}
                        ]'>
                    </pdx-list>
                </div>`,
        },
        {
            id: 'list-clickable',
            title: 'List — Clickable items',
            html: `
                <div style="max-width: 480px;">
                    <pdx-list
                        data-test="list-clickable"
                        clickable
                        items='[
                            {"id":1,"name":"Inbox"},
                            {"id":2,"name":"Drafts"}
                        ]'>
                    </pdx-list>
                </div>`,
        },
        {
            // Two lists on a page are told apart by name (#1053): an aria-label or an aria-labelledby
            // written on the host, which the list writes on its role="list" element.
            id: 'list-named',
            title: 'List — Named lists',
            html: `
                <div style="max-width: 480px;">
                    <pdx-list data-test="by-label" aria-label="Comments"
                        items='[{"id":1,"name":"Looks good"}]'></pdx-list>
                    <h3 id="tasks-heading">Tasks</h3>
                    <pdx-list data-test="by-labelledby" aria-labelledby="tasks-heading"
                        items='[{"id":1,"name":"Call the client"}]'></pdx-list>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'list-basic': {
                standalone: [
                    {
                        // THE INNER BOX: the items' container is a flex column.
                        selector: 'section:not([hidden]) [data-test="list"] [data-part="list"]',
                        description: 'inner list container is a flex/block column box (display set)',
                        display: { op: 'oneOf', value: ['flex', 'block', 'grid'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="list"] [data-part="list"]',
                        description: 'inner list is tall enough to hold the rows (content-driven)',
                        height: { op: '>=', value: 40 },
                    },
                    {
                        // THE HOST: the border and the radius live here (:state(bordered)), not on the list part.
                        selector: 'section:not([hidden]) [data-test="list"]',
                        description: 'bordered list host has non-negative radius (metro/cyberpunk may zero it)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="list"]',
                        description: 'bordered list host has a visible outer border',
                        border: { all: { width: { op: '>=', value: 0.5 } } },
                    },
                    {
                        // Item: a row tall enough to hold avatar+text+action.
                        selector: 'section:not([hidden]) [data-test="list"] [data-part="item"]',
                        description: 'list item row is at least min-height tall',
                        height: { op: '>=', value: 36 },
                    },
                ],
                // Composition: the items are aligned and contained in the inner list box; the first
                // item is vertically above the second (a stacking column) and does not cross the edges.
                composition: [
                    {
                        description: 'list items are stacked and contained within the inner list box',
                        parent: 'section:not([hidden]) [data-test="list"] [data-part="list"]',
                        children: {
                            listbox: 'section:not([hidden]) [data-test="list"] [data-part="list"]',
                            first: 'section:not([hidden]) [data-test="list"] [data-part="item"][data-list-index="0"]',
                            second: 'section:not([hidden]) [data-test="list"] [data-part="item"][data-list-index="1"]',
                        },
                        relations: [
                            { description: 'first item within list', left: 'first', op: 'contained-in', right: 'listbox' },
                            { description: 'second item within list', left: 'second', op: 'contained-in', right: 'listbox' },
                            {
                                description: 'items share the same left edge (aligned column)',
                                left: 'first',
                                op: 'flush-left',
                                right: 'second',
                                tolerance: 1,
                            },
                            {
                                description: 'first item sits above the second (vertical stacking)',
                                left: 'first.bottom',
                                op: '<=',
                                right: 'second.bottom',
                                tolerance: 1,
                            },
                            {
                                description: 'item right edge does not overflow the list right edge',
                                left: 'first.right',
                                op: '<=',
                                right: 'listbox.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
            'list-clickable': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="list-clickable"] [data-part="item"].pdx-list-item-clickable',
                        description: 'clickable list item has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // The inner box uses role="list" + role="listitem" (the right semantics). The main scenario,
    // no disableRules. Note: the non-keyboard clickability is a functional bug (see the header),
    // not necessarily caught by axe — reported separately.
    a11y: {
        scenarios: ['list-basic', 'list-named'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'list-basic',
        targets: [
            // A content-driven container (items): skip height, assert width/radius/border (host).
            { selector: 'section:not([hidden]) [data-test="list"]', tolerancePx: 12, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard ──
    // OMITTED: the clickable items are NOT focusable (no tabindex, no role button, no keydown in the
    // source). Mouse-only → a Tab→expectFocusWithin would fail. The a11y bug is reported.

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['list-basic'],
    },
};

export default list;
