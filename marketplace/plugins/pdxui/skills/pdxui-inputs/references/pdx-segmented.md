### `<pdx-segmented>`

A compact set of exclusive options.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | string | `''` | The current value. |
| `options` | — | array | `[]` | Options: string[] or {label,value,disabled?,icon?}[] — bound as an array, or written as a static JSON attribute. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `full` | `full` | boolean | `false` | Stretches to the full width of its container. |
| `orientation` | `orientation` | string | `'horizontal'` | Layout orientation — horizontal or vertical. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `label` | `label` | string | `''` | Visible label text. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |

**Events:** `change` → `detail: { value, previousValue }` — Fired when the value changes.; `pdx-change` → `detail: { value, previousValue }` — Fired when the value changes.

**Renders:** roles `radio` · `radiogroup`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Select a time period.

```html
<pdx-segmented :value="view" options='["day","week","month","year"]' @change="onView"></pdx-segmented>
```

**Object Options** — With label/value objects. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-segmented label="Billing period" :value="period" options='[{"label":"Monthly","value":"monthly"},{"label":"Quarterly","value":"quarterly"},{"label":"Yearly","value":"yearly"}]' @change="onPeriod"></pdx-segmented>
</div>
```

**Sizes** _(from the live demo)_

```html
<div class="demo-stack">
  <div>
    <span class="pdx-txt-small pdx-ink-muted label-w">Small</span>
    <pdx-segmented label="Small" value="a" options='["a","b","c"]' size="sm"></pdx-segmented>
  </div>
  <div>
    <span class="pdx-txt-small pdx-ink-muted label-w">Default</span>
    <pdx-segmented label="Default" value="a" options='["a","b","c"]'></pdx-segmented>
  </div>
  <div>
    <span class="pdx-txt-small pdx-ink-muted label-w">Large</span>
    <pdx-segmented label="Large" value="a" options='["a","b","c"]' size="lg"></pdx-segmented>
  </div>
</div>
```

**Full Width** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-segmented label="Layout" :value="layout" options='[{"label":"Grid","value":"grid"},{"label":"List","value":"list"},{"label":"Table","value":"table"}]' full @change="onLayout"></pdx-segmented>
</div>
```

**Disabled** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-segmented label="Disabled options" value="opt1" options='["opt1","opt2","opt3"]' disabled></pdx-segmented>
</div>
```

**Form Integration** _(from the live demo)_

```html
<div class="demo-row">
  <form @submit="onSubmit">
    <pdx-form-field label="Billing period">
      <pdx-segmented label="Billing period" :value="period" options='[{"label":"Monthly","value":"monthly"},{"label":"Yearly","value":"yearly"}]' name="period" @change="onPeriod"></pdx-segmented>
    </pdx-form-field>
    <button type="submit" class="pdx-primary" style="margin-top:var(--pdx-space-sm)">Submit</button>
  </form>
</div>
```

