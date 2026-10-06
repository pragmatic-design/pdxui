**Every select is a combobox.** The element that takes focus has `role="combobox"`: the trigger, or
the search input when `searchable` puts it in the trigger (the trigger around it then has no role).
It carries `aria-expanded`, `aria-controls` (the listbox) and, while the list is open,
`aria-activedescendant` naming the highlighted option. The open list is `role="listbox"` with
`role="option"` rows. A test finds a select by its name: `getByRole('combobox', { name: 'Country' })`.

**Name it.** The `label` prop names it; so does the label of an enclosing `pdx-form-field`, a
`pdx-label` right before it, or a `<label for>` the select's id. Without one, a searchable select is
an unnamed combobox and a plain one is named by its current value.

**Keyboard.** ↓ / ↑ / Enter / Space open the list on the selected option. Without `searchable`, a
letter moves to the next option that starts with it: on a closed select it picks that option, as a
native `<select>` does.

**Use it when** the value is one (with `multiple`, several) of a known list: static `options` or a
`DataSource`. **Not when** the user may type a value that is not in the list → `pdx-autocomplete`, whose
value is free text; the options are a hierarchy → `pdx-tree-select`; the rows to pick from are a searched,
paged table → `pdx-relation-picker`.

**Pitfalls**
- `pdx-change.detail` changes shape with `multiple`: `{ value, item }` single, `{ values, items }` multiple; a
  clear sends `{ value: null }` or `{ values: [] }`. Read `e.detail.value`, not `e.detail`.
- With `multiple`, `el.value` is the ARRAY. The comma-joined string survives only in the hidden input a native
  form submits, where a value containing a comma cannot round-trip.
- `creatable` makes the typed text both value and label and emits `pdx-create`; storing the new option is yours.
- Over 100 options the list virtualizes by itself.

**Composes with** `pdx-form` + `pdx-form-field` (wired by `name`; the field's label names it) · `pdx-data-source`
(injected when the select sits inside one).
