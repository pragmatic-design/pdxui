/**
 * MANIFEST — pdx-masked-input
 *
 * A specialised input (the same wrapper pattern as pdx-input): the host renders
 * a `.pdx-input-wrap` with an inner `input.pdx-input`. It formats itself with the mask as
 * you type; the state classes (`disabled`/`error`) are applied to the wrapper.
 *
 * Conservative contracts: true on every theme. No exact px.
 *
 * An a11y NOTE: the component does NOT forward `aria-label` to the inner <input> (the render
 * binds only value/placeholder/inputmode/disabled/name/aria-invalid). The scenario
 * puts an aria-label on the host anyway, to be fair to the axe test, but a fix is needed
 * (an ariaLabel prop plus :aria-label on the input, as number-input, password, slider and search do).
 * See the report.
 */
import type { ComponentManifest } from './_types';

export const maskedInput: ComponentManifest = {
    name: 'masked-input',
    tag: 'pdx-masked-input',
    tier: '1C',
    status: 'wip',
    imports: ['@pdxui/ui/masked-input'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'masked-input-basic',
            title: 'Masked Input — Basic (phone)',
            // aria-label: on its own it needs an accessible name (axe's "label" rule).
            // In real use <pdx-form-field> provides it.
            html: `<pdx-masked-input data-test="masked" mask="phone" aria-label="Phone number"></pdx-masked-input>`,
        },
        {
            id: 'masked-input-disabled',
            title: 'Masked Input — Disabled',
            html: `<pdx-masked-input data-test="masked" mask="phone" disabled aria-label="Phone number"></pdx-masked-input>`,
        },
        {
            id: 'masked-input-sizes',
            title: 'Masked Input — Sizes',
            html: `
                <div style="display: flex; flex-direction: column; gap: 12px; max-width: 300px;">
                    <pdx-masked-input data-test="masked-sm" mask="phone" size="sm" aria-label="Small"></pdx-masked-input>
                    <pdx-masked-input data-test="masked-md" mask="phone" aria-label="Medium"></pdx-masked-input>
                    <pdx-masked-input data-test="masked-lg" mask="phone" size="lg" aria-label="Large"></pdx-masked-input>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (rules scoped to their scenario) ──
    contracts: {
        scenarios: {
            'masked-input-basic': {
                standalone: [
                    {
                        // Aligned with the input/button minimum (>=28): the dense themes stay valid.
                        selector: 'section:not([hidden]) [data-test="masked"] .pdx-input-wrap',
                        description: 'input wrapper height >= 28px',
                        height: { op: '>=', value: 28 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="masked"] .pdx-input-wrap',
                        description: 'wrapper radius >= 0 (mai negativo)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="masked"] input.pdx-input',
                        description: 'inner input has no visible own border',
                        border: {
                            top: { style: { op: 'is', value: 'none' } },
                            left: { style: { op: 'is', value: 'none' } },
                            right: { style: { op: 'is', value: 'none' } },
                        },
                    },
                ],
            },
            'masked-input-disabled': {
                standalone: [
                    {
                        // A state already in the markup: a standalone rule (NOT states/trigger) → no flake.
                        selector: 'section:not([hidden]) [data-test="masked"] .pdx-input-wrap',
                        description: 'disabled wrapper is dimmed (opacity < 1)',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
            'masked-input-sizes': {
                composition: [
                    {
                        description: 'size hierarchy: sm < md < lg heights',
                        parent: 'body',
                        children: {
                            sm: '[data-test="masked-sm"] .pdx-input-wrap',
                            md: '[data-test="masked-md"] .pdx-input-wrap',
                            lg: '[data-test="masked-lg"] .pdx-input-wrap',
                        },
                        relations: [
                            { description: 'sm < md', left: 'sm.height', op: '<', right: 'md.height' },
                            { description: 'md < lg', left: 'md.height', op: '<', right: 'lg.height' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        scenarios: ['masked-input-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'masked-input-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="masked"] .pdx-input-wrap', tolerancePx: 10, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }, { issue: 170, properties: ['borderTopColor'], themes: ['material'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        scenario: 'masked-input-basic',
        steps: [
            // Tab lands INSIDE the component (the inner input): what is checked is the containment.
            { key: 'Tab', expectFocusWithin: '[data-test="masked"] .pdx-input-wrap' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['masked-input-basic'],
    },
};

export default maskedInput;
