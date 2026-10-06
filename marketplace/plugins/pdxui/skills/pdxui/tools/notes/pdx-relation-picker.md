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
