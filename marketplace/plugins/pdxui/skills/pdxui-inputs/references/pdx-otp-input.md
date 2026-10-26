### `<pdx-otp-input>`

One-time-code entry boxes, masked for a PIN.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `length` | `length` | number | `6` | Number of code cells. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `numeric` | `numeric` | boolean | `true` | Restrict input to digits. |
| `mask` | `mask` | boolean | `false` | Cells shown as dots, for a PIN: the label and autocomplete defaults become the PIN ones. |
| `separator` | `separator` | number | `0` | The separator between items. |
| `label` | `label` | string | `''` | The cells' group name. Empty: the otp-input.label component string, «Verification code»; with `mask`, otp-input.maskedLabel, «PIN». |
| `autocomplete` | `autocomplete` | string | `''` | The cells' autocomplete. Empty: 'one-time-code', which lets the browser offer a code it received by SMS; with `mask`, 'off' — a PIN is not a code the browser has. |
| `size` | `size` | 'md' \| 'sm' \| 'lg' | `'md'` | sm, md (the default) or lg: the cells' size. |
| `value` | `value` | string | `''` | The current value. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |

**Events:** `pdx-complete` → `detail: { value: string }` — Every cell is filled: the whole code.; `value-change` → `detail: { value: string }` — Fired when the component writes `value`. Does not bubble.

**Renders:** roles `group`

**States:** `:state(invalid)` — `error` is set; each cell is aria-invalid.; `:state(disabled)` — `disabled` is set; each cell is disabled.

**Parts:** `[data-part="root"]` — The cells' group, `role="group"`.; `[data-part="cell"]` — One cell: a native `<input>`, one per character.; `[data-part="separator"]` — The dash between groups of cells, with `separator`.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**OTP Input** — N-cell code entry. Auto-advance on type, paste spreads across cells, backspace navigates back. Fires `pdx-complete` when all cells filled.

```html
<pdx-otp-input length="6" separator="3"></pdx-otp-input>

<!-- Try pasting: 123456 -->
```

**PIN Input** — Masked code entry — `mask` shows dots instead of digits. The group is named «PIN» and the browser offers no one-time code. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="4-digit PIN">
    <pdx-otp-input mask length="4"></pdx-otp-input>
  </pdx-form-field>
  <pdx-form-field label="6-digit PIN">
    <pdx-otp-input mask length="6"></pdx-otp-input>
  </pdx-form-field>
  <pdx-form-field label="Error" error="Wrong PIN" showError>
    <pdx-otp-input mask length="4" error></pdx-otp-input>
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

**Masked PIN** — `mask` shows dots instead of digits, for a PIN. The group is named «PIN» unless `label` says otherwise, and the browser offers no one-time code. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="4-digit PIN">
    <pdx-otp-input mask length="4"></pdx-otp-input>
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

