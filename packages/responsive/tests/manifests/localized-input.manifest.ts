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
 *        layout="flag": no tablist; a pdx-dropdown-menu whose trigger, <button data-part="cultureButton"
 *          aria-haspopup="menu">, carries the active culture's decorative pdx-flag, then the panels (#1091).
 *        flags: a decorative <pdx-flag> before the name in each tab and row label.
 *  - CSS: packages/design/src/components/localized-input.css; the fields are the library's .pdx-input.
 *
 * Keyboard: the tablist is one tab stop (roving tabindex); the arrows move the selection.
 */
import type { ComponentManifest } from './_types';

// A flag's module loads after the mount and its image then decodes: ready when every flag of the
// section has a decoded image (#1091).
const WAIT_FLAGS = `await new Promise((r) => { let n = 0; const c = () => { const flags = Array.from(document.querySelectorAll('section:not([hidden]) pdx-flag')); const done = flags.length && flags.every((f) => { const i = f.querySelector('img'); return i && i.complete && i.naturalWidth > 0; }); if (done || n++ > 120) r(); else requestAnimationFrame(c); }; c(); });`;

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
            // #1091: a decorative flag before each culture's name; `en` takes GB from `regions`.
            id: 'localized-input-flags',
            title: 'Localized input — Flags',
            html: `<div style="max-width: 420px;"><pdx-localized-input data-test="loc" label="Product name" flags cultures='["en","it-IT","de-DE"]' regions='{"en":"GB"}' value='{"en":"Desk lamp","it-IT":"Lampada da scrivania"}'></pdx-localized-input></div>`,
            setup: WAIT_FLAGS,
        },
        {
            // #1091: one field, its prefix the active culture's flag, a menu button.
            id: 'localized-input-flag-layout',
            title: 'Localized input — Flag layout',
            html: `<div style="max-width: 420px;"><pdx-localized-input data-test="loc" label="Product name" layout="flag" cultures='["it-IT","de-DE","fr-FR"]' value='{"it-IT":"Lampada da scrivania"}'></pdx-localized-input></div>`,
            setup: WAIT_FLAGS,
        },
        {
            // #1091: `expandable`, the «All languages» button in the field's suffix.
            id: 'localized-input-expandable',
            title: 'Localized input — Expandable',
            html: `<div style="max-width: 420px;"><pdx-localized-input data-test="loc" label="Product name" expandable cultures='["en","it","fr"]' value='{"en":"Desk lamp"}'></pdx-localized-input></div>`,
        },
        {
            // #1091: the dialog the suffix button opens, every culture a labelled field with its flag.
            id: 'localized-input-dialog',
            title: 'Localized input — All languages dialog',
            html: `<div style="max-width: 420px;"><pdx-localized-input data-test="loc" label="Product name" expandable flags cultures='["en-GB","it-IT","de-DE"]' value='{"en-GB":"Desk lamp","it-IT":"Lampada da scrivania"}'></pdx-localized-input></div>`,
            setup: `document.querySelector('section:not([hidden]) [data-test="loc"] [data-part="panel"]:not([hidden]) [data-part="expandButton"]').click(); ${WAIT_FLAGS.replace("section:not([hidden]) pdx-flag", "section:not([hidden]) pdx-dialog pdx-flag")} await new Promise((r) => { let n = 0; const c = () => { const d = document.querySelector('section:not([hidden]) pdx-dialog [data-part="root"]'); if ((d && getComputedStyle(d).opacity === '1') || n++ > 120) r(); else requestAnimationFrame(c); }; c(); });`,
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
            'localized-input-flags': {
                composition: [
                    {
                        // The flag sits on the tab's line, before the name, inside the tab.
                        description: 'a tab\'s flag is inside it and centred on its line',
                        parent: 'body',
                        children: {
                            tab: 'section:not([hidden]) [data-test="loc"] [data-part="tab"][lang="it-IT"]',
                            flag: 'section:not([hidden]) [data-test="loc"] [data-part="tab"][lang="it-IT"] pdx-flag img',
                        },
                        relations: [
                            { description: 'flag within the tab', left: 'flag', op: 'contained-in', right: 'tab', tolerance: 1 },
                            { description: 'flag.centerY == tab.centerY', left: 'flag.centerY', op: '==', right: 'tab.centerY', tolerance: 1 },
                        ],
                    },
                ],
            },
            'localized-input-flag-layout': {
                composition: [
                    {
                        // The prefix is joined to the field: the same height, side by side, and its
                        // flag centred in the field (±0.5px, #1091).
                        description: 'the flag prefix is joined to the field and its flag centred on it',
                        parent: 'body',
                        children: {
                            button: 'section:not([hidden]) [data-test="loc"] [data-part="cultureButton"]',
                            flag: 'section:not([hidden]) [data-test="loc"] [data-part="cultureButton"] pdx-flag img',
                            field: 'section:not([hidden]) [data-test="loc"] [data-part="panel"]:not([hidden]) [data-part="field"]',
                            root: 'section:not([hidden]) [data-test="loc"] [data-part="root"]',
                        },
                        relations: [
                            { description: 'button.top == field.top', left: 'button.top', op: '==', right: 'field.top', tolerance: 0.5 },
                            { description: 'button.bottom == field.bottom', left: 'button.bottom', op: '==', right: 'field.bottom', tolerance: 0.5 },
                            // The field's start border lies over the button's end border (the theme's border
                            // width, 1px or 2px): no gap between them, and the flag is not under the field.
                            { description: 'no gap between the button and the field', left: 'field.left', op: '<=', right: 'button.right', tolerance: 0.5 },
                            { description: 'the field begins after the flag', left: 'field.left', op: '>=', right: 'flag.right' },
                            { description: 'flag.centerY == field.centerY', left: 'flag.centerY', op: '==', right: 'field.centerY', tolerance: 0.5 },
                            { description: 'button and field fill the width', left: 'field.right', op: '==', right: 'root.right', tolerance: 1 },
                        ],
                    },
                ],
            },
            'localized-input-expandable': {
                composition: [
                    {
                        // The suffix is joined to the field: the same height, at its end, and the pair
                        // fills the field's width.
                        description: 'the all-languages button is joined to the field\'s end',
                        parent: 'body',
                        children: {
                            button: 'section:not([hidden]) [data-test="loc"] [data-part="panel"]:not([hidden]) [data-part="expandButton"]',
                            field: 'section:not([hidden]) [data-test="loc"] [data-part="panel"]:not([hidden]) [data-part="field"]',
                            root: 'section:not([hidden]) [data-test="loc"] [data-part="root"]',
                        },
                        relations: [
                            { description: 'button.top == field.top', left: 'button.top', op: '==', right: 'field.top', tolerance: 0.5 },
                            { description: 'button.bottom == field.bottom', left: 'button.bottom', op: '==', right: 'field.bottom', tolerance: 0.5 },
                            { description: 'no gap between the field and the button', left: 'button.left', op: '<=', right: 'field.right', tolerance: 0.5 },
                            { description: 'the button ends where the field\'s row ends', left: 'button.right', op: '==', right: 'root.right', tolerance: 1 },
                        ],
                    },
                ],
                standalone: [
                    {
                        // A target a finger can take (WCAG 2.5.8 asks 24px).
                        selector: 'section:not([hidden]) [data-test="loc"] [data-part="panel"]:not([hidden]) [data-part="expandButton"]',
                        description: 'the all-languages button is at least 24px wide',
                        width: { op: '>=', value: 24 },
                    },
                ],
            },
            'localized-input-dialog': {
                composition: [
                    {
                        // Every culture is in the open dialog, a field each, inside its panel.
                        description: 'the dialog shows every culture\'s field inside its panel',
                        parent: 'body',
                        children: {
                            panel: 'section:not([hidden]) pdx-dialog [data-part="root"]',
                            first: 'section:not([hidden]) pdx-dialog [data-part="field"][lang="en-GB"]',
                            last: 'section:not([hidden]) pdx-dialog [data-part="field"][lang="de-DE"]',
                        },
                        relations: [
                            { description: 'the first culture\'s field is in the dialog', left: 'first', op: 'contained-in', right: 'panel', tolerance: 1 },
                            { description: 'the last culture\'s field is in the dialog', left: 'last', op: 'contained-in', right: 'panel', tolerance: 1 },
                            { description: 'the cultures are stacked', left: 'first.bottom', op: '<=', right: 'last.top' },
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
        scenarios: ['localized-input-tabs', 'localized-input-stacked', 'localized-input-disabled', 'localized-input-flags', 'localized-input-flag-layout', 'localized-input-expandable', 'localized-input-dialog'],
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
        scenarios: ['localized-input-tabs', 'localized-input-stacked', 'localized-input-flags', 'localized-input-flag-layout', 'localized-input-expandable', 'localized-input-dialog'],
        // The dialog is fixed, outside its section: shot as the viewport (#714).
        viewportScenarios: ['localized-input-dialog'],
    },
};

export default localizedInput;
