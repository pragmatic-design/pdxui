/**
 * MANIFEST — pdx-tree
 *
 * Written against the source (packages/ui/src/tree/pdx-tree.ts) and the CSS
 * (packages/design/src/components/tree.css).
 *
 * DOM, host vs inner:
 *   <pdx-tree>                                 ← HOST, no box of its own
 *     <div class="pdx-tree" role="tree">       ← the box: overflow, gap
 *       <div class="pdx-tree-item" role="treeitem" aria-level="1" style="--pdx-tree-level:1">
 *         <span class="pdx-tree-twisty">       ← ▸ / ▾ / ⋯, aria-hidden
 *         <input class="pdx-tree-check">       ← only with `checkable`
 *         <span class="pdx-tree-label">
 *       <div class="pdx-tree-group" role="group">   ← the children, siblings of the rows
 *
 * The INDENT is a CSS variable on the row (`--pdx-tree-level`), not a nested box: the rows are
 * siblings inside their group, and a row indented with padding can be highlighted edge to edge —
 * which is what a folder pane looks like. So the row's own left edge does NOT move with depth, and
 * the composition rule below measures the LABELS. Written against the rows first, it said 60 < 60.
 *
 * Content-driven height → isolation with `skipHeight`.
 *
 * KEYBOARD is the dimension that matters most here, and the one a library component usually leaves
 * half done: the W3C pattern wants the arrows, Home/End, `*` and type-ahead, with ONE tab stop for
 * the whole tree.
 */
import type { ComponentManifest } from './_types';

const NODES = `[
    {"id":"src","label":"src","children":[
        {"id":"app","label":"app.pdx"},
        {"id":"pages","label":"pages","children":[{"id":"home","label":"home.pdx"}]}
    ]},
    {"id":"readme","label":"README.md"}
]`;

