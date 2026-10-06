### `<pdx-rating>`

Star rating with halves and tooltips.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | number | `0` | The current value. |
| `count` | `count` | number | `5` | Number of rating symbols. |
| `precision` | `precision` | number | `1` | Smallest selectable step (e.g. 0.5 for half stars). |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `readonly` | `readonly` | boolean | `false` | Makes the value read-only — visible but not editable. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `color` | `color` | string | `''` | Colour of the component. |
| `tooltips` | `tooltips` | string | `''` | Comma-separated tooltip labels, e.g. "Bad,Poor,OK,Good,Great" |
| `colors` | `colors` | string | `''` | Comma-separated threshold:color pairs, e.g. "2:red,3:orange,5:green" |
| `clearable` | `clearable` | boolean | `false` | Allow clearing to 0 by clicking current value |
| `label` | `label` | string | `''` | Accessible name. Empty: the rating.label component string, «Rating» in English. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |

**Events:** `change` → `detail: { value }` — Fired when the value changes.; `hover` → `detail: { value }` — Fired on `hover`.; `pdx-change` → `detail: { value }` — Fired when the value changes.

**Renders:** roles `slider`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Click to rate. Arrow keys to adjust.

```html
<pdx-rating :value="rating1" @pdx-change="onRating1"></pdx-rating>
```

**Half-Star Precision** — precision=0.5 enables half-star selection. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-rating :value="rating2" precision="0.5" @pdx-change="onRating2"></pdx-rating>
</div>
```

**Sizes** _(from the live demo)_

```html
<div class="demo-stack">
  <div>
    <span class="pdx-txt-small pdx-ink-muted label-w">Small</span>
    <pdx-rating value="3" size="sm" readonly></pdx-rating>
  </div>
  <div>
    <span class="pdx-txt-small pdx-ink-muted label-w">Default</span>
    <pdx-rating value="3" readonly></pdx-rating>
  </div>
  <div>
    <span class="pdx-txt-small pdx-ink-muted label-w">Large</span>
    <pdx-rating value="3" size="lg" readonly></pdx-rating>
  </div>
</div>
```

**Tooltips** — Hover a star to see the label. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-rating value="0" tooltips="Terrible,Bad,OK,Good,Excellent"></pdx-rating>
</div>
```

**Threshold Colors** — Colors change based on value. Click to clear. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-rating :value="rating4" colors="2:red,3:orange,5:green" @pdx-change="onRating4" clearable></pdx-rating>
</div>
```

**States** _(from the live demo)_

```html
<div class="demo-stack">
  <div>
    <span class="pdx-txt-small pdx-ink-muted label-w">Readonly</span>
    <pdx-rating value="4" readonly></pdx-rating>
  </div>
  <div>
    <span class="pdx-txt-small pdx-ink-muted label-w">Disabled</span>
    <pdx-rating value="2" disabled></pdx-rating>
  </div>
  <div>
    <span class="pdx-txt-small pdx-ink-muted label-w">10 stars</span>
    <pdx-rating value="7" count="10" precision="0.25" readonly size="sm"></pdx-rating>
  </div>
</div>
```

**Form Integration** — Form-associated: the rating is submitted with a native form, under its `name`. _(from the live demo)_

```html
<div class="demo-row">
  <form @submit="onSubmit">
    <pdx-form-field label="Your rating" required>
      <pdx-rating :value="rating1" name="score" @pdx-change="onRating1"></pdx-rating>
    </pdx-form-field>
    <button type="submit" class="pdx-primary" style="margin-top:var(--pdx-space-sm)">Submit</button>
  </form>
</div>
```

