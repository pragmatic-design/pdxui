### `<pdx-sparkline>`

A tiny inline trend chart.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `data` | `data` | string | `''` | Comma-separated values or array |
| `type` | `type` | string | `'line'` | Chart type: line, area, bar |
| `width` | `width` | string | `'120px'` | Width (CSS) |
| `height` | `height` | string | `'32px'` | Height (CSS) |
| `color` | `color` | string | `''` | Line/fill color (CSS color or design token name) |
| `smooth` | `smooth` | boolean | `true` | Smooth line |
| `label` | `label` | string | `''` | Accessible name. Empty: the series in words, from the data. |

**Renders:** roles `img`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Types** — `type`: `line` (default) · `area` · `bar`.

```html
<pdx-sparkline data="12,18,15,24,21,32" type="line" width="160px" height="40px" />
<pdx-sparkline data="42,51,48,62,59,71" type="area" width="160px" height="40px" />
<pdx-sparkline data="80,65,90,70,85,60" type="bar"  width="160px" height="40px" />
```

**In KPI cards** — The most common use: a headline number with its recent trend underneath. _(from the live demo)_

```html
<div class="kpi-row">
  <div class="kpi-card">
    <span class="pdx-txt-small pdx-ink-muted">Revenue</span>
    <strong class="kpi-value">€ 82.4k</strong>
    <span class="kpi-delta up">▲ 12.5%</span>
    <pdx-sparkline data="42,51,48,62,59,71,68,74,65,78,82,91" type="area" color="--pdx-color-success" width="100%" height="34px"></pdx-sparkline>
  </div>
  <div class="kpi-card">
    <span class="pdx-txt-small pdx-ink-muted">Orders</span>
    <strong class="kpi-value">1,284</strong>
    <span class="kpi-delta up">▲ 4.1%</span>
    <pdx-sparkline data="12,18,15,24,21,32,29,35,28,38,41,48" type="line" color="--pdx-color-primary" width="100%" height="34px"></pdx-sparkline>
  </div>
  <div class="kpi-card">
    <span class="pdx-txt-small pdx-ink-muted">Refunds</span>
    <strong class="kpi-value">37</strong>
    <span class="kpi-delta down">▼ 8.0%</span>
    <pdx-sparkline data="9,7,11,8,12,6,10,5,7,4,6,3" type="bar" color="--pdx-color-danger" width="100%" height="34px"></pdx-sparkline>
  </div>
</div>
```

**In table rows** — A trend column that stays readable at row height. Use a fixed `width` so columns align. _(from the live demo)_

```html
<div class="demo-container">
  <div class="mini-table">
    <div class="mt-head"><span>Product</span><span>Units</span><span>Last 12 weeks</span></div>
    <div class="mt-row"><span>Aurora Keyboard</span><span>1,204</span><pdx-sparkline data="20,24,22,28,30,27,33,38,36,41,44,49" type="line" width="140px" height="22px"></pdx-sparkline></div>
    <div class="mt-row"><span>Nimbus Mouse</span><span>982</span><pdx-sparkline data="40,38,42,36,33,35,30,28,31,27,25,22" type="line" color="--pdx-color-danger" width="140px" height="22px"></pdx-sparkline></div>
    <div class="mt-row"><span>Pulse Headset</span><span>1,640</span><pdx-sparkline data="30,32,31,35,38,40,39,44,47,46,52,58" type="area" width="140px" height="22px"></pdx-sparkline></div>
  </div>
</div>
```

**Color & smoothing** — `color` takes any CSS color or a design token (`--pdx-color-*`); it defaults to the theme palette. `smooth` (default true) toggles bézier vs. straight segments. _(from the live demo)_

```html
<div class="demo-container">
  <div class="spark-grid">
    <div class="spark-item">
      <span class="pdx-txt-small pdx-ink-muted">primary</span>
      <pdx-sparkline data="30,45,38,52,49,61" color="--pdx-color-primary" width="150px" height="40px"></pdx-sparkline>
    </div>
    <div class="spark-item">
      <span class="pdx-txt-small pdx-ink-muted">warning</span>
      <pdx-sparkline data="30,45,38,52,49,61" color="--pdx-color-warning" width="150px" height="40px"></pdx-sparkline>
    </div>
    <div class="spark-item">
      <span class="pdx-txt-small pdx-ink-muted">smooth = false</span>
      <pdx-sparkline data="30,45,38,52,49,61,44,58" smooth="false" width="150px" height="40px"></pdx-sparkline>
    </div>
  </div>
</div>
```

