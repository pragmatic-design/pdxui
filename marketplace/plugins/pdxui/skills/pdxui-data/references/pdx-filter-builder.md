### `<pdx-filter-builder>`

Build complex filters visually.

**Takes a DataSource:** bind one to `:source`.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `fields` | — | array | `[]` | Field definitions (FieldDefinition[] or FilterField[]). |
| `source` | — | object | `null` | DataSource to auto-bind filters. |
| `value` | — | array | `[]` | Initial filter descriptors. |
| `logic` | `logic` | string | `'and'` | Default logic between filters. |

**Events:** `pdx-filter-change` → `detail: { filters, logic }` — Fired when the filter changes.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Click + Add Filter, pick a field, set operator and value. Active filters appear as chips.

```js
const fields = [
  { field: 'name', label: 'Name', type: 'text' },
  { field: 'category', label: 'Category', type: 'enum',
    options: [{ label: 'Electronics', value: 'Electronics' }, ...] },
  { field: 'price', label: 'Price', type: 'currency' },
  { field: 'stock', label: 'Stock', type: 'number' },
];
```

```html
<pdx-filter-builder :fields="fields" :source="ds">
</pdx-filter-builder>
<pdx-data-grid :source="ds" :columns="columns" hover striped>
</pdx-data-grid>
```

**Same JSON — Grid + Filter** — One `FieldDefinition[]` drives both the grid columns and the filter builder fields. Changes in the filter automatically update the grid via shared DataSource.

```js
// ONE definition drives both components
const fields = [
  { field: 'name', label: 'Name', type: 'text' },
  { field: 'category', label: 'Category', type: 'enum', options: [...] },
  { field: 'price', label: 'Price', type: 'currency' },
];
const columns = toColumnDefs(fields);
```

```html
<pdx-filter-builder :fields="fields" :source="ds" />
<pdx-data-grid :source="ds" :columns="columns" hover />
```

