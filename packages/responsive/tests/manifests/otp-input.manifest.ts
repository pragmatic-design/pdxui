/**
 * MANIFEST — pdx-otp-input
 *
 * An input of N cells (PIN/OTP): the host renders `.pdx-otp-container.pdx-otp-wrap`
 * and builds N `input.pdx-otp-cell` elements IMPERATIVELY (one per digit) inside a
 * requestAnimationFrame. The state classes (`error`/`disabled`) are on the wrapper;
 * the disabled cells get the native `:disabled`.
 *
 * Contracts: the cells share a height and are aligned (composition); the size hierarchy is on the
 * wrapper. No exact px.
 *
 * An a11y NOTE: the cells have NO accessible name at all (no aria-label, no
 * <label>) — they are bare <input>s built through the DOM. axe will report "label". It is an a11y
 * BUG: every cell should expose an aria-label like "Digit 1"/"Digit 2"… See the report.
 */
import type { ComponentManifest } from './_types';

export const otpInput: ComponentManifest = {
    name: 'otp-input',
    tag: 'pdx-otp-input',
    tier: '1C',
    status: 'wip',
    imports: ['@pdxui/ui/otp-input'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'otp-input-basic',
            title: 'OTP Input — Basic (6 cells)',
            html: `<pdx-otp-input data-test="otp" length="6"></pdx-otp-input>`,
        },
        {
            id: 'otp-input-disabled',
            title: 'OTP Input — Disabled',
            html: `<pdx-otp-input data-test="otp" length="6" disabled></pdx-otp-input>`,
        },
        {
            id: 'otp-input-sizes',
            title: 'OTP Input — Sizes',
            html: `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <pdx-otp-input data-test="otp-sm" length="4" size="sm"></pdx-otp-input>
                    <pdx-otp-input data-test="otp-md" length="4"></pdx-otp-input>
                    <pdx-otp-input data-test="otp-lg" length="4" size="lg"></pdx-otp-input>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (rules scoped to their scenario) ──
    contracts: {
        scenarios: {
            'otp-input-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="otp"] .pdx-otp-cell:first-of-type',
                        description: 'cell radius >= 0 (mai negativo)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                composition: [
                    {
                        description: 'all cells share the same height and top (aligned row)',
                        parent: '[data-test="otp"] .pdx-otp-wrap',
                        children: {
                            first: '[data-test="otp"] .pdx-otp-cell:first-of-type',
                            last: '[data-test="otp"] .pdx-otp-cell:last-of-type',
                        },
                        relations: [
                            { description: 'first cell height == last cell height', left: 'first.height', op: '==', right: 'last.height', tolerance: 2 },
                            { description: 'cells share the same top (aligned)', left: 'first.top', op: '==', right: 'last.top', tolerance: 2 },
                            { description: 'last cell after first (horizontal row)', left: 'last.left', op: '>', right: 'first.left' },
                        ],
                    },
                    {
                        description: 'cells contained within the wrap',
                        parent: '[data-test="otp"] .pdx-otp-wrap',
                        children: {
                            first: '[data-test="otp"] .pdx-otp-cell:first-of-type',
                            last: '[data-test="otp"] .pdx-otp-cell:last-of-type',
                        },
                        relations: [
                            { description: 'first cell left >= wrap left', left: 'first.left', op: '>=', right: 'parent.left', tolerance: 1 },
                            { description: 'last cell right <= wrap right', left: 'last.right', op: '<=', right: 'parent.right', tolerance: 1 },
                        ],
                    },
                ],
            },
            'otp-input-disabled': {
                standalone: [
                    {
                        // A state already in the markup: a standalone rule (NOT states/trigger) → no flake.
                        selector: 'section:not([hidden]) [data-test="otp"] .pdx-otp-cell:first-of-type',
                        description: 'disabled cell is dimmed (opacity < 1)',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
            'otp-input-sizes': {
                composition: [
                    {
                        description: 'cell size hierarchy: sm < md < lg heights',
                        parent: 'body',
                        children: {
                            sm: '[data-test="otp-sm"] .pdx-otp-cell:first-of-type',
                            md: '[data-test="otp-md"] .pdx-otp-cell:first-of-type',
                            lg: '[data-test="otp-lg"] .pdx-otp-cell:first-of-type',
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
        scenarios: ['otp-input-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'otp-input-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="otp"] .pdx-otp-wrap', tolerancePx: 10 },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        scenario: 'otp-input-basic',
        steps: [
            // Tab lands on the first cell: the focus stays INSIDE the OTP container.
            // (auto-advance and the arrows are tested at the unit and behaviour level, not as geometry.)
            { key: 'Tab', expectFocusWithin: '[data-test="otp"] .pdx-otp-wrap' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['otp-input-basic'],
    },
};

export default otpInput;
