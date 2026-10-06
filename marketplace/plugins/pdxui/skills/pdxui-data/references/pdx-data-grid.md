### `<pdx-data-grid>`

Sortable, filterable, virtual data table.

**Takes a DataSource:** bind one to `:source`.

**A column** (`ColumnDef`, from `@pdxui/core`). `columns: array` on its own says nothing, and the
type lives in core rather than next to the component, so it is written out here:

```ts
{
  field: string;              // dotted paths work: 'address.city'
  header?: string;            // default: the field, humanised
  width?: number; minWidth?: number; maxWidth?: number; flex?: number;
  type?: ColumnType;          // infers filter, sort, format and editor defaults
  sortable?: boolean; filterable?: boolean; resizable?: boolean; reorderable?: boolean;
  editable?: boolean | ((row) => boolean);
  align?: 'left' | 'center' | 'right';
  cell?: CellSpec;            // ← an OBJECT from a builder below, never a function
  format?: string | ((value, row) => string);   // plain text: fine; HTML: @deprecated
}
```

⚠️ **`cell:` takes a `CellSpec`, the object a builder returns, never a function.**
`cell: (row) => '…'` is ignored: the grid looks for the spec's `kind`, finds none, and shows the raw
value (the column's default rendering). The console says so, once per column. A boolean column
written that way shows `false` where "Sì" was wanted. The builders, all exported from `@pdxui/core`,
build the DOM with `textContent`, never `innerHTML`:

| builder | renders |
|---|---|
| `badge({ tones?, tone? })` | the value as a badge, coloured per value (`{ Open: 'info' }`). It colours; it does **not** relabel |
| `status({ tones?, tone? })` | the value with a coloured dot, for a value that IS the row's state |
| `link({ href, text?, target? })` | an anchor; `href(value, row)`, sanitised so a `javascript:` value never runs |
| `currency({ currency?, locale? })` | the amount via `Intl.NumberFormat` |
| `dateCell({ options?, locale? })` | the date via `Intl.DateTimeFormat` |
| `booleanIcon({ trueLabel?, falseLabel? })` | ✓ / ✗, or your two labels |
| `actions([{ label?, icon?, tone?, onClick(row) }])` | buttons; a click does not reach `pdx-row-click` |
| `rowMenu({ items, label?, icon? })` | ONE trigger that opens the row's menu — what `actions()` is past two entries |

**A row's own actions: two buttons, or a menu.** `actions()` draws one button per entry, which is
right for one or two and wrong for four — at 390px a row of four icon buttons is the whole width of
the phone. Past two, `rowMenu({ items })` draws a single trigger that opens the grid's menu (arrows,
type-ahead, Escape back to the trigger), and its items say two things a row of buttons cannot:

```js
rowMenu({
    label: (row) => `Actions for ${row.reference}`,   // the trigger's name, per row
    items: [
        { key: 'duplicate', icon: 'copy', label: 'Duplicate', onSelect: (row) => duplicate(row) },
        // A REAL link: middle-clickable, copyable, announced as a link. `window.open` in a handler
        // is none of those. The URL is sanitised, like every other href the grid builds.
        { key: 'open', icon: 'external-link', label: 'Open in a new tab',
          href: (row) => `/tickets/${row.id}`, target: '_blank' },
        // Refused, not withheld: it stays on screen, `aria-disabled`, with its reason reachable.
        // An action that merely vanishes is indistinguishable from one nobody wrote.
        { key: 'export', icon: 'download', label: 'Export this one',
          disabled: (row) => row.status === 'closed', disabledReason: 'A closed record is archived.',
          onSelect: (row) => exportOne(row) },
    ],
})
```

**To relabel a value, use `format`.** A function that returns a **plain string** is supported:
`format: (v) => (v ? 'Sì' : 'No')`. What `format` is deprecated for is returning HTML: that gets
sanitised, warns once per column, and belongs in a builder. The grid applies `cell` first, then
`format`, then the default for the column's `type`.

