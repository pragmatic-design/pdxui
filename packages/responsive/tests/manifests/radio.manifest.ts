/**
 * MANIFEST — pdx-radio (+ pdx-radio-group)
 *
 * Contracts derived by inspecting:
 *  - source: packages/ui/src/radio/pdx-radio.ts
 *      render → <label class="pdx-radio-wrap ..."> holding:
 *        - <input type="radio" class="pdx-radio ..."> (:checked, :disabled, :name, :value, :aria-invalid)
 *        - size → ".pdx-radio-{size}"; error → ".pdx-radio-error"
 *        - labelPosition="left" → ".pdx-radio-label-left"; disabled → wrapper ".disabled"
 *        - <span class="pdx-radio-content"> with .pdx-radio-label and .pdx-radio-desc
 *      An INTERACTIVE component (a native input, focusable). formAssociated.
 *  - source: packages/ui/src/radio-group/pdx-radio-group.ts
 *      el.className = 'pdx-choice-group' (+' horizontal'); role="radiogroup";
 *      aria-orientation; it passes name/size/disabled/error to the <pdx-radio> children.
 *      focusGroup() → arrows + Home/End + wrap (roving) over the <pdx-radio>s.
 *  - CSS: packages/design/src/surfaces/forms.css
 *      .pdx-radio → appearance:none; width/height 1.25rem; border-radius:50%; cursor:pointer;
 *                   border: 2px solid var(--pdx-color-border-strong);
 *      .pdx-radio:disabled → opacity: var(--pdx-opacity-disabled) (< 1); cursor: not-allowed;
 *      .pdx-radio-wrap → display:inline-flex; cursor:pointer;
 *      .pdx-radio-wrap.disabled → opacity: var(--pdx-opacity-disabled) (< 1);
 *      .pdx-choice-group → display:flex; flex-direction:column (vertical).
 *
 * Conservative rules: only invariants true on ALL 13 themes. No exact px value.
 * Radius: metro and cyberpunk may zero it → we accept >= 0 on the wrapper; for the
 * radio's circle (border-radius:50%) we stay cautious with radius >= 2 on the input.
 *
 * Accessibility (IT MATTERS MOST): every standalone <input type="radio"> gets an accessible
 * name from the `label` prop (the text in the <label> that wraps the input). The
 * radio-group exposes role="radiogroup"; it is given an explicit aria-label. No
 * disableRules: the scenarios are accessible by design.
 */
import type { ComponentManifest } from './_types';

