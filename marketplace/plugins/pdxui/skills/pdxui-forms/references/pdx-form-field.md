### `<pdx-form-field>`

Label, control, hint and error in one.

**Fields space themselves.** Each `pdx-form-field` leaves `--pdx-form-field-gap` (space-md, scaled by
density) below itself, the last one in its container none, so a card body, a grid cell or a plain
`div` needs no wrapper. Inside `pdx-form`, `pdx-stack gap`, `pdx-row`, `pdx-grid`, `pdx-cluster`,
`pdx-form-section` and `pdx-field-group` the parent's gap is used instead, not added. In a flex or
grid container of your own that has a `gap`, drop the gap or set `margin-block-end: 0` on the fields:
otherwise the two add up. Tune the rhythm with the token, not with spacers.

**`error` alone shows nothing until the field is touched.** The message appears when the field is
touched, when `show-error` is set, or when its form validates `onChange`, so a field does not shout
while the user is still typing. An error decided by code, not by typing (a server rejection, a check
on save), goes with `show-error`:

```pdx
<template>
  <pdx-form-field label="PIN" :error="pinError" show-error><pdx-input type="password" /></pdx-form-field>
</template>
<script setup>
let pinError = $signal(''); // set when the server refuses the PIN: pinError = 'Wrong PIN'
</script>
```

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `name` | `name` | string | `''` | Field name — if set and inside <pdx-form>, auto-wires error/touched from form context. |
| `label` | `label` | string | `''` | Visible label text. |
| `hint` | `hint` | string | `''` | Helper text shown under the control. |
| `description` | `description` | string | `''` | Secondary descriptive text. |
| `error` | `error` | string | `''` | The error message. Shown only when the field is touched, when `show-error` is set, or when its form validates onChange: an error decided by code (a server rejection, a check on save) goes with `show-error`. |
| `warning` | `warning` | string | `''` | Non-blocking warning message (yellow, below error). |
| `success` | `success` | string | `''` | Applies the success state styling. |
| `required` | `required` | boolean | `false` | Marks the field as required. |
| `optional` | `optional` | boolean | `false` | Shows an 'optional' marker. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `touched` | `touched` | boolean | `false` | Whether the field has been interacted with (gates validation display). |
| `showError` | `showerror` | boolean | `false` | Force error display even if not touched |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `horizontal` | `horizontal` | boolean | `false` | Horizontal layout: label left, input right |
| `a11yLabel` | `a11ylabel` | string | `''` | The control's name when the field shows no `label`: set as its aria-label. A visible label wins, and a control that names itself keeps its own name. |

**Renders:** roles `alert`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic FormField** — Wraps label + input + hint. Auto-generates IDs and aria-describedby.

```html
<pdx-form-field label="Username" required hint="Must be unique">
  <pdx-input placeholder="Enter username..."></pdx-input>
</pdx-form-field>
```

**Error Display (touched-gated)** — Error shows only when `touched=true` (user has interacted). This prevents showing errors on pristine fields. Use `showError` to force display (e.g. on submit).

```html
<!-- Error hidden: not touched -->
<pdx-form-field label="Email" error="Invalid">...</pdx-form-field>

<!-- Error visible: touched -->
<pdx-form-field label="Email" error="Invalid" touched>...</pdx-form-field>

<!-- Error forced: on submit -->
<pdx-form-field label="Email" error="Required" showError>...</pdx-form-field>
```

**Success State** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="Username" success="Username is available" touched>
    <pdx-input value="john_doe"></pdx-input>
  </pdx-form-field>