```html
<template>
  <pdx-data-grid :data="shipments" :columns="columns"></pdx-data-grid>
</template>

<script setup>
import { badge, booleanIcon, currency } from '@pdxui/core';

let shipments = $signal([
    { id: 1, customer: 'Rossi', state: 'Open', urgent: true, paid: false, amount: 120 },
]);
const columns = [
    { field: 'customer', header: 'Customer' },
    { field: 'state', header: 'State', cell: badge({ tones: { Open: 'info', Closed: 'success' } }) },
    { field: 'amount', header: 'Amount', cell: currency({ currency: 'EUR' }) },
    { field: 'urgent', header: 'Urgent', cell: booleanIcon({ trueLabel: 'Sì', falseLabel: 'No' }) },
    { field: 'paid', header: 'Paid', format: (v) => (v ? 'Sì' : 'No') },
];
</script>
```

⚠️ **A FLEX column needs a `minWidth`** (≥120 if it is filterable), or the column can collapse to
nothing on a narrow viewport.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `source` | — | object | `null` | The data source to render from. |
| `columns` | — | array | `null` | Column definitions: field, header, width, sortable, render, etc. |
| `data` | — | array | `null` | The row data to display. |
| `striped` | `striped` | boolean | `false` | Alternates row background colours. |
| `hover` | `hover` | boolean | `true` | Highlights the row under the pointer. |
| `rowClickable` | `rowclickable` | boolean | `false` | The rows open something: a click on a row is handled (`pdx-row-click`), so the row takes a pointer, so a page does not write its own `.pdx-dg-row { cursor: pointer }`, reaching into this component's internal class. Enter on a row is unchanged: it edits a cell in an editable grid and does nothing otherwise, so give a keyboard reader a way in of its own (an `actions()` column). |
| `compact` | `compact` | boolean | `false` | Tighter row height for dense tables. |
| `stickyHeader` | `stickyheader` | boolean | `true` | Keeps the header visible while the body scrolls. |
| `selection` | `selection` | string | `'none'` | Row selection mode: 'none', 'single' or 'multiple'. |
| `rowClass` | `rowclass` | string | `''` | A class for the whole row: a string, or `(row, index) => string`. Marks a row invalid, new, stale — what `cellClass` could only do one column at a time.  Declared `String` because an ATTRIBUTE is one (`row-class="compact"`), and `PropType` is a single constructor. A function assigned as a JS property arrives untouched: `coerce` returns a non-string value as it is (`component.ts:448`). |
| `idField` | `idfield` | string | `'id'` | The row field used as a unique key. |
| `stateKey` | `statekey` | string | `''` | Persists sort/filter/column state under this key. |
| `emptyTitle` | `emptytitle` | string | `''` | The empty state's text. Unset, it is the grid string `empty.title`. |
| `emptyIcon` | `emptyicon` | string | `'inbox'` | Icon shown in the empty state. |
| `showFooter` | `showfooter` | boolean | `true` | Shows the footer (aggregates / summary row). |
| `filterable` | `filterable` | boolean | `false` | Enables per-column filtering. |
| `filterMode` | `filtermode` | string | `'none'` | How filters apply: e.g. 'menu' or 'row'. |
| `showToolbar` | `showtoolbar` | boolean | `false` | Shows the toolbar (search, column chooser, export). |
| `search` | `search` | boolean | `false` | A search field at the toolbar's right: the term is looked for in the columns marked `searchable`. |
| `showGroupBar` | `showgroupbar` | boolean | `false` | Shows the drag-to-group bar. |
| `paginationPosition` | `paginationposition` | string | `'bottom'` | Where the pager sits: 'top', 'bottom' or 'both'. |
| `pageSizes` | — | array | `[]` | The rows-per-page choices the footer's pager offers; empty, it offers none. |
| `expandable` | `expandable` | boolean | `false` | Allows rows to expand into a detail panel. |
| `rowReorder` | `rowreorder` | boolean | `false` |  |
| `groupBy` | — | array | `null` | Fields to group rows by. |
| `virtualScroll` | `virtualscroll` | boolean | `false` | Renders only visible rows for large datasets. |
| `rowHeight` | `rowheight` | number | `0` | Row height in px for virtual scrolling (42 when unset); ignored otherwise. |
| `maxHeight` | `maxheight` | number | `0` | Caps the grid height in px; the body scrolls beyond it. 0 = no cap (a virtual grid uses 400). |
| `fillHeight` | `fillheight` | boolean | `false` | Fill the parent's height (flex) instead of growing with content. The page no longer scrolls — only the grid body scrolls (virtualized). Pair with virtual-scroll for large sets. |
| `editable` | `editable` | boolean | `false` | Enables inline cell editing. |
| `editMode` | `editmode` | string | `'cell'` | Editing granularity: 'cell' or 'row'. |
| `label` | `label` | string | `''` | The grid's accessible name (its aria-label). |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `grid` _(read-only)_ | Read-only, via a ref: `el.grid`. |
| `whenReady()` | Resolves once the grid is built and `grid`, `applyState` and the rest can be used. The build is a frame after the element connects; until then `applyState` does nothing. A caller that asks later is answered at once. |
| `openColumnMenu(anchorEl)` | Open the column menu anchored to this element. |
| `closeColumnMenu()` | Close the column menu, if one is open. |
| `openFilterPopover(field, anchorEl)` | Open the filter popover of a column, by field, anchored to this element. An unknown field opens nothing. |
| `closeFilterPopover()` | Close the filter popover, if one is open. |
| `openAddFilter(anchorEl)` | Open the add-a-filter popover anchored to this element. |
| `clearAllFilters()` | Drop every filter: the ones set in the popovers and the ones on the source. |
| `toggleRowDetail(id)` | Open or close the detail row under this row id. |
| `startEdit(rowId, field?)` | Begin an edit: one cell when a field is given, otherwise the whole row — in a dialog or inline, as `edit-mode` says. |
| `cancelEdit()` | Abandon the edit in progress and discard what was typed. |
| `addRow()` | Append an empty row, with a negative id until it is saved, and start editing it in dialog and row modes. |
| `deleteRow(rowId)` | Delete a row by id and emit `pdx-row-delete`. It asks nothing first, and in batch mode does not sync. |
| `clearSelection()` | Uncheck every selected row. |
| `getSelectedIds()` | The ids currently checked, as an array. |
| `setSelectedIds(ids)` | Check exactly these rows and uncheck the rest — what a partly refused bulk action leaves behind. |
| `applyState(state)` | Put an arrangement back — filter, sort, column order, widths, visibility, page size — and show it.  `grid.loadState()` is the same thing without the repaint: an application that reaches for it gets a grid whose model has moved and whose header has not. It raises no column event either, and that is deliberate: restoring a saved view is not a reader rearranging anything. |
| `commitBatch()` | Send every change a batch edit is holding, then sync the source. |
| `revertBatch()` | Throw away every change a batch edit is holding. |

