/**
 * MANIFEST — pdx-radio-group
 *
 * NEW contracts, derived by inspecting:
 *  - source: packages/ui/src/radio-group/pdx-radio-group.ts
 *      the HOST <pdx-radio-group> → renders `<slot></slot>` (light DOM); in ctx.track():
 *        el.className = 'pdx-choice-group' (+' horizontal' when orientation==='horizontal');
 *        el.setAttribute('role', 'radiogroup');     // single-select → radiogroup
 *        el.setAttribute('aria-orientation', orient); // VALID on role="radiogroup"
 *        aria-disabled='true' only when disabled.
 *      No focusGroup: the radios share one `name`, and the browser's native radio group
 *      gives the tab stop and the arrows. It passes name/size/disabled/error/
 *      checked to the children in an rAF. It emits pdx-change once per choice. formAssociated.
 *  - source: packages/ui/src/radio/pdx-radio.ts
 *      render → <label class="pdx-radio-wrap [.disabled]"> holding:
 *        - <input type="radio" class="pdx-radio [.pdx-radio-{size}] [.pdx-radio-error]">
 *        - <span class="pdx-radio-content"> with .pdx-radio-label / .pdx-radio-desc
 *      The accessible name comes from the `label` prop (the text inside the <label> wrapper).
 *  - CSS: packages/design/src/surfaces/forms.css
 *      .pdx-choice-group → display:flex; flex-direction:column (vertical); gap.
 *      .pdx-choice-group.horizontal → flex-direction:row; flex-wrap:wrap.
 *      .pdx-radio → appearance:none; ~1.25rem; border-radius:50%; cursor:pointer; border 2px;
 *      .pdx-radio:disabled → opacity: var(--pdx-opacity-disabled) (< 1); cursor:not-allowed;
 *      .pdx-radio-wrap → display:inline-flex; cursor:pointer.
 *      .pdx-radio-wrap.disabled → opacity: var(--pdx-opacity-disabled) (< 1).
 *
 * Conservative rules: only invariants true on ALL themes. No exact px value.
 * Radius: border-radius:50% is relative → we stay cautious with >= 2 on the radio input.
 *
 * Accessibility: every <input type="radio"> gets an accessible name from the `label` prop.
 * The group has role="radiogroup" plus an explicit aria-label; aria-orientation is allowed on a
 * radiogroup → no aria-allowed-attr violation. No disableRules.
 *
 * Keyboard: native radio group. Tab lands on the checked radio, the arrows move and check.
 * The steps name the radio they expect (see Dim. 4 below).
 */
import type { ComponentManifest } from './_types';

