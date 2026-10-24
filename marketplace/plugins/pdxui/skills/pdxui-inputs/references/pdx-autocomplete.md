### `<pdx-autocomplete>`

Suggestions as you type.

**Takes a DataSource:** bind one to `:source`, or place the component inside a [`<pdx-data-source>`](../../pdxui-data/references/pdx-data-source.md), which it injects.

**Use it when** the field is free text with suggestions: a city, a tag, a name the list may not hold.
**Not when** the value must be one of the options → `pdx-select`; `force-selection` only clears a non-matching text
on blur.

**Pitfalls**
- After a pick, `el.value` is the CODE from `value-field`, not the label the input shows: that is
  `el.getText()`, and the picked suggestion `el.getSelectedItem()`.
- Typing emits `query-change` with the text, not `value-change`: the value changes on a pick, on free text
  confirmed by blur or Enter, on a clear, or on a `force-selection` wipe.
- `force-selection` compares the typed text with the labels, case-insensitively, 150 ms after blur.
- Suggestions appear from `min-length` characters (default 1), at most `max-items` (default 10).
- `remote` filters the source with `contains` on `label-field`: the server has to honour that operator.

**Composes with** `pdx-data-source` (wrap it and the source is injected, no `:source` needed) · `pdx-form`
(bound through its model, `::value="f.x"`).

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `suggestions` | — | array | `() => []` | The list of suggestions to match against. |
| `source` | — | object | `null` | The data source to render from. |
| `labelField` | `labelfield` | string | `'label'` | Object field used as the visible label. |
| `valueField` | `valuefield` | string | `'value'` | Object field used as the value. |
| `placeholder` | `placeholder` | string | `''` | Placeholder text shown while empty. |
| `label` | `label` | string | `''` | Visible label text. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `readonly` | `readonly` | boolean | `false` | Makes the value read-only — visible but not editable. |
| `minLength` | `minlength` | number | `1` | Minimum characters before suggestions appear. |
| `debounce` | `debounce` | number | `200` | Delay (ms) before querying after a keystroke. |
| `forceSelection` | `forceselection` | boolean | `false` | Require the value to be one of the suggestions. |
| `highlight` | `highlight` | boolean | `true` | Highlights the matched substring in suggestions. |
| `clearable` | `clearable` | boolean | `false` | Shows a clear button to reset the value. |
| `loading` | `loading` | boolean | `false` | Shows a loading / busy state. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `maxItems` | `maxitems` | number | `10` | Maximum number of suggestions to show. |
| `remote` | `remote` | boolean | `false` | Enable server-side filtering via DataSource.setFilter() with debounce. |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `success` | `success` | boolean | `false` | Applies the success state styling. |
| `warning` | `warning` | boolean | `false` | Applies the warning state styling. |
| `size` | `size` | 'md' \| 'xs' \| 'sm' \| 'lg' \| 'xl' | `'md'` | xs, sm, md (the default), lg or xl — the same scale as pdx-input. |
| `value` | `value` | unknown | `''` | The current value. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `open()` | Opens it. |
| `close()` | Closes it. |
| `clear()` | Clears the value. |
| `getText()` | The text the field shows: the picked suggestion's label, or the free text. |
| `getSelectedItem()` | The suggestion last picked, as given; null when the value is free text or set from outside. |

**Events:** `pdx-clear` — Fired when the clear button empties the field, after its `value-change`.; `query-change` → `detail: { value: string }` — The text typed, on each keystroke: the query the suggestions are filtered by.; `value-change` → `detail: { value: unknown }` — Fired when the component writes `value`. Does not bubble.

**Renders:** roles `combobox` · `listbox` · `option` · `status`

**Injects:** `DataSourceContext` (optional)

**Slot:** `option` — Renders one option: a snippet `option(option, index, highlighted)`, or the scoped slot, which receives `{ label, value, raw, highlighted, index }` (`raw` is the original item).


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic — Local Suggestions** — Pass an array of strings. Suggestions appear after typing.

```html
<pdx-autocomplete
  placeholder="Type a fruit..."
  :suggestions="['Apple', 'Banana', 'Cherry', ...]"
  clearable
  @value-change="onSelect" />
```

**Object Array — Custom Fields** — Use `label-field` and `value-field` for object arrays. The input shows the label; The value is the value field; `getText()` is the label shown and `getSelectedItem()` the whole item.

```html
<pdx-autocomplete
  placeholder="Search a city..."
  :suggestions="cities"
  label-field="name"
  value-field="code"
  @value-change="onSelect" />
```

```js
const cities = [
  { name: 'Rome', code: 'FCO' },
  { name: 'Milan', code: 'MXP' },
  ...
];
```

**Remote Search — DataSource** — Connect to a DataSource for server-side search. Built-in debounce (300ms). Type at least 2 characters to search.

```html
<pdx-autocomplete
  placeholder="Search countries..."
  :source="countryDS"
  label-field="name"
  :debounce="300"
  :min-length="2" />
```

```js
const countryDS = createDataSource({
  data: countries,
  pageSize: 0,
});
```

**Force Selection** — With `force-selection`, the input clears on blur if the text does not match a suggestion. Try typing something that is not in the list, then click outside. _(from the live demo)_

```html
<div class="demo-box">
  <pdx-autocomplete
    placeholder="Must match a color..."
    :suggestions="colors"
    force-selection
    @value-change="onColorChange" />
  <p class="pdx-txt-small pdx-ink-muted result">Color: {{ colorValue }}</p>
</div>
```

**Highlight Matching** — Matching text is highlighted by default (`highlight` prop). Type a few characters to see the match highlighted in bold. _(from the live demo)_

```html
<div class="demo-box">
  <pdx-autocomplete
    placeholder="Type to see highlights..."
    :suggestions="languages"
    highlight />
</div>
```

**Cascading — `<pdx-data-source>` Wrapper** — Wrap with `<pdx-data-source>` — the autocomplete discovers the DataSource automatically via Context Protocol. No `:source` prop needed.

```html
<!-- Zero prop wiring — autocomplete discovers DataSource via Context Protocol -->
<pdx-data-source :data="languages" auto-load>
  <pdx-autocomplete placeholder="Search..." highlight />
</pdx-data-source>
```

**Select — Creatable Mode** — `pdx-select` with `creatable` prop — type a new value and press Enter or click "Create" to add it. Emits `pdx-create` event.

```html
<pdx-select
  placeholder="Pick or create a tag..."
  :options="tags"
  searchable
  creatable
  @pdx-create="onTagCreate"
  @value-change="onTagChange" />
```

