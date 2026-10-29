### `<pdx-cascader>`

Drill through nested options.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `options` | — | T[] | `[]` | Tree of options |
| `placeholder` | `placeholder` | string | `''` | Placeholder text |
| `label` | `label` | string | `''` | Accessible name (aria-label) for the trigger; falls back to placeholder |
| `searchable` | `searchable` | boolean | `false` | Show search input for filtering |
| `separator` | `separator` | string | `' / '` | Separator for display text (default: ' / ') |
| `clearable` | `clearable` | boolean | `true` | Clearable |
| `disabled` | `disabled` | boolean | `false` | Disabled |
| `changeOnSelect` | `changeonselect` | boolean | `false` | Allow selecting non-leaf nodes |
| `loadChildren` | — | function | `null` | Lazy load function: (node) => Promise<CascaderNode[]> |
| `name` | `name` | string | `''` | Form field name |
| `size` | `size` | 'md' \| 'xs' \| 'sm' \| 'lg' \| 'xl' | `'md'` | xs, sm, md (the default), lg or xl — the same scale as pdx-input. |
| `value` | — | string[] | `() => []` | The current value. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `getLabels()` | The labels of the current path, from the root down. |
| `clear()` | Clears the value. |
| `show()` | Open the popup. |
| `close()` | Close the popup. |
| `toggle()` | Open the popup when closed, close it when open. |

**Events:** `open-change` → `detail: { value: boolean }` — The popup opened (`true`) or closed (`false`): its open state, read-only, as an overlay's (#287).; `pdx-clear` — Fired when the clear button or `clear()` empties the path, after its `value-change`.; `pdx-load-error` → `detail: { node: CascaderNode; error: unknown }` — Fired when `loadChildren` rejects; the branch stays askable and can be clicked again.; `value-change` → `detail: { value: string[] }` — Fired when the component writes `value`. Does not bubble.

**Renders:** roles `combobox` · `listbox` · `option` · `status`

**Slot:** `option` — Renders one option in a column: a snippet `option(node, level, selected)`, or the scoped slot, which receives `{ node, level, selected }`.

**States:** `:state(open)` — The popup is open.; `:state(disabled)` — `disabled` is set.; `:state(loading)` — A branch's children are being fetched by `loadChildren`.

**Parts:** `[data-part="root"]` — The trigger, the combobox: the frame, its border and background.; `[data-part="clear"]` — The clear button, while `clearable`, something is chosen and not `disabled`.; `[data-part="popup"]` — The floating panel that holds the columns, or the search results.; `[data-part="search"]` — The search field atop the panel, while `searchable`.; `[data-part="list"]` — A column, or the list of search results: a `role="listbox"`.; `[data-part="option"]` — An option of a column, or a search result.; `[data-part="spinner"]` — The spinner of a branch being fetched by `loadChildren`.

**Shapes:** `CascaderNode { value: string; label: string; children?: CascaderNode[]; isLeaf?: boolean; disabled?: boolean }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic Cascader** — Click to open, drill down through levels. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-cascader :options="locations" placeholder="Select location"></pdx-cascader>
</div>
```

**Pre-selected Value** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-cascader :options="locations" :value="['europe', 'italy', 'rome']"></pdx-cascader>
</div>
```

**Searchable** — Type to filter across all levels. Shows flattened results with full path. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-cascader searchable :options="locations" placeholder="Search location..."></pdx-cascader>
</div>
```

**Change on Select (Non-leaf)** — Allow selecting intermediate nodes, not just leaves. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-cascader :options="locations" changeonselect placeholder="Select any level"></pdx-cascader>
</div>
```

**Disabled Items** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-cascader :options="disabledLocations" placeholder="Some items disabled"></pdx-cascader>
</div>
```

**Lazy Loading** — `loadChildren` fetches a node's children the first time it is opened; the column says "Loading..." meanwhile. Here each country's regions arrive after 600&nbsp;ms. A node marked `isLeaf: true` is never asked.

```js
const countries = [{ value: 'it', label: 'Italy', isLeaf: false }, …];
function loadRegions(node) {
  return fetch('/api/regions?country=' + node.value).then(r => r.json());   // [{ value, label, isLeaf: true }]
}
```

```html
<pdx-cascader :options="countries" :load-children="loadRegions"></pdx-cascader>
```

**Custom Separator** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-cascader :options="locations" :value="['asia', 'japan', 'tokyo']" separator=" → "></pdx-cascader>
</div>
```

