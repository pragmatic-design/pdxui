### `<pdx-date-picker>`

Pick a date from a calendar.

**Use it when** a form asks for a date, a date-time, a range, a week, a month, a quarter or a year — and,
with `editable`, lets it be typed.
**Not when** only a time is wanted → `pdx-time-picker`; a calendar always on screen, with no field →
`pdx-calendar`.

**Pitfalls**
- Without `editable` the date cannot be typed at all, and `editable` covers the modes `date` and `datetime` only.
- An editable value commits on Enter or blur — AFTER the native `change` of its text box. Listen to
  `pdx-change`, not `change`, or a resumed draft comes back without its end date.
- A typed date that does not exist, or falls outside `min`/`max`, marks the field invalid and keeps the last
  good value.
- `pdx-change.detail` has a different shape per mode: `{ value }`, `{ rangeStart, rangeEnd }`, `{ value, time }`,
  `{ values }`…
- `calendar` changes the display only; the value and its math stay Gregorian ISO.

**Composes with** `pdx-form` + `pdx-form-field` (wired by `name`) · `pdx-auto-form` / `pdx-form-template` (a
schema `date` field is drawn as an editable picker) · `@form` touched state (it emits `pdx-blur` when focus
leaves both the field and its panel).

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | string | `''` | Selected value (ISO date/time string). |
| `rangeStart` | `rangestart` | string | `''` | Range start (ISO). |
| `rangeEnd` | `rangeend` | string | `''` | Range end (ISO). |
| `mode` | `mode` | string | `'date'` | Picker mode. |
| `locale` | `locale` | string | `''` | Locale for formatting and i18n. Empty: the page's language (`lang`), then the browser's. |
| `calendar` | `calendar` | string | `'gregory'` | Calendar system for display. |
| `numberOfMonths` | `numberofmonths` | number | `0` | Number of calendar months to show (1-3). |
| `weekNumbers` | `weeknumbers` | boolean | `false` | Show week numbers. |
| `min` | `min` | string | `''` | Minimum date (ISO). |
| `max` | `max` | string | `''` | Maximum date (ISO). |
| `disabledDates` | — | object | `null` | Function: (iso) => boolean for disabled dates. |
| `highlightedDates` | — | object | `null` | Function: (iso) => string\|false for highlighted dates. |
| `fiscalStartMonth` | `fiscalstartmonth` | number | `1` | Fiscal year start month (1-12). |
| `presets` | — | array | `[]` | Preset date options (array of { label, value }). |
| `showCompare` | `showcompare` | boolean | `false` | Show comparison range toggle. |
| `compareStart` | `comparestart` | string | `''` | Compare range start (ISO). |
| `compareEnd` | `compareend` | string | `''` | Compare range end (ISO). |
| `showTime` | `showtime` | boolean | `false` | Show time picker alongside date. |
| `timeFormat` | `timeformat` | string | `'auto'` | Time format (12h/24h/auto). |
| `showSeconds` | `showseconds` | boolean | `false` | Show seconds in time picker. |
| `timeStep` | `timestep` | number | `1` | Time step (1/5/15/30). |
| `clearable` | `clearable` | boolean | `true` | Allow clearing the value. |
| `disabled` | `disabled` | boolean | `false` | Disabled state. |
| `readonly` | `readonly` | boolean | `false` | Readonly state. |
| `placeholder` | `placeholder` | string | `''` | Placeholder text. |
| `name` | `name` | string | `''` | Name for form participation. |
| `size` | `size` | string | `''` | Size variant (sm/md/lg). |
| `inline` | `inline` | boolean | `false` | Inline calendar (no popover, always visible). |
| `fixedWeeks` | `fixedweeks` | boolean | `true` | Fixed weeks in calendar. |
| `firstDay` | `firstday` | number | `-1` | First day of week (-1 = auto). |
| `ariaLabel` | `arialabel` | string | `''` | Aria label. |
| `editable` | `editable` | boolean | `false` | The date can be typed: the trigger's text is an input (still the combobox), read in the locale's numeric pattern or as ISO, committed on Enter and blur. The calendar icon opens the popup, as does Alt+ArrowDown. Modes `date` and `datetime` (its date part); the others keep the plain trigger. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |

**Events:** `pdx-blur` — Fired when it loses focus.; `pdx-change` → `detail: { rangeStart, rangeEnd, value } | { value } | { values } | { value, time } | { rangeStart, rangeEnd, timeStart, timeEnd } | { value, rangeStart, rangeEnd }` — Fired when the value changes.; `pdx-clear` — Fired when the value is cleared.; `pdx-close` — Fired when it closes. Does not bubble.; `pdx-open` — Fired when it opens. Does not bubble.

**Renders:** roles `combobox` · `dialog`

