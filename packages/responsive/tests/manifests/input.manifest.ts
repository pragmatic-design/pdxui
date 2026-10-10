/**
 * MANIFEST — pdx-input
 *
 * The mathematical contracts reproduce the ones already validated in contracts/universal.ts
 * (the component: 'input' and component: 'input-sizes' blocks). Parity is guaranteed
 * while migrating away from the monolith.
 */
import type { ComponentManifest } from './_types';

export const input: ComponentManifest = {
    name: 'input',
    tag: 'pdx-input',
    tier: '1B',
    status: 'wip',
    imports: ['@pdxui/ui/input'],

    // ── Scenarios (the markup comes from the component-contracts.html monolith) ──
    scenarios: [
        {
            id: 'input-basic',
            title: 'Input — Basic',
            html: `<pdx-input data-test="input" placeholder="Type here..."></pdx-input>`,
        },
        {
            id: 'input-disabled',
            title: 'Input — Disabled',
            html: `<pdx-input data-test="input" disabled placeholder="Disabled"></pdx-input>`,
        },
        {
            id: 'input-error',
            title: 'Input — Error',
            html: `<pdx-input data-test="input" error placeholder="Error state"></pdx-input>`,
        },
        {
            id: 'input-sizes',
            title: 'Input — Sizes',
            html: `
                <div style="display: flex; flex-direction: column; gap: 12px; max-width: 300px;">
                    <pdx-input data-test="input-sm" size="sm" placeholder="Small"></pdx-input>
                    <pdx-input data-test="input-md" placeholder="Medium (default)"></pdx-input>
                    <pdx-input data-test="input-lg" size="lg" placeholder="Large"></pdx-input>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (rules scoped to their scenario) ──
    contracts: {
        scenarios: {
            'input-basic': {
                standalone: [
                    {
                        // Aligned with the button's minimum (>=28): the dense themes (fluent, metro,
                        // corporate, input-min-height 2rem × density 0.9 ≈ 28.8px) are valid
                        // by design. The historical 32 threshold disagreed with the button's (28).
                        selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                        description: 'input wrapper height >= 28px',
                        height: { op: '>=', value: 28 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="input"] input.pdx-input',
                        description: 'inner input has no visible own border',
                        border: {
                            top: { style: { op: 'is', value: 'none' } },
                            left: { style: { op: 'is', value: 'none' } },
                            right: { style: { op: 'is', value: 'none' } },
                        },
                    },
                ],
            },
            'input-disabled': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                        description: 'disabled input wrapper has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
            'input-sizes': {
                composition: [
                    {
                        description: 'size hierarchy: sm < md < lg heights',
                        parent: 'body',
                        children: {
                            sm: '[data-test="input-sm"] .pdx-input-wrap',
                            md: '[data-test="input-md"] .pdx-input-wrap',
                            lg: '[data-test="input-lg"] .pdx-input-wrap',
                        },
                        relations: [
                            { description: 'sm < md', left: 'sm.height', op: '<', right: 'md.height' },
                            { description: 'md < lg', left: 'md.height', op: '<', right: 'lg.height' },
                        ],
                    },
                ],
            },
        },
        // Per-theme expectations, from the vendor specs.
        themeOverrides: {
            material: {
                'input-basic': {
                    standalone: [
                        {
                            selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                            description: 'material: filled style, no top/left/right border',
                            border: {
                                top: { style: { op: 'is', value: 'none' }, width: { op: '==', value: 0 } },
                                left: { style: { op: 'is', value: 'none' }, width: { op: '==', value: 0 } },
                                right: { style: { op: 'is', value: 'none' }, width: { op: '==', value: 0 } },
                            },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                            description: 'material: bottom border >= 1px (M3 active indicator)',
                            border: { bottom: { width: { op: '>=', value: 1 } } },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                            description: 'material: filled height >= 52px (spec: 56dp)',
                            height: { op: '>=', value: 52 },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                            description: 'material: inset background, not transparent',
                            backgroundColor: { op: 'isNot', value: 'rgba(0, 0, 0, 0)' },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                            description: 'material: inset background, not white',
                            backgroundColor: { op: 'isNot', value: 'rgb(255, 255, 255)' },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                            description: 'material: top-rounded only (bottom radius = 0)',
                            radius: {
                                bottomLeft: { op: '==', value: 0, tolerance: 1 },
                                bottomRight: { op: '==', value: 0, tolerance: 1 },
                                topLeft: { op: '>=', value: 4 },
                                topRight: { op: '>=', value: 4 },
                            },
                        },
                    ],
                },
            },
            fluent: {
                'input-basic': {
                    standalone: [
                        {
                            selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                            description: 'fluent: outlined, visible border on all sides',
                            border: { all: { style: { op: 'is', value: 'solid' }, width: { op: '>=', value: 1 } } },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                            description: 'fluent: surface background',
                            backgroundColor: { op: 'isNot', value: 'rgba(0, 0, 0, 0)' },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                            description: 'fluent: sharp radius <= 8px (Fluent medium = 4px)',
                            radius: { all: { op: '<=', value: 8 } },
                        },
                    ],
                },
            },
            cupertino: {
                'input-basic': {
                    standalone: [
                        {
                            selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                            description: 'cupertino: transparent border (gray fill style)',
                            border: { top: { color: { op: 'matches', value: 'rgba\\(0,\\s*0,\\s*0,\\s*0\\)|transparent' } } },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                            description: 'cupertino: gray fill background',
                            backgroundColor: { op: 'isNot', value: 'rgba(0, 0, 0, 0)' },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                            description: 'cupertino: Apple touch target, height >= 40px',
                            height: { op: '>=', value: 40 },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                            description: 'cupertino: Apple medium radius >= 8px',
                            radius: { all: { op: '>=', value: 8 } },
                        },
                    ],
                },
            },
            corporate: {
                'input-basic': {
                    standalone: [
                        {
                            selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                            description: 'corporate: sharp radius <= 4px',
                            radius: { all: { op: '<=', value: 4 } },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                            description: 'corporate: visible solid border',
                            border: { all: { style: { op: 'is', value: 'solid' } } },
                        },
                        {
                            // 36px, the height the theme declares and the one the button gets, so a
                            // row of both aligns. Its own 0.88 density must not scale it to 31.7.
                            selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap',
                            description: 'corporate: the control height is 36px, density and all',
                            height: { op: '==', value: 36, tolerance: 0.5 },
                        },
                    ],
                },
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        scenarios: ['input-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'input-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="input"] .pdx-input-wrap', tolerancePx: 6, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }, { issue: 170, properties: ['borderTopColor'], themes: ['material'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        scenario: 'input-basic',
        steps: [
            { key: 'Tab', expectFocus: '[data-test="input"] input.pdx-input' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['input-basic'],
        // No component override: the ring comes from reset.css's `:focus-visible`, i.e. from
        // `--pdx-focus-width`. This is the baseline that goes red when that token moves.
        focus: [{ scenario: 'input-basic', selector: 'section:not([hidden]) [data-test="input"] input' }],
    },
};

export default input;
