**Use it when** the field is free text with suggestions: a city, a tag, a name the list may not hold.
**Not when** the value must be one of the options → `pdx-select`; `force-selection` only clears a non-matching text
on blur.

**Pitfalls**
- After a pick, `el.value` is the CODE from `value-field`, not the label the input shows: that is
  `el.getText()`, and the picked suggestion `el.getSelectedItem()`.
- Typing emits `query-change` with the text, not `value-change`: the value changes on a pick, on free text
  confirmed by blur or Enter, on a clear, or on a `force-selection` wipe.
- `force-selection` compares the typed text with the labels, case-insensitively, 150 ms after blur.
- Suggestions appear from `min-length` characters (default 1), at most `max-items` (default 10).
- `remote` filters the source with `contains` on `label-field`: the server has to honour that operator.

**Composes with** `pdx-data-source` (wrap it and the source is injected, no `:source` needed) · `pdx-form`
(wired by `name`).
