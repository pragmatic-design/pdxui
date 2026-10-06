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
