### `<pdx-label>`

A form label tied to its control.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `for` | `for` | string | `''` | ID of the control this label describes. |
| `text` | `text` | string | `''` | The label text. |
| `required` | `required` | boolean | `false` | Marks the field as required. |
| `optional` | `optional` | boolean | `false` | Shows an 'optional' marker. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `hint` | `hint` | string | `''` | Secondary hint text. |
| `description` | `description` | string | `''` | Secondary descriptive text. |


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic Label** — Simple form label with `text` prop. Associates with input via `for`.

```html
<pdx-label text="Username" for="demo-user"></pdx-label>
<input id="demo-user" class="pdx-input" placeholder="Enter username..." />
```

**Required & Optional Indicators** — `required` appends a red asterisk. `optional` appends "(optional)" in muted text. Both use CSS pseudo-elements — no extra DOM.

```html
<pdx-label text="Email" required></pdx-label>
<pdx-label text="Nickname" optional></pdx-label>
```

**Sizes** — 4 sizes: `xs`, `sm`, default (`md`), `lg`, `xl`. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-label text="Extra Small (xs)" size="xs"></pdx-label>
  <pdx-label text="Small (sm)" size="sm"></pdx-label>
  <pdx-label text="Default (md)"></pdx-label>
  <pdx-label text="Large (lg)" size="lg"></pdx-label>
  <pdx-label text="Extra Large (xl)" size="xl"></pdx-label>
</div>
```

**Disabled State** — Visually muted, not-allowed cursor. Pairs with disabled inputs. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-label text="Disabled Field" disabled></pdx-label>
  <input class="pdx-input" placeholder="Can't edit" disabled />
</div>
```

**Hint & Description** — `description` renders below the label (supplemental context). `hint` renders below description (helper text for the input). _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-label text="Password" required description="Must be at least 8 characters" hint="Include letters, numbers, and symbols"></pdx-label>
  <input class="pdx-input" type="password" placeholder="Enter password..." />
</div>
<div class="demo-stack" style="margin-top:var(--pdx-space-lg)">
  <pdx-label text="Bio" description="Tell us about yourself"></pdx-label>
  <textarea class="pdx-input" rows="3" placeholder="Write something..."></textarea>
</div>
```

**Field Wrapper Integration** — Inside `.pdx-field` wrapper, labels auto-space with inputs. Error state propagates via `:has([aria-invalid])`.

```html
<div class="pdx-field">
  <pdx-label text="Full Name" required></pdx-label>
  <input class="pdx-input" placeholder="John Doe" />
</div>

<!-- Error state: label turns red automatically -->
<div class="pdx-field">
  <pdx-label text="Invalid" required></pdx-label>
  <input class="pdx-input" aria-invalid="true" />
  <span class="pdx-field-error">Error message</span>
</div>
```

**Composition** — Labels in a realistic form layout. _(from the live demo)_

```html
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Registration Form</h3>
  <div class="comp-form">
    <div class="pdx-field">
      <pdx-label text="First Name" required size="sm"></pdx-label>
      <input class="pdx-input pdx-input-sm" placeholder="Jane" />
    </div>
    <div class="pdx-field">
      <pdx-label text="Last Name" required size="sm"></pdx-label>
      <input class="pdx-input pdx-input-sm" placeholder="Doe" />
    </div>
    <div class="pdx-field full-width">
      <pdx-label text="Email" required size="sm" description="Your primary email address"></pdx-label>
      <input class="pdx-input pdx-input-sm" type="email" placeholder="jane@example.com" />
    </div>
    <div class="pdx-field full-width">
      <pdx-label text="Company" optional size="sm"></pdx-label>
      <input class="pdx-input pdx-input-sm" placeholder="Acme Inc." />
    </div>
  </div>
</div>
```

**CSS-only (no WC)** — Use `.pdx-field-label` + `.pdx-field-required` classes directly on `<label>` elements.

```html
<label class="pdx-field-label">Standard</label>
<label class="pdx-field-label pdx-field-required">Required</label>
<label class="pdx-field-label pdx-field-optional">Optional</label>
<label class="pdx-field-label pdx-field-label-disabled">Disabled</label>
```

