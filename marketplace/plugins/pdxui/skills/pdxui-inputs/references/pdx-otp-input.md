### `<pdx-otp-input>`

One-time-code entry boxes.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `length` | `length` | number | `6` | Number of code cells. |
| `value` | `value` | string | `''` | The current value. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `numeric` | `numeric` | boolean | `true` | Restrict input to digits. |
| `mask` | `mask` | boolean | `false` | Mask the entered characters (like a password). |
| `separator` | `separator` | number | `0` | The separator between items. |
| `label` | `label` | string | `''` | The cells' group name. Empty: the otp-input.label component string, «Verification code». |
| `autocomplete` | `autocomplete` | string | `'one-time-code'` | The cells' autocomplete: 'one-time-code' lets the browser offer a code it received by SMS. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |

**Events:** `pdx-complete` → `detail: { value }` — Fired on `pdx-complete`.; `pdx-input` → `detail: { value }` — Fired on each input as the user types.

**Renders:** roles `group`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**OTP Input** — N-cell code entry. Auto-advance on type, paste spreads across cells, backspace navigates back. Fires `pdx-complete` when all cells filled.

```html
<pdx-otp-input length="6" separator="3"></pdx-otp-input>

<!-- Try pasting: 123456 -->
```

**Sizes** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-otp-input length="4" size="sm"></pdx-otp-input>
  <pdx-otp-input length="4"></pdx-otp-input>
  <pdx-otp-input length="4" size="lg"></pdx-otp-input>
</div>
```

**Basic**

```html
<pdx-otp-input length="6"></pdx-otp-input>
```

**With Separator** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="Separator every 3 digits">
    <pdx-otp-input length="6" separator="3"></pdx-otp-input>
  </pdx-form-field>
</div>
```

**States** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="Error state" error="Invalid code. Try again." showError>
    <pdx-otp-input length="6" error></pdx-otp-input>
  </pdx-form-field>
</div>
```

**Sizes** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-otp-input length="4" size="sm"></pdx-otp-input>
  <pdx-otp-input length="4"></pdx-otp-input>
  <pdx-otp-input length="4" size="lg"></pdx-otp-input>
</div>
```

