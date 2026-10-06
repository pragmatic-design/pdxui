### `<pdx-search-input>`

Search box with clear and shortcuts.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | string | `''` | The current value. |
| `placeholder` | `placeholder` | string | `''` | The input's placeholder. Empty: the search-input.placeholder component string, «Search...». |
| `ariaLabel` | `arialabel` | string | `''` | Accessible name when there is no visible label. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `loading` | `loading` | boolean | `false` | Shows a loading / busy state. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `debounce` | `debounce` | number | `300` | Debounce delay in ms for pdx-search event (0 = no debounce) |
| `shortcut` | `shortcut` | string | `''` | Keyboard shortcut hint displayed in suffix (e.g. "Ctrl+K") |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |
| `selectText()` | Select the whole text, so the next keystroke replaces it. Does not focus first. |

**Events:** `pdx-blur` — Fired when it loses focus.; `pdx-clear` — Fired when the value is cleared.; `pdx-focus` — Fired when it receives focus.; `pdx-input` → `detail: { value }` — Fired on each input as the user types.; `pdx-search` → `detail: { value }` — Fired when a search is performed.

**Renders:** roles `searchbox` · `status`


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

