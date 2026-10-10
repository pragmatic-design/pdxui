/**
 * MANIFEST — pdx-checkbox-group
 *
 * NEW contracts, derived by inspecting:
 *  - source: packages/ui/src/checkbox-group/pdx-checkbox-group.ts
 *      the HOST <pdx-checkbox-group> → renders `<slot></slot>` (light DOM); in ctx.track():
 *        el.className = 'pdx-choice-group' (+' horizontal' when orientation==='horizontal');
 *        el.setAttribute('role', 'group');  // multi-selection → group, NOT radiogroup
 *        aria-disabled='true' only when disabled.
 *      Note: it does NOT set aria-orientation on role="group" → which is right (no aria-allowed-attr bug).
 *      State (selection) through createSelection({mode:'multiple'}); it passes size/disabled/error
 *      to the <pdx-checkbox> children in rAF. NO focusGroup → every checkbox is tabbable
 *      independently (NOT roving). It emits pdx-change with the selected values. formAssociated.
 *  - source: packages/ui/src/checkbox/pdx-checkbox.ts
 *      render → <label class="pdx-checkbox-wrap [.disabled]"> holding:
 *        - <input type="checkbox" class="pdx-checkbox [.pdx-checkbox-{size}] [.pdx-checkbox-error]">
 *        - <span class="pdx-checkbox-content"> with .pdx-checkbox-label / .pdx-checkbox-desc
 *      The accessible name comes from the `label` prop (the text inside the <label> wrapper).
 *  - CSS: packages/design/src/surfaces/forms.css
 *      .pdx-choice-group → display:flex; flex-direction:column (vertical); gap.
 *      .pdx-choice-group.horizontal → flex-direction:row; flex-wrap:wrap.
 *      .pdx-checkbox → appearance:none; ~1.25rem; cursor:pointer; border 2px;
 *      .pdx-checkbox:disabled → opacity: var(--pdx-opacity-disabled) (< 1); cursor:not-allowed;
 *      .pdx-checkbox-wrap → display:inline-flex; cursor:pointer.
 *      .pdx-checkbox-wrap.disabled → opacity: var(--pdx-opacity-disabled) (< 1).
 *
 * Conservative rules: only invariants true on ALL themes. No exact px value.
 * Radius: metro and cyberpunk may zero it → we accept >= 0 on the checkbox box.
 *
 * Accessibility: every <input type="checkbox"> gets an accessible name from the `label` prop.
 * The group has role="group" and an explicit aria-label. No disableRules.
 *
 * Keyboard: NO focusGroup in the source → pattern 'none'. Tab moves the focus into the
 * group (onto the first checkbox). expectFocusWithin is used (robust to the rAF timing of the
 * disabled/checked propagation) instead of expectFocus on a specific selector.
 */
import type { ComponentManifest } from './_types';

