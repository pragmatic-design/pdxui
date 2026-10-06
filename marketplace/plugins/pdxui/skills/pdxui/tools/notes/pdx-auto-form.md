**Use it when** the whole form comes from data: a `FormSchema`, or the same `FieldDefinition[]` that drives
the grid's columns and the filter builder. **Not when** you lay the fields out by hand or split a long form
into section components → `<pdx-form :form>`; editing a grid row in a side panel → `pdx-edit-drawer`.

**Pitfalls**
- `schema` names a field `name`; `FieldDefinition`, `ColumnDef` and `FilterField` name it `field`. A filter
  field written with `name` is dropped without a word.
- The form is built a frame after it connects: `getValues()` and `validate()` answer `undefined` until then.
- A change to `fields`, `schema`, `source`, `record-id`, `layout`, `columns` or `show-actions` rebuilds the form
  from scratch: what the user typed is gone.
- With `:source` and no `record-id`, every Save is `add()` + `sync()`: a second click creates a second record.
  With a `record-id` that is not in the source, Save updates nothing and still emits `pdx-submit`.

**Composes with** `pdx-dialog` (the create modal) · `pdx-data-grid` + `pdx-filter-builder` (one field list for
all three) · `pdx-data-source` (`:source` load and save).
