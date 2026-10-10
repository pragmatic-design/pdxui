/**
 * MANIFEST — pdx-pin-input
 *
 * Contracts written by inspecting the source and the CSS:
 *  - packages/ui/src/pin-input/pdx-pin-input.ts  → a thin wrapper over pdx-otp-input with a mask
 *  - packages/ui/src/otp-input/pdx-otp-input.ts   → the cells built imperatively
 *  - packages/design/src/surfaces/inputs.css (the .pdx-otp-* block)
 *
 * DOM structure (host vs inner):
 *   <pdx-pin-input>                              ← HOST (data-test)
 *     render: <pdx-otp-input mask ...>           ← inner CE
 *       render: <div class="pdx-otp-container pdx-otp-wrap"> ← wrapper celle (inline-flex)
 *         <input class="pdx-otp-cell" type="password"> × length
 * The visual classes (.pdx-otp-wrap, .error, .disabled, .pdx-otp-sm/-lg) are on the wrapper.
 * The measurable cells are the <input.pdx-otp-cell> elements. A PIN IS a masked OTP (● dots).
 *
 * Geometria base (.pdx-otp-cell): width/height 2.5rem (sm 2rem, lg 3rem), border solid,
 * radius md, font mono. Conservativi cross-tema: radius >= 0 (metro/cyberpunk azzerano),
 * border width >= 0, no exact px.
 *
 * ⚠ An A11Y BUG (reported): the <input> cells are built with no aria-label, no <label> and no accessible
 * name (see pdx-otp-input.ts: only className/type/inputMode/maxLength/autocomplete).
 * axe will flag it (label / aria-input-field-name). The contract does NOT mask it: a11y stays on.
 */
import type { ComponentManifest } from './_types';

export const pinInput: ComponentManifest = {
    name: 'pin-input',
    tag: 'pdx-pin-input',
    tier: '1C',
    status: 'wip',
    imports: ['@pdxui/ui/pin-input'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'pin-basic',
            title: 'PIN Input — Basic (4 cells, masked)',
            html: `<pdx-pin-input data-test="pin" length="4"></pdx-pin-input>`,
        },
        {
            id: 'pin-disabled',
            // A state already in the markup → a standalone rule, NOT a triggered state
            // (the reactive .disabled class is applied in an rAF: using states here would be flaky).
            title: 'PIN Input — Disabled',
            html: `<pdx-pin-input data-test="pin" length="4" disabled></pdx-pin-input>`,
        },
        {
            id: 'pin-sizes',
            title: 'PIN Input — Sizes',
            html: `
                <div style="display: flex; flex-direction: column; gap: 16px;">
                    <pdx-pin-input data-test="pin-sm" length="4" size="sm"></pdx-pin-input>
                    <pdx-pin-input data-test="pin-md" length="4"></pdx-pin-input>
                    <pdx-pin-input data-test="pin-lg" length="4" size="lg"></pdx-pin-input>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'pin-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="pin"] .pdx-otp-wrap',
                        description: 'pin wrapper is an inline-flex / flex row',
                        display: { op: 'oneOf', value: ['inline-flex', 'flex'] },
                    },
                    {
                        // The first cell must have a sensible height (≈ 2.5rem = 40px,
                        // sm/dense go lower: a conservative threshold aligned with button/input).
                        selector: 'section:not([hidden]) [data-test="pin"] .pdx-otp-cell',
                        description: 'pin cell height >= 28px',
                        height: { op: '>=', value: 28 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="pin"] .pdx-otp-cell',
                        description: 'pin cell has non-negative border radius (metro/cyberpunk may zero it)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="pin"] .pdx-otp-cell',
                        description: 'pin cell border width is non-negative',
                        border: { all: { width: { op: '>=', value: 0 } } },
                    },
                ],
                // Composition: the cells are aligned on the same row (the same height,
                // the same top) and contained in the wrapper.
                composition: [
                    {
                        description: 'pin cells share row geometry and are contained in the wrap',
                        parent: 'section:not([hidden]) [data-test="pin"] .pdx-otp-wrap',
                        children: {
                            wrap: 'section:not([hidden]) [data-test="pin"] .pdx-otp-wrap',
                            // The first and the last cell are measured (stable positional selectors).
                            first: 'section:not([hidden]) [data-test="pin"] .pdx-otp-cell:first-of-type',
                            last: 'section:not([hidden]) [data-test="pin"] .pdx-otp-cell:last-of-type',
                        },
                        relations: [
                            {
                                description: 'cells share the same height',
                                left: 'first.height',
                                op: '==',
                                right: 'last.height',
                                tolerance: 1,
                            },
                            {
                                description: 'cells aligned on the same top edge',
                                left: 'first.top',
                                op: '==',
                                right: 'last.top',
                                tolerance: 1,
                            },
                            {
                                description: 'first cell contained in wrap',
                                left: 'first',
                                op: 'contained-in',
                                right: 'wrap',
                            },
                            {
                                description: 'last cell contained in wrap',
                                left: 'last',
                                op: 'contained-in',
                                right: 'wrap',
                            },
                            {
                                description: 'last cell right edge does not overflow wrap',
                                left: 'last.right',
                                op: '<=',
                                right: 'wrap.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
            'pin-disabled': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="pin"] .pdx-otp-cell',
                        description: 'disabled pin cell has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="pin"] .pdx-otp-cell',
                        description: 'disabled pin cell has not-allowed cursor',
                        cursor: { op: 'is', value: 'not-allowed' },
                    },
                ],
            },
            'pin-sizes': {
                composition: [
                    {
                        description: 'size hierarchy: sm < md < lg cell heights',
                        parent: 'body',
                        children: {
                            sm: '[data-test="pin-sm"] .pdx-otp-cell:first-of-type',
                            md: '[data-test="pin-md"] .pdx-otp-cell:first-of-type',
                            lg: '[data-test="pin-lg"] .pdx-otp-cell:first-of-type',
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
    // NO disableRules: axe is expected to flag the missing accessible name on the
    // cells (a real a11y BUG). The test must stay red until the source adds an
    // aria-label per cell ("Digit 1 of 4", say).
    a11y: {
        scenarios: ['pin-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'pin-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="pin"] .pdx-otp-cell:first-of-type', tolerancePx: 6, leaks: [{ issue: 170, properties: ['lineHeight', 'letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // The cells are native <input>s: Tab enters the group. No composite roving pattern
    // (auto-advance, Backspace and the arrows are tested at the behaviour and unit level). Here: Tab → the focus inside.
    keyboard: {
        scenario: 'pin-basic',
        steps: [
            { key: 'Tab', expectFocusWithin: 'section:not([hidden]) [data-test="pin"] .pdx-otp-wrap' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['pin-basic'],
    },
};

export default pinInput;
