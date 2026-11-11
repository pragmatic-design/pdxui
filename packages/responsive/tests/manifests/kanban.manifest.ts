/**
 * MANIFEST — pdx-kanban (#1021)
 *
 * Derived from:
 *  - source: packages/ui/src/kanban/pdx-kanban.pdx
 *      the HOST <pdx-kanban> :state(lifted|disabled|readonly) → an inner
 *        <div class="pdx-kanban" data-part="root" role="group" aria-label>
 *          <section data-part="column" data-column="<key>" [data-over]> × columns
 *            <div data-part="header"> <h3> title, <span data-part="count">
 *            <ul data-part="list" aria-labelledby="<title>">
 *              <li data-part="card" data-key tabindex="0|-1" aria-roledescription aria-describedby> × cards
 *                <div class="pdx-kanban-body"> · <pdx-dropdown-menu> with <button data-part="moveButton">
 *            <p data-part="empty"> when the column has no card
 *  - CSS: packages/design/src/components/kanban.css
 *      .pdx-kanban → display: flex, columns side by side; .pdx-kanban-column → a fixed width
 *      (--pdx-kanban-column-width, 17rem); a card is a surface with a border.
 *
 * Keyboard: the board is one tab stop (roving tabindex on the cards); the arrows walk them.
 * Conservative rules: only invariants true on all themes, no exact px.
 */
import type { ComponentManifest } from './_types';

const COLUMNS = `[{"key":"todo","label":"To do"},{"key":"doing","label":"Doing","limit":1},{"key":"done","label":"Done"}]`;
const ITEMS = `[{"id":"a","title":"Write the spec","status":"todo"},{"id":"b","title":"Fix the bug","status":"todo"},{"id":"c","title":"Review","status":"doing"}]`;

export const kanban: ComponentManifest = {
    name: 'kanban',
    tag: 'pdx-kanban',
    tier: '3C',
    status: 'wip',
    imports: ['@pdxui/ui/kanban'],

    scenarios: [
        {
            id: 'kanban-basic',
            title: 'Kanban — Basic',
            html: `<pdx-kanban data-test="board" label="Sprint" columns='${COLUMNS}' items='${ITEMS}'></pdx-kanban>`,
        },
        {
            id: 'kanban-disabled',
            title: 'Kanban — Disabled',
            html: `<pdx-kanban data-test="board" label="Sprint" disabled columns='${COLUMNS}' items='${ITEMS}'></pdx-kanban>`,
        },
    ],

    contracts: {
        scenarios: {
            'kanban-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="board"] [data-part="root"]',
                        description: 'the board lays its columns side by side',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="board"] [data-column="todo"]',
                        description: 'a column is wide enough to read a card (>= 200px)',
                        width: { op: '>=', value: 200 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="board"] [data-part="root"]',
                        description: 'an enabled board is opaque',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                ],
                composition: [
                    {
                        // The columns are side by side and the same width: To do's left edge before Doing's.
                        description: 'columns side by side, of one width',
                        parent: 'body',
                        children: {
                            todo: '[data-test="board"] [data-column="todo"]',
                            doing: '[data-test="board"] [data-column="doing"]',
                            card: '[data-test="board"] [data-key="a"]',
                        },
                        relations: [
                            { description: 'To do is left of Doing', left: 'todo.right', op: '<=', right: 'doing.left' },
                            { description: 'the columns are one width', left: 'todo.width', op: '==', right: 'doing.width', tolerance: 1 },
                            { description: 'a card fits inside its column', left: 'card.width', op: '<', right: 'todo.width' },
                        ],
                    },
                ],
            },
            'kanban-disabled': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="board"] [data-part="root"]',
                        description: 'a disabled board has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ── the columns are lists named by their titles, the cards list items.
    a11y: {
        scenarios: ['kanban-basic', 'kanban-disabled'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'kanban-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="board"] [data-column="todo"]', tolerancePx: 12 },
        ],
    },

    // ── Dim. 4: keyboard ── one tab stop on the first card, the arrows walk the cards.
    keyboard: {
        scenario: 'kanban-basic',
        steps: [
            { key: 'Tab', expectFocus: '[data-test="board"] [data-key="a"]' },
            { key: 'ArrowDown', expectFocus: '[data-test="board"] [data-key="b"]' },
            { key: 'ArrowRight', expectFocus: '[data-test="board"] [data-key="c"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['kanban-basic'],
    },
};

export default kanban;
