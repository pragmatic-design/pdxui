/**
 * MANIFEST — pdx-data-grid
 *
 * Contracts derived from the source (packages/ui/src/data-grid/*, grid-a11y.ts for the keyboard and the ARIA)
 * and from the CSS (packages/design/src/components/data-grid.css).
 *
 * ── DOM structure (light DOM, built imperatively in an rAF) ──
 *   <pdx-data-grid label="People">
 *     <div class="pdx-dg-root">
 *       <div class="pdx-dg">                                   ← wrapper: toolbar, group bar, grid, empty, pager
 *         [<div class="pdx-dg-toolbar" role="toolbar" aria-label>]
 *         <div class="pdx-dg-scroll" role="grid" aria-label     ← THE GRID: header + filters + body + totals
 *              aria-rowcount aria-colcount [aria-multiselectable]>
 *           <div class="pdx-dg-header" role="row" aria-rowindex="1">
 *             [<div class="pdx-dg-th pdx-dg-checkbox" role="columnheader"><input type="checkbox" aria-label="Select all">]
 *             <div class="pdx-dg-th" role="columnheader" data-field aria-sort>     ← aria-sort only when sortable
 *               <button class="pdx-dg-sort-btn">label + caret</button>             ← the sort command
 *               [<button class="pdx-dg-filter-icon" aria-label="Filter {col}">]   ← without the filter row
 *           [<div class="pdx-dg-filter-row" role="row" data-dg-nav-skip>          ← the arrows skip it
 *              <div role="gridcell"><pdx-input aria-label="Filter {col}">]
 *           <div class="pdx-dg-body" role="rowgroup">
 *             [<div class="pdx-dg-group-row" role="row"><div role="gridcell" aria-colspan>
 *                <button class="pdx-dg-group-toggle" aria-expanded aria-label="Category: Books, 2 rows">]
 *             <div class="pdx-dg-row" role="row" data-row-id aria-rowindex [aria-selected]>
 *               <div class="pdx-dg-td" role="gridcell" data-field>…
 *         <div class="pdx-dg-empty" role="status">
 *         <pdx-pagination>
 *
 * ── Tastiera (APG data grid) ──
 *   ONE tab stop across the cells, the header included: the cell, or its single control (a checkbox,
 *   the sort button, a group toggle) marked data-dg-widget. Arrows, Home/End,
 *   Ctrl+Home/End, PageUp/PageDown; Enter and Space on the sort button sort.
 *
 * ── Contracts: conservative, universal over the 13 themes ──
 *   The sort button sits inside its own header, and the header lines up with the
 *   column it heads: the button took the label's place, and must move nothing.
 */
import type { ComponentManifest } from './_types';

const COLUMNS = `[
    {"field":"name","header":"Name","sortable":true},
    {"field":"city","header":"City","sortable":false},
    {"field":"category","header":"Category","sortable":false}
]`;
const PEOPLE = `[
    {"id":1,"name":"Ada","city":"Torino","category":"Books"},
    {"id":2,"name":"Grace","city":"Milano","category":"Books"},
    {"id":3,"name":"Katherine","city":"Torino","category":"Music"}
]`;
const NARROW_COLUMNS = `[
    {"field":"code","header":"Code","sortable":true,"width":100},
    {"field":"name","header":"Name","sortable":true}
]`;
const PARTS = `[
    {"id":1,"code":"A1","name":"Bearing"},
    {"id":2,"code":"B2","name":"Gasket"}
]`;
/** City and Category as quick filters, Name searched. */
const QUICK_COLUMNS = `[
    {"field":"name","header":"Name","sortable":true,"searchable":true},
    {"field":"city","header":"City","quickFilter":true},
    {"field":"category","header":"Category","quickFilter":true}
]`;
const DG = 'section:not([hidden]) [data-test="dg"]';
const CODE_TH = `${DG} .pdx-dg-th[data-field="code"]`;

