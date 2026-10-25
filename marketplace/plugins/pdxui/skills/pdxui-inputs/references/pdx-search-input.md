### `<pdx-search-input>`

Search box with clear and shortcuts.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `placeholder` | `placeholder` | string | `''` | The input's placeholder. Empty: the search-input.placeholder component string, «Search...». |
| `ariaLabel` | `arialabel` | string | `''` | Accessible name when there is no visible label. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `loading` | `loading` | boolean | `false` | Shows a loading / busy state. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `debounce` | `debounce` | number | `300` | Debounce delay in ms for pdx-search event (0 = no debounce) |
| `shortcut` | `shortcut` | string | `''` | Keyboard shortcut hint displayed in suffix (e.g. "Ctrl+K") |
| `size` | `size` | 'md' \| 'xs' \| 'sm' \| 'lg' \| 'xl' | `'md'` | xs, sm, md (the default), lg or xl — the same scale as pdx-input. |
| `value` | `value` | string | `''` | The current value. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |
| `selectText()` | Select the whole text, so the next keystroke replaces it. Does not focus first. |

**Events:** `pdx-blur` — The searchbox lost focus.; `pdx-clear` — The clear button or Escape emptied the field, after its `value-change`.; `pdx-focus` — The searchbox received focus.; `pdx-search` → `detail: { value: string }` — The query, after the debounce or on Enter; not repeated for the same text.; `value-change` → `detail: { value: string }` — Fired when the component writes `value`. Does not bubble.

**Renders:** roles `searchbox` · `status`

**States:** `:state(disabled)` — `disabled` is set.; `:state(loading)` — `loading` is set.

**Parts:** `[data-part="root"]` — The frame: border, background and the states' colours.; `[data-part="input"]` — The native `<input type="search">`, the searchbox a form submits.; `[data-part="prefix"]` — The space before the text: the search icon, or the spinner while `loading`.; `[data-part="spinner"]` — The loading spinner, a `role="status"`, while `loading`.; `[data-part="clear"]` — The clear button, while there is text.; `[data-part="shortcut"]` — The `shortcut` hint, while the field is empty.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Search Input** — Search icon prefix, auto-clearable, debounced `pdx-search` event. Press Escape to clear. Enter for immediate search.

```html
<pdx-search-input
  placeholder="Search..."
  debounce="300"
  shortcut="Ctrl+K"
  @pdx-search="onSearch">
</pdx-search-input>
```

**Basic**

```html
<pdx-search-input
  placeholder="Search..."
  debounce="300"
  shortcut="Ctrl+K"
  @pdx-search="onSearch">
</pdx-search-input>
```

**States** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-form-field label="Loading State">
    <pdx-search-input placeholder="Searching..." loading value="react"></pdx-search-input>
  </pdx-form-field>
  <pdx-form-field label="Custom Debounce (500ms)">
    <pdx-search-input placeholder="Type slowly..." debounce="500"></pdx-search-input>
  </pdx-form-field>
</div>
```

**Sizes** _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-search-input size="sm" placeholder="Small search..."></pdx-search-input>
  <pdx-search-input placeholder="Default search..."></pdx-search-input>
  <pdx-search-input size="lg" placeholder="Large search..."></pdx-search-input>
</div>
```

