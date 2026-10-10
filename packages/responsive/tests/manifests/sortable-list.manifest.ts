/**
 * MANIFEST — pdx-sortable-list
 *
 * Written against the source (packages/ui/src/sortable-list/pdx-sortable-list.ts) and the CSS
 * (packages/design/src/components/sortable-list.css).
 *
 * DOM, host vs inner:
 *   <pdx-sortable-list>                       ← HOST: .pdx-sortable-root
 *     <div class="pdx-sr-only" id="…">        ← the instructions every handle points at
 *     <ul class="pdx-sortable-list" role="list" data-axis="vertical">   ← the INNER box, the border
 *       <li class="pdx-sortable-item">
 *         <button class="pdx-sortable-handle" aria-roledescription="draggable" aria-describedby>
 *         <div class="pdx-sortable-body">
 *
 * The border and the radius are on the INNER <ul>, not on the host — the opposite of pdx-list,
 * where .pdx-list-bordered sits on the host. Measure the <ul>.
 *
 * Content-driven: the height is the sum of the rows → isolation with skipHeight.
 *
 * KEYBOARD is the dimension that matters most here, and it is the one a competitor's component
 * usually skips. `aria-grabbed` is deliberately absent: it is deprecated in WAI-ARIA 1.1 and the
 * handle carries `aria-roledescription="draggable"` instead. The full reorder — lift, move, drop —
 * is measured in the browser by
 * packages/responsive/tests/integration/ui-components/sortable-list.spec.ts, because it needs a
 * real pointer for the other half of the same story.
 */
import type { ComponentManifest } from './_types';

const ROWS = `[
    {"id":"a","label":"Alpha"},
    {"id":"b","label":"Bravo"},
    {"id":"c","label":"Charlie"}
]`;

