/**
 * MANIFEST — pdx-switch (toggle)
 *
 * NB: the scenario is CSS-only (<input type="checkbox" class="pdx-toggle">, not a CE) → imports: [].
 */
import type { ComponentManifest } from './_types';

export const toggle: ComponentManifest = {
    name: 'toggle',
    tag: 'pdx-switch',
    tier: '1B',
    status: 'wip',
    imports: [],

// ── Scenarios ──
    scenarios: [
        {
            id: 'toggle-basic',
            title: 'Toggle — Basic',
            html: `
                <div class="row">
                    <label class="pdx-toggle-label">
                        <input type="checkbox" class="pdx-toggle" data-test="toggle-off">
                        <span>Off</span>
                    </label>
                    <label class="pdx-toggle-label">
                        <input type="checkbox" class="pdx-toggle" data-test="toggle-on" checked>
                        <span>On</span>
                    </label>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'toggle-basic': {
                standalone: [
                    {
                        selector: '[data-test="toggle-off"]',
                        description: 'toggle has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: '[data-test="toggle-off"]',
                        description: 'toggle has min width >= 32px',
                        width: { op: '>=', value: 32 },
                    },
                    {
                        selector: '[data-test="toggle-off"]',
                        description: 'toggle has height >= 16px',
                        height: { op: '>=', value: 16 },
                    },
                ],
            },
        },
        themeOverrides: {
            material: {
                'toggle-basic': {
                    standalone: [
                        {
                            selector: '[data-test="toggle-off"]',
                            description: 'material: M3 switch track is wider, >= 48px',
                            width: { op: '>=', value: 48 },
                        },
                        {
                            selector: '[data-test="toggle-off"]',
                            description: 'material: M3 switch track is taller, >= 28px',
                            height: { op: '>=', value: 28 },
                        },
                    ],
                },
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        scenarios: ['toggle-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'toggle-basic',
        targets: [
            { selector: '[data-test="toggle-off"]', tolerancePx: 6 },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        scenario: 'toggle-basic',
        steps: [
            { key: 'Tab', expectFocus: '[data-test="toggle-off"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['toggle-basic'],
    },
};

export default toggle;