**Events:** `pdx-batch-commit` → `detail: { count }` — Fired on `pdx-batch-commit`.; `pdx-batch-revert` → `detail: {}` — Fired on `pdx-batch-revert`.; `pdx-cell-edit-cancel` → `detail: { rowId, field }` — Fired on `pdx-cell-edit-cancel`.; `pdx-cell-edit-end` → `detail: { rowId, field, oldValue, newValue }` — Fired on `pdx-cell-edit-end`.; `pdx-cell-edit-start` → `detail: { rowId, field, value }` — Fired on `pdx-cell-edit-start`.; `pdx-grid-export` → `detail: { rows, columns, format }` — Fired on `pdx-grid-export`.; `pdx-ready` — Fired on `pdx-ready`.; `pdx-row-click` → `detail: { row, index, id }` — Fired when the row is clicked.; `pdx-row-collapse` → `detail: { id }` — Fired on `pdx-row-collapse`.; `pdx-row-delete` → `detail: { rowId, row }` — Fired on `pdx-row-delete`.; `pdx-row-edit-cancel` → `detail: { rowId }` — Fired on `pdx-row-edit-cancel`.; `pdx-row-edit-end` → `detail: { rowId, values }` — Fired on `pdx-row-edit-end`.; `pdx-row-edit-start` → `detail: { rowId, row }` — Fired on `pdx-row-edit-start`.; `pdx-row-expand` → `detail: { id }` — Fired on `pdx-row-expand`.; `pdx-row-reorder` → `detail: { from, to, fromId, toId }` — Fired on `pdx-row-reorder`.; `pdx-selection-change` → `detail: { selected, count }` — Fired when the selection changes.

