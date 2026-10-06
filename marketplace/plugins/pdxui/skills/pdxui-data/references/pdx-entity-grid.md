### `<pdx-entity-grid>`

A CRUD grid: create, edit, delete, bulk.

**Use it when** a screen needs a grid with New, an edit drawer, delete and bulk actions over an ARRAY you
hold. **Not when** the list reads a server-paged `DataSource`, creates in a modal, opens a record from its
row, must ask before discarding, or offers undo, partial bulk results or live updates → `pdx-data-grid` with
`:source`, plus `pdx-edit-drawer` and `pdx-dialog`.

**Pitfalls**
- It persists nothing: it edits a local optimistic copy and emits `pdx-create` / `pdx-update` / `pdx-delete`
  for you to save. A new `:data` array replaces that copy.
- A created row without an id gets a client-only `__tmp-N`; `detail.values` stays clean, and `detail.clientId`
  is how you match the server's row back.
- Omitting `schema` hides New and the row actions, not the bulk Delete: with the default `selection="multiple"`,
  ticking rows still shows a bulk bar with Delete. Only `readonly` removes it.
- The drawer's Cancel and Escape close it with no unsaved-changes question.
- Delete asks first; `confirm-delete="false"` removes at once, for an app that confirms or offers undo itself.

**Composes with** — it renders its own `pdx-data-grid`, `pdx-edit-drawer` (from `schema`), `pdx-bulk-actions`
and `pdx-alert-dialog`; extra bulk actions go in `bulkActions` and come back as `pdx-bulk`.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `columns` | — | array | `[]` | Grid columns (ColumnDef[]). An edit/delete actions column is appended unless readonly. |
| `data` | — | array | `[]` | Entity rows. |
| `schema` | — | object | `null` | FormSchema for the create/edit drawer. Without it the CRUD affordances are hidden. |
| `idField` | `idfield` | string | `'id'` |  |
| `title` | `title` | string | `''` |  |
| `addLabel` | `addlabel` | string | `''` | The create button's text. Empty: the entity-grid.add component string, «New». |
| `selection` | `selection` | 'none' \| 'single' \| 'multiple' | `'multiple'` |  |
| `rowActions` | `rowactions` | boolean | `true` | Show the per-row edit/delete actions column. |
| `bulkActions` | — | array | `[]` | Extra bulk actions (besides the built-in Delete). |
| `readonly` | `readonly` | boolean | `false` | Hide all mutating affordances (view-only grid). |
| `confirmDelete` | `confirmdelete` | boolean | `true` | Ask before deleting ("Delete Alice Johnson?", "Delete 3 records?"). `false` for an app that confirms, or offers undo, in its pdx-delete handler: the rows go at once. |
| `rowLabel` | `rowlabel` | string | `''` | The field that names a row in its action buttons and in the delete confirmation. Empty: the first text column, else the id. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `openCreate()` | Open the drawer on an empty record. |
| `openEdit(row)` | Open the drawer on this row. |
| `getSelectedIds()` | The ids currently checked. |

**Events:** `pdx-bulk` → `detail: { key, ids }` — Fired on `pdx-bulk`.; `pdx-create` → `detail: { values, clientId }` — Fired when a new item is created.; `pdx-delete` → `detail: { ids, rows } | { ids }` — Fired on `pdx-delete`.; `pdx-update` → `detail: { id, values }` — Fired on `pdx-update`.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Full CRUD** — Click New to create, the pencil to edit, the trash to delete — it asks first, and so does the bulk Delete. Select rows (checkboxes) to reveal the bulk bar. Every mutation appends to the event log below.

```js
const schema = { fields: [
  { name: 'name', type: 'text', label: 'Name', validators: [{ type: 'required' }] },
  { name: 'role', type: 'text', label: 'Role' },
] };
```

```html
<pdx-entity-grid title="Team" :columns="columns" :data="people" :schema="schema"
  selection="multiple" @pdx-create="onCreate" @pdx-delete="onDelete" />
```

**Read-only** — Set `readonly` (or omit `schema`) to drop every mutating affordance — no New button, no row actions, no bulk delete. _(from the live demo)_

```html
<pdx-entity-grid title="Team (view)" :columns="columns" :data="people" readonly></pdx-entity-grid>
```