export const tree: ComponentManifest = {
    name: 'tree',
    tag: 'pdx-tree',
    tier: '5B',
    status: 'wip',
    imports: ['@pdxui/ui/tree'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'tree-basic',
            title: 'Tree — expanded',
            html: `
                <div style="max-width: 420px;">
                    <pdx-tree data-test="tree" label="Files" default-expand-all nodes='${NODES}'></pdx-tree>
                </div>`,
        },
        {
            id: 'tree-collapsed',
            title: 'Tree — collapsed',
            html: `
                <div style="max-width: 420px;">
                    <pdx-tree data-test="tree-c" label="Files" nodes='${NODES}'></pdx-tree>
                </div>`,
        },
        {
            id: 'tree-checkable',
            title: 'Tree — with checkboxes',
            html: `
                <div style="max-width: 420px;">
                    <pdx-tree data-test="tree-k" label="Files" checkable default-expand-all nodes='${NODES}'></pdx-tree>
                </div>`,
        },
        {
            id: 'tree-selected',
            title: 'Tree — single selection',
            html: `
                <div style="max-width: 420px;">
                    <pdx-tree data-test="tree-s" label="Files" selection-mode="single" default-expand-all nodes='${NODES}'></pdx-tree>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'tree-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="tree"] .pdx-tree-item',
                        description: 'a row is at least 28px tall: it is a target to point at',
                        height: { op: '>=', value: 28 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="tree"] .pdx-tree-item',
                        description: 'a row can be clicked, and says so',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="tree"] .pdx-tree-twisty',
                        description: 'the twisty keeps its column even on a leaf, so labels line up',
                        width: { op: '>=', value: 12 },
                    },
                ],
                composition: [
                    {
                        // Measured on the LABELS, not the rows, and the difference is the point:
                        // the indent is `padding-inline-start`, so a row's BOX starts where its
                        // parent's does — which is what lets the hover band run edge to edge, as a
                        // folder pane does — and what moves is the content.
                        description: 'a child\'s content is indented, and its row stays as wide',
                        parent: 'section:not([hidden]) [data-test="tree"] .pdx-tree',
                        children: {
                            rootLabel: 'section:not([hidden]) [data-test="tree"] [aria-level="1"] .pdx-tree-label',
                            childLabel: 'section:not([hidden]) [data-test="tree"] [aria-level="2"] .pdx-tree-label',
                            root: 'section:not([hidden]) [data-test="tree"] [aria-level="1"]',
                            child: 'section:not([hidden]) [data-test="tree"] [aria-level="2"]',
                        },
                        relations: [
                            { description: 'the child label starts further right', left: 'rootLabel.left', op: '<', right: 'childLabel.left' },
                            { description: 'but the row ends where the parent row ends', left: 'root.right', op: '==', right: 'child.right', tolerance: 1 },
                        ],
                    },
                    {
                        description: 'the rows go down in order, without overlapping',
                        parent: 'section:not([hidden]) [data-test="tree"] .pdx-tree',
                        children: {
                            first: 'section:not([hidden]) [data-test="tree"] .pdx-tree-item:nth-of-type(1)',
                            group: 'section:not([hidden]) [data-test="tree"] .pdx-tree-group',
                        },
                        relations: [
                            { description: 'the children group sits below the row that opens it', left: 'first.bottom', op: '<=', right: 'group.top', tolerance: 1 },
                        ],
                    },
                ],
                states: [
                    {
                        description: 'a row answers a hover',
                        selector: 'section:not([hidden]) [data-test="tree"] .pdx-tree-item',
                        trigger: 'hover',
                        changes: { mustDiffer: ['backgroundColor'] },
                    },
                ],
            },
            'tree-collapsed': {
                standalone: [
                    {
                        // A closed tree renders ONLY its roots: two rows, not five. That is the
                        // difference between a tree and a list with indents.
                        //
                        // Counted on what EXISTS: written as "zero elements at level 2" the rule
                        // is never evaluated — the runner looks the element up before measuring
                        // it and stops at "Element not found", which is a red about itself rather
                        // than about the component.
                        selector: 'section:not([hidden]) [data-test="tree-c"] [role="treeitem"]',
                        description: 'a closed branch renders no children: two roots, not five nodes',
                        count: { op: '==', value: 2 },
                    },
                ],
            },
            'tree-checkable': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="tree-k"] .pdx-tree-check',
                        description: 'the checkbox fits the row and does not grow it',
                        height: { op: '<=', value: 24 },
                    },
                ],
                composition: [
                    {
                        description: 'the checkbox comes before the text',
                        parent: 'section:not([hidden]) [data-test="tree-k"] .pdx-tree-item:nth-of-type(1)',
                        children: {
                            box: 'section:not([hidden]) [data-test="tree-k"] .pdx-tree-item:nth-of-type(1) .pdx-tree-check',
                            label: 'section:not([hidden]) [data-test="tree-k"] .pdx-tree-item:nth-of-type(1) .pdx-tree-label',
                        },
                        relations: [
                            { description: 'the box is to the left of the label', left: 'box.right', op: '<=', right: 'label.left', tolerance: 2 },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe ──
    a11y: {
        scenarios: ['tree-basic', 'tree-collapsed', 'tree-checkable', 'tree-selected'],
    },

    // ── Dim. 3: immunity to hostile CSS ──
    isolation: {
        scenario: 'tree-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="tree"] .pdx-tree', tolerancePx: 12, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'borderTopWidth', 'borderTopStyle', 'borderTopColor'] }] },
        ],
    },

    // ── Dim. 4: keyboard ──
    //
    // The W3C pattern, measured: the tree costs ONE tab stop, the arrows walk the VISIBLE nodes
    // (not every node), Right opens a closed branch and descends into an open one, Left does the
    // reverse, Home/End jump to the ends. `*` and the type-ahead are in the unit tests, where the
    // state they produce can be read back.
    keyboard: {
        scenario: 'tree-basic',
        steps: [
            { key: 'Tab', expectFocus: '.pdx-tree-item:nth-of-type(1)' },
            { key: 'ArrowDown', expectFocus: '[aria-level="2"]' },
            { key: 'ArrowUp', expectFocus: '.pdx-tree-item:nth-of-type(1)' },
            { key: 'End', expectFocus: '.pdx-tree .pdx-tree-item:last-of-type' },
            { key: 'Home', expectFocus: '.pdx-tree-item:nth-of-type(1)' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['tree-basic', 'tree-checkable'],
        // The focus ring IS the keyboard affordance: with a roving tabindex it is the only thing
        // saying where you are among a hundred rows.
        focus: [{ scenario: 'tree-basic', selector: '.pdx-tree-item' }],
    },
};

export default tree;
