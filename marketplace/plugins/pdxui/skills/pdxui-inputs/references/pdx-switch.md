### `<pdx-switch>`

Toggle a setting on or off.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `checked` | `checked` | boolean | `false` | Whether it is checked / on. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `loading` | `loading` | boolean | `false` | Shows a loading / busy state. |
| `label` | `label` | string | `''` | Visible label text. |
| `description` | `description` | string | `''` | Secondary descriptive text. |
| `ariaLabel` | `arialabel` | string | `''` | Accessible name when there is no visible label (forwarded to the inner input) |
| `labelPosition` | `labelposition` | string | `'right'` | Where the label sits relative to the control. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `value` | `value` | string | `''` | The current value. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |

**Events:** `pdx-change` → `detail: { checked, value }` — Fired when the value changes.

**Renders:** roles `switch`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic Switch** — Click to toggle. Label is part of the clickable area.

```html
<pdx-switch label="Notifications"></pdx-switch>
<pdx-switch label="Dark mode" checked></pdx-switch>
<pdx-switch label="Disabled" disabled></pdx-switch>
```

**With Description** — Supplemental text below the label. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-switch label="Email notifications" description="Receive daily digest of activity" checked></pdx-switch>
  <pdx-switch label="Push notifications" description="Real-time alerts in your browser" checked></pdx-switch>
  <pdx-switch label="Marketing emails" description="Product updates and promotional offers"></pdx-switch>
</div>
```

**Sizes** — 3 sizes: sm, default, lg. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-switch label="Small switch" size="sm" checked></pdx-switch>
  <pdx-switch label="Default switch" checked></pdx-switch>
  <pdx-switch label="Large switch" size="lg" checked></pdx-switch>
</div>
```

**Label Position** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-switch label="Label on right (default)" checked></pdx-switch>
  <pdx-switch label="Label on left" labelPosition="left" checked></pdx-switch>
</div>
```

**Loading State** — Spinner replaces the thumb dot while an async operation completes. Switch is disabled during loading. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-switch label="Syncing preferences..." loading></pdx-switch>
  <pdx-switch label="Enabling feature..." loading checked></pdx-switch>
</div>
```

**Error State** _(from the live demo)_

```html
<div class="demo-stack">
  <div class="pdx-field">
    <pdx-switch label="Accept cookies" error></pdx-switch>
    <span class="pdx-field-error">You must accept cookies to continue</span>
  </div>
</div>
```

**Composition** — Switches in realistic settings contexts. _(from the live demo)_

```html
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Privacy Settings</h3>
  <div class="comp-form-single">
    <pdx-switch label="Profile visible" description="Allow others to see your profile" checked></pdx-switch>
    <pdx-switch label="Activity status" description="Show when you're online" checked></pdx-switch>
    <pdx-switch label="Read receipts" description="Let others know when you've read their messages"></pdx-switch>
    <pdx-divider></pdx-divider>
    <pdx-switch label="Two-factor authentication" description="Extra security for your account" checked></pdx-switch>
  </div>
</div>
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Feature Flags</h3>
  <div class="comp-form-single">
    <pdx-switch label="New dashboard" description="Beta: redesigned dashboard layout" size="sm" checked></pdx-switch>
    <pdx-switch label="AI suggestions" description="Beta: AI-powered content suggestions" size="sm" loading></pdx-switch>
    <pdx-switch label="Dark mode" description="Enable dark color scheme" size="sm" checked></pdx-switch>
  </div>
</div>
```

