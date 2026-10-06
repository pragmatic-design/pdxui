### `<pdx-checkbox>`

On/off box with an indeterminate state.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `checked` | `checked` | boolean | `false` | Whether it is checked / on. |
| `indeterminate` | `indeterminate` | boolean | `false` | Shows the mixed/indeterminate state. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `tristate` | `tristate` | boolean | `false` | Enable 3-state cycle: unchecked → checked → indeterminate → unchecked |
| `label` | `label` | string | `''` | Visible label text. |
| `description` | `description` | string | `''` | Secondary descriptive text. |
| `value` | `value` | string | `''` | The current value. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `required` | `required` | boolean | `false` | Marks the field as required. |
| `labelPosition` | `labelposition` | string | `'right'` | Where the label sits relative to the control. |

**Events:** `pdx-change` → `detail: { checked, indeterminate, value, state } | { checked, value }` — Fired when the value changes.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic Checkbox** — Click to toggle. Label is part of the clickable area.

```html
<pdx-checkbox label="Accept terms"></pdx-checkbox>
<pdx-checkbox label="Pre-checked" checked></pdx-checkbox>
<pdx-checkbox label="Disabled" disabled></pdx-checkbox>
```

**With Description** — Supplemental text below the label for additional context. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-checkbox label="Marketing emails" description="Receive product updates and promotional offers"></pdx-checkbox>
  <pdx-checkbox label="Security alerts" description="Get notified about suspicious activity on your account" checked></pdx-checkbox>
  <pdx-checkbox label="Beta features" description="Try experimental features before they're released (may be unstable)"></pdx-checkbox>
</div>
```

**Indeterminate State** — Visual "—" state for a parent checkbox when only some children are selected. The native input has `indeterminate` only as a property; the component takes it as a prop or an attribute and sets it for you. A click settles it. Here the parent follows its children — all, none or some — and clicking it sets them all.

```html
<pdx-checkbox label="Select all items"
  :checked="allOn(items)" :indeterminate="someOn(items)"
  @pdx-change="e => items = setAll(items, e.detail.checked)"></pdx-checkbox>
&#64;for (items as item; track item.label) {
  <pdx-checkbox :label="item.label" :value="item.label" :checked="item.on"
    @pdx-change="e => items = setOne(items, e.detail)"></pdx-checkbox>
}
```

**Tristate** — `tristate` enables 3-state cycling on click: unchecked → checked → indeterminate → unchecked. Event detail includes `state: true | false | null` (null = indeterminate). Useful for filters and bulk operations. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-checkbox label="Include archived items" tristate></pdx-checkbox>
  <pdx-checkbox label="Show completed tasks" tristate checked></pdx-checkbox>
  <p class="pdx-txt-small pdx-ink-muted">Click each checkbox 3 times to see the full cycle.</p>
</div>
```

**Sizes** — 3 sizes: sm (16px), default (20px), lg (24px). _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-checkbox label="Small checkbox" size="sm" checked></pdx-checkbox>
  <pdx-checkbox label="Default checkbox" checked></pdx-checkbox>
  <pdx-checkbox label="Large checkbox" size="lg" checked></pdx-checkbox>
</div>
```

**Label Position** — Label on right (default) or left. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-checkbox label="Label on right (default)"></pdx-checkbox>
  <pdx-checkbox label="Label on left" labelPosition="left"></pdx-checkbox>
</div>
```

**Error State** — Red border to indicate validation error. Pair with error message below. _(from the live demo)_

```html
<div class="demo-stack">
  <div class="pdx-field">
    <pdx-checkbox label="I agree to the terms" error required></pdx-checkbox>
    <span class="pdx-field-error">You must accept the terms to continue</span>
  </div>
</div>
```

**Composition** — Checkboxes in realistic form contexts. _(from the live demo)_

```html
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Notification Preferences</h3>
  <div class="comp-form-single">
    <pdx-checkbox label="Email notifications" description="Get notified about new messages" checked></pdx-checkbox>
    <pdx-checkbox label="Push notifications" description="Receive browser push notifications" checked></pdx-checkbox>
    <pdx-checkbox label="SMS notifications" description="Text messages for urgent alerts only"></pdx-checkbox>
    <pdx-divider></pdx-divider>
    <pdx-checkbox label="Marketing communications" description="Product updates and promotional offers"></pdx-checkbox>
  </div>
</div>
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Permissions</h3>
  <div class="comp-form-single">
    <pdx-checkbox label="Select all" :checked="allOn(perms)" :indeterminate="someOn(perms)" @pdx-change="e => perms = setAll(perms, e.detail.checked)"></pdx-checkbox>
    <div style="padding-left:var(--pdx-space-lg);display:flex;flex-direction:column;gap:var(--pdx-space-sm)">
      @for (perms as perm; track perm.label) {
        <pdx-checkbox :label="perm.label" :description="perm.description" :value="perm.label" :checked="perm.on" @pdx-change="e => perms = setOne(perms, e.detail)"></pdx-checkbox>
      }
    </div>
  </div>
</div>
```

