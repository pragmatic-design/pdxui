### `<pdx-spinner>`

A lightweight loading indicator.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `variant` | `variant` | string | `'spinner'` | Visual variant. |
| `size` | `size` | string | `'md'` | Size of the control (e.g. sm, md, lg). |
| `label` | `label` | string | `''` | The accessible name. Empty means "use the translated default" — a prop default cannot be a literal here, because the spinners the LIBRARY builds have no author to pass one: a pdx-list puts a pdx-block-ui over itself while its source loads, and nothing on that path reaches the spinner inside it. An app in Italian would be left with an English "Loading" it could not override. |
| `showLabel` | `showlabel` | boolean | `false` | Shows a text label beside the spinner. |

**Renders:** roles `status`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Variants** — 3 variants: `spinner` (default SVG circle), `dots` (pulsing), `bar` (indeterminate progress).

```html
<pdx-spinner></pdx-spinner>
<pdx-spinner variant="dots"></pdx-spinner>
<pdx-spinner variant="bar"></pdx-spinner>
```

**Sizes** — 5 sizes: xs (12px), sm (16px), md (24px), lg (32px), xl (48px). _(from the live demo)_

```html
<div class="demo-row">
  <div class="demo-item"><pdx-spinner size="xs"></pdx-spinner><span class="pdx-txt-caption pdx-ink-muted">xs</span></div>
  <div class="demo-item"><pdx-spinner size="sm"></pdx-spinner><span class="pdx-txt-caption pdx-ink-muted">sm</span></div>
  <div class="demo-item"><pdx-spinner size="md"></pdx-spinner><span class="pdx-txt-caption pdx-ink-muted">md</span></div>
  <div class="demo-item"><pdx-spinner size="lg"></pdx-spinner><span class="pdx-txt-caption pdx-ink-muted">lg</span></div>
  <div class="demo-item"><pdx-spinner size="xl"></pdx-spinner><span class="pdx-txt-caption pdx-ink-muted">xl</span></div>
</div>
```

**Color Inheritance** — Spinner inherits `color` from parent via `currentColor`. _(from the live demo)_

```html
<div class="demo-row">
  <span style="color:var(--pdx-color-primary)"><pdx-spinner size="lg"></pdx-spinner></span>
  <span style="color:var(--pdx-color-danger)"><pdx-spinner size="lg"></pdx-spinner></span>
  <span style="color:var(--pdx-color-success)"><pdx-spinner size="lg"></pdx-spinner></span>
  <span style="color:var(--pdx-color-warning)"><pdx-spinner size="lg"></pdx-spinner></span>
  <span style="color:var(--pdx-color-accent)"><pdx-spinner size="lg"></pdx-spinner></span>
</div>
```

**With Visible Label** — `showLabel` renders the label text below the spinner. Without it, label is aria-only.

```html
<pdx-spinner label="Loading..." showLabel></pdx-spinner>
<pdx-spinner label="Saving..." showLabel size="lg"></pdx-spinner>
```

**Custom Speed & Thickness** — CSS variables: `--pdx-spinner-speed` and `--pdx-spinner-thickness`.

```html
<span style="--pdx-spinner-speed: 0.5s">
  <pdx-spinner size="lg"></pdx-spinner>
</span>
<span style="--pdx-spinner-thickness: 5">
  <pdx-spinner size="lg"></pdx-spinner>
</span>
```

**Inline with Text** _(from the live demo)_

```html
<div class="demo-col">
  <p class="pdx-txt-body">Processing <pdx-spinner size="sm"></pdx-spinner> please wait...</p>
  <p class="pdx-txt-body">Saving your changes <pdx-spinner size="xs"></pdx-spinner></p>
</div>
```

**Composition** — Spinner inside a button for async actions. _(from the live demo)_

```html
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Loading State</h3>
  <div class="loading-center">
    <pdx-spinner size="xl" label="Loading dashboard..." showLabel></pdx-spinner>
  </div>
</div>
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Button Loading</h3>
  <div class="demo-row" style="margin-top:var(--pdx-space-sm)">
    <pdx-button variant="primary" loading>Saving...</pdx-button>
    <pdx-button variant="outline"><pdx-spinner size="sm"></pdx-spinner> Loading</pdx-button>
  </div>
</div>
```

