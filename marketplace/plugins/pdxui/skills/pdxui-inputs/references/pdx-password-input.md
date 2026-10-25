### `<pdx-password-input>`

Password field with reveal and strength.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `placeholder` | `placeholder` | string | `''` | Placeholder text shown while empty. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `readonly` | `readonly` | boolean | `false` | Makes the value read-only — visible but not editable. |
| `required` | `required` | boolean | `false` | Marks the field as required. |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `ariaLabel` | `arialabel` | string | `''` | Accessible name when there is no visible label. |
| `showStrength` | `showstrength` | boolean | `false` | Show strength meter below input |
| `loading` | `loading` | boolean | `false` | Show loading state |
| `size` | `size` | 'md' \| 'xs' \| 'sm' \| 'lg' \| 'xl' | `'md'` | xs, sm, md (the default), lg or xl — the same scale as pdx-input. |
| `value` | `value` | string | `''` | The current value. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |
| `selectText()` | Select the whole text, so the next keystroke replaces it. Does not focus first. |

**Events:** `pdx-blur` — The textbox lost focus.; `pdx-focus` — The textbox received focus.; `value-change` → `detail: { value: string }` — Fired when the component writes `value`. Does not bubble.

**States:** `:state(invalid)` — `error` is set.; `:state(disabled)` — `disabled` is set.; `:state(loading)` — `loading` is set.

**Parts:** `[data-part="root"]` — The frame: border, background and the states' colours.; `[data-part="input"]` — The native `<input>`, the textbox a form submits.; `[data-part="toggle"]` — The button that reveals or hides the password.; `[data-part="strength"]` — The strength meter under the frame, with `show-strength` and something typed.


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

