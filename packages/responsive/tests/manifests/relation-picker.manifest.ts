/**
 * MANIFEST — pdx-relation-picker (pick existing rows for a relation)
 *
 * ── DOM structure (light DOM, built in a rAF — pdx-relation-picker.ts:52) ──
 *   <pdx-relation-picker class="pdx-relation-picker">            ← host, the class is added in build()
 *     <pdx-data-grid class="pdx-relation-picker-grid"            ← selection=multiple, hover, id-field
 *                    [filterable]>                               ← ONLY with `searchable`
 *       … role="grid": header row, [filter row], body rows, pager …
 *     <div class="pdx-relation-picker-foot">                     ← CSS: flex, the footer under the grid
 *       <span class="pdx-relation-picker-count"></span>          ← "n selected", empty at rest
 *       [<pdx-button variant="ghost" size="sm">]                 ← only with create-label
 *       <pdx-button variant="primary" size="sm" disabled>        ← Add: disabled while nothing is picked
 *
 * ── DETERMINISTIC DATA ──
 *   `source` is a DataSource, which an attribute cannot carry: the scenarios build one in their
 *   `setup` with `arrayTransport` over six fixed rows, page size 3. So the grid always shows three
 *   rows of six, a pager, and — in the searchable scenario — a filter row above them.
 *
 *   The setup waits for the component's own rAF chain before the runner measures: the picker
 *   builds in a rAF, the grid inside it builds in another.
 *
 * ── Contracts: conservative, no theme-specific px ──
 *   · the footer is a flex row UNDER the grid (composition: grid.bottom <= foot.top);
 *   · the Add button is disabled at rest — nothing is picked — so its cursor is not-allowed and
 *     its opacity is below 1. That is the state a picker opens in, and the button says so
 *     instead of doing nothing when pressed;
 *   · `searchable` renders a filter row INSIDE the grid, above the body rows, with a text field
 *     the user can reach. Without it there is none — the two scenarios are each other's control;
 *   · everything is contained: the grid and the footer inside the host.
 */
import type { ComponentManifest } from './_types';

/** Six customers, three per page: a page, a pager, and something to filter down to. */
const SETUP = (searchable: boolean): string => `
    const { createDataSource, arrayTransport } = await import('@pdxui/core');
    const rows = [
        { id: 1, name: 'Northwind Traders', city: 'Seattle' },
        { id: 2, name: 'Contoso', city: 'Redmond' },
        { id: 3, name: 'Fabrikam', city: 'Berlin' },
        { id: 4, name: 'Adventure Works', city: 'Bristol' },
        { id: 5, name: 'Tailspin', city: 'Lisbon' },
        { id: 6, name: 'Wide World', city: 'Dublin' },
    ];
    const host = document.querySelector('section:not([hidden]) [data-test="${searchable ? 'rps' : 'rp'}"]');
    if (host) {
        host.source = createDataSource({ transport: arrayTransport({ data: rows, idField: 'id' }), idField: 'id', pageSize: 3 });
        host.columns = [{ field: 'name', header: 'Customer' }, { field: 'city', header: 'City' }];
    }
    // The picker builds in a rAF and the grid it creates builds in another: four frames is the
    // same budget the other rAF components in this harness wait out.
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(
        () => requestAnimationFrame(() => requestAnimationFrame(r)))));
`;

export const relationPicker: ComponentManifest = {
    name: 'relation-picker',
    tag: 'pdx-relation-picker',
    tier: '5B',
    status: 'wip',
    imports: ['@pdxui/ui/relation-picker'],

    scenarios: [
        {
            id: 'relation-picker-basic',
            title: 'Relation picker — 6 rows, 3 per page, nothing picked',
            html: `
                <div style="width: 560px;">
                    <pdx-relation-picker data-test="rp" add-label="Add selected"></pdx-relation-picker>
                </div>`,
            setup: SETUP(false),
        },
        {
            id: 'relation-picker-searchable',
            title: 'Relation picker — searchable: the grid carries a filter row',
            html: `
                <div style="width: 560px;">
                    <pdx-relation-picker data-test="rps" searchable add-label="Add selected"></pdx-relation-picker>
                </div>`,
            setup: SETUP(true),
        },
    ],

    contracts: {
        scenarios: {
            'relation-picker-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="rp"] .pdx-relation-picker-foot',
                        description: 'the footer is a flex row',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // Disabled at rest, because nothing is picked. `pdx-button` paints that with
                        // a cursor and an opacity, and both are theme-independent.
                        selector: 'section:not([hidden]) [data-test="rp"] .pdx-relation-picker-foot pdx-button[variant="primary"] button',
                        description: 'the add button is disabled while nothing is picked',
                        cursor: { op: 'is', value: 'not-allowed' },
                        opacity: { op: '<', value: 1 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="rp"] .pdx-relation-picker-grid',
                        description: 'the grid has rendered and has a height',
                        height: { op: '>=', value: 80 },
                    },
                    {
                        // The control for the scenario below: no `searchable`, no filter row. A rule
                        // that passes in both scenarios would measure nothing.
                        selector: 'section:not([hidden]) [data-test="rp"] .pdx-dg-filter-row',
                        description: 'without searchable there is no filter row',
                        count: { op: '==', value: 0 },
                    },
                ],
                composition: [
                    {
                        description: 'the footer sits under the grid, and both inside the picker',
                        parent: 'section:not([hidden]) [data-test="rp"]',
                        children: {
                            grid: 'section:not([hidden]) [data-test="rp"] .pdx-relation-picker-grid',
                            foot: 'section:not([hidden]) [data-test="rp"] .pdx-relation-picker-foot',
                        },
                        relations: [
                            { description: 'grid above the footer', left: 'grid.bottom', op: '<=', right: 'foot.top' },
                            { description: 'the grid is inside the picker', left: 'grid.right', op: '<=', right: 'parent.right' },
                            { description: 'the footer is inside the picker', left: 'foot.bottom', op: '<=', right: 'parent.bottom', tolerance: 1 },
                        ],
                    },
                ],
            },
            'relation-picker-searchable': {
                standalone: [
                    {
                        // The defect, as a measurement: the picker offered nothing to type into.
                        selector: 'section:not([hidden]) [data-test="rps"] .pdx-dg-filter-row input',
                        description: 'searchable puts a field the user can type into inside the grid',
                        width: { op: '>', value: 40 },
                    },
                ],
                composition: [
                    {
                        description: 'the filter row is above the body rows, inside the grid',
                        parent: 'section:not([hidden]) [data-test="rps"] .pdx-relation-picker-grid',
                        children: {
                            filter: 'section:not([hidden]) [data-test="rps"] .pdx-dg-filter-row',
                            firstRow: 'section:not([hidden]) [data-test="rps"] .pdx-dg-row',
                        },
                        relations: [
                            { description: 'filter row above the first data row', left: 'filter.bottom', op: '<=', right: 'firstRow.top' },
                        ],
                    },
                ],
            },
        },
    },
};
