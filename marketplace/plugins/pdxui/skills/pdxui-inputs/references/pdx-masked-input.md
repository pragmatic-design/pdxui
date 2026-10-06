### `<pdx-masked-input>`

Input that enforces a fixed format.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | string | `''` | The current value. |
| `mask` | `mask` | string | `''` | Mask pattern: # = digit, A = letter, * = any. Or a preset: phone, phone-intl (a 1-3 digit country code, read from its prefix), card, date (MM/DD/YYYY), time (HH:MM), ssn, zip, zip-ext. A complete date or time out of range sets aria-invalid, and the events carry `valid: false`. |
| `placeholder` | `placeholder` | string | `''` | Placeholder text shown while empty. |
| `ariaLabel` | `arialabel` | string | `''` | Accessible name when there is no visible label. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `placeholderChar` | `placeholderchar` | string | `'_'` | Character shown for unfilled positions |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |
| `selectText()` | Select the whole text, so the next keystroke replaces it. Does not focus first. |

**Events:** `pdx-blur` — Fired when it loses focus.; `pdx-change` → `detail: { value, formatted, valid } | { value, formatted }` — Fired when the value changes.; `pdx-focus` — Fired when it receives focus.; `pdx-input` → `detail: { value, formatted, valid }` — Fired on each input as the user types.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Built-in Presets**

```html
<pdx-masked-input mask="phone"></pdx-masked-input>
<pdx-masked-input mask="card"></pdx-masked-input>
<pdx-masked-input mask="date"></pdx-masked-input>
```

**Custom Pattern** — Use `#` for digit, `A` for letter, `*` for any character.

```html
<pdx-masked-input mask="AA-###-AA"></pdx-masked-input>
```

**Masked Input** — Auto-formats as you type. Built-in presets (phone, card, date) or custom patterns. `#` = digit, `A` = letter, `*` = any.

```html
<!-- Built-in presets -->
<pdx-masked-input mask="phone"></pdx-masked-input>
<pdx-masked-input mask="card"></pdx-masked-input>
<pdx-masked-input mask="date"></pdx-masked-input>

<!-- Custom pattern: # digit, A letter, * any -->
<pdx-masked-input mask="AA-###-AA"></pdx-masked-input>
```