**Renders:** roles `columnheader` · `grid` · `gridcell` · `menu` · `menuitem` · `menuitemradio` · `row` · `rowgroup` · `status` · `toolbar`

**Shapes:** `GridContext { grid: { sort: Function; resize: Function; reorder: Function; toggleColumn: Function; saveState: Function; loadState: Function; source: any; sortState: any; rows: any; columns: any; total: any; page: any; totalPages: any; isLoading: any } | null; getSlot: (name: string) => SlotFunction | undefined; getSelectionMode: () => string; getRowClass: (row: Record<string, unknown>, index: number) => string; getIdField: () => string; selectedIds: Set<unknown>; getHeaderEl?: () => HTMLElement | null; getBodyEl?: () => HTMLElement | null; emit: (name: string, detail: unknown) => void; hasFilterRow: () => boolean; hasToolbar: () => boolean; hasSearch: () => boolean; pageSizes: () => number[]; filterMode: () => string; forceUpdate: () => void; popoverFilters: Record<string, { op1: string; val1: string; logic: 'and' | 'or'; op2: string; val2: string }>; inlineFilterValues: Record<string, unknown>; inlineFilterOps: Record<string, string>; isExpandable: () => boolean; isRowReorder: () => boolean; expandedRows: Set<unknown>; collapsedGroups: Set<string>; editMode: () => string; editingCell: EditCellState | null; editingRowId: unknown | null; editForm: Form<Record<string, unknown>> | null; batchChanges: Map<unknown, Record<string, unknown>>; getLabel?: () => string; nav: { key: string; index: number; col: number; pending?: boolean } | null; navFocused: boolean; afterRender?: () => void }` · `VirtualScrollState { update: () => void; dispose: () => void }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Cell Edit** — Double-click a cell to edit. Enter saves, Escape cancels. Editors auto-created from column type (text → input, number → number input, boolean → checkbox).

```html
<pdx-data-grid :source="ds" :columns="columns"
  editable edit-mode="cell" hover striped>
</pdx-data-grid>
```

```js
const columns = [
  { field: 'name', header: 'Name', editable: true },
  { field: 'email', header: 'Email', type: 'email', editable: true },
  { field: 'salary', header: 'Salary', type: 'currency', editable: true },
  { field: 'isActive', header: 'Active', type: 'boolean', editable: true },
];
```

**Row Edit** — Click Edit in the command column. The entire row becomes editable with Save/Cancel buttons. Validation runs on Save.

```html
<pdx-data-grid :source="ds" :columns="columns"
  editable edit-mode="row" hover>
</pdx-data-grid>
```

```js
const columns = [
  { field: 'name', header: 'Name', editable: true,
    validators: [{ type: 'required' }] },
  { field: 'role', header: 'Role', editable: true },
  { field: 'salary', header: 'Salary', type: 'currency', editable: true },
  { field: '_actions', header: '', width: 140, command: true },
];
```

**Dialog Edit** — Click Edit to open a form dialog auto-generated from editable columns. Full form validation, Save/Cancel buttons.

```html
<pdx-data-grid :source="ds" :columns="columns"
  editable edit-mode="dialog" hover>
</pdx-data-grid>
```

```js
// Dialog auto-generates a form from editable columns
// using the same bridge as pdx-form-template
```

**Batch Edit** — Double-click to edit cells. Changes are buffered (yellow highlight) until Save All. Revert discards all pending changes.

```html
<pdx-data-grid :source="ds" :columns="columns"
  editable edit-mode="batch" show-toolbar
  hover striped>
</pdx-data-grid>
```

```js
// Batch mode: changes highlighted in yellow
// Toolbar shows Save All / Revert when changes exist
```

**Inline Filter Row** — `filterable` or `filter-mode="row"` adds a filter input below each header. Type to filter — operators available via the dropdown button.

```html
<pdx-data-grid :source="ds" :columns="columns"
  filterable hover striped>
</pdx-data-grid>
```

**Toolbar Filter Mode** — With `show-toolbar`, filters appear as chips. Click "+" to add a filter, select field, set operator and value. Chips show active filters — click to edit, "x" to remove.

```html
<pdx-data-grid :source="ds" :columns="columns"
  show-toolbar hover striped>
