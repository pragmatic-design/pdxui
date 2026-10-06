### `<pdx-chart>`

Charts from your data.

**Takes a DataSource:** bind one to `:source`.

**Use it when** a dashboard or a detail page shows a trend, a comparison or a share. **Not when** it is a
tiny inline trend in a table cell or a KPI card → `pdx-sparkline`.

**Pitfalls**
- `series-config` is a JSON **string**, not an object. A malformed string is dropped in silence and the chart
  draws as if it were not there.
- The `currency` format is USD unless you set `currency="EUR"`.
- With no `height` the canvas takes a 16:9 ratio of its width: set `height` in a short card.
- The legend is drawn only with two or more items, and never for a gauge.
- Numbers print in `locale`, else the nearest `lang` attribute, else the browser's: set one of the first two.

**Composes with** `pdx-card` / `pdx-statistic` (the KPIs above the charts, recipes: *Dashboard*) ·
`pdx-data-source` / `createDataSource` (`:source`, repainted when the source's `data()` changes).

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `type` | `type` | string | `'line'` | Chart type: line, bar, area, pie, doughnut, scatter, gauge, radar |
| `data` | — | array | `[]` | Data array (array of objects) |
| `xField` | `xfield` | string | `''` | X-axis field name (auto-detected if omitted) |
| `yField` | `yfield` | string | `''` | Y-axis field name(s) — string or comma-separated |
| `seriesNames` | `seriesnames` | string | `''` | Series display names (comma-separated) |
| `title` | `title` | string | `''` | Chart title |
| `smooth` | `smooth` | boolean | `false` | Smooth line interpolation |
| `stacked` | `stacked` | boolean | `false` | Stack series |
| `tooltip` | `tooltip` | boolean | `true` | Show tooltip on hover |
| `legend` | `legend` | boolean | `true` | Show legend |
| `legendPosition` | `legendposition` | string | `'top'` | Legend position: top, bottom, left, right |
| `height` | `height` | string | `''` | Chart height (CSS value) |
| `xAxisName` | `xaxisname` | string | `''` | X-axis label |
| `yAxisName` | `yaxisname` | string | `''` | Y-axis label |
| `yAxisRightName` | `yaxisrightname` | string | `''` | Right Y-axis label (dual axis) |
| `xFormat` | `xformat` | string | `''` | X-axis format: currency, percent, compact, or template '{value}%' |
| `yFormat` | `yformat` | string | `''` | Left Y-axis format |
| `yRightFormat` | `yrightformat` | string | `''` | Right Y-axis format |
| `locale` | `locale` | string | `''` | Locale the chart prints numbers in (BCP 47). Empty: the nearest `lang`, then the browser. |
| `currency` | `currency` | string | `''` | Currency of the `currency` format (ISO 4217, e.g. "EUR"). Empty: "USD". |
| `zoom` | `zoom` | string | `''` | Enable zoom: 'inside' (mouse wheel + drag pan) |
| `seriesConfig` | `seriesconfig` | string | `''` | Advanced: per-series config JSON string |
| `min` | `min` | number | `0` | Gauge: minimum value |
| `max` | `max` | number | `100` | Gauge: maximum value |
| `value` | `value` | number | `0` | Gauge: current value (alternative to data) |
| `format` | `format` | string | `''` | Gauge: value format (e.g. "{value}%") |
| `source` | — | object | `null` | DataSource binding (duck-typed) |

**Renders:** roles `figure` · `group`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Dual Y-Axis (Mixed Chart)** — Bar for revenue (left, currency) + Line for growth (right, %). Each series has its own scale.

```html
<pdx-chart type="bar" :data="data"
  :series-config='[
    { "field": "revenue", "type": "bar" },
    { "field": "growth", "type": "line", "yAxisIndex": 1 }
  ]'
  :y-format="'currency'" :y-right-format="'percent'" />
```

**Zoom & Pan** — Mouse wheel to zoom, drag to pan. Set `zoom="inside"`. _(from the live demo)_

```html
<div class="demo-area">
  <pdx-chart type="line" :data="zoomData" :x-field="'day'" :y-field="'value'" :legend="false" zoom="inside" smooth height="300px" title="90-day trend (scroll to zoom, drag to pan)"></pdx-chart>
</div>
```

**Legend Positions** — Legend can be placed top (default), bottom, left, or right. _(from the live demo)_

```html
<div class="demo-row">
  <div class="demo-labeled">
    <span class="pdx-txt-caption pdx-ink-muted">bottom</span>
    <div class="demo-area">
      <pdx-chart type="line" :data="lineData" :x-field="'month'" :y-field="'revenue,profit'" :series-names="'Revenue,Profit'" :legend-position="'bottom'" height="240px"></pdx-chart>
    </div>
  </div>
  <div class="demo-labeled">
    <span class="pdx-txt-caption pdx-ink-muted">right</span>
    <div class="demo-area">
      <pdx-chart type="line" :data="lineData" :x-field="'month'" :y-field="'revenue,profit'" :series-names="'Revenue,Profit'" :legend-position="'right'" height="240px"></pdx-chart>
    </div>
  </div>
</div>
```

**Axis Formatting** — Built-in formatters: `currency`, `percent`, `compact`, or template `{value}%`. _(from the live demo)_

```html
<div class="demo-row">
  <div class="demo-labeled">
    <span class="pdx-txt-caption pdx-ink-muted">y-format="currency"</span>
    <div class="demo-area">
      <pdx-chart type="bar" :data="lineData" :x-field="'month'" :y-field="'revenue'" :legend="false" :y-format="'currency'" height="200px"></pdx-chart>
    </div>
  </div>
  <div class="demo-labeled">
    <span class="pdx-txt-caption pdx-ink-muted">y-format="compact"</span>
    <div class="demo-area">
      <pdx-chart type="line" :data="lineData" :x-field="'month'" :y-field="'revenue'" :legend="false" :y-format="'compact'" smooth height="200px"></pdx-chart>
    </div>
  </div>
</div>
```

**Dynamic Data** — Click "Randomize" to see animated data transitions. _(from the live demo)_

```html
<div class="demo-area">
  <pdx-chart type="bar" :data="dynamicData" :x-field="'category'" :y-field="'value'" :legend="false" height="280px"></pdx-chart>
</div>
<div class="controls">
  <button class="pdx-primary" @click="randomize">Randomize Data</button>
</div>
```

**Theme & Dark Mode** — Charts automatically re-render when theme or color scheme changes. Try switching in the settings panel. _(from the live demo)_

```html
<div class="demo-area">
  <pdx-chart type="area" :data="lineData" :x-field="'month'" :y-field="'revenue,profit'" :series-names="'Revenue,Profit'" smooth height="280px" title="Adapts to theme automatically"></pdx-chart>
</div>
```

**Gauge** — KPI gauge with animated arc, tick marks, and value label. _(from the live demo)_

```html
<div class="demo-row">
  <div class="demo-labeled">
    <div class="demo-area">
      <pdx-chart type="gauge" title="CPU Usage" :value="72" :max="100" format="{value}%" height="240px" :legend="false"></pdx-chart>
    </div>
  </div>
  <div class="demo-labeled">
    <div class="demo-area">
      <pdx-chart type="gauge" title="Revenue" :value="24500" :max="50000" format="{value}" height="240px" :legend="false"></pdx-chart>
    </div>
  </div>
  <div class="demo-labeled">
    <div class="demo-area">
      <pdx-chart type="gauge" title="Score" :value="8.5" :min="0" :max="10" height="240px" :legend="false"></pdx-chart>
    </div>
  </div>
</div>
```

**Radar Chart** — Multi-dimensional comparison. Values auto-normalized. Click legend to toggle. _(from the live demo)_

```html
<div class="demo-area">
  <pdx-chart type="radar" :data="radarData" :x-field="'skill'" :y-field="'alice,bob'" :series-names="'Alice,Bob'" height="360px"></pdx-chart>
</div>
```

**Candlestick (OHLC)** — Financial chart. Green = bullish (close > open), red/yellow = bearish.

```html
<pdx-chart type="candlestick" :data="ohlcData"
  :x-field="'date'" height="320px" />
```

```js
// Data: { date, open, high, low, close }
```

**Heatmap** — Grid-based intensity. Values mapped to color gradient (light → primary).

```html
<pdx-chart type="heatmap" :data="data"
  :x-field="'hour'" :y-field="'day'" />
```

```js
// Data: { hour, day, visits } (value field auto-detected)
```

**Funnel** — Conversion pipeline. Shows values and percentages relative to first stage. _(from the live demo)_

```html
<div class="demo-area">
  <pdx-chart type="funnel" :data="funnelData" :x-field="'stage'" :y-field="'users'" :legend="false" height="300px"></pdx-chart>
</div>
```

**Sparkline** — Inline mini chart for tables, cards, KPIs. Standalone `<pdx-sparkline>` component.

```html
<pdx-sparkline data="42,51,48,62,59,71"
  type="area" width="160px" height="36px" />

<pdx-sparkline data="80,65,90,70,85,60"
  type="bar" width="160px" height="36px" />
```

**Line Chart** — Basic line chart with tooltip and legend. Hover for crosshair + values.

```html
<pdx-chart type="line" :data="data"
  :x-field="'month'" :y-field="'revenue,profit'"
  :series-names="'Revenue,Profit'"
  title="Monthly Performance" />
```

**Area Chart (Smooth)** — Smooth area fill with gradient. Set `smooth` prop. _(from the live demo)_

```html
<div class="demo-area">
  <pdx-chart type="area" :data="lineData" :x-field="'month'" :y-field="'revenue'" :series-names="'Revenue'" smooth :legend="false" height="280px"></pdx-chart>
</div>
```

**Bar Chart** — Grouped bars with multiple series. Click legend to toggle visibility. _(from the live demo)_

```html
<div class="demo-area">
  <pdx-chart type="bar" :data="barData" :x-field="'quarter'" :y-field="'desktop,mobile,tablet'" :series-names="'Desktop,Mobile,Tablet'" title="Traffic by Device" height="320px"></pdx-chart>
</div>
```

**Stacked Bar** — Set `stacked` prop to stack series. _(from the live demo)_

```html
<div class="demo-area">
  <pdx-chart type="bar" :data="barData" :x-field="'quarter'" :y-field="'desktop,mobile,tablet'" :series-names="'Desktop,Mobile,Tablet'" stacked height="300px"></pdx-chart>
</div>
```

**Pie & Doughnut** _(from the live demo)_

```html
<div class="demo-row">
  <div class="demo-labeled">
    <span class="pdx-txt-caption pdx-ink-muted">type="pie"</span>
    <div class="demo-area">
      <pdx-chart type="pie" :data="pieData" :x-field="'browser'" :y-field="'share'" height="280px" :legend="false"></pdx-chart>
    </div>
  </div>
  <div class="demo-labeled">
    <span class="pdx-txt-caption pdx-ink-muted">type="doughnut"</span>
    <div class="demo-area">
      <pdx-chart type="doughnut" :data="pieData" :x-field="'browser'" :y-field="'share'" height="280px" :legend="false"></pdx-chart>
    </div>
  </div>
</div>
```

