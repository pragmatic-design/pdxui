### `<pdx-password-input>`

Password field with reveal and strength.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | string | `''` | The current value. |
| `placeholder` | `placeholder` | string | `''` | Placeholder text shown while empty. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `readonly` | `readonly` | boolean | `false` | Makes the value read-only — visible but not editable. |
| `required` | `required` | boolean | `false` | Marks the field as required. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `ariaLabel` | `arialabel` | string | `''` | Accessible name when there is no visible label. |
| `showStrength` | `showstrength` | boolean | `false` | Show strength meter below input |
| `loading` | `loading` | boolean | `false` | Show loading state |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |
| `selectText()` | Select the whole text, so the next keystroke replaces it. Does not focus first. |

**Events:** `pdx-blur` — Fired when it loses focus.; `pdx-change` → `detail: { value }` — Fired when the value changes.; `pdx-focus` — Fired when it receives focus.; `pdx-input` → `detail: { value }` — Fired on each input as the user types.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Password Input** — Toggle visibility button. Optional strength meter.

```html
<pdx-password-input placeholder="Enter password..." showStrength>
</pdx-password-input>
```

**Basic** — Toggle visibility button. Optional strength meter.

```html
<pdx-password-input placeholder="Enter password..." showStrength>
</pdx-password-input>
```

**States** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="Error State" error="Password is too short" touched>
    <pdx-password-input placeholder="Min 8 chars" error></pdx-password-input>
  </pdx-form-field>
  <pdx-form-field label="Disabled" disabled>
    <pdx-password-input value="hidden" disabled></pdx-password-input>
  </pdx-form-field>
</div>
```

