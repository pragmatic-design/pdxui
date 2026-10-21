**Empty is a value.** Like the native `<input type="number">`, the field can hold no number:

- `value` `null`, `undefined`, `''` or `NaN` shows an empty field with its `placeholder`, and `el.value`
  reads `null`. With no `value` at all it starts empty, even with a `min`: a number nobody entered is
  not shown as data.
- Clearing the text makes it empty and announces `value-change {value: null}`; leaving the field
  (blur or Enter) keeps it empty: it does not snap back to 0 or to `min`.
- `value-change` is live, on every keystroke and step. The commit is the native `change` on the host:
  the browser's after typing, the component's own after a stepper, an arrow key or the wheel. `@change`
  and `::value.lazy` hear it.
- `min` and `max` bound numbers only; empty stays empty. A stepper press or ArrowUp/ArrowDown on an
  empty field starts from `min` if there is one, else from 0.
- The form value is `null` when empty, so a `required` rule reports it missing; `0` is a number and
  passes.

Test for empty with `el.value === null`, never with a falsy check: `0` is a value.
