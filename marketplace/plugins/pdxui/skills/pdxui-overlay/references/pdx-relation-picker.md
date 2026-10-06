### `<pdx-relation-picker>`

Pick existing rows for a relation.

**Takes a DataSource:** bind one to `:source`.

**Use it when** the user picks existing rows for a relation from a list that is searched and paged at its
source. **Not when** the choices are a short preloaded list → `pdx-select`: a picker over a preloaded array
proves nothing a select would not.

**Pitfalls**
- Nothing renders until `:source` is set.
- Without `searchable` the user cannot narrow the list. `searchable` turns on the grid's filter row, which calls
  `source.setFilter()` — not a search box across columns.
- The grid is always multi-select; for one value take `e.detail.items[0]` from `pdx-pick`.
- `pdx-create` is only a request: the picker creates nothing.
- It is not a form control: the compiler does not wire it by `name`, so a required pick is yours to check — on
  the submit click, before the form's own rules, or a submit the rules refuse never reaches you.

**Composes with** `pdx-data-source` / `createDataSource` (the `:source` it pages and filters) · `pdx-dialog` +
`pdx-form` (a create modal that also picks a customer) · `pdx-wizard` (a step that picks one).

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `source` | — | object | `null` | The DataSource of the rows to pick from, handed to the grid the picker renders. |
| `columns` | — | array | `() => []` |  |
| `createLabel` | `createlabel` | string | `''` |  |
| `addLabel` | `addlabel` | string | `''` | The add button's text. Empty: the relation-picker.add component string. |
| `idField` | `idfield` | string | `'id'` |  |
| `searchable` | `searchable` | boolean | `false` | Let the user narrow the list — the one thing a picker exists for.  It turns on the grid's FILTER ROW: a field under each column header, debounced, which calls `source.setFilter()`. So the narrowing happens where the rows come from and a picker over ten thousand customers works the same as one over fourteen.  ⚠️ Not the grid's toolbar, which is what this issue first proposed: measured, the toolbar is a reload button, filter chips and "+ Add Filter" — a filter builder, not a search. Whether the picker should also carry a search field of its OWN, above the grid and across every column, is a design decision and is still open. |

**Events:** `pdx-create` — Fired when a new item is created.; `pdx-pick` → `detail: { items }` — Fired on `pdx-pick`.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Multi-select + create** — Select rows, then "Add selected". The result is shown below. _(from the live demo)_

```html
<div style="height: 320px; border: 1px solid var(--pdx-color-border); border-radius: 10px; padding: .75rem;">
  <pdx-relation-picker :source="source" :columns="columns" create-label="New city" @pdx-pick="onPick" @pdx-create="onCreate"></pdx-relation-picker>
</div>
<p class="pdx-txt-small pdx-ink-muted" style="margin-top: .6rem;">{{ result }}</p>
```

