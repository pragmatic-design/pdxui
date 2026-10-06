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
