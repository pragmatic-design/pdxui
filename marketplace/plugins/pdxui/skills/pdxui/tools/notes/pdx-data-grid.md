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
