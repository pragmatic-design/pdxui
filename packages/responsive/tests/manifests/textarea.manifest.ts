/**
 * MANIFEST — pdx-textarea
 *
 * NEW contracts, derived by inspecting:
 *  - source: packages/ui/src/textarea/pdx-textarea.ts
 *      the HOST <pdx-textarea> → render:
 *        <div class="pdx-input-wrap pdx-textarea-wrap [pdx-input-{size}] [disabled|readonly|error|success|warning]"
 *             style="height:auto;min-height:auto">
 *          <textarea class="pdx-input" ... :aria-label :aria-invalid :style="resize:...;width:100%"></textarea>
 *        </div>
 *        + an optional <div class="pdx-textarea-footer"> (only with showCount/wordCount).
 *      It reuses the wrapper pattern of pdx-input (.pdx-input-wrap): the border ON the wrapper,
 *      an inner <textarea> with border:none. formAssociated.
 *      aria-label: the `ariaLabel` prop is FORWARDED to the inner <textarea> element
 *      through :aria-label="${() => ctx.ariaLabel() || null}" → accessible name OK.
 *  - CSS: packages/design/src/surfaces/inputs.css
 *      .pdx-input-wrap → display:flex; border: width solid border; border-radius: radius-md; cursor:text;
 *      .pdx-input-wrap > textarea(.pdx-input) → border:none; outline:none; background:transparent;
 *      .pdx-textarea-wrap → height:auto; min-height:auto; align-items:stretch;
 *      .pdx-textarea-wrap > textarea → min-height: 4.5em (a textarea is TALLER than an input).
 *      The resize is applied inline on the <textarea> (default 'vertical').
 *
 * Conservative rules: only invariants that hold in ALL 13 themes. No exact px.
 * The wrapper radius: the metro/cyberpunk themes may zero it → we accept >= 0.
 * Height: the textarea (min-height 4.5em + padding) is taller than the input minimum → a prudent
 * 40px threshold on the wrapper (a single-line input sits at ~28-36px).
 *
 * Accessibility: the standalone scenario puts aria-label on the host (the ariaLabel prop),
 * forwarded to the inner <textarea> → a named control. No disableRules.
 */
import type { ComponentManifest } from './_types';

export const textarea: ComponentManifest = {
    name: 'textarea',
    tag: 'pdx-textarea',
    tier: '1B',
    status: 'wip',
    imports: ['@pdxui/ui/textarea'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'textarea-basic',
            title: 'Textarea — Basic',
            // aria-label → accessible name (the ariaLabel prop is forwarded to the inner <textarea>).
            html: `<pdx-textarea data-test="textarea" aria-label="Message" placeholder="Type your message..."></pdx-textarea>`,
        },
        {
            id: 'textarea-disabled',
            title: 'Textarea — Disabled',
            html: `<pdx-textarea data-test="textarea" aria-label="Disabled message" disabled placeholder="Disabled"></pdx-textarea>`,
        },
        {
            id: 'textarea-error',
            title: 'Textarea — Error',
            html: `<pdx-textarea data-test="textarea" aria-label="Error message" error placeholder="Error state"></pdx-textarea>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, derived from inputs.css) ──
    contracts: {
        scenarios: {
            'textarea-basic': {
                standalone: [
                    {
                        // .pdx-textarea-wrap riusa .pdx-input-wrap: display flex.
                        selector: 'section:not([hidden]) [data-test="textarea"] .pdx-input-wrap',
                        description: 'textarea wrapper is flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // min-height: 4.5em on the textarea → the wrapper is well taller than an input.
                        selector: 'section:not([hidden]) [data-test="textarea"] .pdx-input-wrap',
                        description: 'textarea wrapper height >= 40px (multi-line, taller than input)',
                        height: { op: '>=', value: 40 },
                    },
                    {
                        // The wrapper's border-radius: metro/cyberpunk may zero it → >= 0.
                        selector: 'section:not([hidden]) [data-test="textarea"] .pdx-input-wrap',
                        description: 'textarea wrapper radius >= 0',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        // Inner <textarea>: border:none (the border is on the wrapper).
                        selector: 'section:not([hidden]) [data-test="textarea"] textarea.pdx-input',
                        description: 'inner textarea has no visible own border',
                        border: {
                            top: { style: { op: 'is', value: 'none' } },
                            left: { style: { op: 'is', value: 'none' } },
                            right: { style: { op: 'is', value: 'none' } },
                            bottom: { style: { op: 'is', value: 'none' } },
                        },
                    },
                ],
                composition: [
                    {
                        // The inner textarea must sit inside the wrapper.
                        description: 'inner textarea contained in wrapper',
                        parent: 'body',
                        children: {
                            wrap: '[data-test="textarea"] .pdx-input-wrap',
                            ta: '[data-test="textarea"] textarea.pdx-input',
                        },
                        relations: [
                            {
                                description: 'inner textarea height <= wrapper height',
                                left: 'ta.height',
                                op: '<=',
                                right: 'wrap.height',
                                tolerance: 2,
                            },
                        ],
                    },
                ],
            },
            'textarea-disabled': {
                // Standalone (not a state rule): the textarea is disabled in the markup, so
                // there is no before→after transition; we measure the final state after it settles
                // (robust to the timing with which the .disabled class is applied).
                standalone: [
                    {
                        // .pdx-input-wrap.disabled → opacity: var(--pdx-opacity-disabled) (≈0.5).
                        selector: 'section:not([hidden]) [data-test="textarea"] .pdx-input-wrap',
                        description: 'disabled textarea wrapper has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // The host has aria-label, forwarded to the inner <textarea> → an accessible name. No disableRules.
    a11y: {
        scenarios: ['textarea-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'textarea-basic',
        targets: [
            // A tolerance of 24: the textarea has height:auto (multi-line, content-driven) → under a
            // pathological host that alters line-height/font the height varies by nature. Width/radius stay stable.
            { selector: 'section:not([hidden]) [data-test="textarea"] .pdx-input-wrap', tolerancePx: 24, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }, { issue: 170, properties: ['borderTopColor'], themes: ['material'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // The textarea is a single text control: Tab brings the focus inside the host
    // (onto the inner <textarea>). No roving, no arrows. expectFocusWithin is robust to wrapping.
    keyboard: {
        scenario: 'textarea-basic',
        steps: [
            { key: 'Tab', expectFocusWithin: '[data-test="textarea"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['textarea-basic'],
    },
};

export default textarea;