export const sortableList: ComponentManifest = {
    name: 'sortable-list',
    tag: 'pdx-sortable-list',
    tier: '5B',
    status: 'wip',
    imports: ['@pdxui/ui/sortable-list'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'sortable-basic',
            title: 'Sortable list — vertical',
            html: `
                <div style="max-width: 420px;">
                    <pdx-sortable-list data-test="sortable" items='${ROWS}'></pdx-sortable-list>
                </div>`,
        },
        {
            id: 'sortable-horizontal',
            title: 'Sortable list — horizontal',
            html: `
                <div style="max-width: 560px;">
                    <pdx-sortable-list data-test="sortable-h" axis="horizontal" items='${ROWS}'></pdx-sortable-list>
                </div>`,
        },
        {
            id: 'sortable-disabled',
            title: 'Sortable list — disabled',
            html: `
                <div style="max-width: 420px;">
                    <pdx-sortable-list data-test="sortable-off" disabled items='${ROWS}'></pdx-sortable-list>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'sortable-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="sortable"] .pdx-sortable-list',
                        description: 'the rows stack in a column box',
                        display: { op: 'oneOf', value: ['flex', 'block', 'grid'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="sortable"] .pdx-sortable-item',
                        description: 'a row is at least 40px tall, the same floor as a list item',
                        height: { op: '>=', value: 40 },
                    },
                    {
                        // A handle smaller than this cannot be hit reliably with a finger, and this
                        // component exists to be dragged.
                        selector: 'section:not([hidden]) [data-test="sortable"] .pdx-sortable-handle',
                        description: 'the handle is at least 24x24',
                        height: { op: '>=', value: 24 },
                        width: { op: '>=', value: 24 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="sortable"] .pdx-sortable-handle',
                        description: 'the handle says it can be grabbed',
                        cursor: { op: 'is', value: 'grab' },
                    },
                ],
                composition: [
                    {
                        description: 'the rows stack vertically, inside the list, in order',
                        parent: 'section:not([hidden]) [data-test="sortable"] .pdx-sortable-list',
                        children: {
                            list: 'section:not([hidden]) [data-test="sortable"] .pdx-sortable-list',
                            first: 'section:not([hidden]) [data-test="sortable"] .pdx-sortable-item:nth-of-type(1)',
                            second: 'section:not([hidden]) [data-test="sortable"] .pdx-sortable-item:nth-of-type(2)',
                        },
                        relations: [
                            { description: 'the first row is above the second', left: 'first.bottom', op: '<=', right: 'second.top', tolerance: 1 },
                            { description: 'the rows share a left edge', left: 'first.left', op: '==', right: 'second.left', tolerance: 1 },
                            { description: 'a row does not overflow the list', left: 'first.right', op: '<=', right: 'list.right', tolerance: 1 },
                        ],
                    },
                    {
                        description: 'the handle sits inside its row, at the start of it',
                        parent: 'section:not([hidden]) [data-test="sortable"] .pdx-sortable-item:nth-of-type(1)',
                        children: {
                            row: 'section:not([hidden]) [data-test="sortable"] .pdx-sortable-item:nth-of-type(1)',
                            handle: 'section:not([hidden]) [data-test="sortable"] .pdx-sortable-item:nth-of-type(1) .pdx-sortable-handle',
                            body: 'section:not([hidden]) [data-test="sortable"] .pdx-sortable-item:nth-of-type(1) .pdx-sortable-body',
                        },
                        relations: [
                            { description: 'the handle is inside the row', left: 'handle.bottom', op: '<=', right: 'row.bottom', tolerance: 1 },
                            { description: 'the handle comes before the text', left: 'handle.right', op: '<=', right: 'body.left', tolerance: 1 },
                        ],
                    },
                ],
                states: [
                    {
                        description: 'the handle answers a hover',
                        selector: 'section:not([hidden]) [data-test="sortable"] .pdx-sortable-handle',
                        trigger: 'hover',
                        changes: { mustDiffer: ['backgroundColor'] },
                    },
                ],
            },
            'sortable-horizontal': {
                composition: [
                    {
                        description: 'the horizontal axis lays the rows out side by side',
                        parent: 'section:not([hidden]) [data-test="sortable-h"] .pdx-sortable-list',
                        children: {
                            first: 'section:not([hidden]) [data-test="sortable-h"] .pdx-sortable-item:nth-of-type(1)',
                            second: 'section:not([hidden]) [data-test="sortable-h"] .pdx-sortable-item:nth-of-type(2)',
                        },
                        relations: [
                            { description: 'the first row is left of the second', left: 'first.right', op: '<=', right: 'second.left', tolerance: 1 },
                            { description: 'the rows share a top edge', left: 'first.top', op: '==', right: 'second.top', tolerance: 1 },
                        ],
                    },
                ],
            },
            'sortable-disabled': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="sortable-off"] .pdx-sortable-handle',
                        description: 'a disabled handle does not offer to be grabbed',
                        cursor: { op: 'is', value: 'default' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="sortable-off"] .pdx-sortable-handle',
                        description: 'a disabled handle is dimmed',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        scenarios: ['sortable-basic', 'sortable-disabled'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'sortable-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="sortable"] .pdx-sortable-list', tolerancePx: 12, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard ──
    //
    // The list costs ONE Tab stop, and the arrows move the focus between handles while nothing is
    // lifted — the roving tabindex. What the arrows do once a row IS lifted is the other half, and
    // it is measured in the browser spec, where the reordered DOM can be read back.
    keyboard: {
        scenario: 'sortable-basic',
        steps: [
            { key: 'Tab', expectFocus: '.pdx-sortable-item:nth-of-type(1) .pdx-sortable-handle' },
            { key: 'ArrowDown', expectFocus: '.pdx-sortable-item:nth-of-type(2) .pdx-sortable-handle' },
            { key: 'ArrowDown', expectFocus: '.pdx-sortable-item:nth-of-type(3) .pdx-sortable-handle' },
            // wrap: false — the last row is the end of the road, not a trip back to the first.
            { key: 'ArrowDown', expectFocus: '.pdx-sortable-item:nth-of-type(3) .pdx-sortable-handle' },
            { key: 'ArrowUp', expectFocus: '.pdx-sortable-item:nth-of-type(2) .pdx-sortable-handle' },
            { key: 'Home', expectFocus: '.pdx-sortable-item:nth-of-type(1) .pdx-sortable-handle' },
            { key: 'End', expectFocus: '.pdx-sortable-item:nth-of-type(3) .pdx-sortable-handle' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['sortable-basic'],
        // The handle is the only control here, so its focus ring IS the component's keyboard
        // affordance — exactly the case the focus baselines exist for.
        focus: [{ scenario: 'sortable-basic', selector: '.pdx-sortable-handle' }],
    },
};

export default sortableList;
