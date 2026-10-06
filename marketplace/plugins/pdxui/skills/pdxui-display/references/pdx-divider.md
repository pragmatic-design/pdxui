### `<pdx-divider>`

A plain or labeled separating line.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `orientation` | `orientation` | string | `'horizontal'` | Layout orientation — horizontal or vertical. |
| `label` | `label` | string | `''` | The label. Unset, the element's text content is the label: `<pdx-divider>OR</pdx-divider>`. |
| `variant` | `variant` | string | `'solid'` | Visual variant. |
| `labelPosition` | `labelposition` | string | `'center'` | Where the label sits relative to the control. |

**Renders:** roles `separator`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Content above _(from the live demo)_

```html
<div class="demo-box">
  <pdx-divider></pdx-divider>
  <p class="pdx-txt-small">Content below</p>
</div>
```

**With Label** — `label` prop adds text, or the text inside the tag when `label` is not set. `labelPosition`: left, center (default), right.

```html
<pdx-divider label="OR"></pdx-divider>
<pdx-divider label="Left" labelPosition="left"></pdx-divider>
<pdx-divider>Section 2</pdx-divider>
```

**Line Variants** — `variant`: solid (default), dashed, dotted. _(from the live demo)_

```html
<div class="demo-box">
  <pdx-divider></pdx-divider>
  <span class="pdx-txt-caption pdx-ink-muted">solid</span>
  <pdx-divider variant="dashed"></pdx-divider>
  <span class="pdx-txt-caption pdx-ink-muted">dashed</span>
  <pdx-divider variant="dotted"></pdx-divider>
  <span class="pdx-txt-caption pdx-ink-muted">dotted</span>
</div>
```

**Vertical** — `orientation="vertical"` for inline separators. _(from the live demo)_

```html
<div class="demo-row">
  <span class="pdx-txt-small">Home</span>
  <pdx-divider orientation="vertical"></pdx-divider>
  <span class="pdx-txt-small">Products</span>
  <pdx-divider orientation="vertical"></pdx-divider>
  <span class="pdx-txt-small">About</span>
  <pdx-divider orientation="vertical"></pdx-divider>
  <span class="pdx-txt-small">Contact</span>
</div>
```

**Composition** _(from the live demo)_

```html
<div class="comp-card" style="max-width:320px">
  <h3 class="pdx-txt-subheading">Sign In</h3>
  <div class="pdx-skeleton pdx-skeleton-input" style="margin-bottom:var(--pdx-space-sm)"></div>
  <div class="pdx-skeleton pdx-skeleton-input" style="margin-bottom:var(--pdx-space-md)"></div>
  <div class="pdx-skeleton pdx-skeleton-button" style="width:100%;margin-bottom:var(--pdx-space-md)"></div>
  <pdx-divider label="OR"></pdx-divider>
  <div class="pdx-skeleton pdx-skeleton-button" style="width:100%;margin-top:var(--pdx-space-md)"></div>
</div>
```

