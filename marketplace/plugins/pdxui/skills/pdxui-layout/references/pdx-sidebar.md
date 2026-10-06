### `<pdx-sidebar>`

Collapsible side navigation.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `open` | `open` | boolean | `true` | Sidebar open/expanded state |
| `mini` | `mini` | boolean | `false` | Mini mode: show only icons when collapsed |
| `position` | `position` | string | `'left'` | Position: left (default) or right |
| `width` | `width` | number | `260` | Width when expanded (px) |
| `collapsedWidth` | `collapsedwidth` | number | `60` | Width when collapsed/mini (px) |

**Renders:** roles `complementary`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Interactive Toggle** — Click the hamburger to toggle between expanded and mini (icon-only) modes.

```html
<pdx-sidebar open :width="240" :collapsedWidth="56" mini>
  <pdx-nav-menu :items="items" activekey="dashboard"></pdx-nav-menu>
</pdx-sidebar>
```

**Mini Mode (Collapsed)** — Icons only when collapsed. Set `mini` + unset `open`.

```html
<pdx-sidebar mini :width="240" :collapsedWidth="56">
  <pdx-nav-menu :items="items" activekey="dashboard"></pdx-nav-menu>
</pdx-sidebar>
```

**Right Position** _(from the live demo)_

```html
<div class="demo-layout">
  <div class="demo-content">Content with right sidebar</div>
  <pdx-sidebar open position="right" :width="200">
    <pdx-nav-menu :items="shortItems" activekey="overview"></pdx-nav-menu>
  </pdx-sidebar>
</div>
```

