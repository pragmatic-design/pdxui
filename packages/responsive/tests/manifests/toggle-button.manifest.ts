/**
 * MANIFEST — pdx-toggle (the toggle button element)
 *
 * toggle.manifest.ts certifies the CSS switch `input.pdx-toggle` under pdx-switch; this one certifies
 * the element #286 brought to the beta contract, whose buttons pdx-button's removed toggle mode
 * becomes (#291).
 *
 * Source: packages/ui/src/toggle/pdx-toggle.ts
 *   HOST <pdx-toggle variant="outline|ghost|solid">  :state(pressed), :state(disabled)
 *     └── <button class="pdx-toggle-btn" data-part="root" aria-pressed="true|false">
 * CSS: packages/design/src/components/toggle.css, generated from variant-sources: each variant keyed on
 * the host's `variant`, its pressed look on the button's aria-pressed.
 *
 * Contracts: the buttons share a row and a height; a pressed solid toggle fills with the primary; a
 * disabled one is dimmed. No exact px.
 */
import type { ComponentManifest } from './_types';

const PAIR = (variant: string, key: string) => `
    <pdx-toggle data-test="${key}-off" variant="${variant}">${variant}</pdx-toggle>
    <pdx-toggle data-test="${key}-on" variant="${variant}" pressed>${variant}</pdx-toggle>`;

export const toggleButton: ComponentManifest = {
    name: 'toggle-button',
    tag: 'pdx-toggle',
    tier: '1B',
    status: 'wip',
    imports: ['@pdxui/ui/toggle'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'toggle-button-variants',
            title: 'Toggle button — outline, ghost and solid, off and pressed',
            html: `
                <div style="display: flex; gap: 8px; align-items: center;">
                    ${PAIR('outline', 'o')}${PAIR('ghost', 'g')}${PAIR('solid', 's')}
                </div>`,
        },
        {
            id: 'toggle-button-disabled',
            title: 'Toggle button — disabled, off and pressed',
            html: `
                <div style="display: flex; gap: 8px; align-items: center;">
                    <pdx-toggle data-test="d-off" disabled>Off</pdx-toggle>
                    <pdx-toggle data-test="d-on" disabled pressed>On</pdx-toggle>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'toggle-button-variants': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="o-off"] [data-part="root"]',
                        description: 'a toggle is a usable target (height >= 28px)',
                        height: { op: '>=', value: 28 },
                    },
                ],
                composition: [
                    {
                        description: 'the toggles share a row and a height',
                        parent: 'section:not([hidden])',
                        children: {
                            first: 'section:not([hidden]) [data-test="o-off"] [data-part="root"]',
                            last: 'section:not([hidden]) [data-test="s-on"] [data-part="root"]',
                        },
                        relations: [
                            { description: 'same height, off and pressed', left: 'first.height', op: '==', right: 'last.height', tolerance: 2 },
                            { description: 'same top (one row)', left: 'first.top', op: '==', right: 'last.top', tolerance: 2 },
                        ],
                    },
                ],
                states: [
                    {
                        description: 'a pressed toggle is the custom state :state(pressed), its button aria-pressed',
                        selector: 'section:not([hidden]) [data-test="s-on"] [data-part="root"]',
                        trigger: 'attribute',
                        customState: { host: 'section:not([hidden]) [data-test="s-on"]', name: 'pressed' },
                        changes: {},
                    },
                ],
            },
            'toggle-button-disabled': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="d-off"] [data-part="root"]',
                        description: 'a disabled toggle is dimmed (opacity < 1)',
                        opacity: { op: '<', value: 1 },
                    },
                ],
                states: [
                    {
                        description: 'a disabled toggle is the custom state :state(disabled)',
                        selector: 'section:not([hidden]) [data-test="d-off"] [data-part="root"]',
                        trigger: 'attribute',
                        customState: { host: 'section:not([hidden]) [data-test="d-off"]', name: 'disabled' },
                        changes: {},
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // Each toggle is a <button> named by its text, its state in aria-pressed.
    a11y: {
        scenarios: ['toggle-button-variants', 'toggle-button-disabled'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'toggle-button-variants',
        targets: [
            { selector: 'section:not([hidden]) [data-test="o-off"] [data-part="root"]', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // A native button: Tab reaches it, Space presses it.
    keyboard: {
        scenario: 'toggle-button-variants',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="o-off"] [data-part="root"]' },
            { key: 'Space', expectAttr: { selector: 'section:not([hidden]) [data-test="o-off"] [data-part="root"]', name: 'aria-pressed', value: 'true' } },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['toggle-button-variants', 'toggle-button-disabled'],
    },
};

export default toggleButton;
