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
- The compiler does not wire it inside `<pdx-form>`: bind `:value` and `@pdx-change` yourself.

**Composes with** — it shares the `loadChildren` shape with `pdx-tree` and `pdx-cascader`.
