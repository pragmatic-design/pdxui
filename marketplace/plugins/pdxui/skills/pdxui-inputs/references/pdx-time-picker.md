### `<pdx-time-picker>`

Set hours and minutes.

**The value** is `HH:mm` (`HH:mm:ss` with `show-seconds`) on the 24-hour clock, whatever the display
format. It is on the element after every change — `el.value` equals `pdx-change.detail.value` — so a
form can bind it like any other input.

**`''` means empty**, as in the native `<input type="time">`: every segment shows `--`, a screen reader
hears the `time-picker.empty` string instead of a number, and `el.value` is `''`. The first arrow press,
typed digit or wheel step on a segment starts from `min` (if set) or 00:00. `el.clear()` returns to
empty and emits `pdx-change {value: ''}`. There is no `placeholder` prop: `--` is the empty display.

Typing fills a segment: two digits (or one that cannot start a larger number, like `3` for the hour)
move to the next segment.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | string | `''` | The current value. |
| `format` | `format` | string | `'auto'` | Time format, e.g. '12h' or '24h'. |
| `showSeconds` | `showseconds` | boolean | `false` | Includes a seconds field. |
| `step` | `step` | number | `1` | Increment step. |
| `min` | `min` | string | `''` | Minimum allowed value. |
| `max` | `max` | string | `''` | Maximum allowed value. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `locale` | `locale` | string | `''` | Locale for the 12h/24h default. Empty: the page's language (`lang`), then the browser's. |
| `ariaLabel` | `arialabel` | string | `''` | Accessible name when there is no visible label. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |

**Events:** `pdx-blur` — Fired when it loses focus.; `pdx-change` → `detail: { value }` — Fired when the value changes.; `pdx-input` → `detail: { value }` — Fired on each input as the user types.

**Renders:** roles `group` · `spinbutton`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Bound to a signal: the arrows, the wheel and typed digits all emit `pdx-change` with the new value. An empty picker shows `--`, the way the native time input does — not midnight.

```html
<pdx-time-picker :value="meeting" format="24h" aria-label="Meeting time"
  @pdx-change="e => meeting = e.detail.value"></pdx-time-picker>
```

```js
let meeting = $signal('09:30');
```

**12-hour and 24-hour clock** — `format="auto"` (the default) follows the locale — the page's `lang`, then the browser's. `12h` adds an AM/PM segment; the value stays on the 24-hour clock. _(from the live demo)_

```html
<div class="demo-grid">
  <div class="demo-stack">
    <span class="pdx-txt-small pdx-weight-semibold">24h</span>
    <pdx-time-picker value="14:45" format="24h" aria-label="24-hour"></pdx-time-picker>
  </div>
  <div class="demo-stack">
    <span class="pdx-txt-small pdx-weight-semibold">12h</span>
    <pdx-time-picker value="14:45" format="12h" aria-label="12-hour"></pdx-time-picker>
  </div>
  <div class="demo-stack">
    <span class="pdx-txt-small pdx-weight-semibold">auto, locale en-US</span>
    <pdx-time-picker value="14:45" locale="en-US" aria-label="Auto, en-US"></pdx-time-picker>
  </div>
  <div class="demo-stack">
    <span class="pdx-txt-small pdx-weight-semibold">auto, locale it-IT</span>
    <pdx-time-picker value="14:45" locale="it-IT" aria-label="Auto, it-IT"></pdx-time-picker>
  </div>
</div>
```

**Seconds and step** — `showSeconds` adds a seconds segment. `step` is how far one arrow press moves the minutes (and seconds): `15` gives quarter hours.

```html
<pdx-time-picker value="08:15:30" format="24h" show-seconds></pdx-time-picker>
<pdx-time-picker :value="quarter" format="24h" step="15"></pdx-time-picker>
```

**Min and max** — Office hours, 09:00 to 18:00: arrows, the wheel and typed digits are all pulled back inside the range. An empty picker starts from `min` on the first arrow press.

```html
<pdx-time-picker :value="office" format="24h" min="09:00" max="18:00" step="30"></pdx-time-picker>
```

**Sizes** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-time-picker value="10:00" format="24h" size="sm" aria-label="Small"></pdx-time-picker>
  <pdx-time-picker value="10:00" format="24h" aria-label="Default"></pdx-time-picker>
  <pdx-time-picker value="10:00" format="24h" size="lg" aria-label="Large"></pdx-time-picker>
</div>
```

**Disabled** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-time-picker value="12:30" format="24h" disabled aria-label="Disabled"></pdx-time-picker>
</div>
```

**Composition — booking a slot** — Inside form fields, with a label and a hint. The end cannot come before the start: its `min` follows the start's value. _(from the live demo)_

```html
<div class="comp-card">
  <div class="form-grid-2">
    <pdx-form-field label="Start" hint="Opening hours 08:00–20:00">
      <pdx-time-picker :value="start" format="24h" min="08:00" max="20:00" step="15" aria-label="Start" @pdx-change="e => start = e.detail.value"></pdx-time-picker>
    </pdx-form-field>
    <pdx-form-field label="End" hint="After the start">
      <pdx-time-picker :value="end" format="24h" :min="start" max="20:00" step="15" aria-label="End" @pdx-change="e => end = e.detail.value"></pdx-time-picker>
    </pdx-form-field>
  </div>
  <p class="pdx-txt-small summary">Booked <strong>{{ start }}</strong> – <strong>{{ end }}</strong> · {{ duration() }}</p>
</div>
```

