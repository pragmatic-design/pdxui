/**
 * MANIFEST — pdx-description-list
 *
 * Contracts written by inspecting the source (packages/ui/src/description-list/pdx-description-list.ts)
 * and the CSS (packages/design/src/components/description-list.css, the .pdx-dl* block).
 *
 * DOM structure (host vs inner):
 *   <pdx-description-list>                  ← HOST: gets .pdx-dl-root (ctx.el.classList.add, rAF)
 *     <dl class="pdx-dl pdx-dl-{layout} pdx-dl-{size} [pdx-dl-colon] ...">  ← INNER, appended to the host
 *       <div class="pdx-dl-item">           ← one key-value pair
 *         <dt class="pdx-dl-label"><span>label</span></dt>
 *         <dd class="pdx-dl-value">value</dd>
 *       </div>
 *       ...
 * So the measurable container IS the inner <dl> (NOT the host): the selector is
 * [data-test="dl"] .pdx-dl. The grid uses grid-template-columns repeat(--pdx-dl-columns, 1fr).
 *
 * a11y: the native semantics are RIGHT — it uses <dl>/<dt>/<dd>. No disableRules.
 *
 * Content-driven (a list of pairs, its height the sum of the rows, sensitive to the host's line-height)
 * → isolation with skipHeight: true; the radius (bordered) and the display stay asserted.
 * Conservative contracts: display oneOf (grid/flex/block), radius >= 0, no exact px.
 * Responsive columns (columns="2"/"3"): only the base STRUCTURE is tested (containment),
 * NOT the responsive layout at specific viewports.
 */
import type { ComponentManifest } from './_types';

export const descriptionList: ComponentManifest = {
    name: 'description-list',
    tag: 'pdx-description-list',
    tier: '5B',
    status: 'wip',
    imports: ['@pdxui/ui/description-list'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'description-list-basic',
            title: 'Description List — Basic (horizontal, single column)',
            html: `
                <div style="max-width: 480px;">
                    <pdx-description-list
                        data-test="dl"
                        items='[
                            {"label":"Name","value":"Alice Johnson"},
                            {"label":"Email","value":"alice@example.com"},
                            {"label":"Role","value":"Administrator"}
                        ]'>
                    </pdx-description-list>
                </div>`,
        },
        {
            id: 'description-list-bordered',
            title: 'Description List — Bordered',
            html: `
                <div style="max-width: 480px;">
                    <pdx-description-list
                        data-test="dl-bordered"
                        bordered
                        items='[
                            {"label":"Status","value":"Active"},
                            {"label":"Plan","value":"Enterprise"}
                        ]'>
                    </pdx-description-list>
                </div>`,
        },
        {
            id: 'description-list-columns',
            title: 'Description List — Multi-column grid (2)',
            html: `
                <div style="max-width: 480px;">
                    <pdx-description-list
                        data-test="dl-cols"
                        columns="2"
                        items='[
                            {"label":"First name","value":"Alice"},
                            {"label":"Last name","value":"Johnson"},
                            {"label":"City","value":"Milan"},
                            {"label":"Country","value":"Italy"}
                        ]'>
                    </pdx-description-list>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'description-list-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="dl"] .pdx-dl',
                        description: 'dl container is a grid/flex/block box (display set)',
                        display: { op: 'oneOf', value: ['grid', 'flex', 'block'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="dl"] .pdx-dl',
                        description: 'dl is tall enough to hold the key-value rows (content-driven)',
                        height: { op: '>=', value: 40 },
                    },
                ],
                // Composition: the dt (the label) and the dd (the value) are contained in the item, the item in the dl.
                composition: [
                    {
                        description: 'label + value rows are contained within the dl box',
                        parent: 'section:not([hidden]) [data-test="dl"] .pdx-dl',
                        children: {
                            dl: 'section:not([hidden]) [data-test="dl"] .pdx-dl',
                            item: 'section:not([hidden]) [data-test="dl"] .pdx-dl-item',
                            label: 'section:not([hidden]) [data-test="dl"] .pdx-dl-label',
                            value: 'section:not([hidden]) [data-test="dl"] .pdx-dl-value',
                        },
                        relations: [
                            { description: 'item within dl', left: 'item', op: 'contained-in', right: 'dl' },
                            { description: 'label within dl', left: 'label', op: 'contained-in', right: 'dl' },
                            { description: 'value within dl', left: 'value', op: 'contained-in', right: 'dl' },
                            {
                                description: 'label sits left of (or at) value start (horizontal layout)',
                                left: 'label.left',
                                op: '<=',
                                right: 'value.left',
                                tolerance: 1,
                            },
                            {
                                description: 'value right edge does not overflow dl right edge',
                                left: 'value.right',
                                op: '<=',
                                right: 'dl.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
            'description-list-bordered': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="dl-bordered"] .pdx-dl',
                        description: 'bordered dl has non-negative border radius (metro/cyberpunk may zero it)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="dl-bordered"] .pdx-dl',
                        description: 'bordered dl has a visible outer border',
                        border: { all: { width: { op: '>=', value: 0.5 } } },
                    },
                ],
            },
            'description-list-columns': {
                // The base structure only: every pair stays inside the grid.
                composition: [
                    {
                        description: 'all items contained within the multi-column dl box',
                        parent: 'section:not([hidden]) [data-test="dl-cols"] .pdx-dl',
                        children: {
                            dl: 'section:not([hidden]) [data-test="dl-cols"] .pdx-dl',
                            item: 'section:not([hidden]) [data-test="dl-cols"] .pdx-dl-item',
                        },
                        relations: [
                            { description: 'item within dl', left: 'item', op: 'contained-in', right: 'dl' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // The native semantics are right (<dl>/<dt>/<dd>). The main scenario, no disableRules.
    a11y: {
        scenarios: ['description-list-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'description-list-basic',
        targets: [
            // A content-driven container (key-value rows): skip height, assert radius/width/border.
            { selector: 'section:not([hidden]) [data-test="dl"] .pdx-dl', tolerancePx: 12, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'borderTopColor'] }] },
        ],
    },

    // ── Dim. 4: keyboard ──
    // Not interactive (it displays data) → no keyboard pattern. Omitted.

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['description-list-basic'],
    },
};

export default descriptionList;
