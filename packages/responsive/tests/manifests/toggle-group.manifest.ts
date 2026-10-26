/**
 * MANIFEST — pdx-toggle-group
 *
 * Source: packages/ui/src/toggle/pdx-toggle.ts
 *   HOST <pdx-toggle-group class="pdx-toggle-group" role="group" orientation="horizontal|vertical">
 *        :state(disabled)
 *     └── <pdx-toggle> … (display: contents) └── <button class="pdx-toggle-btn" data-part="root">
 * CSS: packages/design/src/components/toggle.css, generated from variant-sources: the toggles joined in
 * a row, in a column under the host's `orientation="vertical"`.
 *
 * Contracts: the toggles of a group share an edge (no gap, borders collapsed) and a height; a vertical
 * group stacks them on one left edge; a disabled group dims every toggle. No exact px.
 */
import type { ComponentManifest } from './_types';

const ITEMS = ['a', 'b', 'c'].map((v) =>
    `<pdx-toggle data-test="t-${v}" value="${v}">${v.toUpperCase()}</pdx-toggle>`).join('');

const FIRST = 'section:not([hidden]) [data-test="t-a"] [data-part="root"]';
const SECOND = 'section:not([hidden]) [data-test="t-b"] [data-part="root"]';
const LAST = 'section:not([hidden]) [data-test="t-c"] [data-part="root"]';

export const toggleGroup: ComponentManifest = {
    name: 'toggle-group',
    tag: 'pdx-toggle-group',
    tier: '1B',
    status: 'wip',
    imports: ['@pdxui/ui/toggle'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'toggle-group-basic',
            title: 'Toggle group — multiple, two pressed',
            html: `<pdx-toggle-group data-test="group" type="multiple" label="Formatting" value="a,c">${ITEMS}</pdx-toggle-group>`,
        },
        {
            id: 'toggle-group-vertical',
            title: 'Toggle group — vertical, one pressed',
            html: `<pdx-toggle-group data-test="group" type="single" label="Alignment" orientation="vertical" value="b">${ITEMS}</pdx-toggle-group>`,
        },
        {
            id: 'toggle-group-disabled',
            title: 'Toggle group — disabled',
            html: `<pdx-toggle-group data-test="group" type="single" label="Alignment" value="a" disabled>${ITEMS}</pdx-toggle-group>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'toggle-group-basic': {
                standalone: [
                    { selector: FIRST, description: 'a toggle is a usable target (height >= 28px)', height: { op: '>=', value: 28 } },
                ],
                composition: [
                    {
                        description: 'the toggles are joined in a row: one top, one height, no gap',
                        parent: 'section:not([hidden]) [data-test="group"]',
                        children: { first: FIRST, second: SECOND, last: LAST },
                        relations: [
                            { description: 'same top', left: 'first.top', op: '==', right: 'last.top', tolerance: 1 },
                            { description: 'same height', left: 'first.height', op: '==', right: 'last.height', tolerance: 1 },
                            { description: 'no gap: the second starts where the first ends, borders collapsed', left: 'second.left', op: '<=', right: 'first.right' },
                        ],
                    },
                ],
            },
            'toggle-group-vertical': {
                // A column's inner corners are square: the row's rounding of the first toggle's
                // bottom-left and the last's top-right does not leak into it.
                standalone: [
                    { selector: FIRST, description: 'the first toggle of a column has a square bottom-left corner', radius: { bottomLeft: { op: '==', value: 0 }, bottomRight: { op: '==', value: 0 } } },
                    { selector: SECOND, description: 'a middle toggle of a column is square', radius: { all: { op: '==', value: 0 } } },
                    { selector: LAST, description: 'the last toggle of a column has a square top-right corner', radius: { topLeft: { op: '==', value: 0 }, topRight: { op: '==', value: 0 } } },
                ],
                composition: [
                    {
                        description: 'the toggles are joined in a column: one left edge, no gap',
                        parent: 'section:not([hidden]) [data-test="group"]',
                        children: { first: FIRST, second: SECOND },
                        relations: [
                            { description: 'same left', left: 'first.left', op: '==', right: 'second.left', tolerance: 1 },
                            { description: 'stacked', left: 'second.top', op: '>', right: 'first.top' },
                            { description: 'no gap: the second starts where the first ends, borders collapsed', left: 'second.top', op: '<=', right: 'first.bottom' },
                        ],
                    },
                ],
            },
            'toggle-group-disabled': {
                standalone: [
                    { selector: FIRST, description: 'every toggle of a disabled group is dimmed (opacity < 1)', opacity: { op: '<', value: 1 } },
                    { selector: LAST, description: 'every toggle of a disabled group is dimmed (opacity < 1)', opacity: { op: '<', value: 1 } },
                ],
                states: [
                    {
                        description: 'a disabled group is the custom state :state(disabled)',
                        selector: FIRST,
                        trigger: 'attribute',
                        customState: { host: 'section:not([hidden]) [data-test="group"]', name: 'disabled' },
                        changes: {},
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // The host is a `group` named by `label`; each toggle a <button> named by its text, its state in
    // aria-pressed.
    a11y: {
        scenarios: ['toggle-group-basic', 'toggle-group-vertical', 'toggle-group-disabled'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'toggle-group-basic',
        targets: [
            { selector: FIRST, tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // Tab reaches the first toggle; the arrows move between them, Home and End to the ends; Space
    // presses the focused one.
    keyboard: {
        scenario: 'toggle-group-basic',
        steps: [
            { key: 'Tab', expectFocus: FIRST },
            { key: 'ArrowRight', expectFocus: SECOND },
            { key: 'End', expectFocus: LAST },
            { key: 'ArrowRight', expectFocus: FIRST },
            { key: 'Space', expectAttr: { selector: FIRST, name: 'aria-pressed', value: 'false' } },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['toggle-group-basic', 'toggle-group-vertical', 'toggle-group-disabled'],
    },
};

export default toggleGroup;
