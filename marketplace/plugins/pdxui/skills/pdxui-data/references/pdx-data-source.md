### `<pdx-data-source>`

One reactive source of rows for grids, lists, selects, charts and forms.

**Read by** (15): [`<pdx-auto-form>`](../../pdxui-forms/references/pdx-auto-form.md) · [`<pdx-autocomplete>`](../../pdxui-inputs/references/pdx-autocomplete.md) · [`<pdx-chart>`](../../pdxui-data/references/pdx-chart.md) · [`<pdx-data-grid>`](../../pdxui-data/references/pdx-data-grid.md) · [`<pdx-filter-builder>`](../../pdxui-data/references/pdx-filter-builder.md) · [`<pdx-form>`](../../pdxui-forms/references/pdx-form.md) · [`<pdx-form-template>`](../../pdxui-forms/references/pdx-form-template.md) · [`<pdx-infinite-scroll>`](../../pdxui-data/references/pdx-infinite-scroll.md) · [`<pdx-list>`](../../pdxui-data/references/pdx-list.md) · [`<pdx-mention>`](../../pdxui-inputs/references/pdx-mention.md) · [`<pdx-pagination>`](../../pdxui-navigation/references/pdx-pagination.md) · [`<pdx-relation-picker>`](../../pdxui-overlay/references/pdx-relation-picker.md) · [`<pdx-rich-text>`](../../pdxui-inputs/references/pdx-rich-text.md) · [`<pdx-select>`](../../pdxui-inputs/references/pdx-select.md) · [`<pdx-transfer>`](../../pdxui-inputs/references/pdx-transfer.md)

**A filter is AND by default; OR is a `CompositeFilter`.** `setFilter` (and the `filter` prop) take an
array, and the entries of that array are ANDed. For "customer **or** container", put a
`CompositeFilter { logic: 'and' | 'or', filters }` in it; composites nest, and `pdx-filter-builder`
produces the same shape.

```js
// "customer or container" as a FILTER the reader built (it gets a chip)
rows.setFilter([{
    logic: 'or',
    filters: [
        { field: 'customer',  operator: 'contains', value: q },
        { field: 'container', operator: 'contains', value: q },
    ],
}]);
```

**A search box is `setSearch`, not a filter.** `rows.setSearch(q, ['customer', 'container'])` keeps
the rows where any of those fields contains `q`, case-insensitively, and a blank `q` clears it. It is
kept apart from `filter` — no chip, not in a saved view — and reaches the transport as the same OR of
`contains` appended to the filter, so every adapter already understands it. `pdx-data-grid search`
wires it to a field in the toolbar over the columns marked `searchable`.

Operators (`FilterDescriptor.operator`): `eq` `neq` `gt` `gte` `lt` `lte` · `contains` `startswith`
`endswith` · `isnull` `isnotnull` · `in` `notin` · `between` · the relative dates `today` `yesterday`
`thisweek` `thismonth` `thisyear` `last7days` `last30days`.

**The `DataSource` surface** (`createDataSource(…)`, from `@pdxui/core`; every read is a signal, so call it: `rows.total()`):

| | |
|---|---|
| read | `data` · `total` · `totalPages` · `isLoading` · `error` · `page` · `pageSize` · `sort` · `filter` · `search` · `group` · `groups` |
| shape | `setPage(n)` · `setPageSize(n)` · `setSort([{ field, dir }])` · `setFilter([…])` · `setSearch(term, fields)` · `setGroup([…])` · `refresh()` |
| infinite scroll | `loadMore()` · `hasMore` · `loadedCount` · `reset()` |
| every row, not just the page | `getAllIds()` — the ids matching the current filter (select-all) · `getAllRows()` — the ROWS the filter and sort select, which is what an export writes · `distinctValues(field)` — a field's distinct values (an Excel-style filter) |
| selection | opt-in: `createDataSource({ …, selection: { mode: 'multiple', persistKey? } })`, then `selectionEnabled` · `selected` · `selectedItems` · `selectedCount` · `select(id)` · `deselect(id)` · `toggleSelect(id)` · `selectAll()` · `deselectAll()` · `setSelected(ids)` · `isSelected(id)` |
| write | `add(item)` · `update(item)` · `patch(id, partial)` · `remove(item)` · `getById(id)` → `changes` · `hasChanges` · `sync()` · `revert(id)` — undo the tracked change for ONE row, which is what an optimistic write rolls back with · `cancelChanges()` — the whole change set, which on a grid with inline editing throws away every unsaved edit on screen |
| a push FROM the server | `applyServerChange({ type: 'created' \| 'updated' \| 'deleted', item })` — a socket message, bridged with `fromCallback`. It records nothing to sync, sends nothing back and **reloads nothing**, so the selection, the scroll offset and an open editor survive; `refresh()` on every push is the mistake it exists to prevent. Returns `applied`, `shadowed` (the row has an unsaved local edit: the user still sees theirs, and a rollback now lands on the server's value) or `ignored` (not this page's row). Do not use `update()` for this — that records it as the USER's edit |
| persistence | `clearCache()` · `clearSelection()` · `clearPersisted()` |
| forms | `bindForm(form, id?)` — form edits flow into the source |
| teardown | `dispose()` |

