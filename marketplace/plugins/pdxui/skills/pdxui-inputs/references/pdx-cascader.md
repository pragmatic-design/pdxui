### `<pdx-cascader>`

Drill through nested options.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `options` | — | array | `[]` | Tree of options |
| `value` | — | array | `[]` | Selected path — array of values from root to leaf |
| `placeholder` | `placeholder` | string | `''` | Placeholder text |
| `label` | `label` | string | `''` | Accessible name (aria-label) for the trigger; falls back to placeholder |
| `searchable` | `searchable` | boolean | `false` | Show search input for filtering |
| `separator` | `separator` | string | `' / '` | Separator for display text (default: ' / ') |
| `clearable` | `clearable` | boolean | `true` | Clearable |
| `disabled` | `disabled` | boolean | `false` | Disabled |
| `changeOnSelect` | `changeonselect` | boolean | `false` | Allow selecting non-leaf nodes |
| `loadChildren` | — | function | `null` | Lazy load function: (node) => Promise<CascaderNode[]> |
| `size` | `size` | string | `''` | Component size |
| `name` | `name` | string | `''` | Form field name |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `getValue()` | The current path, as the keys from the root down. |
| `setValue(v)` | Set the path and emit `pdx-change`. The event carries the keys only — its `labels` is empty. |
| `clear()` | Clears the value. |

**Events:** `pdx-change` → `detail: { value, labels }` — Fired when the value changes.; `pdx-clear` — Fired when the value is cleared.; `pdx-close` — Fired when it closes. Does not bubble.; `pdx-load-error` → `detail: { node, error }` — Fired when `loadChildren` rejects; the branch stays askable and can be clicked again.; `pdx-open` — Fired when it opens. Does not bubble.

**Renders:** roles `combobox` · `listbox` · `option` · `status`

**Slot:** `option` — Scoped — renders one option in a column. Receives `{ node, level, selected }`.

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