export const checkboxGroup: ComponentManifest = {
    name: 'checkbox-group',
    tag: 'pdx-checkbox-group',
    tier: '1B',
    status: 'wip',
    imports: ['@pdxui/ui/checkbox-group'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'checkbox-group-basic',
            title: 'Checkbox Group — Basic',
            // role="group" + aria-label on the group. Every child has a `label` (its accessible name).
            html: `
                <pdx-checkbox-group data-test="cbg" value="email" aria-label="Notification channels">
                    <pdx-checkbox data-test="cbg-email" value="email" label="Email"></pdx-checkbox>
                    <pdx-checkbox data-test="cbg-sms" value="sms" label="SMS"></pdx-checkbox>
                    <pdx-checkbox data-test="cbg-push" value="push" label="Push"></pdx-checkbox>
                </pdx-checkbox-group>`,
        },
        {
            id: 'checkbox-group-disabled',
            title: 'Checkbox Group — Disabled',
            // disabled on the host → it propagates disabled to every child checkbox.
            html: `
                <pdx-checkbox-group data-test="cbg" value="email" disabled aria-label="Notification channels (disabled)">
                    <pdx-checkbox data-test="cbg-email" value="email" label="Email"></pdx-checkbox>
                    <pdx-checkbox data-test="cbg-sms" value="sms" label="SMS"></pdx-checkbox>
                    <pdx-checkbox data-test="cbg-push" value="push" label="Push"></pdx-checkbox>
                </pdx-checkbox-group>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, derived from forms.css) ──
    contracts: {
        scenarios: {
            'checkbox-group-basic': {
                standalone: [
                    {
                        // .pdx-choice-group → display flex (vertical: column).
                        selector: 'section:not([hidden]) [data-test="cbg"]',
                        description: 'checkbox group is flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // .pdx-checkbox → cursor: pointer (an interactive control).
                        selector: 'section:not([hidden]) [data-test="cbg-email"] input.pdx-checkbox',
                        description: 'checkbox input cursor = pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // appearance:none + ~1.25rem → a square atom, a cautious minimum.
                        selector: 'section:not([hidden]) [data-test="cbg-email"] input.pdx-checkbox',
                        description: 'checkbox input width >= 12px',
                        width: { op: '>=', value: 12 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="cbg-email"] input.pdx-checkbox',
                        description: 'checkbox input height >= 12px',
                        height: { op: '>=', value: 12 },
                    },
                    {
                        // border-radius: metro and cyberpunk may zero it → >= 0.
                        selector: 'section:not([hidden]) [data-test="cbg-email"] input.pdx-checkbox',
                        description: 'checkbox input radius >= 0',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        // A checkbox that is not disabled → opaque.
                        selector: 'section:not([hidden]) [data-test="cbg-email"] input.pdx-checkbox',
                        description: 'checkbox input opacity = 1',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                ],
                composition: [
                    {
                        // The children's checkbox atoms share the layout → the same height.
                        description: 'checkbox group options have consistent height',
                        parent: '[data-test="cbg"]',
                        children: {
                            first: '[data-test="cbg-email"] input.pdx-checkbox',
                            last: '[data-test="cbg-push"] input.pdx-checkbox',
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
                            group: '[data-test="cbg"]',
                            option: '[data-test="cbg-email"] .pdx-checkbox-wrap',
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
            'checkbox-group-disabled': {
                // A standalone rule (NOT a state rule): the host is disabled in the markup and propagates
                // :disabled to its children reactively; we measure the final state after settle (robust to timing).
                standalone: [
                    {
                        // .pdx-checkbox:disabled → opacity: var(--pdx-opacity-disabled) (< 1).
                        selector: 'section:not([hidden]) [data-test="cbg-email"] input.pdx-checkbox',
                        description: 'disabled group checkbox has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // role="group" (NOT radiogroup: it is multi-select) + aria-label. Every checkbox has an accessible
    // name (the `label` prop). The source does NOT set aria-orientation on role="group"
    // → no aria-allowed-attr violation. No disableRules.
    a11y: {
        scenarios: ['checkbox-group-basic', 'checkbox-group-disabled'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'checkbox-group-basic',
        targets: [
            // The target is a single control (a fixed size), not the group (a content-driven flex
            // column: its height is the sum of N items, sensitive to the host's line-height).
            { selector: 'section:not([hidden]) [data-test="cbg-email"] input.pdx-checkbox', tolerancePx: 10, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard (a WAI-ARIA group, multi-select → NOT roving) ──
    // The checkbox-group does NOT use focusGroup: every checkbox is tabbable independently.
    // Tab moves the focus INSIDE the group (the first checkbox). expectFocusWithin: robust to the
    // rAF timing of the disabled/checked propagation.
    keyboard: {
        scenario: 'checkbox-group-basic',
        steps: [
            { key: 'Tab', expectFocusWithin: '[data-test="cbg"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['checkbox-group-basic'],
    },
};

export default checkboxGroup;
