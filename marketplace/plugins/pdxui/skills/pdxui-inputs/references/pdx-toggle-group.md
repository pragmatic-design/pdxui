### `<pdx-toggle-group>`

Exclusive or multi-select set of toggles.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `type` | `type` | string | `'single'` |  |
| `value` | `value` | string | `''` | For single: string. For multiple: comma-separated string of values. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `orientation` | `orientation` | string | `'horizontal'` | Layout orientation — horizontal or vertical. |
| `variant` | `variant` | string | `'outline'` | Visual variant. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `loop` | `loop` | boolean | `true` |  |
| `label` | `label` | string | `''` | Visible label text. |

**Events:** `pdx-change` → `detail: { value, values }` — Fired when the value changes.; `valuechange` → `detail: { value, values }` — Fired on `valuechange`.

**Renders:** roles `group`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Single** — One pressed at a time. Pressing the pressed one again clears the value.

```html
<pdx-toggle-group type="single" label="Text alignment"
  :value="align" @pdx-change="e => align = e.detail.value">
  <pdx-toggle value="left">Left</pdx-toggle>
  <pdx-toggle value="center">Center</pdx-toggle>
  <pdx-toggle value="right">Right</pdx-toggle>
  <pdx-toggle value="justify">Justify</pdx-toggle>
</pdx-toggle-group>
```

**Multiple** — Any number pressed. The event carries both forms: `detail.value` (`"bold,italic"`) and `detail.values` (an array). _(from the live demo)_

```html
<div class="demo-row">
  <pdx-toggle-group type="multiple" label="Formatting" :value="formatting" @pdx-change="e => setFormatting(e.detail.value)">
    <pdx-toggle value="bold" aria-label="Bold"><strong>B</strong></pdx-toggle>
    <pdx-toggle value="italic" aria-label="Italic"><em>I</em></pdx-toggle>
    <pdx-toggle value="underline" aria-label="Underline"><u>U</u></pdx-toggle>
    <pdx-toggle value="strike" aria-label="Strikethrough"><s>S</s></pdx-toggle>
  </pdx-toggle-group>
  <span class="pdx-txt-small pdx-ink-muted">value: <code class="live-value">{{ formatting || '(none)' }}</code></span>
</div>
<p class="pdx-txt-small sample" :style="sampleStyle()">Formatted sample text</p>
```

**Disabled item** — A single `disabled` toggle cannot be pressed, and the arrow keys step over it. Focus Day and press → : focus lands on Month.

```html
<pdx-toggle-group type="single" label="Calendar view" value="day">
  <pdx-toggle value="day">Day</pdx-toggle>
  <pdx-toggle value="week" disabled>Week</pdx-toggle>
  <pdx-toggle value="month">Month</pdx-toggle>
  <pdx-toggle value="year">Year</pdx-toggle>
</pdx-toggle-group>
```

**Disabled group** — `disabled` on the group disables every toggle in it. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-toggle-group type="single" label="Disabled group" value="b" disabled>
    <pdx-toggle value="a">A</pdx-toggle>
    <pdx-toggle value="b">B</pdx-toggle>
    <pdx-toggle value="c">C</pdx-toggle>
  </pdx-toggle-group>
</div>
```

**Variants and sizes** — `variant` and `size` on the group reach every toggle. _(from the live demo)_

```html
<div class="demo-grid">
  <div class="demo-stack">
    <span class="pdx-txt-small pdx-weight-semibold">outline (default)</span>
    <pdx-toggle-group type="single" label="Outline" value="a" variant="outline">
      <pdx-toggle value="a">One</pdx-toggle><pdx-toggle value="b">Two</pdx-toggle><pdx-toggle value="c">Three</pdx-toggle>
    </pdx-toggle-group>
  </div>
  <div class="demo-stack">
    <span class="pdx-txt-small pdx-weight-semibold">ghost</span>
    <pdx-toggle-group type="single" label="Ghost" value="a" variant="ghost">
      <pdx-toggle value="a">One</pdx-toggle><pdx-toggle value="b">Two</pdx-toggle><pdx-toggle value="c">Three</pdx-toggle>
    </pdx-toggle-group>
  </div>
  <div class="demo-stack">
    <span class="pdx-txt-small pdx-weight-semibold">size sm</span>
    <pdx-toggle-group type="single" label="Small" value="a" size="sm">
      <pdx-toggle value="a">One</pdx-toggle><pdx-toggle value="b">Two</pdx-toggle><pdx-toggle value="c">Three</pdx-toggle>
    </pdx-toggle-group>
  </div>
  <div class="demo-stack">
    <span class="pdx-txt-small pdx-weight-semibold">size lg</span>
    <pdx-toggle-group type="single" label="Large" value="a" size="lg">
      <pdx-toggle value="a">One</pdx-toggle><pdx-toggle value="b">Two</pdx-toggle><pdx-toggle value="c">Three</pdx-toggle>
    </pdx-toggle-group>
  </div>
</div>
```

**Vertical** — `orientation="vertical"` stacks the toggles, and ↑ / ↓ move between them. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-toggle-group type="single" label="Panel" value="files" orientation="vertical">
    <pdx-toggle value="files">Files</pdx-toggle>
    <pdx-toggle value="search">Search</pdx-toggle>
    <pdx-toggle value="git">Source control</pdx-toggle>
  </pdx-toggle-group>
</div>
```

**Composition — an editor toolbar** — Two groups in one toolbar: formatting (multiple) and alignment (single). _(from the live demo)_

```html
<div class="comp-card">
  <div class="toolbar" role="toolbar" aria-label="Text formatting">
    <pdx-toggle-group type="multiple" label="Style" size="sm" :value="formatting" @pdx-change="e => setFormatting(e.detail.value)">
      <pdx-toggle value="bold" aria-label="Bold"><strong>B</strong></pdx-toggle>
      <pdx-toggle value="italic" aria-label="Italic"><em>I</em></pdx-toggle>
      <pdx-toggle value="underline" aria-label="Underline"><u>U</u></pdx-toggle>
    </pdx-toggle-group>
    <span class="toolbar-sep" aria-hidden="true"></span>
    <pdx-toggle-group type="single" label="Alignment" size="sm" :value="align" @pdx-change="e => setAlign(e.detail.value)">
      <pdx-toggle value="left">Left</pdx-toggle>
      <pdx-toggle value="center">Center</pdx-toggle>
      <pdx-toggle value="right">Right</pdx-toggle>
    </pdx-toggle-group>
  </div>
  <p class="pdx-txt-small sample" :style="sampleStyle() + ';text-align:' + (align || 'left')">
    The toolbar and the sections above share their state: press a button here and watch the groups above follow.
  </p>
</div>
```