export const radio: ComponentManifest = {
    name: 'radio',
    tag: 'pdx-radio',
    tier: '1B',
    status: 'wip',
    imports: ['@pdxui/ui/radio'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'radio-basic',
            title: 'Radio — Basic',
            // Every radio has a `label` → the input is wrapped in a <label> whose text is its accessible name.
            // Its own name: with name="plan" the radio-group scenarios on the same page would join this
            // native group and uncheck "Pro plan" — the Dim 5 baseline would show both empty.
            html: `
                <div class="row">
                    <pdx-radio data-test="radio-off" name="billing" value="free" label="Free plan"></pdx-radio>
                    <pdx-radio data-test="radio-on" name="billing" value="pro" label="Pro plan" checked></pdx-radio>
                </div>`,
        },
        {
            id: 'radio-group',
            title: 'Radio — Group',
            // role="radiogroup" + aria-label on the group. The children have a `label` (their accessible name).
            html: `
                <pdx-radio-group data-test="rg" name="size" value="m" aria-label="T-shirt size">
                    <pdx-radio data-test="rg-s" value="s" label="Small"></pdx-radio>
                    <pdx-radio data-test="rg-m" value="m" label="Medium"></pdx-radio>
                    <pdx-radio data-test="rg-l" value="l" label="Large"></pdx-radio>
                </pdx-radio-group>`,
        },
        {
            id: 'radio-disabled',
            title: 'Radio — Disabled',
            html: `<pdx-radio data-test="radio-disabled" name="opt" value="x" label="Disabled option" disabled></pdx-radio>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, derived from forms.css) ──
    contracts: {
        scenarios: {
            'radio-basic': {
                standalone: [
                    {
                        // .pdx-radio → cursor: pointer (an interactive control).
                        selector: '[data-test="radio-off"] input.pdx-radio',
                        description: 'radio input cursor = pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // appearance:none + width/height 1.25rem → a square atom, a cautious minimum.
                        selector: '[data-test="radio-off"] input.pdx-radio',
                        description: 'radio input width >= 12px',
                        width: { op: '>=', value: 12 },
                    },
                    {
                        selector: '[data-test="radio-off"] input.pdx-radio',
                        description: 'radio input height >= 12px',
                        height: { op: '>=', value: 12 },
                    },
                    {
                        // border-radius: 50% → a circle. Cautiously: >= 2px (metro and cyberpunk do not zero a 50%, since it is relative, but we stay conservative).
                        selector: '[data-test="radio-off"] input.pdx-radio',
                        description: 'radio input has rounded corners (radius >= 2px)',
                        radius: { all: { op: '>=', value: 2 } },
                    },
                    {
                        // A radio that is not disabled: opaque.
                        selector: '[data-test="radio-off"] input.pdx-radio',
                        description: 'radio input opacity = 1',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                    {
                        // .pdx-radio-wrap → display: inline-flex (the <label> wrapper).
                        selector: '[data-test="radio-off"] .pdx-radio-wrap',
                        description: 'radio wrapper is inline-flex or flex',
                        display: { op: 'oneOf', value: ['inline-flex', 'flex'] },
                    },
                ],
                composition: [
                    {
                        // The input must sit INSIDE the <label> wrapper.
                        description: 'radio input contained in wrapper',
                        parent: 'body',
                        children: {
                            wrap: '[data-test="radio-off"] .pdx-radio-wrap',
                            input: '[data-test="radio-off"] input.pdx-radio',
                        },
                        relations: [
                            {
                                description: 'input height <= wrapper height',
                                left: 'input.height',
                                op: '<=',
                                right: 'wrap.height',
                            },
                        ],
                    },
                ],
                // Note: no state rule for "checked": the radio is already checked in the markup,
                // so there is no before→after transition to measure (mustDiffer does not apply
                // to a pre-existing state). The checked style is checked by eye (the visual dimension).
            },
            'radio-group': {
                standalone: [
                    {
                        // pdx-radio-group → display flex (vertical: column).
                        selector: '[data-test="rg"]',
                        description: 'radio group is flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                ],
            },
            'radio-disabled': {
                states: [
                    {
                        // .pdx-radio:disabled → opacity: var(--pdx-opacity-disabled) (< 1).
                        description: 'disabled radio input has reduced opacity',
                        selector: '[data-test="radio-disabled"] input.pdx-radio',
                        trigger: 'attribute',
                        attribute: { name: 'disabled', value: '' },
                        changes: { opacity: { op: '<', value: 1 } },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // Every input has an accessible name (the `label` prop → the text in the <label> wrapper).
    // The group has role="radiogroup" + aria-label. No disableRules.
    a11y: {
        scenarios: ['radio-basic', 'radio-group', 'radio-disabled'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'radio-basic',
        targets: [
            // A tiny atom: a generous tolerance against pathological host CSS.
            { selector: '[data-test="radio-off"] input.pdx-radio', tolerancePx: 10 },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA radiogroup) ──
    // Note: no keyboard here — the group's arrows are covered by radio-group.manifest.ts.
    // Radios sharing a `name` use the browser's native group (one tab stop, arrows that
    // select); pdx-radio-group adds no focusGroup on top.

    // ── Dim. 5: visual regression ──
    visual: {
        scenarios: ['radio-basic'],
    },
};

export default radio;
