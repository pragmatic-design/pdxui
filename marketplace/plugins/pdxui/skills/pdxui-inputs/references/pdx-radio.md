### `<pdx-radio>`

Pick a single option from a set.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `checked` | `checked` | boolean | `false` | Whether it is checked / on. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `label` | `label` | string | `''` | Visible label text. |
| `description` | `description` | string | `''` | Secondary descriptive text. |
| `value` | `value` | string | `''` | The current value. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `labelPosition` | `labelposition` | string | `'right'` | Where the label sits relative to the control. |

**Events:** `pdx-change` → `detail: { value }` — Fired when the value changes.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic Radio** — Standalone radios. Use `name` for native grouping or `<pdx-radio-group>` for managed selection. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-radio label="Option A" name="demo1" value="a" checked></pdx-radio>
  <pdx-radio label="Option B" name="demo1" value="b"></pdx-radio>
  <pdx-radio label="Option C (disabled)" name="demo1" value="c" disabled></pdx-radio>
</div>
```

**With Description** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-radio label="Free plan" description="5 projects, 1GB storage, community support" name="plan" value="free" checked></pdx-radio>
  <pdx-radio label="Pro plan" description="Unlimited projects, 100GB storage, priority support" name="plan" value="pro"></pdx-radio>
  <pdx-radio label="Enterprise" description="Custom limits, dedicated support, SLA" name="plan" value="enterprise"></pdx-radio>
</div>
```

**Radio Group** — `<pdx-radio-group>` manages selection, propagates name/size/disabled, and adds arrow key navigation (roving tabindex).

```html
<pdx-radio-group value="standard">
  <pdx-radio label="Standard (5-7 days)" value="standard"></pdx-radio>
  <pdx-radio label="Express (2-3 days)" value="express"></pdx-radio>
  <pdx-radio label="Overnight" value="overnight"></pdx-radio>
</pdx-radio-group>
```

**Horizontal Orientation** — Use `orientation="horizontal"` for inline layout. Arrow Left/Right for navigation. _(from the live demo)_

```html
<div class="demo-stack">
  <div class="pdx-field">
    <pdx-label text="Size"></pdx-label>
    <pdx-radio-group orientation="horizontal" value="md">
      <pdx-radio label="S" value="sm"></pdx-radio>
      <pdx-radio label="M" value="md"></pdx-radio>
      <pdx-radio label="L" value="lg"></pdx-radio>
      <pdx-radio label="XL" value="xl"></pdx-radio>
    </pdx-radio-group>
  </div>
</div>
```

**Group Size Propagation** — Set `size` on the group — propagates to all children. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-radio-group size="sm" value="a">
    <pdx-radio label="Small A" value="a"></pdx-radio>
    <pdx-radio label="Small B" value="b"></pdx-radio>
  </pdx-radio-group>
  <pdx-radio-group value="a">
    <pdx-radio label="Default A" value="a"></pdx-radio>
    <pdx-radio label="Default B" value="b"></pdx-radio>
  </pdx-radio-group>
  <pdx-radio-group size="lg" value="a">
    <pdx-radio label="Large A" value="a"></pdx-radio>
    <pdx-radio label="Large B" value="b"></pdx-radio>
  </pdx-radio-group>
</div>
```

**Error State** _(from the live demo)_

```html
<div class="demo-stack">
  <div class="pdx-field">
    <pdx-label text="Payment method" required></pdx-label>
    <pdx-radio-group error>
      <pdx-radio label="Credit card" value="card"></pdx-radio>
      <pdx-radio label="PayPal" value="paypal"></pdx-radio>
      <pdx-radio label="Bank transfer" value="bank"></pdx-radio>
    </pdx-radio-group>
    <span class="pdx-field-error">Please select a payment method</span>
  </div>
</div>
```

**Composition** — Groups in realistic form contexts. _(from the live demo)_

```html
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Account Settings</h3>
  <div class="comp-form-single">
    <div class="pdx-field">
      <pdx-label text="Theme" required size="sm"></pdx-label>
      <pdx-radio-group orientation="horizontal" value="system" size="sm">
        <pdx-radio label="Light" value="light"></pdx-radio>
        <pdx-radio label="Dark" value="dark"></pdx-radio>
        <pdx-radio label="System" value="system"></pdx-radio>
      </pdx-radio-group>
    </div>
    <pdx-divider></pdx-divider>
    <div class="pdx-field">
      <pdx-label text="Notifications" size="sm"></pdx-label>
      <pdx-checkbox-group size="sm" value="email,push">
        <pdx-checkbox label="Email" value="email" description="Daily digest"></pdx-checkbox>
        <pdx-checkbox label="Push" value="push" description="Real-time alerts"></pdx-checkbox>
        <pdx-checkbox label="SMS" value="sms" description="Urgent only"></pdx-checkbox>
      </pdx-checkbox-group>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:var(--pdx-space-sm);margin-top:var(--pdx-space-sm)">
      <pdx-button variant="ghost" size="sm">Cancel</pdx-button>
      <pdx-button variant="solid" size="sm">Save Settings</pdx-button>
    </div>
  </div>
</div>
```

