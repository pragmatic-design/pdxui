/**
 * MANIFEST — pdx-edit-drawer (a drawer holding a schema-driven form)
 *
 * ── DOM (packages/ui/src/edit-drawer/pdx-edit-drawer.ts) ──
 *   <pdx-edit-drawer :open :schema>
 *     <pdx-drawer>                                         ← its own manifest measures the panel (drawer.manifest.ts)
 *       <div class="pdx-edit-drawer">
 *         <header data-part="header">Edit</header>
 *         <div data-part="body"><pdx-form-template>…</div>  ← built in a frame, on open
 *       <div slot="footer" data-part="actions">
 *         <button data-part="cancel"> <button data-part="save">
 *
 *   No ancestor here traps fixed positioning, so the drawer keeps its panel inside the host and the
 *   selectors stay scoped to the scenario's `data-test`.
 *
 * ── DETERMINISTIC DATA ──
 *   `schema` and `value` are objects, set in `setup`; `open` is then set, as a host opens it. Two
 *   fields, a record to edit.
 *
 * ── Contracts ──
 *   · the form renders inside the body, its fields with the record's values;
 *   · the actions row sits under the form, Cancel before Save;
 *   · busy disables both buttons — the busy scenario against the open one.
 *
 * No visual block: the drawer's own manifest holds its look.
 */
import type { ComponentManifest } from './_types';

const SETUP = (test: string): string => `
    const host = document.querySelector('section:not([hidden]) [data-test="${test}"]');
    if (host) {
        host.schema = { fields: [
            { name: 'name', label: 'Name', type: 'text', required: true },
            { name: 'email', label: 'Email', type: 'email' },
        ] };
        host.value = { id: 7, name: 'Alice Johnson', email: 'alice@example.com' };
        host.open = true;
    }
    // The form is built a frame after the drawer opens, and its fields a frame after that.
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(
        () => requestAnimationFrame(() => requestAnimationFrame(r)))));
`;

const IN = (test: string, part: string) => `section:not([hidden]) [data-test="${test}"] [data-part="${part}"]`;

export const editDrawer: ComponentManifest = {
    name: 'edit-drawer',
    tag: 'pdx-edit-drawer',
    tier: '5B',
    status: 'wip',
    imports: ['@pdxui/ui/edit-drawer'],

    scenarios: [
        {
            id: 'edit-drawer-open',
            title: 'Edit drawer — open on a record',
            html: `<pdx-edit-drawer data-test="ed"></pdx-edit-drawer>`,
            setup: SETUP('ed'),
        },
        {
            id: 'edit-drawer-busy',
            title: 'Edit drawer — open, the parent saving',
            html: `<pdx-edit-drawer data-test="edb" busy></pdx-edit-drawer>`,
            setup: SETUP('edb'),
        },
    ],

    contracts: {
        scenarios: {
            'edit-drawer-open': {
                standalone: [
                    {
                        selector: `${IN('ed', 'body')} input`,
                        description: 'the form renders a field per schema field',
                        count: { op: '==', value: 2 },
                    },
                    {
                        selector: IN('ed', 'save'),
                        description: 'Save can be pressed while the parent is not saving',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                composition: [
                    {
                        description: 'the actions row sits under the form, Cancel before Save',
                        parent: 'section:not([hidden]) [data-test="ed"]',
                        children: {
                            body: IN('ed', 'body'),
                            actions: IN('ed', 'actions'),
                            cancel: IN('ed', 'cancel'),
                            save: IN('ed', 'save'),
                        },
                        relations: [
                            { description: 'the form above the actions', left: 'body.bottom', op: '<=', right: 'actions.top', tolerance: 1 },
                            { description: 'Cancel before Save', left: 'cancel.right', op: '<=', right: 'save.left' },
                        ],
                    },
                ],
            },
            'edit-drawer-busy': {
                standalone: [
                    {
                        // The control for the rule above: busy, the buttons say they cannot be pressed.
                        selector: IN('edb', 'save'),
                        description: 'busy disables Save',
                        cursor: { op: 'is', value: 'not-allowed' },
                    },
                ],
            },
        },
    },

    a11y: {
        // The drawer is a named dialog; the fields are labelled by the form template.
        scenarios: ['edit-drawer-open', 'edit-drawer-busy'],
    },

    isolation: {
        scenario: 'edit-drawer-open',
        targets: [
            { selector: IN('ed', 'actions'), tolerancePx: 8, skipHeight: true },
        ],
    },

    // No keyboard block of its own: the focus trap and Escape are the drawer's (drawer.manifest.ts), the
    // fields' the form template's; what this component adds, a failed Save moving focus to the first
    // invalid field, is held by edit-drawer-state.test.ts.
};

export default editDrawer;
