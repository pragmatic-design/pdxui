### `<pdx-col>`

A responsive grid column.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `span` | `span` | number | `12` | Column span 1-12 (default: 12 = full width) |
| `sm` | `sm` | number | `0` | Span override at >= 640px |
| `md` | `md` | number | `0` | Span override at >= 768px |
| `lg` | `lg` | number | `0` | Span override at >= 1024px |
| `xl` | `xl` | number | `0` | Span override at >= 1280px |
| `offset` | `offset` | number | `0` | Column offset (0-11) — pushes column to the right |
| `order` | `order` | number | `0` | CSS order override |


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic Grid** — 12-column system. Each `pdx-col` specifies how many columns to span.

```html
<pdx-row gutter="sm">
  <pdx-col span="4">...</pdx-col>
  <pdx-col span="4">...</pdx-col>
  <pdx-col span="4">...</pdx-col>
</pdx-row>
```

**Animated Span Change** — Drag the slider to change column spans. The transition is animated.

```html
<pdx-row gutter="sm">
  <pdx-col :span="sidebarSpan">Sidebar</pdx-col>
  <pdx-col :span="contentSpan">Content</pdx-col>
</pdx-row>

<!-- Change sidebarSpan signal and the columns animate -->
```

**Responsive Breakpoints** — Columns adapt to viewport width. Resize the browser to see changes.

```html
<pdx-row gutter="sm">
  <pdx-col span="12" sm="6" md="4" lg="3">
    Responsive column
  </pdx-col>
</pdx-row>
```

**Offset** — Push columns to the right with `offset`.

```html
<pdx-col span="4" offset="4">...</pdx-col>
<pdx-col span="6" offset="3">Centered column</pdx-col>
```

**Gutter Sizes** — Control spacing between columns with the `gutter` prop on `pdx-row`. _(from the live demo)_

```html
<div class="demo-row">
  <div class="demo-labeled">
    <span class="pdx-txt-caption pdx-ink-muted">gutter="xs"</span>
    <div class="demo-area">
      <pdx-row gutter="xs">
        <pdx-col span="4"><div class="box">4</div></pdx-col>
        <pdx-col span="4"><div class="box">4</div></pdx-col>
        <pdx-col span="4"><div class="box">4</div></pdx-col>
      </pdx-row>
    </div>
  </div>
  <div class="demo-labeled">
    <span class="pdx-txt-caption pdx-ink-muted">gutter="lg"</span>
    <div class="demo-area">
      <pdx-row gutter="lg">
        <pdx-col span="4"><div class="box">4</div></pdx-col>
        <pdx-col span="4"><div class="box">4</div></pdx-col>
        <pdx-col span="4"><div class="box">4</div></pdx-col>
      </pdx-row>
    </div>
  </div>
</div>
```

**Alignment** — Control vertical alignment with `align` and horizontal with `justify`. _(from the live demo)_

```html
<div class="demo-row">
  <div class="demo-labeled">
    <span class="pdx-txt-caption pdx-ink-muted">align="start"</span>
    <div class="demo-area">
      <pdx-row gutter="sm" align="start">
        <pdx-col span="4"><div class="box tall">Tall</div></pdx-col>
        <pdx-col span="4"><div class="box">Short</div></pdx-col>
        <pdx-col span="4"><div class="box md-h">Medium</div></pdx-col>
      </pdx-row>
    </div>
  </div>
  <div class="demo-labeled">
    <span class="pdx-txt-caption pdx-ink-muted">align="center"</span>
    <div class="demo-area">
      <pdx-row gutter="sm" align="center">
        <pdx-col span="4"><div class="box tall">Tall</div></pdx-col>
        <pdx-col span="4"><div class="box">Short</div></pdx-col>
        <pdx-col span="4"><div class="box md-h">Medium</div></pdx-col>
      </pdx-row>
    </div>
  </div>
</div>
<div class="demo-area">
  <span class="pdx-txt-caption pdx-ink-muted">justify="center" (total span &lt; 12)</span>
  <pdx-row gutter="sm" justify="center" style="margin-top:var(--pdx-space-xs)">
    <pdx-col span="3"><div class="box">3</div></pdx-col>
    <pdx-col span="3"><div class="box">3</div></pdx-col>
  </pdx-row>
</div>
```

**Nested Grids** — Rows can be nested inside columns for complex layouts.

```html
<pdx-row gutter="md">
  <pdx-col span="4">Sidebar</pdx-col>
  <pdx-col span="8">
    <pdx-row gutter="sm">
      <pdx-col span="6">Nested</pdx-col>
      <pdx-col span="6">Nested</pdx-col>
    </pdx-row>
  </pdx-col>
</pdx-row>
```

**Real-world: Dashboard** — Combining row/col with other components for a realistic dashboard layout. _(from the live demo)_

```html
<div class="demo-area comp">
  <pdx-row gutter="md">
    <pdx-col span="12" md="6" lg="3">
      <div class="stat-card">
        <span class="pdx-txt-caption pdx-ink-muted">Revenue</span>
        <span class="pdx-txt-heading">$24,500</span>
      </div>
    </pdx-col>
    <pdx-col span="12" md="6" lg="3">
      <div class="stat-card">
        <span class="pdx-txt-caption pdx-ink-muted">Orders</span>
        <span class="pdx-txt-heading">1,240</span>
      </div>
    </pdx-col>
    <pdx-col span="12" md="6" lg="3">
      <div class="stat-card">
        <span class="pdx-txt-caption pdx-ink-muted">Customers</span>
        <span class="pdx-txt-heading">890</span>
      </div>
    </pdx-col>
    <pdx-col span="12" md="6" lg="3">
      <div class="stat-card">
        <span class="pdx-txt-caption pdx-ink-muted">Growth</span>
        <span class="pdx-txt-heading pdx-ink-success">+18%</span>
      </div>
    </pdx-col>
  </pdx-row>
  <pdx-row gutter="md" style="margin-top:var(--pdx-space-md)">
    <pdx-col span="12" lg="8">
      <div class="chart-card">
        <span class="pdx-txt-label">Sales Chart</span>
        <div class="chart-placeholder">Chart area (span 8 on desktop, 12 on mobile)</div>
      </div>
    </pdx-col>
    <pdx-col span="12" lg="4">
      <div class="chart-card">
        <span class="pdx-txt-label">Top Products</span>
        <div class="chart-placeholder sm">List area</div>
      </div>
    </pdx-col>
  </pdx-row>
</div>
```

