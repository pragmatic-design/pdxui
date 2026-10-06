### `<pdx-fieldset>`

A bordered, titled group of fields.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `legend` | `legend` | string | `''` | The fieldset legend/title. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `invalid` | `invalid` | boolean | `false` | Marks the group as invalid. |
| `error` | `error` | string | `''` | Marks the control as invalid. |
| `description` | `description` | string | `''` | Secondary descriptive text. |
| `variant` | `variant` | string | `'bordered'` | Visual variant. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `collapsible` | `collapsible` | boolean | `false` | Allows the group to collapse. |
| `collapsed` | `collapsed` | boolean | `false` | Whether it starts collapsed. |

**Events:** `toggle` → `detail: { collapsed }` — Fired when toggled open or closed.

**Renders:** roles `alert`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Bordered (default)**

```html
<pdx-fieldset legend="Personal Information" description="Required fields.">
  <pdx-form-field label="First Name" required>
    <pdx-input placeholder="John"></pdx-input>
  </pdx-form-field>
</pdx-fieldset>
```

**Filled Variant** _(from the live demo)_

```html
<div class="demo-block">
  <pdx-fieldset legend="Contact" variant="filled">
    <pdx-form-field label="Phone">
      <pdx-input placeholder="+1 555-0100"></pdx-input>
    </pdx-form-field>
  </pdx-fieldset>
</div>
```

**Plain Variant** _(from the live demo)_

```html
<div class="demo-block">
  <pdx-fieldset legend="Logical group (no visual box)" variant="plain">
    <pdx-form-field label="Notes">
      <pdx-textarea placeholder="Additional notes"></pdx-textarea>
    </pdx-form-field>
  </pdx-fieldset>
</div>
```

**Collapsible** — Click the chevron to expand/collapse. _(from the live demo)_

```html
<div class="demo-block">
  <pdx-fieldset legend="Advanced Options" collapsible :collapsed="collapsed1" @toggle="onToggle">
    <pdx-form-field label="Timeout">
      <pdx-input placeholder="5000"></pdx-input>
    </pdx-form-field>
  </pdx-fieldset>
</div>
```

**Disabled** _(from the live demo)_

```html
<div class="demo-block">
  <pdx-fieldset legend="Disabled Section" disabled>
    <pdx-form-field label="Name">
      <pdx-input placeholder="Cannot edit"></pdx-input>
    </pdx-form-field>
  </pdx-fieldset>
</div>
```

**Invalid with Error** _(from the live demo)_

```html
<div class="demo-block">
  <pdx-fieldset legend="Payment" invalid error="Please fill all required fields.">
    <pdx-form-field label="Card Number" required error="Required">
      <pdx-input placeholder="4242 4242 4242 4242"></pdx-input>
    </pdx-form-field>
  </pdx-fieldset>
</div>
```

