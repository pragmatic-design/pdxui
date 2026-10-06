### `<pdx-number-input>`

Numeric field with steppers and formatting.

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

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | number \| null | `null` | The number, or `null` when the field is empty. |
| `min` | `min` | number | `-Infinity` | Minimum allowed value. |
| `max` | `max` | number | `Infinity` | Maximum allowed value. |
| `step` | `step` | number | `1` | Increment step. |
| `precision` | `precision` | number | `-1` | Decimal places to round/format to (-1 = derive from step). |
| `trimZeros` | `trimzeros` | boolean | `false` | Show only the decimals the value has, up to `precision`: 29.5 at `precision="3"` is "29.5", not "29.500". The value is still rounded to `precision`, and what the field emits does not change. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `readonly` | `readonly` | boolean | `false` | Makes the value read-only — visible but not editable. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `placeholder` | `placeholder` | string | `''` | Placeholder text shown while empty. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `ariaLabel` | `arialabel` | string | `''` | Accessible name when there is no visible label. |
| `controls` | `controls` | 'both' \| 'right' \| 'none' | `'both'` | 'both'=−left +right, 'right'=stacked on right, 'none'=hidden |
| `stepMode` | `stepmode` | 'auto' \| 'fixed' \| 'caret' | `'auto'` | What the arrow keys and the wheel step. `fixed`: one `step`. `caret`: the digit before the caret — `12\|3` ↑ is 133, `1.2\|5` ↑ is 1.35 — and the caret stays on that digit. `auto`, the default: `caret` with `controls="none"`, `fixed` with steppers shown. |
| `allowWheel` | `allowwheel` | boolean | `false` | Allow the mouse wheel to change the value when focused. |
| `allowNegative` | `allownegative` | boolean | `false` | Allow negative values (adds a sign toggle). |
| `locale` | `locale` | string | `''` | Locale for formatting and for reading a typed value. Empty: the page's language (`lang`), then the browser's. |
| `currency` | `currency` | string | `''` | ISO currency code for currency formatting (e.g. EUR). |
| `colorBySign` | `colorbysign` | boolean | `false` | Color the number green (positive) / red (negative) |
| `loading` | `loading` | boolean | `false` | Show loading state |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |
| `selectText()` | Select the whole text, so the next keystroke replaces it. Does not focus first. |

**Events:** `pdx-blur` — Fired when it loses focus.; `pdx-change` → `detail: { value }` — Fired when the value changes.; `pdx-focus` — Fired when it receives focus.; `pdx-input` → `detail: { value }` — Fired on each input as the user types.

**Renders:** roles `spinbutton`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Arrow Up/Down add or remove one `step`; Shift multiplies by 10. Home/End go to min/max when they are set.

```html
<pdx-number-input
  value="1234.56"
  step="0.01"
  precision="2"
  min="0"
  max="9999"
  allowWheel>
</pdx-number-input>
```

**Control Styles** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="Both sides (default)">
    <pdx-number-input value="42" min="0" max="100"></pdx-number-input>
  </pdx-form-field>
  <pdx-form-field label="Stacked right">
    <pdx-number-input value="25" min="0" max="100" controls="right"></pdx-number-input>
  </pdx-form-field>
  <pdx-form-field label="Free mode (no steppers)" hint="Arrow keys step the digit before the cursor">
    <pdx-number-input value="1234" controls="none"></pdx-number-input>
  </pdx-form-field>
</div>
```

**Step on the digit before the cursor** — `step-mode="caret"`: Arrow Up/Down (and the wheel) change the digit before the cursor — `12|3` ↑ is 133, `1.2|5` ↑ is 1.35 — and the cursor stays on that digit, also when the number gains one (99 → 109). `auto`, the default, is this without steppers and one `step` with them; `fixed` is always one `step`.

```html
<pdx-number-input value="1234.56" step="0.01" precision="2" step-mode="caret"></pdx-number-input>
```

**Sign Toggle** — Green (+) / red (-) toggle button. Press +/- keys or click. `colorBySign` colors the number. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="Amount" hint="Click +/- button or press key">
    <pdx-number-input value="100" allowNegative precision="2"></pdx-number-input>
  </pdx-form-field>
  <pdx-form-field label="Colored by sign">
    <pdx-number-input value="-75.50" allowNegative colorBySign precision="2"></pdx-number-input>
  </pdx-form-field>
</div>
```

**Locale Formatting** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="US Dollar">
    <pdx-number-input value="1234.50" locale="en-US" currency="USD" precision="2"></pdx-number-input>
  </pdx-form-field>
  <pdx-form-field label="Euro (German)">
    <pdx-number-input value="1234.50" locale="de-DE" currency="EUR" precision="2"></pdx-number-input>
  </pdx-form-field>
</div>
```

**Number Input** — Figma-style: Place cursor on a digit → Arrow Up/Down increments that digit position. Shift×10 multiplier, Ctrl for min/max. Scroll wheel support.

```html
<pdx-number-input
  value="1234.56"
  step="0.01"
  precision="2"
  min="0"
  max="9999"
  allowWheel
  locale="en-US"
  currency="USD">
</pdx-number-input>
```

