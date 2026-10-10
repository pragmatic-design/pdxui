/**
 * MANIFEST — pdx-checkbox
 *
 * Mathematical contracts transcribed FAITHFULLY from contracts/universal.ts (the component: 'checkbox' block).
 * Scenario markup taken from the component-contracts.html monolith (scenario checkbox-basic).
 * Note: checkbox-basic is CSS-only (<input type="checkbox" class="pdx-checkbox">, not a custom element);
 * checkbox-mixed uses the custom element, the only way to have an indeterminate input without a script → imports: ['@pdxui/ui/checkbox'].
 */
import type { ComponentManifest } from './_types';

export const checkbox: ComponentManifest = {
    name: 'checkbox',
    tag: 'pdx-checkbox',
    tier: '1B',
    status: 'wip',
    imports: ['@pdxui/ui/checkbox'],

// ── Scenarios (markup taken from the component-contracts.html monolith) ──
    scenarios: [
        {
            id: 'checkbox-basic',
            title: 'Checkbox — Basic',
            html: `
                <div class="row">
                    <label class="pdx-checkbox-label">
                        <input type="checkbox" class="pdx-checkbox" data-test="checkbox-off">
                        <span>Unchecked</span>
                    </label>
                    <label class="pdx-checkbox-label">
                        <input type="checkbox" class="pdx-checkbox" data-test="checkbox-on" checked>
                        <span>Checked</span>
                    </label>
                </div>`,
        },
        {
            // The indeterminate dash: `indeterminate` is a property with no HTML attribute, so the
            // box comes from the custom element, which sets it on its native input.
            id: 'checkbox-mixed',
            title: 'Checkbox — Indeterminate',
            html: `
                <pdx-checkbox indeterminate label="Some selected" data-test="checkbox-mixed"></pdx-checkbox>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (transcribed from universal.ts) ──
    contracts: {
        scenarios: {
            'checkbox-basic': {
                standalone: [
                    {
                        selector: '[data-test="checkbox-off"]',
                        description: 'checkbox has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: '[data-test="checkbox-off"]',
                        description: 'checkbox is square (width ~= height)',
                        width: { op: '>=', value: 14 },
                    },
                    {
                        // A `:checked` rule that uses the `background` shorthand resets the check image
                        // to none, and the theme draws no check. A fixed white check is under 3:1 on
                        // Pragmatic Gold's light gold.
                        selector: 'section:not([hidden]) [data-test="checkbox-on"]',
                        description: 'a checked checkbox shows its check, 3:1 against the fill (WCAG 1.4.11)',
                        mark: { pixels: { op: '>=', value: 4 }, contrast: { op: '>=', value: 3 } },
                    },
                ],
            },
            'checkbox-mixed': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="checkbox-mixed"] input',
                        description: 'an indeterminate checkbox shows its dash, 3:1 against the fill (WCAG 1.4.11)',
                        mark: { pixels: { op: '>=', value: 4 }, contrast: { op: '>=', value: 3 } },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        scenarios: ['checkbox-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'checkbox-basic',
        targets: [
            { selector: '[data-test="checkbox-off"]', tolerancePx: 6, leaks: [{ issue: 170, properties: ['fontFamily', 'letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        scenario: 'checkbox-basic',
        steps: [
            { key: 'Tab', expectFocus: '[data-test="checkbox-off"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['checkbox-basic'],
        focus: [{ scenario: 'checkbox-basic', selector: 'section:not([hidden]) [data-test="checkbox-off"]' }],
    },
};

export default checkbox;
