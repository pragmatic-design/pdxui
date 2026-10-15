/**
 * MANIFEST — pdx-label
 *
 * NEW contracts (label was not in universal.ts), derived by inspecting:
 *  - source: packages/ui/src/label/pdx-label.ts
 *      render → <label class="pdx-field-label ..."> holding:
 *        - the text prop → text, otherwise <slot>
 *        - for prop → attributo :for
 *        - size → ".pdx-field-label-{size}"
 *        - required → ".pdx-field-required" (CSS ::after content ' *')
 *        - optional → ".pdx-field-optional" (CSS ::after content ' (optional)')
 *        - disabled → ".pdx-field-label-disabled"
 *      + opzionali <span class="pdx-field-description"> e <span class="pdx-field-hint">.
 *      A component that is NOT interactive (it is a text <label>) → no keyboard.
 *  - CSS: packages/design/src/surfaces/forms.css
 *      .pdx-field-label → font-weight: medium; color: var(--pdx-color-text);
 *      .pdx-field-label-disabled → opacity: var(--pdx-opacity-disabled) (< 1); cursor: not-allowed;
 *      .pdx-field-required::after → content: ' *'; color: var(--pdx-color-danger);
 *      .pdx-field-optional::after → content: ' (optional)';
 *
 * Conservative rules: only invariants true on ALL 13 themes. No exact px value.
 *
 * Accessibility: a <label> with text is pure text content; axe does not ask for
 * an associated control for the <label> itself. The scenarios stay correct static
 * markup anyway (no disableRules needed).
 */
import type { ComponentManifest } from './_types';

export const label: ComponentManifest = {
    name: 'label',
    tag: 'pdx-label',
    tier: '1B',
    status: 'wip',
    imports: ['@pdxui/ui/label'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'label-variants',
            title: 'Label — Variants',
            html: `
                <div class="row">
                    <pdx-label data-test="plain" text="Plain label"></pdx-label>
                    <pdx-label data-test="required" text="Email" required></pdx-label>
                    <pdx-label data-test="optional" text="Nickname" optional></pdx-label>
                    <pdx-label data-test="described" text="Password" description="At least 8 characters"></pdx-label>
                </div>`,
        },
        {
            id: 'label-disabled',
            title: 'Label — Disabled',
            html: `<pdx-label data-test="disabled" text="Disabled field" disabled></pdx-label>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, derived from forms.css) ──
    contracts: {
        scenarios: {
            'label-variants': {
                standalone: [
                    {
// the <label> the component renders.
                        selector: '[data-test="plain"] .pdx-field-label',
                        description: 'label is full opacity',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                    {
                        // A text atom: it has a non-zero height.
                        selector: '[data-test="plain"] .pdx-field-label',
                        description: 'label has non-zero height',
                        height: { op: '>=', value: 8 },
                    },
                    {
                        // .pdx-field-label is a <label> → block or inline, depending on the theme and the reset.
                        selector: '[data-test="plain"] .pdx-field-label',
                        description: 'label display is block-ish or inline-ish',
                        display: { op: 'oneOf', value: ['block', 'inline-block', 'inline', 'flex', 'inline-flex'] },
                    },
                    {
                        // The required variant: the class is applied (the asterisk is a ::after, not measurable through a rect).
                        selector: '[data-test="required"] .pdx-field-required',
                        description: 'required label is full opacity',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                    {
                        // The variant with a description: the <span> exists and is opaque.
                        selector: '[data-test="described"] .pdx-field-description',
                        description: 'description text is full opacity',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                ],
                composition: [
                    {
                        // The description sits under the label (smaller, secondary).
                        description: 'description font-size <= label font-size',
                        parent: '[data-test="described"]',
                        children: {
                            lbl: '[data-test="described"] .pdx-field-label',
                            desc: '[data-test="described"] .pdx-field-description',
                        },
                        relations: [
                            {
                                description: 'description below label (top edge lower)',
                                left: 'lbl.top',
                                op: '<=',
                                right: 'desc.top',
                            },
                        ],
                    },
                ],
            },
            'label-disabled': {
                states: [
                    {
                        // .pdx-field-label-disabled → opacity: var(--pdx-opacity-disabled) (< 1).
                        description: 'disabled label has reduced opacity',
                        selector: '[data-test="disabled"] .pdx-field-label',
                        trigger: 'attribute',
                        attribute: { name: 'disabled', value: '' },
                        changes: { opacity: { op: '<', value: 1 } },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // A text <label> is only text: axe requires no associated control.
    a11y: {
        scenarios: ['label-variants', 'label-disabled'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'label-variants',
        targets: [
            // A text atom: a generous tolerance (the font and line-height vary by theme).
            { selector: '[data-test="plain"] .pdx-field-label', tolerancePx: 10 },
        ],
    },

    // ── Dim. 4: keyboard ──
    // A label is NOT interactive: no keyboard pattern. (deliberately omitted)

    // ── Dim. 5: visual regression ──
    visual: {
        scenarios: ['label-variants'],
    },
};

export default label;
