### `<pdx-tree>`

A hierarchy the user navigates.

**Use it when** the hierarchy stays on the page and is navigated — a folder pane, a category tree, an org
chart — and selecting is a consequence, not the purpose. **Not when** a form field's value is picked from a
hierarchy → `pdx-tree-select`; a path is chosen through columns → `pdx-cascader`.

**Pitfalls**
- A lazy node must say `isBranch: true`: without children and without the flag it renders as a leaf and
  `loadChildren` is never asked. `pdx-tree-select` uses the opposite flag, `isLeaf`.
- Ids come out as strings: `pdx-select` and `pdx-check` carry `String(node[idField])`, so `7` arrives as `"7"`.
- `pdx-check` lists the leaves and the fully-checked branches; a mixed parent is not in it.
- No prop holds the selection or the checks: you learn them from the events.
- It is not virtualized, and every expand, select or check rebuilds the visible rows, by design.

**Composes with** — its `node` slot (`{ node, level, expanded }`) for a custom row. It shares the
`loadChildren(node) => Promise<Node[]>` shape with `pdx-tree-select` and `pdx-cascader`.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `nodes` | — | array | `() => []` | The roots. Children are read from `childrenField`. |
| `idField` | `idfield` | string | `'id'` | The field that identifies a node. |
| `labelField` | `labelfield` | string | `'label'` | The field rendered as the node's text, when there is no `node` slot. |
| `childrenField` | `childrenfield` | string | `'children'` | The field holding a node's children. |
| `selectionMode` | `selectionmode` | 'none' \| 'single' \| 'multiple' | `'none'` | 'none' \| 'single' \| 'multiple'. |
| `checkable` | `checkable` | boolean | `false` | Show a checkbox per node, tri-state over a branch's subtree. |
| `defaultExpandAll` | `defaultexpandall` | boolean | `false` | Open every branch on first render. |
| `loadChildren` | — | function | `null` | Fetch a branch's children the first time it opens. |
| `label` | `label` | string | `''` | Accessible name for the tree. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |

**Events:** `pdx-check` → `detail: { checked }` — `{ checked: string[] }` — the ids fully checked (a mixed parent is not one).; `pdx-expand` → `detail: { id, expanded }` — `{ id, expanded }` — one branch opened or closed.; `pdx-load-error` → `detail: { id, error }` — `{ id, error }` — `loadChildren` rejected; the branch stays askable.; `pdx-select` → `detail: { selected }` — `{ selected: string[] }` — the ids selected, after the change.

**Renders:** roles `group` · `tree` · `treeitem`

**Slot:** `node` — Scoped — renders one node's label. Receives `{ node, level, expanded }`.

**Shapes:** `TreeNode { isBranch?: boolean }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Expanding** — Click a branch to open it. A leaf has no twisty, and no `aria-expanded` either — the pattern puts that attribute only where there is something to expand.

```html
<pdx-tree label="Project files" :nodes="files"></pdx-tree>
```

**Open on arrival** — `default-expand-all` shows the whole hierarchy at once — right for a small tree the user is meant to read rather than explore. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-tree label="Documentation" default-expand-all :nodes="docs"></pdx-tree>
</div>
```

**Selection** — `selection-mode` is `none` (navigate only), `single`, or `multiple` — where Ctrl-click and Space add to the selection.

```html
<pdx-tree selection-mode="multiple" :nodes="files"
          @pdx-select="e => picked = e.detail.selected"></pdx-tree>
```

**Checkboxes, and the third state** — Checking a branch checks its subtree; checking some of its children leaves the branch mixed. That third state is the reason a tree is not a list with indents — and it is computed from the subtree, never stored, so it cannot go stale. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-tree label="Permissions" checkable default-expand-all :nodes="permissions"></pdx-tree>
</div>
```

**Children fetched when asked for** — `loadChildren` is called the first time a branch opens, and the branch shows `⋯` while it waits. The second server here fails on purpose: the branch stays askable, and `pdx-load-error` fires rather than the tree emptying itself.

```js
const fetchChildren = (node) => api.get('/servers/' + node.id + '/disks');
```

```html
<pdx-tree :nodes="servers" :loadChildren="fetchChildren"></pdx-tree>
```

**The fields are yours** — A tree renders the objects the application already has: name the fields with `id-field`, `label-field` and `children-field` instead of converting the data to a shape the component prefers.

```html
<pdx-tree id-field="code" label-field="name" children-field="reports"
          :nodes="org"></pdx-tree>
```

**Disabled** — Still readable, and out of the tab order. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-tree label="Read-only tree" disabled default-expand-all :nodes="docs"></pdx-tree>
</div>
```

**In a screen** — What the component is for: the pane on the left of an editor, next to what it selects. _(from the live demo)_

```html
<div class="explorer">
  <div class="explorer-pane">
    <pdx-tree label="Explorer" default-expand-all selection-mode="single" :nodes="files"></pdx-tree>
  </div>
  <div class="explorer-main">
    <p class="pdx-txt-small pdx-ink-muted">Pick a file on the left.</p>
  </div>
</div>
```

