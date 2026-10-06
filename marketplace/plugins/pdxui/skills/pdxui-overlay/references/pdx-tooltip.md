### `<pdx-tooltip>`

A hint on hover or focus.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `text` | `text` | string | `''` | The tooltip text. |
| `placement` | `placement` | string | `'top'` | Position relative to the anchor element. |
| `delay` | `delay` | number | `200` | Delay (ms) before showing. |
| `hideDelay` | `hidedelay` | number | `100` | Delay (ms) before hiding. |
| `arrow` | `arrow` | boolean | `false` | Shows the pointer arrow. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `overflowOnly` | `overflowonly` | boolean | `false` | Only show when the target text is truncated. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `show()` | Shows it. |
| `hide()` | Hides it. |
| `toggle()` | Toggles it open/closed. |
| `isOpen` _(read-only)_ | Read-only, via a ref: `el.isOpen`. |

**Renders:** roles `tooltip`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Hover or focus the button to show a tooltip. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button variant="outline" size="sm">Hover me</pdx-button>
  <pdx-tooltip text="This is a tooltip"></pdx-tooltip>
</div>
```

**Placements** — 12 placement options: top, bottom, left, right + start/end variants. _(from the live demo)_

```html
<div class="placement-grid">
  <div class="row">
    <span class="trigger" tabindex="0">top-start</span><pdx-tooltip text="top-start" placement="top-start"></pdx-tooltip>
    <span class="trigger" tabindex="0">top</span><pdx-tooltip text="top" placement="top"></pdx-tooltip>
    <span class="trigger" tabindex="0">top-end</span><pdx-tooltip text="top-end" placement="top-end"></pdx-tooltip>
  </div>
  <div class="row side">
    <span class="trigger" tabindex="0">left</span><pdx-tooltip text="left" placement="left"></pdx-tooltip>
    <span class="trigger" tabindex="0">right</span><pdx-tooltip text="right" placement="right"></pdx-tooltip>
  </div>
  <div class="row">
    <span class="trigger" tabindex="0">bottom-start</span><pdx-tooltip text="bottom-start" placement="bottom-start"></pdx-tooltip>
    <span class="trigger" tabindex="0">bottom</span><pdx-tooltip text="bottom" placement="bottom"></pdx-tooltip>
    <span class="trigger" tabindex="0">bottom-end</span><pdx-tooltip text="bottom-end" placement="bottom-end"></pdx-tooltip>
  </div>
</div>
```

**With Arrow** — Add `arrow` prop for a directional pointer. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button variant="outline" size="sm">Top arrow</pdx-button>
  <pdx-tooltip text="Tooltip with arrow" placement="top" arrow></pdx-tooltip>
  <pdx-button variant="outline" size="sm">Bottom arrow</pdx-button>
  <pdx-tooltip text="Tooltip with arrow" placement="bottom" arrow></pdx-tooltip>
  <pdx-button variant="outline" size="sm">Left arrow</pdx-button>
  <pdx-tooltip text="Tooltip with arrow" placement="left" arrow></pdx-tooltip>
  <pdx-button variant="outline" size="sm">Right arrow</pdx-button>
  <pdx-tooltip text="Tooltip with arrow" placement="right" arrow></pdx-tooltip>
</div>
```

**Show Delay** — Control how long before the tooltip appears. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button variant="outline" size="sm">Instant (0ms)</pdx-button>
  <pdx-tooltip text="No delay" :delay="0"></pdx-tooltip>
  <pdx-button variant="outline" size="sm">Default (200ms)</pdx-button>
  <pdx-tooltip text="200ms delay"></pdx-tooltip>
  <pdx-button variant="outline" size="sm">Slow (800ms)</pdx-button>
  <pdx-tooltip text="800ms delay" :delay="800"></pdx-tooltip>
</div>
```

**Overflow Only** — Tooltip only shows when text is truncated. Resize the window to test. _(from the live demo)_

```html
<div class="overflow-demo">
  <span class="truncate-text" tabindex="0">This is a short text</span>
  <pdx-tooltip text="This text is not truncated" overflowOnly></pdx-tooltip>
  <span class="truncate-text" tabindex="0" style="max-width: 150px">This text is very long and will be truncated by the container width</span>
  <pdx-tooltip text="This text is very long and will be truncated by the container width" overflowOnly></pdx-tooltip>
</div>
```

**Disabled** — Use `disabled` to prevent the tooltip from showing. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button variant="outline" size="sm">No tooltip</pdx-button>
  <pdx-tooltip text="You won't see this" disabled></pdx-tooltip>
</div>
```

