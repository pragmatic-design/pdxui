### `<pdx-statistic>`

A big number with label and trend.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `title` | `title` | string | `''` | Label text above the value |
| `value` | `value` | string | `'0'` | Main display value |
| `prefix` | `prefix` | string | `''` | Text/symbol before value (e.g. '$') |
| `suffix` | `suffix` | string | `''` | Text/symbol after value (e.g. '%') |
| `icon` | `icon` | string | `''` | Icon name (left of title) |
| `trend` | `trend` | string | `''` | Trend direction: 'up' \| 'down' \| 'flat' \| '' |
| `trendValue` | `trendvalue` | string | `''` | Trend text e.g. '+12.5%' |
| `trendColor` | `trendcolor` | boolean | `true` | Auto-color trend (green up, red down) |
| `size` | `size` | string | `'md'` | Size variant: 'sm' \| 'md' \| 'lg' |
| `loading` | `loading` | boolean | `false` | Show skeleton placeholder |
| `precision` | `precision` | number | `-1` | Decimal places for formatting (-1 = no format) |
| `groupSeparator` | `groupseparator` | string | `','` | Thousands separator |
| `compareValue` | `comparevalue` | string | `''` | Comparison/previous value (shown muted below main value) |
| `compareLabel` | `comparelabel` | string | `''` | Compare label (e.g. "vs last month") |
| `description` | `description` | string | `''` | Description text below value |


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Simple value + title combinations.

```html
<pdx-statistic title="Revenue" prefix="$" value="12345"
  :precision="0" group-separator=","></pdx-statistic>
<pdx-statistic title="Active Users" value="8,234"></pdx-statistic>
<pdx-statistic title="Orders" value="1,234"></pdx-statistic>
```

**With Trend** — Trend arrows with auto-colored direction indicators.

```html
<pdx-statistic title="Revenue" prefix="$" value="48,250"
  trend="up" trend-value="+12.5%"></pdx-statistic>
<pdx-statistic title="Bounce Rate" value="24.8" suffix="%"
  trend="down" trend-value="-3.2%"></pdx-statistic>
<pdx-statistic title="Conversion" value="3.6" suffix="%"
  trend="flat" trend-value="0.0%"></pdx-statistic>
```

**With Icons** — Icons provide visual context for each metric.

```html
<pdx-statistic icon="users" title="Total Users" value="15,420"
  trend="up" trend-value="+5.3%"></pdx-statistic>
<pdx-statistic icon="dollar-sign" title="Avg. Order" prefix="$"
  value="67.50"></pdx-statistic>
<pdx-statistic icon="shopping-cart" title="Cart Items" value="3,891"
  trend="down" trend-value="-1.8%"></pdx-statistic>
```

**Sizes** — Three size variants: sm, md (default), lg. _(from the live demo)_

```html
<div class="demo-row demo-row-align">
  <div class="size-card">
    <span class="pdx-txt-small pdx-ink-muted">sm</span>
    <pdx-statistic title="Views" value="1,024" size="sm"></pdx-statistic>
  </div>
  <div class="size-card">
    <span class="pdx-txt-small pdx-ink-muted">md</span>
    <pdx-statistic title="Views" value="1,024" size="md"></pdx-statistic>
  </div>
  <div class="size-card">
    <span class="pdx-txt-small pdx-ink-muted">lg</span>
    <pdx-statistic title="Views" value="1,024" size="lg"></pdx-statistic>
  </div>
</div>
```

**Loading** — Skeleton placeholders while data loads.

```html
<pdx-statistic :loading="true"></pdx-statistic>
```

**Formatted Values** — Automatic number formatting with precision and group separator.

```html
<pdx-statistic title="Balance" prefix="$" value="1234567.89"
  :precision="2" group-separator=","></pdx-statistic>
<pdx-statistic title="Percentage" value="87.456" suffix="%"
  :precision="1"></pdx-statistic>
<pdx-statistic title="Score" value="9876"
  :precision="0" group-separator="."></pdx-statistic>
```

**Dashboard Grid** — Statistics in a real dashboard context with card borders. _(from the live demo)_

```html
<div class="dashboard-grid">
  <div class="dashboard-card">
    <pdx-statistic icon="dollar-sign" title="Total Revenue" prefix="$" value="284500" :precision="0" group-separator="," trend="up" trend-value="+18.2%"></pdx-statistic>
  </div>
  <div class="dashboard-card">
    <pdx-statistic icon="users" title="New Customers" value="1,429" trend="up" trend-value="+7.4%"></pdx-statistic>
  </div>
  <div class="dashboard-card">
    <pdx-statistic icon="shopping-cart" title="Orders" value="3,672" trend="down" trend-value="-2.1%"></pdx-statistic>
  </div>
  <div class="dashboard-card">
    <pdx-statistic icon="activity" title="Avg. Session" value="4.8" suffix="min" trend="flat" trend-value="+0.1%"></pdx-statistic>
  </div>
</div>
```

**With Description** — Extra context below the value. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-statistic title="MRR" prefix="$" value="48250" :precision="0" group-separator="," trend="up" trend-value="+12.5%" description="Monthly Recurring Revenue"></pdx-statistic>
  <pdx-statistic title="Churn Rate" value="2.4" suffix="%" trend="down" trend-value="-0.8%" description="30-day rolling average"></pdx-statistic>
</div>
```

**With Comparison** — Show previous period value for comparison.

```html
<pdx-statistic title="Revenue" prefix="$"
  value="284500" :precision="0"
  trend="up" trend-value="+18.2%"
  compare-value="240600"
  compare-label="vs last month:">
</pdx-statistic>
```

**No Trend Color** — Disable automatic trend coloring with `:trend-color="false"`. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-statistic title="Revenue" prefix="$" value="48,250" trend="up" trend-value="+12.5%" :trend-color="false"></pdx-statistic>
  <pdx-statistic title="Churn" value="2.4" suffix="%" trend="down" trend-value="-0.8%" :trend-color="false"></pdx-statistic>
</div>
```