</div>
```

**Works With All Inputs** — FormField wraps any input component — the slot-based design is agnostic. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="Password" required hint="Min 8 characters">
    <pdx-input type="password" placeholder="Enter password..."></pdx-input>
  </pdx-form-field>
  <pdx-form-field label="Comments" optional hint="Max 500 characters">
    <pdx-textarea placeholder="Leave a comment..." showCount maxlength="500" minRows="2" maxRows="6"></pdx-textarea>
  </pdx-form-field>
  <pdx-form-field label="Website" hint="Include https://">
    <pdx-input-group>
      <span class="pdx-input-addon">https://</span>
      <pdx-input placeholder="example.com"></pdx-input>
    </pdx-input-group>
  </pdx-form-field>
  <pdx-form-field label="Notifications">
    <pdx-switch label="Enable email alerts"></pdx-switch>
  </pdx-form-field>
  <pdx-form-field label="Role" required>
    <pdx-radio-group value="editor">
      <pdx-radio label="Viewer" value="viewer"></pdx-radio>
      <pdx-radio label="Editor" value="editor"></pdx-radio>
      <pdx-radio label="Admin" value="admin"></pdx-radio>
    </pdx-radio-group>
  </pdx-form-field>
  <pdx-form-field label="Skills" hint="Select all that apply">
    <pdx-checkbox-group orientation="horizontal" value="js">
      <pdx-checkbox label="JavaScript" value="js"></pdx-checkbox>
      <pdx-checkbox label="TypeScript" value="ts"></pdx-checkbox>
      <pdx-checkbox label="CSS" value="css"></pdx-checkbox>
      <pdx-checkbox label="Rust" value="rust"></pdx-checkbox>
    </pdx-checkbox-group>
  </pdx-form-field>
</div>
```

**Horizontal Layout** — Label on the left, input on the right. Good for settings pages. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="Full Name" required horizontal>
    <pdx-input placeholder="John Doe"></pdx-input>
  </pdx-form-field>
  <pdx-form-field label="Email" required horizontal hint="Primary email">
    <pdx-input type="email" placeholder="john@example.com"></pdx-input>
  </pdx-form-field>
  <pdx-form-field label="Theme" horizontal>
    <pdx-radio-group orientation="horizontal" value="system">
      <pdx-radio label="Light" value="light"></pdx-radio>
      <pdx-radio label="Dark" value="dark"></pdx-radio>
      <pdx-radio label="System" value="system"></pdx-radio>
    </pdx-radio-group>
  </pdx-form-field>
</div>
```

**Disabled** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="Locked Field" disabled hint="Contact admin to change">
    <pdx-input value="Cannot edit" disabled></pdx-input>
  </pdx-form-field>
</div>
```

**Size Propagation** — Set `size` on FormField — propagates to label and input children. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="Small field" required size="sm">
    <pdx-input placeholder="Small"></pdx-input>
  </pdx-form-field>
  <pdx-form-field label="Default field" required>
    <pdx-input placeholder="Default"></pdx-input>
  </pdx-form-field>
  <pdx-form-field label="Large field" required size="lg">
    <pdx-input placeholder="Large"></pdx-input>
  </pdx-form-field>
</div>
```

**Composition: Registration Form** — Complete form using FormField wrappers. Simulates a post-submit state with mixed validation. _(from the live demo)_

```html
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Create Account</h3>
  <div class="comp-form">
    <pdx-form-field label="First Name" required size="sm" showError error="">
      <pdx-input placeholder="Jane"></pdx-input>
    </pdx-form-field>
    <pdx-form-field label="Last Name" required size="sm" showError error="">
      <pdx-input placeholder="Doe"></pdx-input>
    </pdx-form-field>
    <pdx-form-field label="Email" required size="sm" error="Email is already taken" touched class="full-width">
      <pdx-input type="email" value="jane@example.com"></pdx-input>
    </pdx-form-field>
    <pdx-form-field label="Password" required size="sm" hint="Min 8 chars, 1 uppercase, 1 number" class="full-width">
      <pdx-input type="password" placeholder="Create a password"></pdx-input>
    </pdx-form-field>
    <pdx-form-field label="Terms" required size="sm" error="You must accept" showError class="full-width">
      <pdx-checkbox label="I agree to the Terms of Service and Privacy Policy"></pdx-checkbox>
    </pdx-form-field>
  </div>
  <div style="display:flex;justify-content:flex-end;gap:var(--pdx-space-sm);margin-top:var(--pdx-space-md)">
    <pdx-button variant="ghost" size="sm">Cancel</pdx-button>
    <pdx-button variant="solid" size="sm">Create Account</pdx-button>
  </div>
</div>
```

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

**States** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="Loading State">
    <pdx-search-input placeholder="Searching..." loading value="react"></pdx-search-input>
  </pdx-form-field>
  <pdx-form-field label="Custom Debounce (500ms)">
    <pdx-search-input placeholder="Type slowly..." debounce="500"></pdx-search-input>
  </pdx-form-field>
</div>
```

