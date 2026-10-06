**The rows are options, not checkboxes.** Each item is a `div.pdx-transfer-item[role=option]`
with `aria-selected`, inside a `role="listbox"` per side. In `checkbox` mode the tick is a
presentational `span.pdx-transfer-check` (`aria-hidden`), not an `<input>`: a control inside an
option breaks WAI-ARIA. Select by clicking the row, and read the state from `aria-selected` or
`.checked`. `input[type=checkbox]` finds nothing.
