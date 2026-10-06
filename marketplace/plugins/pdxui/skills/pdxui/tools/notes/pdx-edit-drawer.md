**Use it when** one existing record is edited from a `FormSchema`, in a side panel its row opens.
**Not when** the record is new → `pdx-dialog` around `pdx-auto-form` (create in a modal, edit in the page); the fields are hand-written — the drawer builds them only from `schema`.

**Pitfalls**
- It is controlled and never closes itself: Escape, ✕ and the backdrop become `pdx-cancel`, Save validates and
  emits `pdx-save`. You close it by setting `open` to false, in both.
- Ask before discarding with `el.isDirty()`. The panel is re-parented to `<body>`, so a query under the host
  finds no form, and comparing `getValues()` with the record races the last keystroke.
- A new `value` or `schema` while it is open rebuilds the form: hand it a stable object, not a fresh one per
  render, or typed edits vanish.
- `getValues()` is `{}` until the form is built, a frame after opening.
- `busy` only disables the footer while you persist; closing on success is still yours.

**Composes with** `pdx-alert-dialog` (the "discard changes?" question, asked only when `isDirty()`) ·
`pdx-data-grid` (the row that opens it sets `value`) · `pdx-entity-grid` (renders one from its `schema`).
