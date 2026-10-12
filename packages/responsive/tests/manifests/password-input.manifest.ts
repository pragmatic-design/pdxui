/**
 * MANIFEST — pdx-password-input
 *
 * A specialised input (the same wrapper pattern as pdx-input): the host renders
 * a `.pdx-input-wrap` with an inner `input.pdx-input` plus a visibility toggle button
 * (`.pdx-password-toggle.pdx-input-suffix-interactive`).
 *
 * Conservative contracts: true on all 13 themes. No exact px.
 */
import type { ComponentManifest } from './_types';

export const passwordInput: ComponentManifest = {
    name: 'password-input',
    tag: 'pdx-password-input',
    tier: '1C',
    status: 'wip',
    imports: ['@pdxui/ui/password-input'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'password-input-basic',
            title: 'Password Input — Basic',
            // aria-label: on its own it needs an accessible name (axe's "label" rule).
            // In real use <pdx-form-field> provides it. The component forwards
            // ariaLabel→<input> via :aria-label.
            html: `<pdx-password-input data-test="password" placeholder="Password" aria-label="Password"></pdx-password-input>`,
        },
        {
            id: 'password-input-disabled',
            title: 'Password Input — Disabled',
            html: `<pdx-password-input data-test="password" disabled placeholder="Password" aria-label="Password"></pdx-password-input>`,
        },
        {
            id: 'password-input-sizes',
            title: 'Password Input — Sizes',
            html: `
                <div style="display: flex; flex-direction: column; gap: 12px; max-width: 300px;">
                    <pdx-password-input data-test="password-sm" size="sm" aria-label="Small"></pdx-password-input>
                    <pdx-password-input data-test="password-md" aria-label="Medium"></pdx-password-input>
                    <pdx-password-input data-test="password-lg" size="lg" aria-label="Large"></pdx-password-input>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (rules scoped to their scenario) ──
    contracts: {
        scenarios: {
            'password-input-basic': {
                standalone: [
                    {
                        // Aligned with the input/button minimum (>=28): the dense themes stay valid
                        // (input-min-height × the density can fall below 32).
                        selector: 'section:not([hidden]) [data-test="password"] .pdx-input-wrap',
                        description: 'input wrapper height >= 28px',
                        height: { op: '>=', value: 28 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="password"] .pdx-input-wrap',
                        description: 'wrapper radius >= 0 (mai negativo)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="password"] input.pdx-input',
                        description: 'inner input has no visible own border',
                        border: {
                            top: { style: { op: 'is', value: 'none' } },
                            left: { style: { op: 'is', value: 'none' } },
                            right: { style: { op: 'is', value: 'none' } },
                        },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="password"] .pdx-password-toggle',
                        description: 'visibility toggle button is a pointer affordance',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                composition: [
                    {
                        description: 'toggle button contained within the wrapper',
                        parent: '[data-test="password"] .pdx-input-wrap',
                        children: {
                            toggle: '[data-test="password"] .pdx-password-toggle',
                        },
                        relations: [
                            { description: 'toggle right <= wrapper right', left: 'toggle.right', op: '<=', right: 'parent.right', tolerance: 1 },
                            { description: 'toggle top >= wrapper top', left: 'toggle.top', op: '>=', right: 'parent.top', tolerance: 1 },
                        ],
                    },
                ],
            },
            'password-input-disabled': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="password"] .pdx-input-wrap',
                        description: 'disabled wrapper is dimmed (opacity < 1)',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
            'password-input-sizes': {
                composition: [
                    {
                        description: 'size hierarchy: sm < md < lg heights',
                        parent: 'body',
                        children: {
                            sm: '[data-test="password-sm"] .pdx-input-wrap',
                            md: '[data-test="password-md"] .pdx-input-wrap',
                            lg: '[data-test="password-lg"] .pdx-input-wrap',
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
        scenarios: ['password-input-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'password-input-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="password"] .pdx-input-wrap', tolerancePx: 10 },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        scenario: 'password-input-basic',
        steps: [
            // Tab lands INSIDE the component (the input, then the toggle): what is checked is the containment.
            { key: 'Tab', expectFocusWithin: '[data-test="password"] .pdx-input-wrap' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['password-input-basic'],
    },
};

export default passwordInput;
