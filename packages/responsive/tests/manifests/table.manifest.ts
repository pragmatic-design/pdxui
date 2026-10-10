/**
 * MANIFEST — pdx-table (Tier 5A, CSS-only)
 *
 * A CSS-only component: the dev applies the .pdx-table class to a native <table>.
 */
import type { ComponentManifest } from './_types';

export const table: ComponentManifest = {
    name: 'table',
    tag: 'pdx-table',
    tier: '5A',
    status: 'wip',
    imports: [],

// ── Scenarios ──
    scenarios: [
        {
            id: 'table-basic',
            title: 'Table — Basic',
            html: `
                <div style="max-width: 480px;">
                    <table class="pdx-table" data-test="table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Status</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Alice</td>
                                <td>Active</td>
                                <td>$1,200</td>
                            </tr>
                            <tr>
                                <td>Bob</td>
                                <td>Pending</td>
                                <td>$450</td>
                            </tr>
                        </tbody>
                    </table>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'table-basic': {
                standalone: [
                    {
                        selector: '.pdx-table th',
                        description: 'table header has font-weight >= 500',
                        fontWeight: { op: 'oneOf', value: ['500', '600', '700', 'bold'] },
                    },
                    {
                        selector: '.pdx-table td',
                        description: 'table cell has visible border-bottom',
                        border: {
                            bottom: { width: { op: '>=', value: 0.5 } },
                        },
                    },
                ],
            },
        },
        // Per-theme header and cell style.
        themeOverrides: {
            material: {
                'table-basic': {
                    standalone: [
                        {
                            selector: '.pdx-table th',
                            description: 'material: header is not uppercased',
                            textTransform: { op: 'is', value: 'none' },
                        },
                    ],
                },
            },
            corporate: {
                'table-basic': {
                    standalone: [
                        {
                            selector: '.pdx-table th',
                            description: 'corporate: header has a strong bottom border (>= 3px)',
                            border: { bottom: { width: { op: '>=', value: 3 } } },
                        },
                    ],
                },
            },
            cyberpunk: {
                'table-basic': {
                    standalone: [
                        {
                            selector: '.pdx-table th',
                            description: 'cyberpunk: uppercase headers',
                            textTransform: { op: 'is', value: 'uppercase' },
                        },
                    ],
                },
            },
            editorial: {
                'table-basic': {
                    standalone: [
                        {
                            selector: '.pdx-table th',
                            description: 'editorial: header is not uppercased',
                            textTransform: { op: 'is', value: 'none' },
                        },
                        {
                            selector: '.pdx-table td',
                            description: 'editorial: cells have a dotted bottom border',
                            border: { bottom: { style: { op: 'is', value: 'dotted' } } },
                        },
                    ],
                },
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        scenarios: ['table-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'table-basic',
        targets: [
            { selector: '[data-test="table"]', tolerancePx: 6, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'letterSpacing'] }] },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['table-basic'],
    },
};

export default table;