</pdx-data-grid>
```

```js
// Toolbar implies filter-mode="toolbar"
```

**Enum Filter (Multi-select)** — Columns of `type: 'enum'` with `filterOptions` render a multi-select (operator `in`) with select-all. Pick several categories at once.

```js
{ field: 'category', header: 'Category', type: 'enum',
  filterOptions: [
    { label: 'Electronics', value: 'Electronics' },
    { label: 'Clothing', value: 'Clothing' },
    { label: 'Books', value: 'Books' },
  ] }
// Multi-select → operator `in` (matches any selected value)
```

**Enum Filter (Server-side autocomplete)** — With `filterSearchable` + `filterOptionsSource` the options load on demand from the server as the user types — for large or remote value sets (lookup columns).

```js
function loadCategories(query) {
  return fetch('/api/categories?q=' + query).then(r => r.json());
  // → [{ label, value }, ...]
}

{ field: 'category', header: 'Category', type: 'enum',
  filterSearchable: true,
  filterOptionsSource: loadCategories }
```

**Set Filter (Excel-style)** — `filterSet: true` builds the checklist from the distinct values in the data (no `filterOptions` to write), with search, select-all and `(Blanks)`. Open the Category column's filter (the funnel icon in its header).

```js
{ field: 'category', header: 'Category', filterSet: true }
// → checklist of the distinct values (from the data) + search + select-all + (Blanks)
// Applies the `in` operator. Server-side: DataSource.distinctValues() with pageSize=0.
```

**Relative Date Filters** — `type: 'date'` columns offer relative presets, computed from today: `Today`, `Yesterday`, `This week/month/year`, `Last 7/30 days` (besides After/Before and Between). Open the Order Date filter.

```js
{ field: 'date', header: 'Order Date', type: 'date' }
// Operators: After / On or after / Before / On or before / Between
//   + relative: Today, Yesterday, This week/month/year, Last 7/30 days
// The relative ones are dynamic ranges (recomputed each time they apply), with no value.
```

**Custom Operators** — `filterOperators` on a column limits available operators. Default: text = contains/eq/neq/startswith/endswith, number = eq/neq/gt/gte/lt/lte.

```js
{ field: 'price', header: 'Price', type: 'currency',
  filterOperators: ['gt', 'lt', 'eq'] }

// Available operators:
// Text: contains, eq, neq, startswith, endswith, isnull, isnotnull
// Number: eq, neq, gt, gte, lt, lte, between, isnull, isnotnull
// Date:   eq, neq, gt, gte, lt, lte, between, isnull, isnotnull (label: After/Before…)
// Enum:   in, notin, isnull, isnotnull
// `between` (range) → two inputs, min and max, in the popover; value [min, max].
```

**Group Bar (Drag & Drop)** — Enable `show-group-bar` to show a drop zone above the grid. Drag column headers to the bar to group. Remove chips to ungroup.

```html
<pdx-data-grid :source="ds" :columns="columns"
  show-group-bar show-toolbar
  hover striped>
</pdx-data-grid>
```

**Programmatic Grouping** — Use the `group-by` prop to set initial grouping. Accepts an array of `{ field, dir? }` descriptors.

```html
<pdx-data-grid :source="ds" :columns="columns"
  :group-by="[{ field: 'category' }]"
  show-group-bar hover striped>
</pdx-data-grid>
```

**Multiple Selection** — Checkbox column with select-all header. Hold Shift for range select.

```html
<pdx-data-grid :source="ds" :columns="columns"
  selection="multiple" hover
  @pdx-selection-change="onSelect">
</pdx-data-grid>
```

**Single Selection** — Radio-style: only one row can be selected at a time.

```html
<pdx-data-grid :source="ds" :columns="columns"
  selection="single" hover>
</pdx-data-grid>
```

**Column Resize** — Drag column borders to resize. Columns are resizable by default. Set `resizable: false` on a column to disable. _(from the live demo)_

```html
<div class="demo-container">
  <pdx-data-grid :source="resizeDS" :columns="resizeColumns" hover striped></pdx-data-grid>
