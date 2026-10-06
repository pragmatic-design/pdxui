### `<pdx-progress>`

Linear progress, determinate or not.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | number | `-1` | Current value (0-100). Omit or -1 for indeterminate. |
| `max` | `max` | number | `100` | Max value (default 100) |
| `variant` | `variant` | string | `''` | Color variant: primary (default), success, warning, danger |
| `size` | `size` | string | `''` | Size: sm, md (default), lg |
| `showLabel` | `showlabel` | boolean | `false` | Show percentage label |
| `label` | `label` | string | `''` | Custom label text (overrides percentage). Also the value in words for assistive technology (aria-valuetext). |
| `striped` | `striped` | boolean | `false` | Striped animation on the bar |
| `circular` | `circular` | boolean | `false` | Circular/ring mode instead of linear bar |
| `ariaLabel` | `arialabel` | string | `''` | Accessible label for screen readers. Empty: the progress.label component string. |

**Renders:** roles `progressbar`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Linear** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="Default (65%)">
    <pdx-progress value="65"></pdx-progress>
  </pdx-form-field>
  <pdx-form-field label="With label">
    <pdx-progress value="42" showLabel></pdx-progress>
  </pdx-form-field>
  <pdx-form-field label="Custom label">
    <pdx-progress value="3" max="5" showLabel label="3 of 5 steps"></pdx-progress>
  </pdx-form-field>
  <pdx-form-field label="Indeterminate (loading)">
    <pdx-progress></pdx-progress>
  </pdx-form-field>
</div>
```

**Color Variants** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-progress value="80" variant="success" showLabel></pdx-progress>
  <pdx-progress value="55" variant="warning" showLabel></pdx-progress>
  <pdx-progress value="30" variant="danger" showLabel></pdx-progress>
</div>
```

**Sizes** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="Small">
    <pdx-progress value="60" size="sm"></pdx-progress>
  </pdx-form-field>
  <pdx-form-field label="Default">
    <pdx-progress value="60"></pdx-progress>
  </pdx-form-field>
  <pdx-form-field label="Large">
    <pdx-progress value="60" size="lg"></pdx-progress>
  </pdx-form-field>
</div>
```

**Striped** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-progress value="70" striped showLabel></pdx-progress>
  <pdx-progress value="45" variant="success" striped></pdx-progress>
  <pdx-progress value="90" variant="danger" striped size="lg"></pdx-progress>
</div>
```

**Circular** _(from the live demo)_

```html
<div class="demo-row">
  <div class="demo-col">
    <pdx-progress value="75" circular showLabel></pdx-progress>
    <span class="pdx-txt-small pdx-ink-muted">75%</span>
  </div>
  <div class="demo-col">
    <pdx-progress value="40" circular variant="success" showLabel></pdx-progress>
    <span class="pdx-txt-small pdx-ink-muted">Success</span>
  </div>
  <div class="demo-col">
    <pdx-progress value="90" circular variant="danger" showLabel></pdx-progress>
    <span class="pdx-txt-small pdx-ink-muted">Danger</span>
  </div>
  <div class="demo-col">
    <pdx-progress circular></pdx-progress>
    <span class="pdx-txt-small pdx-ink-muted">Loading</span>
  </div>
</div>
<h3 class="pdx-txt-subheading" style="margin-top:var(--pdx-space-lg)">Circular Sizes</h3>
<div class="demo-row" style="margin-top:var(--pdx-space-md)">
  <div class="demo-col">
    <pdx-progress value="50" circular size="sm"></pdx-progress>
    <span class="pdx-txt-small pdx-ink-muted">sm</span>
  </div>
  <div class="demo-col">
    <pdx-progress value="50" circular showLabel></pdx-progress>
    <span class="pdx-txt-small pdx-ink-muted">md</span>
  </div>
  <div class="demo-col">
    <pdx-progress value="50" circular size="lg" showLabel></pdx-progress>
    <span class="pdx-txt-small pdx-ink-muted">lg</span>
  </div>
</div>
```