export const radioGroup: ComponentManifest = {
    name: 'radio-group',
    tag: 'pdx-radio-group',
    tier: '1B',
    status: 'wip',
    imports: ['@pdxui/ui/radio-group'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'radio-group-basic',
            title: 'Radio Group — Basic',
            // role="radiogroup" + aria-label on the group. Every child has a `label` (its accessible name).
            html: `
                <pdx-radio-group data-test="rg" name="plan" value="pro" aria-label="Subscription plan">
                    <pdx-radio data-test="rg-free" value="free" label="Free"></pdx-radio>
                    <pdx-radio data-test="rg-pro" value="pro" label="Pro"></pdx-radio>
                    <pdx-radio data-test="rg-team" value="team" label="Team"></pdx-radio>
                </pdx-radio-group>`,
        },
        {
            id: 'radio-group-disabled',
            title: 'Radio Group — Disabled',
            // disabled on the host → it propagates disabled to every child radio.
            // Its own name: with name="plan" it would be one native group with radio-group-basic, and its
            // "Pro", checked last, would leave the basic scenario with nothing checked.
            html: `
                <pdx-radio-group data-test="rg" name="plan-locked" value="pro" disabled aria-label="Subscription plan (disabled)">
                    <pdx-radio data-test="rg-free" value="free" label="Free"></pdx-radio>
                    <pdx-radio data-test="rg-pro" value="pro" label="Pro"></pdx-radio>
                    <pdx-radio data-test="rg-team" value="team" label="Team"></pdx-radio>
                </pdx-radio-group>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, derived from forms.css) ──
    contracts: {
        scenarios: {
            'radio-group-basic': {
                standalone: [
                    {
                        // .pdx-choice-group → display flex (vertical: column).
                        selector: 'section:not([hidden]) [data-test="rg"]',
                        description: 'radio group is flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // .pdx-radio → cursor: pointer (an interactive control).
                        selector: 'section:not([hidden]) [data-test="rg-free"] input.pdx-radio',
                        description: 'radio input cursor = pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // appearance:none + ~1.25rem → a square atom, a cautious minimum.
                        selector: 'section:not([hidden]) [data-test="rg-free"] input.pdx-radio',
                        description: 'radio input width >= 12px',
                        width: { op: '>=', value: 12 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="rg-free"] input.pdx-radio',
                        description: 'radio input height >= 12px',
                        height: { op: '>=', value: 12 },
                    },
                    {
                        // border-radius: 50% → a circle. Cautious: >= 2px.
                        selector: 'section:not([hidden]) [data-test="rg-free"] input.pdx-radio',
                        description: 'radio input has rounded corners (radius >= 2px)',
                        radius: { all: { op: '>=', value: 2 } },
                    },
                    {
                        // A radio that is not disabled → opaque.
                        selector: 'section:not([hidden]) [data-test="rg-free"] input.pdx-radio',
                        description: 'radio input opacity = 1',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                ],
                composition: [
                    {
                        // The children's radio atoms share the layout → the same height.
                        description: 'radio group options have consistent height',
                        parent: '[data-test="rg"]',
                        children: {
                            first: '[data-test="rg-free"] input.pdx-radio',
                            last: '[data-test="rg-team"] input.pdx-radio',
                        },
                        relations: [
                            {
                                description: 'first and last option same height',
                                left: 'first.height',
                                op: '==',
                                right: 'last.height',
                                tolerance: 4,
                            },
                        ],
                    },
                    {
                        // The options must be contained in the group (no vertical overflow).
                        description: 'option contained in group',
                        parent: 'body',
                        children: {
                            group: '[data-test="rg"]',
                            option: '[data-test="rg-free"] .pdx-radio-wrap',
                        },
                        relations: [
                            {
                                description: 'option height <= group height',
                                left: 'option.height',
                                op: '<=',
                                right: 'group.height',
                                tolerance: 2,
                            },
                        ],
                    },
                ],
            },
            'radio-group-disabled': {
                // A standalone rule (NOT a state rule): the host is disabled in the markup and propagates
                // :disabled to its children reactively; we measure the final state after settle (robust to timing).
                standalone: [
                    {
                        // .pdx-radio:disabled → opacity: var(--pdx-opacity-disabled) (< 1).
                        selector: 'section:not([hidden]) [data-test="rg-free"] input.pdx-radio',
                        description: 'disabled group radio has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // role="radiogroup" + aria-label. aria-orientation IS allowed on a radiogroup → no
    // aria-allowed-attr violation. Every radio has an accessible name (the `label` prop). No disableRules.
    a11y: {
        scenarios: ['radio-group-basic', 'radio-group-disabled'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'radio-group-basic',
        targets: [
            // The target is a single control (a fixed size), not the group (a content-driven flex
            // column: its height is the sum of N items, sensitive to the host's line-height).
            { selector: 'section:not([hidden]) [data-test="rg-free"] input.pdx-radio', tolerancePx: 10 },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA radiogroup) ──
    // The radios share a `name`: the browser's native group gives one tab stop (the selected
    // radio) and arrows that move AND select. The assertions name the radio expected:
    // «the focus is still in the group» would let an arrow that goes back to the first one pass.
    keyboard: {
        scenario: 'radio-group-basic',
        steps: [
            { key: 'Tab', expectFocus: '[data-test="rg-pro"] input.pdx-radio' },
            { key: 'ArrowDown', expectFocus: '[data-test="rg-team"] input.pdx-radio' },
            { key: 'ArrowUp', expectFocus: '[data-test="rg-pro"] input.pdx-radio' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['radio-group-basic'],
    },
};

export default radioGroup;
