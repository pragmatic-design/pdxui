/**
 * MANIFEST — pdx-number-input
 *
 * The mathematical contracts reproduce the ones already validated in contracts/universal.ts
 * (the component: 'number-input-both' and component: 'number-input-sizes' blocks).
 * Parity was guaranteed while migrating away from the monolith.
 */
import type { ComponentManifest } from './_types';

export const numberInput: ComponentManifest = {
    name: 'number-input',
    tag: 'pdx-number-input',
    tier: '1C',
    status: 'wip',
    imports: ['@pdxui/ui/number-input'],

// ── Scenarios (markup taken from the component-contracts.html monolith) ──
    scenarios: [
        {
            id: 'number-input-both',
            title: 'Number Input — Both Controls',
            // aria-label: in real use the accessible name comes from <pdx-form-field>;
            // on its own it must be declared, for a fair a11y test (axe's "label" rule).
            html: `<pdx-number-input data-test="number-both" value="42" controls="both" aria-label="Quantity"></pdx-number-input>`,
        },
        {
            id: 'number-input-right',
            title: 'Number Input — Right Stack',
            html: `<pdx-number-input data-test="number-right" value="42" controls="right"></pdx-number-input>`,
        },
        {
            // colorBySign colours the value (its CSS rule must win on specificity), and a
            // negative number's sign reaches a screen reader.
            id: 'number-input-sign',
            title: 'Number Input — Colored by sign',
            html: `
                <div style="display: flex; flex-direction: column; gap: 12px; max-width: 300px;">
                    <pdx-number-input data-test="number-neg" value="-75.5" precision="2" allow-negative color-by-sign aria-label="Balance"></pdx-number-input>
                    <pdx-number-input data-test="number-pos" value="75.5" precision="2" allow-negative color-by-sign aria-label="Credit"></pdx-number-input>
                </div>`,
        },
        {
            // With a min and a max, Home and End go to the ends; PageUp and PageDown take ten steps.
            // controls="right": the input is the first Tab stop (with "both" the − button is).
            id: 'number-input-range',
            title: 'Number Input — Range keys',
            html: `<pdx-number-input data-test="number-range" value="42" min="0" max="100" controls="right" aria-label="Quantity"></pdx-number-input>`,
        },
        {
            // step-mode="caret", with the steppers shown — the arrows step the digit before
            // the caret, and the caret stays on it. Measured with real keys by number-input-caret.spec.ts.
            id: 'number-input-caret',
            title: 'Number Input — Caret step mode',
            html: `<pdx-number-input data-test="number-caret" value="99" step-mode="caret" controls="right" locale="en-US" aria-label="Amount"></pdx-number-input>`,
        },
        {
            // Its frame is the group's `field` part, not the host's child: before #286 the
            // disabled class sat on the group, where no rule drew it, and the field looked enabled.
            id: 'number-input-disabled',
            title: 'Number Input — Disabled',
            html: `<pdx-number-input data-test="number-off" value="42" disabled aria-label="Quantity"></pdx-number-input>`,
        },
        {
            id: 'number-input-sizes',
            title: 'Number Input — Sizes',
            html: `
                <div style="display: flex; flex-direction: column; gap: 12px; max-width: 300px;">
                    <pdx-number-input data-test="number-sm" value="10" size="sm"></pdx-number-input>
                    <pdx-number-input data-test="number-md" value="20"></pdx-number-input>
                    <pdx-number-input data-test="number-lg" value="30" size="lg"></pdx-number-input>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (rules scoped to their scenario) ──
    contracts: {
        scenarios: {
            'number-input-both': {
                composition: [
                    {
                        description: 'stepper buttons same height as input',
                        parent: '[data-test="number-both"] [data-part="root"]',
                        children: {
                            input: '[data-test="number-both"] [data-part="field"]',
                            decBtn: '[data-test="number-both"] [data-part="decrement"]',
                            incBtn: '[data-test="number-both"] [data-part="increment"]',
                        },
                        relations: [
                            {
                                description: 'dec button height == input height',
                                left: 'decBtn.height',
                                op: '==',
                                right: 'input.height',
                                tolerance: 2,
                            },
                            {
                                description: 'inc button height == input height',
                                left: 'incBtn.height',
                                op: '==',
                                right: 'input.height',
                                tolerance: 2,
                            },
                        ],
                    },
                    {
                        description: 'elements contained in group',
                        parent: '[data-test="number-both"] [data-part="root"]',
                        children: {
                            decBtn: '[data-test="number-both"] [data-part="decrement"]',
                            incBtn: '[data-test="number-both"] [data-part="increment"]',
                        },
                        relations: [
                            {
                                description: 'dec left >= group left',
                                left: 'decBtn.left',
                                op: '>=',
                                right: 'parent.left',
                                tolerance: 1,
                            },
                            {
                                description: 'inc right <= group right',
                                left: 'incBtn.right',
                                op: '<=',
                                right: 'parent.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
            'number-input-sign': {
                standalone: [
                    {
                        selector: '[data-test="number-neg"] [data-part="input"]',
                        description: 'colorBySign: a negative number is in the danger ink',
                        colorVar: '--pdx-color-danger-ink',
                    },
                    {
                        selector: '[data-test="number-pos"] [data-part="input"]',
                        description: 'colorBySign: a positive number is in the success ink',
                        colorVar: '--pdx-color-success-ink',
                    },
                ],
                states: [
                    {
                        description: 'a negative number is the custom state :state(negative)',
                        selector: '[data-test="number-neg"] [data-part="field"]',
                        trigger: 'attribute',
                        customState: { host: '[data-test="number-neg"]', name: 'negative' },
                        changes: {},
                    },
                    {
                        description: 'a positive number is the custom state :state(positive)',
                        selector: '[data-test="number-pos"] [data-part="field"]',
                        trigger: 'attribute',
                        customState: { host: '[data-test="number-pos"]', name: 'positive' },
                        changes: {},
                    },
                ],
            },
            'number-input-disabled': {
                standalone: [
                    {
                        selector: '[data-test="number-off"] [data-part="field"]',
                        description: 'a disabled field is dimmed (opacity < 1)',
                        opacity: { op: '<', value: 1 },
                    },
                ],
                states: [
                    {
                        description: 'disabled is the custom state :state(disabled)',
                        selector: '[data-test="number-off"] [data-part="field"]',
                        trigger: 'attribute',
                        customState: { host: '[data-test="number-off"]', name: 'disabled' },
                        changes: { cursor: { op: 'is', value: 'not-allowed' } },
                    },
                ],
            },
            'number-input-sizes': {
                composition: [
                    {
                        description: 'number input size hierarchy: sm < md < lg',
                        parent: 'body',
                        children: {
                            sm: '[data-test="number-sm"] [data-part="root"]',
                            md: '[data-test="number-md"] [data-part="root"]',
                            lg: '[data-test="number-lg"] [data-part="root"]',
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
        scenarios: ['number-input-both', 'number-input-sign'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'number-input-both',
        targets: [
            { selector: '[data-test="number-both"] [data-part="field"]', tolerancePx: 6 },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // The APG spinbutton's keys: PageUp/PageDown ten steps, End/Home to the max/min.
    // aria-valuenow is the number, not the formatted string, which carries no sign.
    keyboard: {
        scenario: 'number-input-range',
        steps: [
            { key: 'Tab', expectFocus: '[data-test="number-range"] [data-part="input"]' },
            { key: 'PageUp', expectAttr: { selector: '[data-test="number-range"] [data-part="input"]', name: 'aria-valuenow', value: '52' } },
            { key: 'End', expectAttr: { selector: '[data-test="number-range"] [data-part="input"]', name: 'aria-valuenow', value: '100' } },
            { key: 'Home', expectAttr: { selector: '[data-test="number-range"] [data-part="input"]', name: 'aria-valuenow', value: '0' } },
            { key: 'ArrowUp', expectAttr: { selector: '[data-test="number-range"] [data-part="input"]', name: 'aria-valuenow', value: '1' } },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['number-input-both'],
    },
};

export default numberInput;
