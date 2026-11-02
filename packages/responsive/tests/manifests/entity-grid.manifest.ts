/**
 * MANIFEST — pdx-entity-grid (a CRUD surface over a data grid)
 *
 * ── DOM (packages/ui/src/entity-grid/pdx-entity-grid.ts) ──
 *   <pdx-entity-grid>
 *     <div class="pdx-entity-grid">                         ← a flex column
 *       <header data-part="toolbar">
 *         <h2 data-part="title">Customers</h2>
 *         <button data-part="add">＋ New</button>            ← with a schema and not readonly
 *       [<pdx-bulk-actions>]                                 ← only while rows are checked
 *       <pdx-data-grid>                                      ← its own manifest measures the grid
 *       <pdx-edit-drawer> <pdx-alert-dialog>                 ← closed at rest
 *
 * ── DETERMINISTIC DATA ──
 *   `columns`, `data` and `schema` are arrays and objects, set in `setup`: three customers, a name
 *   column; the readonly scenario is the same grid with `readonly`.
 *
 * ── Contracts ──
 *   · the toolbar sits above the grid, the title at its start and the create button at its end;
 *   · each row carries an edit and a delete button, named after the row;
 *   · readonly takes the create button and the row actions away — the two scenarios are each other's
 *     control.
 *
 * No visual block: what it draws of its own is a heading and a button the type and button manifests hold.
 */
import type { ComponentManifest } from './_types';

const SETUP = (test: string): string => `
    const host = document.querySelector('section:not([hidden]) [data-test="${test}"]');
    if (host) {
        host.schema = { fields: [{ name: 'name', label: 'Name', type: 'text', required: true }] };
        host.columns = [{ field: 'name', header: 'Name' }];
        host.data = [
            { id: 1, name: 'Northwind Traders' },
            { id: 2, name: 'Contoso' },
            { id: 3, name: 'Fabrikam' },
        ];
    }
    // The grid builds a frame after it gets its columns, its rows a frame after that.
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(
        () => requestAnimationFrame(() => requestAnimationFrame(r)))));
`;

const IN = (test: string, sel: string) => `section:not([hidden]) [data-test="${test}"] ${sel}`;

export const entityGrid: ComponentManifest = {
    name: 'entity-grid',
    tag: 'pdx-entity-grid',
    tier: '5B',
    status: 'wip',
    imports: ['@pdxui/ui/entity-grid'],

    scenarios: [
        {
            id: 'entity-grid-basic',
            title: 'Entity grid — three customers, create and row actions',
            html: `
                <div style="width: 640px;">
                    <pdx-entity-grid data-test="eg" title="Customers"></pdx-entity-grid>
                </div>`,
            setup: SETUP('eg'),
        },
        {
            id: 'entity-grid-readonly',
            title: 'Entity grid — readonly: no create, no row actions',
            html: `
                <div style="width: 640px;">
                    <pdx-entity-grid data-test="egr" title="Customers" readonly></pdx-entity-grid>
                </div>`,
            setup: SETUP('egr'),
        },
    ],

    contracts: {
        scenarios: {
            'entity-grid-basic': {
                standalone: [
                    {
                        selector: IN('eg', '[data-part="add"]'),
                        description: 'with a schema the create button is there',
                        count: { op: '==', value: 1 },
                    },
                    {
                        // An edit and a delete per row, three rows.
                        selector: IN('eg', '.pdx-dg-body .pdx-dg-action'),
                        description: 'each row carries its edit and delete buttons',
                        count: { op: '==', value: 6 },
                    },
                ],
                composition: [
                    {
                        description: 'the toolbar above the grid, its title at the start and the create button at the end',
                        parent: 'section:not([hidden]) [data-test="eg"]',
                        children: {
                            toolbar: IN('eg', '[data-part="toolbar"]'),
                            title: IN('eg', '[data-part="title"]'),
                            add: IN('eg', '[data-part="add"]'),
                            grid: IN('eg', 'pdx-data-grid'),
                        },
                        relations: [
                            { description: 'the toolbar above the grid', left: 'toolbar.bottom', op: '<=', right: 'grid.top', tolerance: 1 },
                            { description: 'the title before the create button', left: 'title.right', op: '<=', right: 'add.left' },
                            { description: 'the create button inside the toolbar', left: 'add.right', op: '<=', right: 'toolbar.right', tolerance: 1 },
                        ],
                    },
                ],
            },
            'entity-grid-readonly': {
                standalone: [
                    {
                        // The control for both rules above.
                        selector: IN('egr', '[data-part="add"]'),
                        description: 'readonly offers no create button',
                        count: { op: '==', value: 0 },
                    },
                    {
                        selector: IN('egr', '.pdx-dg-body .pdx-dg-action'),
                        description: 'readonly offers no row actions',
                        count: { op: '==', value: 0 },
                    },
                ],
            },
        },
    },

    a11y: {
        // The grid is named by its rows' actions; the toolbar's heading names the surface.
        scenarios: ['entity-grid-basic', 'entity-grid-readonly'],
    },

    isolation: {
        scenario: 'entity-grid-basic',
        targets: [
            { selector: IN('eg', '[data-part="toolbar"]'), tolerancePx: 8, skipHeight: true },
        ],
    },

    // The create button is the first stop; the grid behind it is one tab stop (its own manifest walks it).
    keyboard: {
        scenario: 'entity-grid-basic',
        steps: [
            { key: 'Tab', expectFocus: IN('eg', '[data-part="add"]') },
        ],
    },
};

export default entityGrid;
