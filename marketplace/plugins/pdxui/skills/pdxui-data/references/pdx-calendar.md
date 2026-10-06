### `<pdx-calendar>`

A month calendar surface.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | string | `''` | Selected date (ISO string) for single mode. |
| `rangeStart` | `rangestart` | string | `''` | Range start (ISO). |
| `rangeEnd` | `rangeend` | string | `''` | Range end (ISO). |
| `mode` | `mode` | string | `'date'` | Selection mode. |
| `locale` | `locale` | string | `''` | Locale for month/day names. Empty: the page's language (`lang`), then the browser's. |
| `calendar` | `calendar` | string | `'gregory'` | Calendar system for display. |
| `numberOfMonths` | `numberofmonths` | number | `1` | Number of months to display (1-3). |
| `fixedWeeks` | `fixedweeks` | boolean | `true` | Always show 6 weeks per month. |
| `weekNumbers` | `weeknumbers` | boolean | `false` | Show ISO week numbers. |
| `min` | `min` | string | `''` | Minimum selectable date (ISO). |
| `max` | `max` | string | `''` | Maximum selectable date (ISO). |
| `disabledDates` | — | object | `null` | Function returning true if date should be disabled. |
| `highlightedDates` | — | object | `null` | Function returning highlight label or false. |
| `fiscalStartMonth` | `fiscalstartmonth` | number | `1` | Fiscal year start month (1-12). |
| `compareStart` | `comparestart` | string | `''` | Compare range start (ISO) for analytics overlay. |
| `compareEnd` | `compareend` | string | `''` | Compare range end (ISO). |
| `firstDay` | `firstday` | number | `-1` | First day of week override (0=Sun..6=Sat). Auto-detected from locale if -1. |
| `inline` | `inline` | boolean | `false` | Inline mode (no external popover wrapper). |
| `disabled` | `disabled` | boolean | `false` | Disabled state. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focusView()` | Focus the active day (or the month / year shown), now or once the view is drawn. |

**Events:** `pdx-change` → `detail: { value } | { rangeStart, rangeEnd } | { values } | { value, rangeStart, rangeEnd } | { value, quarter, fiscalYear, rangeStart, rangeEnd }` — Fired when the value changes.; `pdx-navigate` → `detail: { year, month }` — Fired on navigation.; `pdx-view-change` → `detail: { view }` — Fired when the view changes.

**Renders:** roles `columnheader` · `grid` · `gridcell` · `group` · `row`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Single date** — `inline` keeps it always visible; `value` is the selected ISO date.

```html
<pdx-calendar inline value="2026-06-15"></pdx-calendar>
```

**Range** — `mode="range"` with `rangeStart` / `rangeEnd`.

```html
<pdx-calendar inline mode="range" rangeStart="2026-06-10" rangeEnd="2026-06-18"></pdx-calendar>
```

**Multiple months** — `numberOfMonths` shows several months side by side — handy for range picking.

```html
<pdx-calendar inline mode="range" numberOfMonths="2"></pdx-calendar>
```

**Week numbers & bounds** — `weekNumbers` adds the ISO week column; `min`/`max` disable out-of-range days.

```html
<pdx-calendar inline weekNumbers min="2026-06-08" max="2026-06-26"></pdx-calendar>
```

