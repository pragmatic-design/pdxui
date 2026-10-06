### `<pdx-autocomplete>`

Suggestions as you type.

**Takes a DataSource:** bind one to `:source`, or place the component inside a [`<pdx-data-source>`](../../pdxui-data/references/pdx-data-source.md), which it injects.

**Use it when** the field is free text with suggestions: a city, a tag, a name the list may not hold.
**Not when** the value must be one of the options → `pdx-select`; `force-selection` only clears a non-matching text
on blur.

**Pitfalls**
- After a pick, `el.value` is the LABEL the input shows; the code from `value-field` is only in
  `pdx-change.detail.value`.
- Typing emits `pdx-input`, not `pdx-change`: `pdx-change` fires on a pick, a clear, or a `force-selection` wipe.
- `force-selection` compares the typed text with the labels, case-insensitively, 150 ms after blur.
- Suggestions appear from `min-length` characters (default 1), at most `max-items` (default 10).
- `remote` filters the source with `contains` on `label-field`: the server has to honour that operator.

**Composes with** `pdx-data-source` (wrap it and the source is injected, no `:source` needed) · `pdx-form`
(wired by `name`).

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | string | `''` | The current value. |
| `suggestions` | — | array | `() => []` | The list of suggestions to match against. |
| `source` | — | object | `null` | The data source to render from. |
| `labelField` | `labelfield` | string | `'label'` | Object field used as the visible label. |
| `valueField` | `valuefield` | string | `'value'` | Object field used as the value. |
| `placeholder` | `placeholder` | string | `''` | Placeholder text shown while empty. |
| `label` | `label` | string | `''` | Visible label text. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
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

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `open()` | Opens it. |
| `close()` | Closes it. |
| `clear()` | Clears the value. |

**Events:** `pdx-change` → `detail: { value, label, item }` — When the value is committed: a suggestion picked (`value` is its value field, `item` the suggestion), the field cleared, or free text confirmed by leaving the field or pressing Enter with no option chosen (`value` and `label` the text, `item` null). Once per edit, like a native `change`.; `pdx-clear` — Fired when the value is cleared.; `pdx-input` → `detail: { value }` — Fired on each input as the user types.

**Renders:** roles `combobox` · `listbox` · `option` · `status`

**Slot:** `option` — Scoped — renders one option. Receives `{ label, value, raw, highlighted, index }` (`raw` is the original item).


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
  @pdx-change="onSelect" />
```

**Object Array — Custom Fields** — Use `label-field` and `value-field` for object arrays. The input shows the label; `pdx-change` sends the value field as `value`, with `label` and the whole `item`.

```html
<pdx-autocomplete
  placeholder="Search a city..."
  :suggestions="cities"
  label-field="name"
  value-field="code"
  @pdx-change="onSelect" />
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
    @pdx-change="onColorChange" />
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
  @pdx-change="onTagChange" />
```

