/**
 * PILOT MANIFEST — pdx-button
 *
 * It validates the system end to end on a real component, across all 5 dimensions.
 * The mathematical contracts reproduce the ones already validated in contracts/universal.ts and
 * button-contract.spec.ts (parity was guaranteed while migrating away from the monolith).
 */
import type { ComponentManifest } from './_types';

export const button: ComponentManifest = {
    name: 'button',
    tag: 'pdx-button',
    tier: '1A',
    status: 'wip',
    imports: ['@pdxui/ui/button'],

    // ── Scenarios (the markup comes from the component-contracts.html monolith) ──
    scenarios: [
        {
            id: 'button-variants',
            title: 'Button — Variants',
            html: `
                <div class="row">
                    <pdx-button data-test="primary" variant="solid">Primary</pdx-button>
                    <pdx-button data-test="secondary" variant="secondary">Secondary</pdx-button>
                    <pdx-button data-test="outline" variant="outline">Outline</pdx-button>
                    <pdx-button data-test="ghost" variant="ghost">Ghost</pdx-button>
                    <pdx-button data-test="danger" variant="danger">Danger</pdx-button>
                </div>`,
        },
        {
            id: 'button-sizes',
            title: 'Button — Sizes',
            html: `
                <div class="row">
                    <pdx-button data-test="btn-sm" size="sm">Small</pdx-button>
                    <pdx-button data-test="btn-md">Default</pdx-button>
                    <pdx-button data-test="btn-lg" size="lg">Large</pdx-button>
                </div>`,
        },
        {
            id: 'button-disabled',
            title: 'Button — Disabled',
            html: `<pdx-button data-test="btn-disabled" disabled>Disabled</pdx-button>`,
        },
        {
            // Icon-only, named by aria-label on the host: if it stays on the host, the inner
            // <button> is announced "button" — axe's button-name.
            id: 'button-icon-only',
            title: 'Button — Icon-only, named',
            html: `
                <div class="row">
                    <pdx-button data-test="icon-settings" variant="ghost" aria-label="Settings"><span aria-hidden="true">⚙</span></pdx-button>
                    <pdx-button data-test="icon-more" variant="outline" aria-label="More actions"><span aria-hidden="true">…</span></pdx-button>
                </div>`,
        },
        {
            // Every variant whose label sits on a fill, or is the text itself. Primary is
            // measured by the theme gate: the Pragmatic themes paint it with a gradient.
            id: 'button-labels',
            title: 'Button — Labels of every variant',
            html: `
                <div class="row">
                    ${['secondary', 'outline', 'ghost', 'link', 'danger', 'success', 'warning', 'info']
                        .map((v) => `<pdx-button data-test="l-${v}" variant="${v}">${v}</pdx-button>`)
                        .join('\n                    ')}
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (rules scoped to their own scenario) ──
    contracts: {
        scenarios: {
            // Each label on what the theme really paints behind it: info on the accent (1.88 in
            // cyberpunk), secondary darkening in dark, link as text on the page.
            'button-labels': {
                standalone: ['secondary', 'outline', 'ghost', 'link', 'danger', 'success', 'warning', 'info'].map((v) => ({
                    selector: `[data-test="l-${v}"] button`,
                    description: `${v} button label is legible (AA)`,
                    contrast: { op: '>=' as const, value: 4.5 },
                })),
            },
            'button-variants': {
                standalone: [
                    {
                        selector: '[data-test="primary"] button',
                        description: 'primary button height >= 28px',
                        height: { op: '>=', value: 28 },
                    },
                    {
                        selector: '[data-test="primary"] button',
                        description: 'primary button opacity = 1',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                    {
                        selector: '[data-test="primary"] button',
                        description: 'primary button cursor = pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                // Note: a universal "hover changes X" rule cannot be expressed reliably across
                // themes (mustDiffer is an AND: it would ask for both the background AND the shadow).
                // The hover affordance is tested per theme, where it is deterministic. See INVESTIGATE.
            },
            'button-sizes': {
                composition: [
                    {
                        description: 'size hierarchy: sm < md < lg heights',
                        parent: 'body',
                        children: {
                            sm: '[data-test="btn-sm"] button',
                            md: '[data-test="btn-md"] button',
                            lg: '[data-test="btn-lg"] button',
                        },
                        relations: [
                            { description: 'sm < md', left: 'sm.height', op: '<', right: 'md.height' },
                            { description: 'md < lg', left: 'md.height', op: '<', right: 'lg.height' },
                        ],
                    },
                ],
            },
            'button-disabled': {
                states: [
                    {
                        description: 'disabled button has reduced opacity',
                        selector: '[data-test="btn-disabled"] button',
                        trigger: 'attribute',
                        attribute: { name: 'disabled', value: '' },
                        changes: { opacity: { op: '<', value: 1 } },
                    },
                ],
            },
        },
        // Per-theme expectations, from the vendor specs.
        themeOverrides: {
            material: {
                'button-variants': {
                    standalone: [
                        {
                            selector: '[data-test="primary"] button',
                            description: 'material: pill radius >= 18px',
                            radius: { all: { op: '>=', value: 18 } },
                        },
                        {
                            selector: '[data-test="primary"] button',
                            description: 'material: M3 button height >= 36px',
                            height: { op: '>=', value: 36 },
                        },
                        {
                            selector: '[data-test="primary"] button',
                            description: 'material: M3 label-large letter-spacing > 0',
                            letterSpacing: { op: 'isNot', value: 'normal' },
                        },
                        {
                            selector: '[data-test="primary"] button',
                            description: 'material: M3 label-large font-weight 500',
                            fontWeight: { op: 'is', value: '500' },
                        },
                    ],
                    states: [
                        {
                            description: 'material: hover raises an elevation shadow',
                            selector: '[data-test="primary"] button',
                            trigger: 'hover',
                            changes: { mustDiffer: ['boxShadow'] },
                        },
                    ],
                },
            },
            fluent: {
                'button-variants': {
                    standalone: [
                        {
                            selector: '[data-test="primary"] button',
                            description: 'fluent: compact height <= 40px',
                            height: { op: '<=', value: 40 },
                        },
                        {
                            selector: '[data-test="primary"] button',
                            description: 'fluent: sharp radius <= 10px (Fluent medium = 4px)',
                            radius: { all: { op: '<=', value: 10 } },
                        },
                        {
                            selector: '[data-test="primary"] button',
                            description: 'fluent: no letter-spacing',
                            letterSpacing: { op: 'oneOf', value: ['normal', '0px'] },
                        },
                        {
                            selector: '[data-test="primary"] button',
                            description: 'fluent: semibold weight',
                            fontWeight: { op: 'oneOf', value: ['600', '700'] },
                        },
                    ],
                },
            },
            corporate: {
                'button-variants': {
                    standalone: [
                        {
                            selector: '[data-test="primary"] button',
                            description: 'corporate: uppercase label',
                            textTransform: { op: 'is', value: 'uppercase' },
                        },
                        {
                            selector: '[data-test="primary"] button',
                            description: 'corporate: tight radius <= 6px',
                            radius: { all: { op: '<=', value: 6 } },
                        },
                        {
                            selector: '[data-test="primary"] button',
                            description: 'corporate: wide letter-spacing',
                            letterSpacing: { op: 'isNot', value: 'normal' },
                        },
                        {
                            selector: '[data-test="primary"] button',
                            description: 'corporate: bold weight',
                            fontWeight: { op: 'oneOf', value: ['700', 'bold'] },
                        },
                        {
                            // Corporate's controls are 36px; the theme's own 0.88 density must not
                            // multiply them down to 31.7. The height is what the theme says it is.
                            selector: '[data-test="primary"] button',
                            description: 'corporate: the control height is 36px, density and all',
                            height: { op: '==', value: 36, tolerance: 0.5 },
                        },
                    ],
                },
            },
            cupertino: {
                'button-variants': {
                    standalone: [
                        {
                            selector: '[data-test="primary"] button',
                            description: 'cupertino: touch target height >= 40px',
                            height: { op: '>=', value: 40 },
                        },
                        {
                            selector: '[data-test="primary"] button',
                            description: 'cupertino: Apple large button radius >= 10px',
                            radius: { all: { op: '>=', value: 10 } },
                        },
                    ],
                },
            },
            playful: {
                'button-variants': {
                    standalone: [
                        {
                            selector: '[data-test="primary"] button',
                            description: 'playful: pill radius >= 20px',
                            radius: { all: { op: '>=', value: 20 } },
                        },
                        {
                            selector: '[data-test="primary"] button',
                            description: 'playful: bold weight',
                            fontWeight: { op: 'oneOf', value: ['700', 'bold'] },
                        },
                    ],
                    states: [
                        {
                            description: 'playful: hover raises a coloured shadow',
                            selector: '[data-test="primary"] button',
                            trigger: 'hover',
                            changes: { mustDiffer: ['boxShadow'] },
                        },
                    ],
                },
            },
            cyberpunk: {
                'button-variants': {
                    standalone: [
                        {
                            selector: '[data-test="primary"] button',
                            description: 'cyberpunk: sharp edges, radius <= 4px',
                            radius: { all: { op: '<=', value: 4 } },
                        },
                    ],
                    states: [
                        {
                            description: 'cyberpunk: hover raises a neon glow',
                            selector: '[data-test="primary"] button',
                            trigger: 'hover',
                            changes: { mustDiffer: ['boxShadow'] },
                        },
                    ],
                },
            },
            editorial: {
                'button-variants': {
                    standalone: [
                        {
                            selector: '[data-test="primary"] button',
                            description: 'editorial: sharp radius <= 6px',
                            radius: { all: { op: '<=', value: 6 } },
                        },
                        {
                            selector: '[data-test="primary"] button',
                            description: 'editorial: serif font family',
                            fontFamily: { op: 'matches', value: 'Playfair|Georgia|serif' },
                        },
                    ],
                },
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        scenarios: ['button-variants', 'button-disabled', 'button-icon-only'],
        // No rule disabled: a button with a text label must pass WCAG cleanly.
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'button-variants',
        targets: [
            // The button must keep its height (the design system's min-height)
            // even under hostile global CSS. A generous tolerance for the pilot: to be tightened.
            { selector: '[data-test="primary"] button', tolerancePx: 6, leaks: [{ issue: 170, properties: ['letterSpacing'], themes: ['neutral'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        scenario: 'button-variants',
        steps: [
            // Tab puts the focus on the first interactive button
            { key: 'Tab', expectFocus: '[data-test="primary"] button' },
            { key: 'Tab', expectFocus: '[data-test="secondary"] button' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['button-variants'],
        // The ring here is `box-shadow: var(--pdx-focus-ring)` with `outline: none` — the
        // button opts out of the global outline, so it is the one that gates that token.
        focus: [{ scenario: 'button-variants', selector: 'section:not([hidden]) [data-test="primary"] button' }],
    },
};

export default button;
