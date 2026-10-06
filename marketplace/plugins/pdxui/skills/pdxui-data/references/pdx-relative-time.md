### `<pdx-relative-time>`

Auto-updating “3 days ago”.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `datetime` | `datetime` | string | `''` | The date/time to render relative to now. |
| `locale` | `locale` | string | `''` | Locale of the wording. Empty: the page's language (`lang`), then the browser's. |
| `style` | `style` | string | `'long'` | Wording length: 'long', 'short' or 'narrow'. |
| `numeric` | `numeric` | string | `'auto'` | 'always' (1 day ago) or 'auto' (yesterday). |
| `updateInterval` | `updateinterval` | number | `60000` | How often (ms) to refresh the text. |
| `showTooltip` | `showtooltip` | boolean | `true` | Shows the absolute date on hover. |


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic (Past)** — Common past time expressions. _(from the live demo)_

```html
<div class="demo-container">
  <div class="demo-stack">
    <div class="demo-row-labeled">
      <span class="pdx-txt-small pdx-ink-muted label-col">5 min ago:</span>
      <pdx-relative-time :datetime="fiveMinAgo"></pdx-relative-time>
    </div>
    <div class="demo-row-labeled">
      <span class="pdx-txt-small pdx-ink-muted label-col">2 hours ago:</span>
      <pdx-relative-time :datetime="twoHoursAgo"></pdx-relative-time>
    </div>
    <div class="demo-row-labeled">
      <span class="pdx-txt-small pdx-ink-muted label-col">Yesterday:</span>
      <pdx-relative-time :datetime="oneDayAgo"></pdx-relative-time>
    </div>
    <div class="demo-row-labeled">
      <span class="pdx-txt-small pdx-ink-muted label-col">3 days ago:</span>
      <pdx-relative-time :datetime="threeDaysAgo"></pdx-relative-time>
    </div>
    <div class="demo-row-labeled">
      <span class="pdx-txt-small pdx-ink-muted label-col">Last month:</span>
      <pdx-relative-time :datetime="oneMonthAgo"></pdx-relative-time>
    </div>
  </div>
</div>
```

**Future** — Upcoming times. _(from the live demo)_

```html
<div class="demo-container">
  <div class="demo-stack">
    <div class="demo-row-labeled">
      <span class="pdx-txt-small pdx-ink-muted label-col">In 5 min:</span>
      <pdx-relative-time :datetime="inFiveMin"></pdx-relative-time>
    </div>
    <div class="demo-row-labeled">
      <span class="pdx-txt-small pdx-ink-muted label-col">In 2 hours:</span>
      <pdx-relative-time :datetime="inTwoHours"></pdx-relative-time>
    </div>
    <div class="demo-row-labeled">
      <span class="pdx-txt-small pdx-ink-muted label-col">Tomorrow:</span>
      <pdx-relative-time :datetime="inOneDay"></pdx-relative-time>
    </div>
  </div>
</div>
```

**Styles** — Intl.RelativeTimeFormat style: long, short, narrow.

```html
<pdx-relative-time :datetime="date" style="short"></pdx-relative-time>
<pdx-relative-time :datetime="date" style="narrow"></pdx-relative-time>
```

**Auto-Update** — Updates every 10 seconds. Watch the text change over time.

```html
<pdx-relative-time :datetime="now" :update-interval="10000"></pdx-relative-time>
```

**Locales** — Same date rendered in different locales.

```html
<pdx-relative-time :datetime="date" locale="it"></pdx-relative-time>
<pdx-relative-time :datetime="date" locale="de"></pdx-relative-time>
```

**Tooltip** — Hover over the text to see the full absolute date in a tooltip (enabled by default). _(from the live demo)_

```html
<div class="demo-container">
  <div class="demo-row-labeled">
    <span class="pdx-txt-small pdx-ink-muted label-col">Hover me:</span>
    <pdx-relative-time :datetime="threeDaysAgo" show-tooltip></pdx-relative-time>
  </div>
</div>
```

