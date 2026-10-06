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
