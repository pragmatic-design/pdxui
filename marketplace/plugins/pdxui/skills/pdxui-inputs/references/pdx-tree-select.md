### `<pdx-tree-select>`

Select from a tree of options.

**Use it when** a form field's value is chosen from a hierarchy: an input that opens, is bound to `value`,
and closes on the pick. **Not when** the tree stays on the page → `pdx-tree`; the options are flat
→ `pdx-select`; checking a branch should check its subtree → `pdx-tree` with `checkable` (here `multiple`
toggles only the node clicked).

**Pitfalls**
- In single mode a branch cannot be chosen: a click on it expands it.
- With `loadChildren`, every node without `isLeaf: true` counts as a branch, so it cannot be selected either.
  Mark the leaves.
- `searchable` matches labels in declared `children` only: a node inside a branch fetched by `loadChildren` is
  not found unless its branch matches.
- Nodes have a fixed shape, `{ value, label, children?, disabled?, isLeaf? }`: no `idField` / `labelField` as on
  `pdx-tree`.

**Composes with** — it shares the `loadChildren` shape with `pdx-tree` and `pdx-cascader`.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `options` | — | array | `[]` | Tree of options |
| `multiple` | `multiple` | boolean | `false` | Allow multiple selection |
| `placeholder` | `placeholder` | string | `''` | Placeholder |
| `label` | `label` | string | `''` | Accessible name (aria-label) for the trigger; falls back to placeholder |
| `searchable` | `searchable` | boolean | `false` | Show search filter |
| `clearable` | `clearable` | boolean | `true` | Clearable |
| `disabled` | `disabled` | boolean | `false` | Disabled |
| `expandAll` | `expandall` | boolean | `false` | Expand all nodes initially |
| `loadChildren` | — | function | `null` | Lazy load: (node) => Promise<TreeSelectNode[]> |
| `name` | `name` | string | `''` | Form field name |
| `size` | `size` | 'md' \| 'xs' \| 'sm' \| 'lg' \| 'xl' | `'md'` | xs, sm, md (the default), lg or xl — the same scale as pdx-input. |
| `value` | — | string \| string[] \| null | `null` | The current value. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `getValue()` | The current selection: one key, the array of keys when `multiple`, or null. |
| `getLabel()` | The label of the selected node, or the labels joined with ', ' when `multiple`. |
| `setValue(v)` | Set the selection, which dispatches `value-change`, as a click on the tree would. |
| `clear()` | Clears the value. |

**Events:** `pdx-clear` — Fired when the value is cleared.; `pdx-close` — Fired when it closes. Does not bubble.; `pdx-load-error` → `detail: { node, error }` — Fired when `loadChildren` rejects; the branch stays askable and can be reopened.; `pdx-open` — Fired when it opens. Does not bubble.; `value-change` → `detail: { value: string | string[] | null }` — Fired when the component writes `value`. Does not bubble.

**Renders:** roles `combobox` · `tree` · `treeitem`

**Slot:** `node` — Renders one node's label: a snippet `node(node, level, expanded)`, or the scoped slot, which receives `{ node, level, expanded }`.

**Shapes:** `TreeSelectNode { value: string; label: string; children?: TreeSelectNode[]; disabled?: boolean; isLeaf?: boolean }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Single Select** — Click a leaf node to select. Parent nodes expand/collapse. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-tree-select label="Department" :options="departments" placeholder="Select department"></pdx-tree-select>
</div>
```

**Multi Select** — Check multiple nodes with checkboxes. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-tree-select label="Departments" multiple :options="departments" placeholder="Select departments"></pdx-tree-select>
</div>
```

**Searchable** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-tree-select label="Department" searchable :options="departments" placeholder="Search..."></pdx-tree-select>
</div>
```

**Expand All** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-tree-select label="Department" expandall :options="departments" placeholder="All expanded"></pdx-tree-select>
</div>
```

**Pre-selected** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-tree-select label="Department" :options="departments" :value="'frontend'"></pdx-tree-select>
</div>
```

