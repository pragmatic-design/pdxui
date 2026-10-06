### `<pdx-banner>`

A persistent inline message.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `variant` | `variant` | string | `'info'` | Visual variant. |
| `closable` | `closable` | boolean | `false` | Shows a close affordance. |
| `autoDismiss` | `autodismiss` | number | `0` | Auto-dismiss after this many ms. |
| `showIcon` | `showicon` | boolean | `true` | Shows the leading status icon. |
| `subtle` | `subtle` | boolean | `false` | Uses the low-emphasis (tinted) style. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `dismiss()` | Hide the banner and emit `pdx-close`, moving focus out of it first. |
| `show()` | Shows it. |
| `isVisible` _(read-only)_ | Read-only, via a ref: `el.isVisible`. |

**Events:** `pdx-close` — Fired when it closes. Does not bubble.

**Renders:** roles `alert` · `status`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Variants** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-banner variant="info">This is an informational message.</pdx-banner>
  <pdx-banner variant="success">Operation completed successfully!</pdx-banner>
  <pdx-banner variant="warning">Please review your settings before continuing.</pdx-banner>
  <pdx-banner variant="danger">An error occurred while saving.</pdx-banner>
</div>
```

**Closable** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-banner variant="info" closable>Click the × to dismiss this banner.</pdx-banner>
  <pdx-banner variant="success" closable>You can close this success message.</pdx-banner>
</div>
```

**Subtle** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-banner variant="info" subtle>Subtle info — lighter background.</pdx-banner>
  <pdx-banner variant="warning" subtle closable>Subtle warning with close.</pdx-banner>
</div>
```

**Auto-dismiss** — This banner disappears 5 seconds after it is shown. `show()` brings it back and starts the 5 seconds over.

```html
<pdx-banner variant="success" autoDismiss="5000" closable :ref="banner">…</pdx-banner>
<button @click="banner.show()">Show again</button>
```

**Without Icon** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-banner variant="info" :showIcon="false">A banner without the leading icon.</pdx-banner>
</div>
```

