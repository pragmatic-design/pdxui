**It is one of TWO ways to build repeating rows, and they do not compose.** This component keeps each
row as dotted paths in the form (`rooms.0.type`), so a row is addressed by its INDEX and removing one
re-indexes every row after it. The other way is `createFieldArray` / `form.array(name)`, whose items
are `{ __id, value }` wrappers keyed by an id that survives a removal — and which draws nothing.

⚠️ **Never both on one name**: `form.getValues()` merges the field arrays back last, so one call to
`form.array('rooms')` on a name this component manages discards everything it has written. The full
comparison, and which to choose, is in the recipe "Rows that repeat".

`itemFields` builds **plain controls only** — text, email, number, textarea, checkbox, switch. A
`select` gets no options, and anything else becomes a text input: a row that needs a picker, a select
with options or a component of its own goes in the `row` slot, which receives
`{ item, index, fields, remove }`.

**Use it when** a form field is a list of plain sub-records — order lines, contacts, addresses — and you want
the rows, add and remove, min and max drawn for you; or a row field must be `required`: a rule written inside
`@form`'s `[{ … }]` is dropped (`PDX_FORM_ARRAY_RULES_IGNORED`), while `itemFields` registers it as each row is
added. **Not when** you want keyed rows that survive a removal → `createFieldArray` / `form.array(name)`.

**Pitfalls**
- It needs a form: `:form`, or an enclosing `<pdx-form>`. Without one the add button does nothing, silently.
- A row's fields are not in `form.fields` until the row exists; a per-step check reads them by dotted path,
  `lines.${i}.activity`.
- `form.fields.<name>` — the array itself — mirrors the rows only when the array was seeded EMPTY; a filled
  initial array has no such leaf, and the dotted fields are the only state.
- Inside a `<pdx-field-group>` its rows are prefixed with the group's path.

**Composes with** `pdx-form` (the form it writes into) · `pdx-field-group` (a nested path) · `pdx-wizard` (rows
inside a step) · `pdx-select` and other components in the `row` slot.