⚠️ **A `pdx-data-grid` fills the source's selection only if the source opted in.** Created with
`selection`, the source mirrors the rows ticked in the grid (`selectedCount()`, `selectedItems()`);
without it, `selected` stays empty, and the selection is the grid's: `pdx-selection-change`,
`el.getSelectedIds()`.

`remove` takes the **item**, not its id; `add` / `update` / `patch` / `remove` only record the change,
and `sync()` sends it to the transport.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `url` | `url` | string | `''` | REST endpoint URL. When set, creates a restTransport-backed DataSource. |
| `data` | — | array | `null` | Static data array. When set, creates an arrayTransport-backed DataSource. |
| `transport` | — | object | `null` | Custom transport object (IDataTransport). Takes priority over url/data. |
| `idField` | `idfield` | string | `'id'` | ID field for identifying items. Default: 'id'. |
| `pageSize` | `pagesize` | number | `0` | Page size. 0 = no pagination. Default: 0. |
| `autoLoad` | `autoload` | boolean | `true` | Auto-load on creation. Default: true. |
| `sort` | — | array | `null` | Initial sort. Array of { field, dir } objects. |
| `filter` | — | array | `null` | Initial filter. Array of filter descriptors. |
| `params` | — | object | `null` | Additional params passed to transport.read(). |
| `name` | `name` | string | `''` | Name for Context Protocol provide. Descendants can inject('ds:{name}'). |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `source` | The DataSource itself, as a computed: call it — `el.source()` — and it re-reads when the source is replaced. |


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Programmatic DataSource** — Create a DataSource in script and bind via `:source` prop.

```js
import { createDataSource } from '@pdxui/core';

const userDS = createDataSource({
  data: users,
  idField: 'id',
});
```

```html
<pdx-select :source="userDS" labelField="name"
  valueField="id" searchable clearable />
```

**`<pdx-data-source>` — Declarative** — Non-rendering component. Pass `:data`, `url`, or `:transport`. Use `:ref` to get the DataSource, or `name` for Context Protocol.

```html
<pdx-data-source :data="users" id-field="id" :ref="dsRef" />
<pdx-select :source="dsRef" labelField="name" valueField="id"
  searchable clearable />
```

**Wrapping Children — Provider Pattern** — The core pattern: `<pdx-data-source>` wraps its consumers. The select inside reads data from the parent DataSource automatically. Multiple components can share the same source.

```html
<!-- No :source needed — children inject automatically -->
<pdx-data-source :data="products" id-field="id">
  <pdx-select labelField="name" valueField="id" />
  <pdx-select labelField="name" valueField="id" />
</pdx-data-source>
```

**Remote Simulation — delayTransport** — Wraps `arrayTransport` with `delayTransport` for 1s latency. Loading spinner shows on first open (`autoLoad: false`).

```js
import { createDataSource, arrayTransport, delayTransport } from '@pdxui/core';

const remoteDS = createDataSource({
  transport: delayTransport({
    transport: arrayTransport({ data: users, idField: 'id' }),
    readDelay: 1000,
  }),
  idField: 'id',
  autoLoad: false,
});
```

```html
<pdx-select :source="remoteDS" labelField="name" valueField="id"
  searchable clearable placeholder="Click to load..." />
```

**Cascading DataSources** — Second select filters reactively based on the first. Uses `$derived` to recompute options. Changing country resets the city selection.

```js
let pickedCountry = $signal('');
let pickedCity = $signal(null);

const filteredCityList = $derived(
  cities.filter(c => !pickedCountry || c.country === pickedCountry)
);

function onCountryPick(e) {
  pickedCountry = e.detail.value ?? e.detail;
  pickedCity = null; // reset dependent
}
```

```html
<pdx-select :options="countryList" clearable
  @pdx-change="onCountryPick" />

<pdx-select :options="filteredCityList" labelField="name"
  valueField="id" :value="pickedCity"
  :disabled="!pickedCountry" searchable clearable />
```

