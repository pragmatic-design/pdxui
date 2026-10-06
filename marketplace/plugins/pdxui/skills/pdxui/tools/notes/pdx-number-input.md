**Empty is a value.** Like the native `<input type="number">`, the field can hold no number:

- `value` `null`, `undefined`, `''` or `NaN` shows an empty field with its `placeholder`, and `el.value`
  reads `null`. With no `value` at all it starts empty, even with a `min`: a number nobody entered is
  not shown as data.
- Clearing the text and leaving the field (blur or Enter) makes it empty and emits
  `pdx-change {value: null}`; it does not snap back to 0 or to `min`.
- `min` and `max` bound numbers only; empty stays empty. A stepper press or ArrowUp/ArrowDown on an
  empty field starts from `min` if there is one, else from 0.
- The form value is `null` when empty, so a `required` rule reports it missing; `0` is a number and
  passes.

Test for empty with `el.value === null`, never with a falsy check: `0` is a value.