</div>
```

**Column Reorder** — Drag column headers to reorder. Also available from the column chooser in the toolbar. Set `reorderable: false` on a column to pin its position. _(from the live demo)_

```html
<div class="demo-container">
  <pdx-data-grid :source="reorderDS" :columns="columns" :show-toolbar="true" hover striped></pdx-data-grid>
</div>
```

**Toolbar** — Toolbar with sort recap chips, reload button, and column chooser. Sort columns then see chips appear. Click chip to toggle direction, ✕ to remove.

```html
<pdx-data-grid :source="ds" :columns="columns"
  show-toolbar hover striped>
</pdx-data-grid>
```

**Toolbar + Paginated** — Toolbar with pagination. Filters are always via chips when toolbar is active. Click "+ Add Filter" to choose a column, set operator and value. No filter icons in headers — all filtering through toolbar.

```html
<pdx-data-grid :source="ds" :columns="columns"
  show-toolbar hover>
</pdx-data-grid>
```

```js
// show-toolbar implies filter-mode="toolbar"
// No inline filter row when toolbar is active
```

**Inline Filters** — `filterable` or `filter-mode="row"` — filter row under header. Type-aware: text search, number min, boolean Yes/No, date picker.

```html
<pdx-data-grid :source="ds" :columns="columns"
  filterable hover>
</pdx-data-grid>
```

**Enum Filter (filterOptions)** — Columns with `filterOptions` show a predefined dropdown.

```js
{ field: 'category', filterOptions: [
    { label: 'Electronics', value: 'Electronics' },
    { label: 'Clothing', value: 'Clothing' },
  ]}
```

**Group Bar** — Drag column headers to the group bar. Chips show active groupings with ✕ to remove.

```html
<pdx-data-grid :source="ds" :columns="columns"
  show-group-bar show-toolbar hover>
</pdx-data-grid>
```

**Grouping (Declarative)** — Pre-configured grouping via `group-by` prop with aggregates.

```html
<pdx-data-grid :source="ds" :columns="columns"
  :group-by="[{ field: 'category',
    aggregates: [
      { field: 'price', aggregate: 'sum' },
      { field: 'stock', aggregate: 'average' }
    ]}]" hover>
</pdx-data-grid>
```

**Pagination Position** — `pagination-position`: `'bottom'` (default), `'top'`, or `'both'`.

```html
<pdx-data-grid :source="ds" :columns="columns"
  pagination-position="both" hover>
</pdx-data-grid>
```

**Frozen Columns** — `frozen: 'left'` or `'right'` on a column definition makes it sticky. Scroll horizontally to see frozen columns stay in place.

```js
const columns = [
  { field: 'id', header: 'ID', width: 60, frozen: 'left' },
  { field: 'name', header: 'Name', width: 180, frozen: 'left' },
  { field: 'email', header: 'Email', width: 220 },
  { field: 'role', header: 'Role', width: 150 },
  { field: 'salary', header: 'Salary', type: 'currency', width: 130 },
  { field: 'actions', header: '', width: 80, frozen: 'right', command: true },
];
```

**Virtual Scroll** — `virtual-scroll` renders only visible rows + overscan. Scales to 10K+ rows. Set `max-height` for the scroll container and `row-height` for fixed row size.

```html
<pdx-data-grid :source="ds" :columns="columns"
  virtual-scroll :max-height="400"
  hover striped>
</pdx-data-grid>
```

```js
// 1000 rows — only visible rows in DOM
const ds = createDataSource({ data: bigData, pageSize: 0 });
```

**Row Detail (Master-Detail)** — `expandable` adds a chevron to each row. Click to expand and show a detail panel. Use the `detail` slot for custom content.

```html
<pdx-data-grid :source="ds" :columns="columns"
  expandable hover>

  <slot name="detail" let:row let:id>
    <div style="padding: 16px">
      <strong>Details for {row.name}</strong>
      <p>Role: {row.role}</p>
    </div>
  </slot>

