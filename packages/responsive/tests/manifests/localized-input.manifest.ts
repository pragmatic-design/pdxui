/**
 * MANIFEST — pdx-localized-input (#1024)
 *
 * Derived from:
 *  - source: packages/ui/src/localized-input/pdx-localized-input.pdx
 *      the HOST <pdx-localized-input> :state(incomplete|invalid|disabled|readonly) → an inner
 *        <div class="pdx-localized-input" data-part="root" role="group" aria-label>
 *          <div data-part="tabs" role="tablist"> <button data-part="tab" role="tab" lang aria-selected> × cultures
 *            (a culture with no text: a hidden ", missing" and <span data-part="marker">)
 *          <div data-part="panel" role="tabpanel" [hidden]> <input|textarea class="pdx-input" data-part="field" lang dir> × cultures
 *        layout="stacked": no tablist, every panel a row with the culture's name.
 *  - CSS: packages/design/src/components/localized-input.css; the fields are the library's .pdx-input.
 *
 * Keyboard: the tablist is one tab stop (roving tabindex); the arrows move the selection.
 */
import type { ComponentManifest } from './_types';

export const localizedInput: ComponentManifest = {
    name: 'localized-input',
    tag: 'pdx-localized-input',
    tier: '3C',
    status: 'wip',
    imports: ['@pdxui/ui/localized-input'],

    scenarios: [
        {
            id: 'localized-input-tabs',
            title: 'Localized input — Tabs',
            html: `<div style="max-width: 420px;"><pdx-localized-input data-test="loc" label="Product name" cultures='["en","it","fr"]' value='{"en":"Desk lamp","it":"Lampada da scrivania"}'></pdx-localized-input></div>`,
        },
        {
            id: 'localized-input-stacked',
            title: 'Localized input — Stacked',
            html: `<div style="max-width: 420px;"><pdx-localized-input data-test="loc" label="Description" layout="stacked" multiline cultures='["en","it"]' value='{"en":"A lamp for the desk."}'></pdx-localized-input></div>`,
        },
        {
            id: 'localized-input-disabled',
            title: 'Localized input — Disabled',
            html: `<div style="max-width: 420px;"><pdx-localized-input data-test="loc" label="Product name" disabled cultures='["en","it"]' value='{"en":"Desk lamp"}'></pdx-localized-input></div>`,
        },
    ],

    contracts: {
        scenarios: {
            'localized-input-tabs': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="loc"] [data-part="tabs"]',
                        description: 'the tabs lie in a row',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // A tab is a target a finger can take (WCAG 2.5.8 asks 24px).
                        selector: 'section:not([hidden]) [data-test="loc"] [data-part="tab"]',
                        description: 'a tab is at least 24px tall',
                        height: { op: '>=', value: 24 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="loc"] [data-part="root"]',
                        description: 'an enabled field is opaque',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                ],
                composition: [
                    {
                        description: 'the tabs sit above the field, which takes the width',
                        parent: 'body',
                        children: {
                            tabs: '[data-test="loc"] [data-part="tabs"]',
                            field: '[data-test="loc"] [data-part="panel"]:not([hidden]) [data-part="field"]',
                            root: '[data-test="loc"] [data-part="root"]',
                        },
                        relations: [
                            { description: 'tabs above the field', left: 'tabs.bottom', op: '<=', right: 'field.top' },
                            { description: 'the field fills the width', left: 'field.width', op: '>=', right: 'root.width', tolerance: 2 },
                        ],
                    },
                ],
            },
            'localized-input-disabled': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="loc"] [data-part="root"]',
                        description: 'a disabled field has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ── a tablist with named tabs, each field named "label (language)".
    a11y: {
        scenarios: ['localized-input-tabs', 'localized-input-stacked', 'localized-input-disabled'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'localized-input-tabs',
        targets: [
            { selector: 'section:not([hidden]) [data-test="loc"] [data-part="tabs"]', tolerancePx: 12 },
        ],
    },

    // ── Dim. 4: keyboard ── one tab stop on the selected tab, the arrows move it, Tab reaches the field.
    keyboard: {
        scenario: 'localized-input-tabs',
        steps: [
            { key: 'Tab', expectFocus: '[data-test="loc"] [data-part="tab"][lang="en"]' },
            { key: 'ArrowRight', expectFocus: '[data-test="loc"] [data-part="tab"][lang="it"]' },
            { key: 'Tab', expectFocus: '[data-test="loc"] [data-part="field"][lang="it"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['localized-input-tabs', 'localized-input-stacked'],
    },
};

export default localizedInput;
