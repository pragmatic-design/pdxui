### `<pdx-radio-group>`

A managed set of radios.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | string | `''` | The current value. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `orientation` | `orientation` | string | `'vertical'` | Layout orientation — horizontal or vertical. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `label` | `label` | string | `''` | Accessible name of the group. Without it, a <pdx-label> right before the group names it. |

**Events:** `pdx-change` → `detail: { value }` — Fired when the value changes.

**Renders:** roles `radiogroup`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

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

