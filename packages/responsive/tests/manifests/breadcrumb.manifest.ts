/**
 * MANIFEST — pdx-breadcrumb (Tier 6, CSS-only)
 *
 * The contract taken FAITHFULLY from contracts/universal.ts (the component: 'breadcrumb' block).
 * A NOTE on imports: in the monolith the markup is `<nav class="pdx-breadcrumb">` (CSS-only),
 * so imports: [] even though the export '@pdxui/ui/breadcrumb' exists.
 */
import type { ComponentManifest } from './_types';

export const breadcrumb: ComponentManifest = {
    name: 'breadcrumb',
    tag: 'pdx-breadcrumb',
    tier: '6',
    status: 'wip',
    imports: [],

// ── Scenarios (markup taken from the component-contracts.html monolith) ──
    scenarios: [
        {
            id: 'breadcrumb-basic',
            title: 'Breadcrumb — Basic',
            html: `
                <nav class="pdx-breadcrumb" data-test="breadcrumb">
                    <a href="#">Home</a>
                    <a href="#">Products</a>
                    <span>Details</span>
                </nav>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (from universal.ts, the 'breadcrumb' block) ──
    contracts: {
        scenarios: {
            'breadcrumb-basic': {
                standalone: [
                    {
                        selector: '[data-test="breadcrumb"]',
                        description: 'breadcrumb has height >= 20px',
                        height: { op: '>=', value: 20 },
                    },
                    {
                        selector: '[data-test="breadcrumb"] a',
                        description: 'breadcrumb link has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        scenarios: ['breadcrumb-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'breadcrumb-basic',
        targets: [
            { selector: '[data-test="breadcrumb"]', tolerancePx: 6 },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['breadcrumb-basic'],
    },
};

export default breadcrumb;
