### `<pdx-slider>`

Pick a number by dragging.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | number | `0` | The current value. |
| `min` | `min` | number | `0` | Minimum allowed value. |
| `max` | `max` | number | `100` | Maximum allowed value. |
| `step` | `step` | number | `1` | Increment step. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `ariaLabel` | `arialabel` | string | `''` | Accessible name when there is no visible label. |
| `label` | `label` | string | `''` | What the slider sets ("Volume"): the thumb's name, and in range mode "{label}, minimum" / "{label}, maximum". Not needed after a pdx-label, which names it. |
| `orientation` | `orientation` | string | `'horizontal'` | Layout orientation — horizontal or vertical. |
| `marks` | `marks` | string | `''` | Comma-separated mark values, or "step" to show all steps |
| `showLabel` | `showlabel` | boolean | `false` | Show value label on thumb while dragging |
| `labelAlways` | `labelalways` | boolean | `false` | Always show label (not just on drag) |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `range` | `range` | boolean | `false` | Range mode: value is "min,max" |
| `minGap` | `mingap` | number | `0` | Minimum gap between thumbs in range mode |
| `color` | `color` | string | `''` | Color the fill portion |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |

**Events:** `pdx-change` → `detail: { value, min, max } | { value }` — Fired when the value changes.; `pdx-change-end` → `detail: { value }` — Fired on `pdx-change-end`.

**Renders:** roles `slider`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Slider** — Two thumbs for min/max selection. Thumbs can't cross.

```html
<pdx-slider value="50" step="10" marks="step" showLabel>
</pdx-slider>

<!-- Range mode -->
<pdx-slider value="20,80" range minGap="10">
</pdx-slider>
```

