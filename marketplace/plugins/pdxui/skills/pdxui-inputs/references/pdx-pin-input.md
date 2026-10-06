### `<pdx-pin-input>`

Segmented PIN entry.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `length` | `length` | number | `4` | Number of PIN cells. |
| `value` | `value` | string | `''` | The current value. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `numeric` | `numeric` | boolean | `true` | Restrict input to digits. |
| `label` | `label` | string | `''` | The cells' group name. Empty: the pin-input.label component string, «PIN». |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |

**Events:** `pdx-input` → `detail: { value }` — Fired on each input as the user types.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**PIN Input** — Masked code entry — shows dots instead of digits. Same behavior as OTP but for passwords/PINs. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="4-digit PIN">
    <pdx-pin-input length="4"></pdx-pin-input>
  </pdx-form-field>
  <pdx-form-field label="6-digit PIN">
    <pdx-pin-input length="6"></pdx-pin-input>
  </pdx-form-field>
  <pdx-form-field label="Error" error="Wrong PIN" showError>
    <pdx-pin-input length="4" error></pdx-pin-input>
  </pdx-form-field>
</div>
```

**Basic** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="4-digit PIN">
    <pdx-pin-input length="4"></pdx-pin-input>
  </pdx-form-field>
  <pdx-form-field label="6-digit PIN">
    <pdx-pin-input length="6"></pdx-pin-input>
  </pdx-form-field>
</div>
```

**States** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="Error" error="Wrong PIN" showError>
    <pdx-pin-input length="4" error></pdx-pin-input>
  </pdx-form-field>
</div>
```

