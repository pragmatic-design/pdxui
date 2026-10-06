### `<pdx-button>`

Clickable action — 9 variants, sizes, loading and icons.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `variant` | `variant` | 'solid' \| 'primary' \| 'secondary' \| 'outline' \| 'ghost' \| 'link' \| 'danger' \| 'success' \| 'warning' \| 'info' | `'primary'` | Visual variant. |
| `size` | `size` | 'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl' | `''` | xs, sm, md (the default), lg or xl — the same scale as pdx-input and pdx-select. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `loading` | `loading` | boolean | `false` | Shows a loading / busy state. |
| `type` | `type` | 'button' \| 'submit' \| 'reset' | `'button'` | Native button type: 'button', 'submit' or 'reset'. |
| `full` | `full` | boolean | `false` | Stretches to the full width of its container. |
| `toggle` | `toggle` | boolean | `false` | Toggle mode: button maintains pressed/unpressed state |
| `pressed` | `pressed` | boolean | `false` | Pressed state for toggle buttons |
| `label` | `label` | string | `''` | The button's text, rendered inside its `<button>` after any slotted content (an icon). Set this — not `textContent`, which replaces the rendered `<button>` with bare text once the button is connected. |
| `ariaLabel` | `arialabel` | string | `''` | The accessible name of an icon-only button, forwarded to the inner `<button>`: `aria-label` on the host has no role to name. |
| `ariaLabelledby` | `arialabelledby` | string | `''` | The id of an element whose text names the button, forwarded to the inner `<button>`. |

**Events:** `pdx-toggle` → `detail: { pressed }` — Fired when toggled open or closed. Does not bubble.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Variants** — 9 semantic variants via `variant` prop. Click any button to see events in the console above.

```html
<pdx-button variant="primary">Primary</pdx-button>
<pdx-button variant="secondary">Secondary</pdx-button>
<pdx-button variant="outline">Outline</pdx-button>
<pdx-button variant="ghost">Ghost</pdx-button>
<pdx-button variant="link">Link</pdx-button>
<pdx-button variant="danger">Danger</pdx-button>
```

**With Icons** — Slot content: combine `<pdx-icon>` + text. Icon inherits button color.

```html
<pdx-button variant="primary">
  <pdx-icon name="plus" size="sm"></pdx-icon> New Project
</pdx-button>

<!-- Icon-only: the icon says nothing to a screen reader, aria-label names the button -->
<pdx-button variant="ghost" aria-label="Settings">
  <pdx-icon name="settings" size="sm"></pdx-icon>
</pdx-button>
```

**Sizes** — 3 sizes via `size` prop: sm, default, lg.

```html
<pdx-button variant="primary" size="sm">Small</pdx-button>
<pdx-button variant="primary">Default</pdx-button>
<pdx-button variant="primary" size="lg">Large</pdx-button>
```

**Toggle Button** — Add `toggle` prop for stateful on/off buttons. Uses `aria-pressed`. Emits `pdx-toggle`.

```html
<pdx-button toggle variant="outline">Bold</pdx-button>
<pdx-button toggle variant="primary" pressed>Active</pdx-button>
```

**Loading State** — Set `loading` prop. Button becomes disabled with spinner overlay. `aria-busy="true"` set automatically. Click to toggle.

```html
<pdx-button variant="primary" :loading="isSaving">
  Save
</pdx-button>
```

**Disabled** — Set `disabled` prop. Click events are blocked. Try clicking — no console output. _(from the live demo)_

```html
<div class="btn-row">
  <pdx-button variant="primary" disabled @click="log">Primary</pdx-button>
  <pdx-button variant="secondary" disabled @click="log">Secondary</pdx-button>
  <pdx-button variant="outline" disabled @click="log">Outline</pdx-button>
  <pdx-button variant="ghost" disabled @click="log">Ghost</pdx-button>
</div>
```

**Full Width** — Add `full` prop for block-level buttons. _(from the live demo)_

```html
<div class="full-demo">
  <pdx-button variant="primary" full @click="log">Full Width Primary</pdx-button>
  <pdx-button variant="outline" full @click="log">Full Width Outline</pdx-button>
</div>
```

**Composition** — Buttons in realistic dialog actions. _(from the live demo)_

```html
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Confirm Deployment</h3>
  <p class="pdx-txt-small pdx-ink-muted">Deploy v2.5.0 to production? This will affect all users.</p>
  <div class="comp-actions">
    <pdx-button variant="ghost" @click="log">Cancel</pdx-button>
    <pdx-button variant="primary" @click="log"><pdx-icon name="upload" size="sm"></pdx-icon> Deploy</pdx-button>
  </div>
</div>
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Delete Repository</h3>
  <p class="pdx-txt-small pdx-ink-muted">This cannot be undone. All data will be permanently removed.</p>
  <div class="comp-actions">
    <pdx-button variant="outline" @click="log">Keep</pdx-button>
    <pdx-button variant="danger" @click="log"><pdx-icon name="trash" size="sm"></pdx-icon> Delete Forever</pdx-button>
  </div>
</div>
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Unsaved Changes</h3>
  <p class="pdx-txt-small pdx-ink-muted">You have unsaved changes. What would you like to do?</p>
  <div class="comp-actions">
    <pdx-button variant="link" @click="log">Discard</pdx-button>
    <pdx-button variant="secondary" @click="log">Save Draft</pdx-button>
    <pdx-button variant="primary" @click="log">Publish</pdx-button>
  </div>
</div>
```

**Programmatic Confirm** — Returns `true` (Confirm) or `false` (Cancel / Escape). _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button variant="outline" size="sm" @click="onConfirm">dialog.confirm()</pdx-button>
  <span class="pdx-txt-small pdx-ink-muted">Result: {{ confirmResult }}</span>
</div>
```

**Programmatic Alert** — Single OK button. Resolves when dismissed. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button variant="outline" size="sm" @click="onAlert">dialog.alert()</pdx-button>
</div>
```

**Danger + Type-to-Confirm** — Red variant with type-to-confirm protection. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button variant="danger" size="sm" @click="onDangerConfirm">Delete Account</pdx-button>
  <span class="pdx-txt-small pdx-ink-muted">Result: {{ dangerResult }}</span>
</div>
```

**Timer-Gated Confirm** — Confirm button disabled for 3 seconds. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button variant="outline" size="sm" @click="onTimerConfirm">Timer Confirm</pdx-button>
</div>
```

**Dialog + Toast Coexistence** — Shows confirm + fires toast simultaneously. Both use overlayStack. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button variant="primary" size="sm" @click="onDialogPlusToast">Confirm + Toast</pdx-button>
</div>
```

**Cascade Close (LIFO)** — Opens 3 dialogs stacked. Press Escape to close them one by one (LIFO order). _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button variant="outline" size="sm" @click="onCascade">Open 3 Stacked</pdx-button>
</div>
```

**Declarative + Programmatic Mix** — A declarative `<pdx-dialog>` with a programmatic `dialog.confirm()` on top. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button variant="outline" size="sm" @click="openDeclarative">Open Dialog</pdx-button>
</div>
<pdx-dialog :open="declOpen" title="Declarative Dialog" size="md">
  <p style="margin:0 0 var(--pdx-space-md)">This dialog is opened via <code>:open</code> binding.</p>
  <p style="margin:0">Click below to open a programmatic confirm on top of this dialog.</p>
  <span slot="footer">
    <pdx-button variant="danger" size="sm" @click="onNestedConfirm">Delete (Programmatic)</pdx-button>
    <pdx-button variant="ghost" size="sm" @click="closeDeclarative">Close</pdx-button>
  </span>
</pdx-dialog>
```

