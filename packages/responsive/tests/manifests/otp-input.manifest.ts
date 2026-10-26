/**
 * MANIFEST — pdx-otp-input
 *
 * An input of N cells (PIN/OTP): the host renders `.pdx-otp-container.pdx-otp-wrap`
 * and builds N `input.pdx-otp-cell` elements IMPERATIVELY (one per digit) inside a
 * requestAnimationFrame. The states are the host's custom states, `:state(invalid)` and
 * `:state(disabled)` (#286); the disabled cells get the native `:disabled`.
 *
 * Contracts: the cells share a height and are aligned (composition); the size hierarchy is on the
 * wrapper. No exact px.
 *
 * The `pin-*` scenarios are the masked PIN entry, `<pdx-otp-input mask length="4">`: they were
 * pdx-pin-input's, which was removed for it (#286). Their ids are kept, and with them the visual
 * baselines, which draw the same cells.
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
        {
            id: 'pin-basic',
            title: 'OTP Input — Masked PIN (4 cells)',
            html: `<pdx-otp-input data-test="pin" mask length="4"></pdx-otp-input>`,
        },
        {
            id: 'pin-disabled',
            // A state already in the markup → a standalone rule, NOT a triggered state
            // (the cells are rebuilt in an rAF: a triggered state here would be flaky).
            title: 'OTP Input — Masked PIN, disabled',
            html: `<pdx-otp-input data-test="pin" mask length="4" disabled></pdx-otp-input>`,
        },
        {
            id: 'pin-sizes',
            title: 'OTP Input — Masked PIN, sizes',
            html: `
                <div style="display: flex; flex-direction: column; gap: 16px;">
                    <pdx-otp-input data-test="pin-sm" mask length="4" size="sm"></pdx-otp-input>
                    <pdx-otp-input data-test="pin-md" mask length="4"></pdx-otp-input>
                    <pdx-otp-input data-test="pin-lg" mask length="4" size="lg"></pdx-otp-input>
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
                states: [
                    {
                        description: 'a disabled otp-input is the custom state :state(disabled)',
                        // The tier page holds every scenario, and `otp` is basic's host too.
                        selector: 'section:not([hidden]) [data-test="otp"] [data-part="root"]',
                        trigger: 'attribute',
                        customState: { host: 'section:not([hidden]) [data-test="otp"]', name: 'disabled' },
                        changes: {},
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
                            { description: 'cells share the same height', left: 'first.height', op: '==', right: 'last.height', tolerance: 1 },
                            { description: 'cells aligned on the same top edge', left: 'first.top', op: '==', right: 'last.top', tolerance: 1 },
                            { description: 'first cell contained in wrap', left: 'first', op: 'contained-in', right: 'wrap' },
                            { description: 'last cell contained in wrap', left: 'last', op: 'contained-in', right: 'wrap' },
                            { description: 'last cell right edge does not overflow wrap', left: 'last.right', op: '<=', right: 'wrap.right', tolerance: 1 },
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
    a11y: {
        scenarios: ['otp-input-basic', 'pin-basic'],
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
        scenarios: ['otp-input-basic', 'pin-basic'],
    },
};

export default otpInput;
