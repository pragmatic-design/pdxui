/**
 * MANIFEST — pdx-spinner
 *
 * Contracts DERIVED by inspecting the source and the CSS.
 *
 * The source (ui/src/spinner/pdx-spinner.ts):
 *   - Sizes px: xs(12) sm(16) md(24) lg(32) xl(48). default 'md'.
 *   - The `variant` prop: 'spinner' (SVG), 'dots' (.pdx-dot), 'bar' (.pdx-progress). default 'spinner'.
 *   - DOM: <span data-part="root" role="status" aria-live="polite" :aria-label> > <span data-part="indicator">
 *     > the graphic. spinner.css (#291) sizes the indicator from the host's `size` variant.
 *   - The SVG animates (@keyframes pdx-spin) but its SIZE is fixed (the indicator's) → stable to measure.
 *
 * Conservative contracts (true on all 13 themes): no theme redefines the spinner's width and height
 * (spinner.css draws them; they were an inline style before #291), so the geometry is independent of
 * the theme. Only the display and a cautious minimum size are asserted.
 * The animated state (transform/rotate) is NOT asserted: the runner freezes the animations,
 * but the box's size is invariant and enough for the contract.
 */
import type { ComponentManifest } from './_types';

export const spinner: ComponentManifest = {
    name: 'spinner',
    tag: 'pdx-spinner',
    tier: '1A',
    status: 'wip',
    imports: ['@pdxui/ui/spinner'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'spinner-variants',
            title: 'Spinner — Variants',
            html: `
                <div class="row">
                    <pdx-spinner data-test="spin-default" label="Loading content"></pdx-spinner>
                    <pdx-spinner data-test="spin-dots" variant="dots" label="Loading content"></pdx-spinner>
                    <pdx-spinner data-test="spin-bar" variant="bar" label="Loading content"></pdx-spinner>
                </div>`,
        },
        {
            id: 'spinner-sizes',
            title: 'Spinner — Sizes',
            html: `
                <div class="row">
                    <pdx-spinner data-test="spin-sm" size="sm" label="Loading"></pdx-spinner>
                    <pdx-spinner data-test="spin-md" size="md" label="Loading"></pdx-spinner>
                    <pdx-spinner data-test="spin-lg" size="lg" label="Loading"></pdx-spinner>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'spinner-variants': {
                standalone: [
                    {
// the outer wrapper <span role="status"> = inline-flex (from the component)
                        selector: 'section:not([hidden]) [data-test="spin-default"] [role="status"]',
                        description: 'spinner status wrapper is inline-flex',
                        display: { op: 'is', value: 'inline-flex' },
                    },
                    {
                        // md container span: width/height = 24px (size 'md' default)
                        selector: 'section:not([hidden]) [data-test="spin-default"] [data-part="indicator"]',
                        description: 'spinner (md) container height >= 16px',
                        height: { op: '>=', value: 16 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="spin-default"] [data-part="indicator"]',
                        description: 'spinner (md) container width >= 16px',
                        width: { op: '>=', value: 16 },
                    },
                    // The bar variant is painted by progress.css, which the spinner must import:
                    // without it, alone on a page it renders nothing. The track is the visible part.
                    {
                        selector: 'section:not([hidden]) [data-test="spin-bar"] .pdx-progress',
                        description: 'bar variant: the track has a height',
                        height: { op: '>', value: 0 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="spin-bar"] .pdx-progress',
                        description: 'bar variant: the track is painted',
                        backgroundColor: { op: 'isNot', value: 'rgba(0, 0, 0, 0)' },
                    },
                ],
                composition: [
                    {
                        // Indeterminate is a SLICE of the track that slides. The class belongs on the
                        // track, not the bar: progress.css selects the track's descendant, and on the bar
                        // it fills the track or nothing at all, and never slides.
                        description: 'bar variant: the indeterminate bar is a slice of its track',
                        parent: 'section:not([hidden]) [data-test="spin-bar"]',
                        children: {
                            track: 'section:not([hidden]) [data-test="spin-bar"] .pdx-progress',
                            bar: 'section:not([hidden]) [data-test="spin-bar"] .pdx-progress-bar',
                        },
                        relations: [
                            { description: 'bar is narrower than its track', left: 'bar.width', op: '<', right: 'track.width' },
                        ],
                    },
                ],
            },
            'spinner-sizes': {
                composition: [
                    {
                        // The size is drawn on the indicator by spinner.css (xs12<sm16<md24<lg32<xl48):
                        // an invariant on every theme, because the design system does not redefine width/height.
                        description: 'size hierarchy: sm < md < lg container size',
                        parent: 'section:not([hidden]) .row',
                        children: {
                            sm: 'section:not([hidden]) [data-test="spin-sm"] [data-part="indicator"]',
                            md: 'section:not([hidden]) [data-test="spin-md"] [data-part="indicator"]',
                            lg: 'section:not([hidden]) [data-test="spin-lg"] [data-part="indicator"]',
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
    // The spinner has role="status" + aria-label (the label prop) → accessible text for a screen reader.
    // In the scenarios the label is explicit ("Loading content"), so axe passes cleanly with no disableRules.
    a11y: {
        scenarios: ['spinner-variants'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'spinner-variants',
        targets: [
            // The size is spinner.css's (24px, inline before #291) → it must resist hostile global CSS.
            { selector: 'section:not([hidden]) [data-test="spin-default"] [data-part="indicator"]', tolerancePx: 8 },
        ],
    },

    // ── Dim. 4: keyboard ──
    // A spinner is NOT interactive → no keyboard pattern (the keyboard block is omitted).

    // ── Dim. 5: visual regression (Docker) ──
    // The runner freezes the animation; the wrapper's mask is a safety net.
    visual: {
        scenarios: ['spinner-variants'],
        mask: ['section:not([hidden]) [data-test="spin-default"] [data-part="indicator"]'],
    },
};

export default spinner;
