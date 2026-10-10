/**
 * MANIFEST — pdx-badge
 *
 * Contracts derived by inspecting:
 *  - source: packages/ui/src/badge/pdx-badge.ts
 *      render → <span class="pdx-badge pdx-badge-{variant}" role="status" aria-live="polite">
 *      A component that is NOT interactive: no cursor:pointer, no click handler, no disabled state.
 *  - CSS: packages/design/src/components/feedback.css
 *      .pdx-badge base → display: inline-flex; border-radius: var(--pdx-radius-full); (pill)
 *      No opacity or disabled rule on the badge → opacity is always 1.
 *
 * Conservative rules: only invariants that hold on ALL 13 themes. No exact px value.
 * The sm/lg sizes differ ONLY in font-size and padding (there is no guaranteed height ladder),
 * so NO height hierarchy is asserted.
 */
import type { ComponentManifest } from './_types';

export const badge: ComponentManifest = {
    name: 'badge',
    tag: 'pdx-badge',
    tier: '1A',
    status: 'wip',
    imports: ['@pdxui/ui/badge'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'badge-variants',
            title: 'Badge — Variants',
            html: `
                <div class="row">
                    <pdx-badge data-test="primary" value="3" variant="primary"></pdx-badge>
                    <pdx-badge data-test="success" value="7" variant="success"></pdx-badge>
                    <pdx-badge data-test="danger" value="9" variant="danger"></pdx-badge>
                    <pdx-badge data-test="warning" value="5" variant="warning"></pdx-badge>
                    <pdx-badge data-test="info" value="2" variant="info"></pdx-badge>
                </div>`,
        },
        {
            id: 'badge-shape',
            title: 'Badge — Shape',
            html: `
                <div class="row">
                    <pdx-badge data-test="pill" value="42" variant="primary" shape="pill"></pdx-badge>
                    <pdx-badge data-test="square" value="42" variant="primary" shape="square"></pdx-badge>
                </div>`,
        },
        {
            // Dots named by what they mean, not by their variant: "success indicator" has no way to
            // say "Online".
            id: 'badge-dot',
            title: 'Badge — Named status dots',
            html: `
                <div class="row">
                    <pdx-badge data-test="dot-online" dot variant="success" label="Online"></pdx-badge>
                    <pdx-badge data-test="dot-busy" dot variant="danger" pulse label="Busy"></pdx-badge>
                    <pdx-badge data-test="count-unread" value="3" variant="primary" label="3 unread messages"></pdx-badge>
                </div>`,
        },
        {
            // The colour as text on the page: an outline badge is transparent.
            id: 'badge-outline',
            title: 'Badge — Outline variants',
            html: `
                <div class="row">
                    <pdx-badge data-test="o-primary" value="3" variant="outline-primary"></pdx-badge>
                    <pdx-badge data-test="o-success" value="7" variant="outline-success"></pdx-badge>
                    <pdx-badge data-test="o-danger" value="9" variant="outline-danger"></pdx-badge>
                    <pdx-badge data-test="o-warning" value="5" variant="outline-warning"></pdx-badge>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, derived from feedback.css) ──
    contracts: {
        scenarios: {
            'badge-variants': {
                standalone: [
                    {
                        // .pdx-badge base → display: inline-flex
                        selector: '[data-test="primary"] .pdx-badge',
                        description: 'badge is inline-flex',
                        display: { op: 'is', value: 'inline-flex' },
                    },
                    {
                        // A small atom: a cautious minimum, not an exact value.
                        selector: '[data-test="primary"] .pdx-badge',
                        description: 'badge height >= 14px',
                        height: { op: '>=', value: 14 },
                    },
                    {
                        // No opacity rule on the badge → always opaque.
                        selector: '[data-test="primary"] .pdx-badge',
                        description: 'badge opacity = 1',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                    {
                        // border-radius: var(--pdx-radius-full) → a pill on every theme.
                        // A cautious assertion: a perceptible radius, not an exact value.
                        selector: '[data-test="primary"] .pdx-badge',
                        description: 'badge has rounded corners (radius >= 2px)',
                        radius: { all: { op: '>=', value: 2 } },
                    },
                    // The tinted variants' text on their tint, the filled one's label on its fill:
                    // WCAG AA for 12 px text, in all 26 theme×scheme combinations.
                    ...['primary', 'success', 'danger', 'warning', 'info'].map((v) => ({
                        selector: `[data-test="${v}"] .pdx-badge`,
                        description: `${v} badge text is legible (AA)`,
                        contrast: { op: '>=' as const, value: 4.5 },
                    })),
                ],
            },
            'badge-outline': {
                standalone: ['primary', 'success', 'danger', 'warning'].map((v) => ({
                    selector: `[data-test="o-${v}"] .pdx-badge-outline-${v}`,
                    description: `outline ${v} badge text is legible on the page (AA)`,
                    contrast: { op: '>=' as const, value: 4.5 },
                })),
            },
            'badge-shape': {
                standalone: [
                    {
                        // .pdx-badge-square → radius-sm, but the radius-zero themes (metro/cyberpunk)
                        // zero it legitimately. The real invariant = a non-negative radius;
                        // the "a pill is rounder than a square" comparison is in the composition below.
                        selector: '[data-test="square"] .pdx-badge',
                        description: 'square badge radius is defined (>= 0)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                composition: [
                    {
                        // A pill (radius-full) must have a radius >= the square one (radius-sm), for the same content.
                        description: 'pill radius >= square radius',
                        parent: 'body',
                        children: {
                            pill: '[data-test="pill"] .pdx-badge',
                            square: '[data-test="square"] .pdx-badge',
                        },
                        relations: [
                            {
                                description: 'pill topLeft radius >= square topLeft radius',
                                left: 'pill.borderTopLeftRadius',
                                op: '>=',
                                right: 'square.borderTopLeftRadius',
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // role="status" + aria-live="polite": the badge exposes its count to screen readers.
    a11y: {
        scenarios: ['badge-variants', 'badge-dot'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'badge-variants',
        targets: [
            // The box-sizing and border defences in feedback.css keep the drift to 11px. What is left
            // comes from a pathological host (`span{line-height:2.2}`) on a tiny atom: tolerance 14.
            { selector: '[data-test="primary"] .pdx-badge', tolerancePx: 14, leaks: [{ issue: 170, properties: ['fontFamily', 'letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard ──
    // A badge is NOT interactive (no focus, no handler) → the keyboard block is omitted.

    // ── Dim. 5: visual regression ──
    visual: {
        scenarios: ['badge-variants'],
    },
};

export default badge;
