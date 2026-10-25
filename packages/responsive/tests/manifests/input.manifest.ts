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
            // The other states, each a custom state on the host (#286): what a theme selects.
            id: 'input-states',
            title: 'Input — States',
            html: `
                <div style="display: flex; flex-direction: column; gap: 12px; max-width: 300px;">
                    <pdx-input data-test="input-success" success aria-label="Success" value="Valid"></pdx-input>
                    <pdx-input data-test="input-warning" warning aria-label="Warning" value="Check this"></pdx-input>
                    <pdx-input data-test="input-readonly" readonly aria-label="Read only" value="Fixed"></pdx-input>
                    <pdx-input data-test="input-loading" loading aria-label="Loading" value="Searching"></pdx-input>
                </div>`,
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
        {
            // A subtree with a theme of its own takes that theme's input style (#156): material's
            // filled field and fluent's outlined one, whatever the page's theme. The design CSS reads
            // `--pdx-input-style` through a style query — the default target, baseline-2026. Under
            // baseline-2024 the style is an attribute on <html>, the page's alone, and this scenario
            // is the difference.
            id: 'input-nested-theme',
            title: 'Input — Nested themes',
            html: `
                <div style="display: flex; flex-direction: column; gap: 12px; max-width: 300px;">
                    <div pdx-theme="material"><pdx-input data-test="material-input" placeholder="Material"></pdx-input></div>
                    <div pdx-theme="fluent"><pdx-input data-test="fluent-input" placeholder="Fluent"></pdx-input></div>
                </div>`,
            // Left out of the baseline-2024 run (#509), where it fails on every theme by design.
            onlyOn: {
                target: 'baseline-2026',
                why: 'a theme subtree with its own input style needs the style query baseline-2026 gives; '
                    + 'under baseline-2024 the input style is an attribute on <html>, one for the whole page',
            },
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
                        selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
                        description: 'input wrapper height >= 28px',
                        height: { op: '>=', value: 28 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="input"] [data-part="input"]',
                        description: 'inner input has no visible own border',
                        border: {
                            top: { style: { op: 'is', value: 'none' } },
                            left: { style: { op: 'is', value: 'none' } },
                            right: { style: { op: 'is', value: 'none' } },
                        },
                    },
                ],
            },
            'input-nested-theme': {
                standalone: [
                    {
                        // filled: `border: none` and a bottom border alone (inputs.css).
                        selector: 'section:not([hidden]) [data-test="material-input"] [data-part="root"]',
                        description: 'a material subtree has a filled input, on any page theme',
                        border: {
                            top: { style: { op: 'is', value: 'none' } },
                            bottom: { style: { op: 'is', value: 'solid' } },
                        },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="fluent-input"] [data-part="root"]',
                        description: 'a fluent subtree has an outlined input, on any page theme',
                        border: {
                            top: { style: { op: 'is', value: 'solid' } },
                            left: { style: { op: 'is', value: 'solid' } },
                        },
                    },
                ],
            },
            'input-disabled': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
                        description: 'disabled input wrapper has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                ],
                states: [
                    {
                        description: 'disabled is the custom state :state(disabled)',
                        selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
                        trigger: 'attribute',
                        customState: { host: 'section:not([hidden]) [data-test="input"]', name: 'disabled' },
                        changes: { cursor: { op: 'is', value: 'not-allowed' } },
                    },
                ],
            },
            'input-error': {
                states: [
                    {
                        description: 'error is the custom state :state(invalid)',
                        selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
                        trigger: 'attribute',
                        customState: { host: 'section:not([hidden]) [data-test="input"]', name: 'invalid' },
                        changes: {},
                    },
                ],
            },
            'input-states': {
                states: (['success', 'warning', 'readonly', 'loading'] as const).map((name) => ({
                    description: `${name} is the custom state :state(${name})`,
                    selector: `section:not([hidden]) [data-test="input-${name}"] [data-part="root"]`,
                    trigger: 'attribute' as const,
                    customState: { host: `section:not([hidden]) [data-test="input-${name}"]`, name },
                    changes: {},
                })),
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="input-readonly"] [data-part="root"]',
                        description: 'a readonly frame is not dimmed: it is read, not unavailable',
                        opacity: { op: '==', value: 1 },
                    },
                ],
            },
            'input-sizes': {
                composition: [
                    {
                        description: 'size hierarchy: sm < md < lg heights',
                        parent: 'body',
                        children: {
                            sm: '[data-test="input-sm"] [data-part="root"]',
                            md: '[data-test="input-md"] [data-part="root"]',
                            lg: '[data-test="input-lg"] [data-part="root"]',
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
                            selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
                            description: 'material: filled style, no top/left/right border',
                            border: {
                                top: { style: { op: 'is', value: 'none' }, width: { op: '==', value: 0 } },
                                left: { style: { op: 'is', value: 'none' }, width: { op: '==', value: 0 } },
                                right: { style: { op: 'is', value: 'none' }, width: { op: '==', value: 0 } },
                            },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
                            description: 'material: bottom border >= 1px (M3 active indicator)',
                            border: { bottom: { width: { op: '>=', value: 1 } } },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
                            description: 'material: filled height >= 52px (spec: 56dp)',
                            height: { op: '>=', value: 52 },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
                            description: 'material: inset background, not transparent',
                            backgroundColor: { op: 'isNot', value: 'rgba(0, 0, 0, 0)' },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
                            description: 'material: inset background, not white',
                            backgroundColor: { op: 'isNot', value: 'rgb(255, 255, 255)' },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
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
                            selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
                            description: 'fluent: outlined, visible border on all sides',
                            border: { all: { style: { op: 'is', value: 'solid' }, width: { op: '>=', value: 1 } } },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
                            description: 'fluent: surface background',
                            backgroundColor: { op: 'isNot', value: 'rgba(0, 0, 0, 0)' },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
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
                            selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
                            description: 'cupertino: transparent border (gray fill style)',
                            border: { top: { color: { op: 'matches', value: 'rgba\\(0,\\s*0,\\s*0,\\s*0\\)|transparent' } } },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
                            description: 'cupertino: gray fill background',
                            backgroundColor: { op: 'isNot', value: 'rgba(0, 0, 0, 0)' },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
                            description: 'cupertino: Apple touch target, height >= 40px',
                            height: { op: '>=', value: 40 },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
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
                            selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
                            description: 'corporate: sharp radius <= 4px',
                            radius: { all: { op: '<=', value: 4 } },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
                            description: 'corporate: visible solid border',
                            border: { all: { style: { op: 'is', value: 'solid' } } },
                        },
                        {
                            // 36px, the height the theme declares and the one the button gets, so a
                            // row of both aligns. Its own 0.88 density must not scale it to 31.7.
                            selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]',
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
        scenarios: ['input-basic', 'input-states'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'input-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="input"] [data-part="root"]', tolerancePx: 6 },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        scenario: 'input-basic',
        steps: [
            { key: 'Tab', expectFocus: '[data-test="input"] [data-part="input"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['input-basic'],
        // No component override: the ring comes from reset.css's `:focus-visible`, i.e. from
        // `--pdx-focus-width`. This is the baseline that goes red when that token moves.
        focus: [{ scenario: 'input-basic', selector: 'section:not([hidden]) [data-test="input"] [data-part="input"]' }],
    },
};

export default input;