export const dataGrid: ComponentManifest = {
    name: 'data-grid',
    tag: 'pdx-data-grid',
    tier: '6',
    status: 'wip',
    imports: ['@pdxui/ui/data-grid'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'data-grid-basic',
            title: 'Data grid — read-only, a sortable column, named',
            html: `
                <pdx-data-grid data-test="dg" label="People" columns='${COLUMNS}' data='${PEOPLE}'></pdx-data-grid>`,
        },
        {
            // Rows that open something say so, through the prop and the design system's CSS.
            id: 'data-grid-row-clickable',
            title: 'Data grid — rows that open a record (row-clickable)',
            html: `
                <pdx-data-grid data-test="dg" label="People" row-clickable columns='${COLUMNS}' data='${PEOPLE}'></pdx-data-grid>`,
        },
        {
            id: 'data-grid-select-filter',
            title: 'Data grid — multiple selection and the inline filter row',
            html: `
                <pdx-data-grid data-test="dg" label="People" selection="multiple" filterable
                    columns='${COLUMNS}' data='${PEOPLE}'></pdx-data-grid>`,
        },
        {
            id: 'data-grid-grouped-toolbar',
            title: 'Data grid — grouped by category, with the toolbar',
            // `group-by`, the kebab form: an Array/Object prop is read at mount.
            html: `
                <pdx-data-grid data-test="dg" label="People" show-toolbar group-by='[{"field":"category"}]'
                    columns='${COLUMNS}' data='${PEOPLE}'></pdx-data-grid>`,
        },
        {
            // The toolbar with an active filter: its chip and the clear-all button exist only then, so
            // no other axe scenario meets them. Only Dim 2.
            id: 'data-grid-filtered-toolbar',
            title: 'Data grid — the toolbar with an active filter',
            html: `
                <pdx-data-grid data-test="dg" label="People" show-toolbar
                    columns='${COLUMNS}' data='${PEOPLE}'></pdx-data-grid>`,
            setup: `
                const host = document.querySelector('section:not([hidden]) [data-test="dg"]');
                for (let i = 0; i < 30 && !(host && host.grid); i++) await new Promise(r => requestAnimationFrame(r));
                host.grid.source.setFilter([{ field: 'city', operator: 'eq', value: 'Torino' }]);
                await new Promise(r => requestAnimationFrame(r));`,
        },
        {
            // A 100px column, the width the relation-picker demo needs: the funnel is invisible
            // at rest, and if it kept its 18px "Code" would render "C…".
            // `Code` has an explicit width, `Name` does not — with every column fixed the grid
            // shares the leftover space out, and the narrow one would not stay narrow.
            id: 'data-grid-narrow-column',
            title: 'Data grid — a 100px column, and the filter icon that shares it',
            html: `
                <pdx-data-grid data-test="dg" label="Parts" columns='${NARROW_COLUMNS}' data='${PARTS}'></pdx-data-grid>`,
        },
        {
            // The filters a list is narrowed by, on screen before any is set, and a search field:
            // the empty chips and the field are surfaces of their own in the toolbar.
            id: 'data-grid-quick-filters',
            title: 'Data grid — quick-filter chips and the search field',
            html: `
                <pdx-data-grid data-test="dg" label="People" show-toolbar search
                    columns='${QUICK_COLUMNS}' data='${PEOPLE}'></pdx-data-grid>`,
        },
        {
            id: 'data-grid-empty',
            title: 'Data grid — no rows',
            html: `
                <pdx-data-grid data-test="dg" label="People" columns='${COLUMNS}' data='[]'></pdx-data-grid>`,
        },
        {
            // A row's own menu, OPEN. The panel is a surface: 13
            // themes have to agree on how wide it is, that a refused entry is dimmed, and that the
            // entries stay inside it. The columns are set from JS because `rowMenu` carries
            // functions, which a JSON attribute cannot express.
            id: 'data-grid-row-menu',
            title: 'Data grid — a row\'s own menu, open',
            html: `
                <pdx-data-grid data-test="dg" label="People" data='${PEOPLE}'></pdx-data-grid>`,
            setup: `
                const { rowMenu } = await import('@pdxui/core');
                const host = document.querySelector('section:not([hidden]) [data-test="dg"]');
                host.columns = [
                    { field: 'name', header: 'Name' },
                    { field: 'rowMenu', header: '', width: 56, command: true, cell: rowMenu({
                        label: (row) => 'Actions for ' + row.name,
                        items: [
                            { key: 'duplicate', icon: 'copy', label: 'Duplicate', onSelect: () => {} },
                            { key: 'open', icon: 'external-link', label: 'Open in a new tab',
                              href: (row) => '/people/' + row.id, target: '_blank' },
                            { key: 'export', icon: 'download', label: 'Export this one', disabled: true,
                              disabledReason: 'A closed record is archived.', onSelect: () => {} },
                        ],
                    }) },
                ];
                let trigger = null;
                for (let i = 0; i < 40 && !trigger; i++) {
                    await new Promise(r => requestAnimationFrame(r));
                    trigger = host.querySelector('[role="row"] [aria-haspopup="menu"]');
                }
                trigger.click();
                await new Promise(r => requestAnimationFrame(r));`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            // With `row-clickable` the row takes a pointer, so a page does not reach into
            // `.pdx-dg-row` to draw it.
            'data-grid-row-clickable': {
                standalone: [
                    {
                        selector: `${DG} .pdx-dg-row`,
                        description: 'a row that opens something says so: cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
            },
            'data-grid-basic': {
                standalone: [
                    {
                        // The control for `data-grid-row-clickable`: without the prop a row is not a
                        // link, and must not look like one.
                        selector: `${DG} .pdx-dg-row`,
                        description: 'without row-clickable, a row does not take a pointer',
                        cursor: { op: 'isNot', value: 'pointer' },
                    },
                    {
                        // THE RHYTHM, and it is one number in all 13 themes.
                        //
                        // A row's height is declared, not whatever its cells' padding produces: it is
                        // `--pdx-row-height`, read by the cell as
                        // `min-height: calc(var(--pdx-row-height) - 1px)` (the 1px is the row's own
                        // separator), so an application states 49 and every row is 49.
                        //
                        // The band is the rhythm and its separator, nothing wider: a theme that
                        // draws a fourth value fails here.
                        selector: `${DG} .pdx-dg-body .pdx-dg-row:not(:last-child)`,
                        description: 'a row is the declared rhythm (45) and not a value of its own',
                        height: { op: '>=', value: 45 },
                    },
                    {
                        selector: `${DG} .pdx-dg-body .pdx-dg-row:not(:last-child)`,
                        description: 'and no taller than that rhythm',
                        height: { op: '<=', value: 46 },
                    },
                ],
                composition: [
                    {
                        // Numeric edges, not `contained-in` between names: see pagination.manifest.
                        description: 'the sort button sits inside its column header',
                        parent: `${DG} .pdx-dg-header`,
                        children: {
                            th: `${DG} [role="columnheader"][data-field="name"]`,
                            btn: `${DG} [role="columnheader"][data-field="name"] .pdx-dg-sort-btn`,
                        },
                        relations: [
                            { description: 'button left edge within the header', left: 'btn.left', op: '>=', right: 'th.left' },
                            { description: 'button right edge within the header', left: 'btn.right', op: '<=', right: 'th.right' },
                            { description: 'button no taller than the header', left: 'btn.height', op: '<=', right: 'th.height' },
                        ],
                    },
                    {
                        description: 'a column header lines up with the column it heads',
                        parent: `${DG} .pdx-dg-scroll`,
                        children: {
                            th: `${DG} [role="columnheader"][data-field="city"]`,
                            td: `${DG} [data-row-id="1"] [role="gridcell"][data-field="city"]`,
                        },
                        relations: [
                            { description: 'same left edge', left: 'th.left', op: '==', right: 'td.left', tolerance: 1 },
                            { description: 'same width', left: 'th.width', op: '==', right: 'td.width', tolerance: 1 },
                        ],
                    },
                ],
            },
            'data-grid-quick-filters': {
                standalone: [
                    {
                        selector: `${DG} .pdx-dg-toolbar-chip-quick[data-empty][data-field="city"]`,
                        description: 'the City quick filter is there before any filter, as an empty chip',
                        height: { op: '>=', value: 18 },
                    },
                    {
                        selector: `${DG} .pdx-dg-toolbar-chip-quick[data-empty][data-field="category"]`,
                        description: 'and so is the Category one',
                        height: { op: '>=', value: 18 },
                    },
                    {
                        selector: `${DG} .pdx-dg-toolbar-chip-quick[data-field="city"]`,
                        description: 'an empty chip shows its whole name, not «Ci…»',
                        contentOverflowX: { op: '==', value: 0, tolerance: 0.5 },
                    },
                ],
                composition: [
                    {
                        description: 'the chips and the search field sit inside the toolbar',
                        parent: `${DG} .pdx-dg-toolbar`,
                        children: {
                            bar: `${DG} .pdx-dg-toolbar`,
                            chip: `${DG} .pdx-dg-toolbar-chip-quick[data-field="city"]`,
                            search: `${DG} [data-grid-search]`,
                        },
                        relations: [
                            { description: 'chip within the bar, vertically', left: 'chip.bottom', op: '<=', right: 'bar.bottom' },
                            { description: 'search field within the bar, on the right', left: 'search.right', op: '<=', right: 'bar.right' },
                            { description: 'search field within the bar, vertically', left: 'search.bottom', op: '<=', right: 'bar.bottom' },
                        ],
                    },
                ],
            },
            // The funnel is invisible until the header is hovered, and it takes room only when it
            // is shown: kept at its 18px, it would take them from the label, which would truncate.
            'data-grid-narrow-column': {
                standalone: [
                    {
                        selector: `${CODE_TH} .pdx-dg-filter-icon`,
                        description: 'at rest the invisible funnel takes no room',
                        width: { op: '<=', value: 0.5 },
                        opacity: { op: '==', value: 0, tolerance: 0.01 },
                    },
                    {
                        selector: `${CODE_TH} .pdx-dg-th-label`,
                        description: 'a 100px column shows its whole header, not "C…"',
                        contentOverflowX: { op: '==', value: 0, tolerance: 0.5 },
                    },
                ],
                states: [
                    {
                        // Tabbing onto it must not draw a focus ring around nothing.
                        description: 'focus makes the funnel appear, and take its room',
                        selector: `${CODE_TH} .pdx-dg-filter-icon`,
                        trigger: 'focus',
                        changes: { opacity: { op: '>=', value: 0.6 }, mustDiffer: ['width', 'opacity'] },
                    },
                ],
            },
            // The other two states the funnel shows in — a hovered header, and `.active` on a
            // filtered column — are measured in `packages/design/tests/data-grid-filter-icon.spec.ts`
            // on static markup: a `hover` state rule hovers the element it measures, and a
            // collapsed funnel is 0px wide, which Playwright refuses to hover; and `.active` is set
            // only by the filter popover (grid-filter-popover.ts:21), which a scenario cannot drive.
            // The setup really left a filter active: the clear-all button axe is meant to see is shown.
            'data-grid-filtered-toolbar': {
                standalone: [
                    { selector: `${DG} .pdx-dg-toolbar-chip-remove-all`, description: 'the clear-all-filters button is shown',
                      width: { op: '>', value: 0 } },
                ],
            },
            'data-grid-grouped-toolbar': {
                composition: [
                    {
                        description: 'the group toggle sits inside its group row',
                        parent: `${DG} .pdx-dg-body`,
                        children: {
                            row: `${DG} .pdx-dg-group-row`,
                            toggle: `${DG} .pdx-dg-group-row .pdx-dg-group-toggle`,
                        },
                        relations: [
                            { description: 'toggle top within the row', left: 'toggle.top', op: '>=', right: 'row.top' },
                            { description: 'toggle bottom within the row', left: 'toggle.bottom', op: '<=', right: 'row.bottom' },
                        ],
                    },
                ],
            },
            'data-grid-row-menu': {
                standalone: [
                    {
                        selector: '.pdx-dg-row-menu',
                        description: 'the row menu is at least as wide as a menu needs to be',
                        minWidth: { op: '>=', value: 180 },
                    },
                    {
                        // Three entries, and a refused one is still ONE of them: withholding it
                        // would read as a menu with two.
                        selector: '.pdx-dg-row-menu [role="menuitem"]',
                        description: 'the menu draws one entry per action, the refused one included',
                        count: { op: '==', value: 3 },
                    },
                    {
                        selector: '.pdx-dg-row-menu-item[aria-disabled="true"]',
                        description: 'a refused entry is dimmed, and says so with the cursor',
                        opacity: { op: '<', value: 1 },
                        cursor: { op: 'is', value: 'not-allowed' },
                    },
                    {
                        // The trigger is an icon button and the column is 56px: a control that
                        // overflows its cell is one a thumb misses.
                        selector: '.pdx-dg-row-menu-btn',
                        description: 'the trigger fits the column it sits in',
                        width: { op: '<=', value: 56 },
                    },
                ],
                composition: [
                    {
                        description: 'every entry stays inside the panel',
                        parent: '.pdx-dg-row-menu',
                        children: {
                            panel: '.pdx-dg-row-menu',
                            first: '.pdx-dg-row-menu [role="menuitem"]:first-of-type',
                            last: '.pdx-dg-row-menu [role="menuitem"]:last-of-type',
                        },
                        relations: [
                            { description: 'the first entry is inside the panel', left: 'first', op: 'contained-in', right: 'panel' },
                            { description: 'the last entry is inside the panel', left: 'last', op: 'contained-in', right: 'panel' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // The grid owns only rows (the toolbar, the group bar and the pager sit beside it); every row has cells
    // with a role (the filter row and the totals row included); every control has a name. No
    // rule is disabled.
    a11y: {
        scenarios: ['data-grid-basic', 'data-grid-select-filter', 'data-grid-grouped-toolbar', 'data-grid-filtered-toolbar', 'data-grid-empty'],
    },

    // ── Dim. 4: keyboard (APG data grid) ──
    // The initial tab stop is "Name"'s sort button (the header's first cell). At HEAD the
    // cells were tabindex -1 and the arrows did nothing without `editable`.
    keyboard: {
        scenario: 'data-grid-basic',
        initialFocus: `${DG} [role="columnheader"][data-field="name"] .pdx-dg-sort-btn`,
        steps: [
            { key: 'ArrowDown', expectFocus: `${DG} [data-row-id="1"] [role="gridcell"][data-field="name"]` },
            { key: 'ArrowRight', expectFocus: `${DG} [data-row-id="1"] [role="gridcell"][data-field="city"]` },
            { key: 'End', expectFocus: `${DG} [data-row-id="1"] [role="gridcell"][data-field="category"]` },
            { key: 'Control+End', expectFocus: `${DG} [data-row-id="3"] [role="gridcell"][data-field="category"]` },
            { key: 'Home', expectFocus: `${DG} [data-row-id="3"] [role="gridcell"][data-field="name"]` },
            { key: 'Control+Home', expectFocus: `${DG} [role="columnheader"][data-field="name"] .pdx-dg-sort-btn` },
            // Enter on the button sorts; the header is rebuilt and the focus returns to the new button.
            { key: 'Enter',
                expectAttr: { selector: `${DG} [role="columnheader"][data-field="name"]`, name: 'aria-sort', value: 'ascending' },
                expectFocus: `${DG} [role="columnheader"][data-field="name"] .pdx-dg-sort-btn` },
            { key: 'Space',
                expectAttr: { selector: `${DG} [role="columnheader"][data-field="name"]`, name: 'aria-sort', value: 'descending' } },
            // Katherine, Grace, Ada: the first row is Katherine now.
            { key: 'ArrowDown', expectFocus: `${DG} [data-row-id="3"] [role="gridcell"][data-field="name"]` },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — the header with its sort button, and a group ──
    visual: {
        scenarios: ['data-grid-basic', 'data-grid-grouped-toolbar'],
    },
};

export default dataGrid;