**Shapes:** `DatePreset { label: string; value: string | [string, string] }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic Date Picker** — Click to open calendar. Select a date. Clearable by default.

```html
<pdx-date-picker placeholder="Pick a date"></pdx-date-picker>
<pdx-date-picker value="2024-06-15"></pdx-date-picker>
<pdx-date-picker disabled value="2024-06-15"></pdx-date-picker>
<pdx-date-picker readonly value="2024-03-10"></pdx-date-picker>
```

**9 Selection Modes** — date, datetime, daterange, datetimerange, time, week, month, year, quarter.

```html
<pdx-date-picker mode="date" placeholder="Select date"></pdx-date-picker>
<pdx-date-picker mode="datetime" placeholder="Date + time"></pdx-date-picker>
<pdx-date-picker mode="daterange" placeholder="Start — End"></pdx-date-picker>
<pdx-date-picker mode="time" placeholder="Select time"></pdx-date-picker>
<pdx-date-picker mode="week" placeholder="Select week"></pdx-date-picker>
<pdx-date-picker mode="month" placeholder="Select month"></pdx-date-picker>
<pdx-date-picker mode="year" placeholder="Select year"></pdx-date-picker>
<pdx-date-picker mode="quarter" placeholder="Select quarter"></pdx-date-picker>
```

**Calendar Systems (13)** — All powered by `Intl.DateTimeFormat` — zero translation files. Display only, math stays Gregorian.

```html
<pdx-date-picker value="2024-06-15" calendar="gregory"></pdx-date-picker>
<pdx-date-picker value="2024-06-15" calendar="islamic-umalqura" locale="ar"></pdx-date-picker>
<pdx-date-picker value="2024-06-15" calendar="hebrew" locale="he"></pdx-date-picker>
<pdx-date-picker value="2024-06-15" calendar="japanese" locale="ja"></pdx-date-picker>
<pdx-date-picker value="2024-06-15" calendar="buddhist" locale="th"></pdx-date-picker>
<pdx-date-picker value="2024-06-15" calendar="persian" locale="fa"></pdx-date-picker>
```

**Min/Max & Disabled Dates** — Constrain selectable dates. Disabled dates are grayed out.

```html
<pdx-date-picker min="2024-01-01" max="2024-12-31" placeholder="2024 only"></pdx-date-picker>
```

**Editable** — With `editable` the date can be typed, in the locale's pattern or as ISO (2024-06-23), and is committed on Enter or when the field loses focus. A date that does not exist, or one outside min/max, marks the field invalid and keeps the last good value. In `datetime` the time typed after the date is read too. The calendar button, or Alt+ArrowDown, opens the calendar.

```html
<pdx-date-picker editable locale="en-US" min="2024-01-01" max="2024-12-31" aria-label="Delivery date"></pdx-date-picker>
<pdx-date-picker editable mode="datetime" locale="en-US" aria-label="Appointment"></pdx-date-picker>
```

**Standalone Calendar** — `<pdx-calendar>` can be used standalone without the picker wrapper. Inline mode, week numbers, multiple months.

```html
<pdx-calendar inline></pdx-calendar>

<!-- With week numbers -->
<pdx-calendar inline :week-numbers="true"></pdx-calendar>
```

**Time Picker Standalone** — `<pdx-time-picker>` — segmented input with spinbutton semantics. Up/Down arrows, digit typing, Tab between segments.

```html
<pdx-time-picker value="14:30" format="24h"></pdx-time-picker>
<pdx-time-picker value="14:30" format="12h"></pdx-time-picker>
<pdx-time-picker value="09:15:30" format="24h" showseconds></pdx-time-picker>
<pdx-time-picker value="10:00" format="24h" :step="15"></pdx-time-picker>
<pdx-time-picker value="14:30" format="auto" locale="it"></pdx-time-picker>

<!-- Sizes -->
<pdx-time-picker value="10:30" size="sm" format="24h"></pdx-time-picker>
<pdx-time-picker value="10:30" format="24h"></pdx-time-picker>
<pdx-time-picker value="10:30" size="lg" format="24h"></pdx-time-picker>
```

**Date Range** — Click start, hover preview, click end. Auto-swap if end < start. 2-month view for range mode.

```html
<pdx-date-picker mode="daterange" :number-of-months="2" placeholder="Select range"></pdx-date-picker>
```

**Presets** — Quick-select buttons in the panel sidebar. Pass an array of `{ label, value }` objects.

```html
<pdx-date-picker mode="daterange" :number-of-months="2"
  :presets="rangePresets"></pdx-date-picker>
```

```js
// presets = [
//   { label: 'Today', value: ['2026-04-07', '2026-04-07'] },
//   { label: 'Last 7 days', value: ['2026-04-01', '2026-04-07'] },
//   { label: 'This month', value: ['2026-04-01', '2026-04-30'] },
// ]
```

**Highlighted Dates** — Mark specific dates with a dot indicator via `highlightedDates` callback. The standalone calendar below highlights the 5th, 15th, and 25th of each month.

```html
<pdx-calendar inline :highlightedDates="highlightFn"></pdx-calendar>
```

```js
// highlightFn = (iso) => {
//   const d = parseInt(iso.split('-')[2]);
//   return d === 5 || d === 15 || d === 25 ? 'event' : false;
// }
```

**Fiscal Year / Quarter** — Configurable fiscal start month. Q1 starts in April if `fiscal-start-month="4"`.

```html
<pdx-date-picker mode="quarter" :fiscal-start-month="4"
  placeholder="Select fiscal quarter"></pdx-date-picker>

<pdx-date-picker mode="quarter" :fiscal-start-month="1"
  placeholder="Select calendar quarter"></pdx-date-picker>
```

**Inline Calendar (No Popover)** — Calendar rendered directly in the page. Ideal for dashboards.

```html
<pdx-date-picker inline value="2024-06-15"></pdx-date-picker>
```

**Sizes**

```html
<pdx-date-picker size="sm" placeholder="Small"></pdx-date-picker>
<pdx-date-picker placeholder="Medium (default)"></pdx-date-picker>
<pdx-date-picker size="lg" placeholder="Large"></pdx-date-picker>
```

**Locale Support** — Month/day names, date format, first day of week — all from Intl. Zero translation files.

```html
<pdx-date-picker value="2024-06-15" locale="it"></pdx-date-picker>
<pdx-date-picker value="2024-06-15" locale="de"></pdx-date-picker>
<pdx-date-picker value="2024-06-15" locale="ja"></pdx-date-picker>
<pdx-date-picker value="2024-06-15" locale="ar"></pdx-date-picker>
```

