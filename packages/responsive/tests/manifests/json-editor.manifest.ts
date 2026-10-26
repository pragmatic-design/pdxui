/**
 * MANIFEST — pdx-json-editor
 *
 * A form drawn from a schema, for a nested JSON value. Derived from the source,
 * packages/ui/src/json-editor/pdx-json-editor.ts:
 *   HOST <pdx-json-editor role="group" aria-label="{schema.label}">  (.pdx-json-editor-root)
 *     └── div.jobj-b                                   the root object's body, built asynchronously
 *           ├── div.jfld[data-part="entry"]            one scalar: its caption and a library field
 *           │     └── <pdx-input> / <pdx-number-input> / <pdx-select> / <pdx-tag-input> / <pdx-switch>
 *           └── div.jcomplex[data-part="branch"]       an object or list: caption, summary, Edit button
 *   The Edit button opens a sub-modal appended to <body>: div.jed-back > div.jed-box[data-part="dialog"]
 *   role="dialog" aria-modal="true", named by its heading, with Cancel and Apply.
 *
 * `schema` and `value` are objects: no attribute expresses them, so each scenario's `setup` assigns
 * them, then waits for the asynchronous build (its first entry) before the page signals ready.
 *
 * Contracts: the entries are stacked in the host and contained in it; the dialog lies within the
 * viewport. No exact px.
 */
import type { ComponentManifest } from './_types';

/** The setup that gives the scenario's editor its schema and value, and waits for its entries. */
const assign = (schema: unknown, value: unknown, open = false): string => `
    const host = document.querySelector('section:not([hidden]) [data-test="je"]');
    if (host) {
        Object.assign(host, { schema: ${JSON.stringify(schema)}, value: ${JSON.stringify(value)} });
        for (let i = 0; i < 60 && !host.querySelector('[data-part="entry"]'); i++) {
            await new Promise((r) => requestAnimationFrame(r));
        }
        ${open ? `host.querySelector('[data-part="branch"] button')?.click();
        for (let i = 0; i < 60 && !document.querySelector('[data-part="dialog"] [data-part="entry"]'); i++) {
            await new Promise((r) => requestAnimationFrame(r));
        }` : ''}
    }
`;

const PROFILE = {
    label: 'Profile',
    fields: [
        { k: 'name', label: 'Name', req: true },
        { k: 'age', label: 'Age', type: 'number' },
        { k: 'active', label: 'Active', type: 'bool' },
        { k: 'address', label: 'Address', type: 'object', fields: [{ k: 'city', label: 'City' }, { k: 'zip', label: 'ZIP' }] },
    ],
};
const PROFILE_VALUE = { name: 'Ada Lovelace', age: 36, active: true, address: { city: 'London' } };

const SHORT = {
    label: 'Profile',
    fields: [
        { k: 'name', label: 'Name' },
        { k: 'address', label: 'Address', type: 'object', fields: [{ k: 'city', label: 'City' }] },
    ],
};

export const jsonEditor: ComponentManifest = {
    name: 'json-editor',
    tag: 'pdx-json-editor',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/json-editor'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'json-editor-basic',
            title: 'JSON Editor — An object: scalars and a branch',
            html: `
                <div style="max-width: 420px;">
                    <pdx-json-editor data-test="je"></pdx-json-editor>
                </div>`,
            setup: assign(PROFILE, PROFILE_VALUE),
        },
        {
            id: 'json-editor-dialog',
            title: 'JSON Editor — A branch open in its sub-modal',
            // Tall: the sub-modal is fixed and centred in the viewport, and the visual dimension
            // shoots the scenario's section, so the section must cover where the dialog is drawn.
            html: `
                <div style="max-width: 420px; min-height: 600px;">
                    <pdx-json-editor data-test="je"></pdx-json-editor>
                </div>`,
            setup: assign(PROFILE, PROFILE_VALUE, true),
        },
        {
            id: 'json-editor-keyboard',
            title: 'JSON Editor — A field and a branch, for the keyboard',
            html: `
                <div style="max-width: 420px;">
                    <pdx-json-editor data-test="je"></pdx-json-editor>
                </div>`,
            setup: assign(SHORT, { name: 'Ada' }),
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'json-editor-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="je"] [data-part="entry"]',
                        description: 'an entry is drawn with width',
                        width: { op: '>', value: 0 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="je"] [data-part="branch"] button',
                        description: 'the branch\'s Edit button is a usable target',
                        height: { op: '>=', value: 24 },
                    },
                ],
                composition: [
                    {
                        // The object's body is a three-column grid (json-editor.css, .jobj-b); a branch
                        // spans the whole row.
                        description: 'entries share a row, the branch lies below it, all contained in the editor',
                        parent: 'section:not([hidden]) [data-test="je"]',
                        children: {
                            first: 'section:not([hidden]) [data-test="je"] [data-part="entry"]:nth-child(1)',
                            second: 'section:not([hidden]) [data-test="je"] [data-part="entry"]:nth-child(2)',
                            branch: 'section:not([hidden]) [data-test="je"] [data-part="branch"]',
                        },
                        relations: [
                            { description: 'the second entry is beside the first', left: 'second.left', op: '>', right: 'first.right', tolerance: 1 },
                            { description: 'the two entries share a top edge', left: 'second.top', op: '==', right: 'first.top', tolerance: 2 },
                            { description: 'the branch is below the entries', left: 'branch.top', op: '>=', right: 'first.bottom', tolerance: 1 },
                            { description: 'the first entry is contained in the editor', left: 'first', op: 'contained-in', right: 'parent' },
                            { description: 'the branch is contained in the editor', left: 'branch', op: 'contained-in', right: 'parent' },
                        ],
                    },
                ],
            },
            'json-editor-dialog': {
                standalone: [
                    {
                        selector: '[data-part="dialog"]',
                        description: 'the sub-modal is drawn with width',
                        width: { op: '>', value: 0 },
                    },
                ],
                composition: [
                    {
                        description: 'the sub-modal lies within the viewport',
                        parent: 'body',
                        children: { dialog: '[data-part="dialog"]' },
                        relations: [
                            { description: 'the dialog left edge is on screen', left: 'dialog.left', op: '>=', right: 'parent.left' },
                            { description: 'the dialog top edge is on screen', left: 'dialog.top', op: '>=', right: 'parent.top' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // The host is a named group; each sub-field is named by its own label (the library fields'
    // `label`/`aria-label`); the sub-modal is a named, modal dialog.
    a11y: {
        scenarios: ['json-editor-basic', 'json-editor-dialog'],
    },

    // ── Dim. 3: style isolation ──
    // The content follows hostile fonts; the entries' height is skipped, as for the other forms.
    isolation: {
        scenario: 'json-editor-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="je"] [data-part="branch"]', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // Tab reaches the first field, then the branch's Edit button. Enter opens the sub-modal with focus
    // on its first field; Escape closes it unapplied and puts focus back on the button that opened it.
    keyboard: {
        scenario: 'json-editor-keyboard',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="je"] [data-part="entry"] input' },
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="je"] [data-part="branch"] button' },
            { key: 'Enter', expectFocus: '[data-part="dialog"] [data-part="entry"] input' },
            { key: 'Escape', expectFocus: 'section:not([hidden]) [data-test="je"] [data-part="branch"] button' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    // The sub-modal's first field takes focus; the runner hides the caret, so nothing is masked.
    visual: {
        scenarios: ['json-editor-basic', 'json-editor-dialog'],
    },
};

export default jsonEditor;