</pdx-data-grid>
```

**Command Column** — `command: true` on a column disables sort/filter/resize/reorder automatically. Use the `col:{field}` slot for custom action buttons.

```js
const columns = [
  { field: 'name', header: 'Name' },
  { field: 'role', header: 'Role' },
  { field: '_actions', header: '', width: 120, command: true },
];
```

```html
<pdx-data-grid :source="ds" :columns="columns" hover>
  <slot name="col:_actions" let:row let:id>
    <pdx-button size="xs" @click="edit(id)">Edit</pdx-button>
    <pdx-button size="xs" variant="danger" @click="remove(id)">
      Delete
    </pdx-button>
  </slot>
</pdx-data-grid>
```

**1K Rows**

```html
<pdx-data-grid :source="ds" :columns="columns"
  virtual-scroll :max-height="500"
  hover striped>
</pdx-data-grid>
```

```js
const ds = createDataSource({ data: bigData, pageSize: 0 });
// 10,000 rows — only visible rows rendered
```

**Basic (Static Data)** — Simple grid from a static array. Columns auto-detected from data keys.

```html
<pdx-data-grid :data="users" label="Team members" striped hover>
</pdx-data-grid>
```

**Typed Columns + Sort** — Explicit column definitions with types. Click a header — or press Enter on it — to sort. Hold Shift for multi-sort. Types control alignment and formatting (number=right, boolean=center, date=locale).

```js
const columns = [
  { field: 'name', header: 'Name', width: 180 },
  { field: 'email', header: 'Email', type: 'email', width: 220 },
  { field: 'role', header: 'Role', width: 120 },
  { field: 'salary', header: 'Salary', type: 'currency', width: 120 },
  { field: 'isActive', header: 'Active', type: 'boolean', width: 80 },
  { field: 'joinedAt', header: 'Joined', type: 'date', width: 120 },
];
```

```html
<pdx-data-grid :source="ds" :columns="columns"
  label="Employees" striped hover>
</pdx-data-grid>
```

**Paginated (DataSource)** — Server-simulated pagination with 100 rows, page size 10. Footer shows "1–10 of 100" format with numbered page navigation. The grid tells a screen reader it has 101 rows (the header included), and each row where it sits among them.

```js
const ds = createDataSource({
  transport: fakeTransport({ data: products, idField: 'id' }),
  pageSize: 10,
});
```

```html
<pdx-data-grid :source="ds" :columns="columns"
  striped hover>
</pdx-data-grid>
```

**Slot Templates** — Custom cell rendering via `<slot name="col:field">`. Custom header via `<slot name="header:field">`. Custom empty state via `<slot name="empty">`.

```js
import { status } from '@pdxui/core';

const columns = [
  { field: 'name', header: 'User', width: 220 },
  { field: 'email', header: 'Email', width: 200 },
  { field: 'role', header: 'Role', width: 120 },
  // A typed cell renderer: built DOM, no HTML string
  { field: 'status', header: 'Status', cell: status({ tones: { Active: 'success', Away: 'warning', Offline: 'muted' } }) },
];
```

```html
<pdx-data-grid :source="ds" :columns="columns" hover>

  <!-- Custom cell for 'name' column -->
  <slot name="col:name" let:row let:value>
    <div class="user-cell">
      <pdx-avatar size="xs" :alt="row.name"></pdx-avatar>
      <strong>{{ value }}</strong>
    </div>
  </slot>

  <!-- Custom header -->
  <slot name="header:name" let:col>
    <pdx-icon name="user" size="14"></pdx-icon>
    {col.header}
  </slot>

  <!-- Custom empty state -->
  <slot name="empty" let:_>
    <pdx-empty-state title="No results" icon="search">
    </pdx-empty-state>
  </slot>

</pdx-data-grid>
```

**Compact** — Reduced padding for denser data views. Use the `compact` prop. _(from the live demo)_

```html
<div class="demo-container">
  <pdx-data-grid :data="basicData" :columns="compactColumns" label="Team members, compact" compact hover></pdx-data-grid>
</div>
```

**Empty State** — When there is no data, a customizable empty state appears. It is a status, so a filter that leaves nothing is announced; the pager reads "0 of 0" and offers no page. _(from the live demo)_

```html
<div class="demo-container">
  <pdx-data-grid :data="emptyData" :columns="typedColumns" label="Archived employees" empty-title="No records found" empty-icon="search"></pdx-data-grid>
</div>
```

