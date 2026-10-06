**Use it when** the field is free text with suggestions: a city, a tag, a name the list may not hold.
**Not when** the value must be one of the options → `pdx-select`; `force-selection` only clears a non-matching text
on blur.

**Pitfalls**
- After a pick, `el.value` is the LABEL the input shows; the code from `value-field` is only in
  `pdx-change.detail.value`.
- Typing emits `pdx-input`, not `pdx-change`: `pdx-change` fires on a pick, a clear, or a `force-selection` wipe.
- `force-selection` compares the typed text with the labels, case-insensitively, 150 ms after blur.
- Suggestions appear from `min-length` characters (default 1), at most `max-items` (default 10).
- `remote` filters the source with `contains` on `label-field`: the server has to honour that operator.

**Composes with** `pdx-data-source` (wrap it and the source is injected, no `:source` needed) · `pdx-form`
(wired by `name`).
