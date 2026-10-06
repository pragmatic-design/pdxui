### `<pdx-list>`

Data-driven list with custom rows.

**Takes a DataSource:** bind one to `:source`, or place the component inside a [`<pdx-data-source>`](../../pdxui-data/references/pdx-data-source.md), which it injects.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | array | `null` | The data items to render. |
| `source` | — | object | `null` | The data source to render from. |
| `renderItem` | — | object | `null` | Render function for each item. |
| `idField` | `idfield` | string | `'id'` | Item field used as a unique key. |
| `dividers` | `dividers` | boolean | `false` | Shows dividers between items. |
| `clickable` | `clickable` | boolean | `false` | Whether items are clickable. |
| `bordered` | `bordered` | boolean | `true` | Adds a border. |
| `emptyTitle` | `emptytitle` | string | `''` | The empty state's title. Empty: the list.empty component string, «No items». |
| `emptyDescription` | `emptydescription` | string | `''` | Description shown when the list is empty. |
| `emptyIcon` | `emptyicon` | string | `'inbox'` | Icon shown in the empty state. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `refresh()` | Reloads its data. |

**Events:** `pdx-click` → `detail: { item, index, id }` — Fired on `pdx-click`.

**Renders:** roles `list` · `listitem`

**Slot:** `item` — Scoped — renders one item. Receives `{ item, index, id }` (`id` is the value of `id-field`).; `empty` — Shown when the list has no items. Receives nothing, but write it `<slot name="empty" let:_>`: without a `let:` the compiler reads a `<slot>` as plain HTML and the template is ignored.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic (Static Array)** — Simple list from a static items array with a render function.

```html
<pdx-list :items="users" :render-item="renderUser" clickable dividers
  @pdx-click="onUserClick">
</pdx-list>
```

```js
// renderUser = (user) => {
//   return '<strong>' + user.name + '</strong> — ' + user.role;
// }
```

**With DataSource + Loading** — Simulates a 1.5s fetch. Shows loading overlay, then data.

```js
const ds = createDataSource({
  transport: {
    read: () => fetch('/api/users').then(r => r.json()),
  },
  autoLoad: true,
});

function renderUser(user) {
  return '<pdx-icon name="user"></pdx-icon>'
    + '<span>' + user.name + '</span>'
    + '<span class="role">' + user.role + '</span>';
}
```

```html
<pdx-list :source="ds" :render-item="renderUser"
  clickable dividers>
</pdx-list>
```

**Empty State** — When items is empty, shows the empty state.

```html
<pdx-list :items="[]"
  empty-title="No users found"
  empty-description="Try adjusting your search or filters."
  empty-icon="search">
</pdx-list>
```

**Slot Template (Declarative)** — Scoped slot template — declarative, no render function. The slot receives `item` and `index` from the list.

```html
<!-- Template: slot receives item + index from the list -->
<pdx-list :items="users" clickable dividers>
  <slot name="item" let:item let:index>
    <div class="user-row">
      <span class="idx">{index + 1}.</span>
      <div class="info">
        <strong>{item.name}</strong>
        <span class="muted">{item.email}</span>
      </div>
      <span class="badge">{item.dept}</span>
    </div>
  </slot>
</pdx-list>

<!-- Scoped styles (in <style scoped>) -->
.user-row { display: flex; align-items: center;
            gap: var(--pdx-space-sm); width: 100%; }
.idx      { color: var(--pdx-color-muted);
            font-size: var(--pdx-text-xs); min-width: 20px; }
.info     { flex: 1; display: flex; flex-direction: column; }
.info span { font-size: var(--pdx-text-xs); }
.badge    { font-size: var(--pdx-text-xs);
            padding: 2px 8px; border-radius: 9999px;
            background: var(--pdx-color-inset); }
```

**Custom Empty Slot** — Override the empty state with a custom slot template.

```html
<!-- Empty slot overrides the default empty state -->
<!-- Note: let:_ is required (compiler needs at least one let:) -->
<pdx-list :items="[]">
  <slot name="empty" let:_>
    <div class="custom-empty">
      <pdx-icon name="search" size="32"></pdx-icon>
      <p>Nothing here yet — try adding some items!</p>
    </div>
  </slot>
</pdx-list>

.custom-empty {
  display: flex; flex-direction: column;
  align-items: center; gap: var(--pdx-space-sm);
  padding: var(--pdx-space-xl);
  color: var(--pdx-color-muted);
}
```

**Rich Item Template** — Avatar + name + role + badge layout.

```js
function renderRichItem(user) {
  const statusColor = user.status === 'Active'
    ? 'var(--pdx-color-success)' : 'var(--pdx-color-muted)';
  return '<div class="avatar">' + user.initials + '</div>'
    + '<div><strong>' + user.name + '</strong>'
    + '<div class="role">' + user.role + '</div></div>'
    + '<span class="status">' + user.status + '</span>';
}
```

```html
<pdx-list :items="richItems"
  :render-item="renderRichItem" dividers>
</pdx-list>
```

**DataSource + Pagination** — List and Pagination share the same DataSource. Page change reloads the list with loading overlay.

```js
const ds = createDataSource({
  transport: fakePagedTransport,
  pageSize: 5,
  autoLoad: true,
});
```

```html
<pdx-list :source="ds" :render-item="renderItem"></pdx-list>
<pdx-pagination :total="ds.total()" :pageSize="5"
  :page="ds.page()" @pdx-change="onPage">
</pdx-pagination>
```

**pdx-data-source Wrapper** — Zero wiring: `pdx-data-source` provides DataSource to both List and Pagination via context. No explicit `:source` needed.

```html
<pdx-data-source url="/api/users" :page-size="5">
  <pdx-list :render-item="renderUser" clickable dividers>
  </pdx-list>
  <pdx-pagination></pdx-pagination>
</pdx-data-source>
```

```js
// Both components auto-inject the DataSource from context.
// Pagination reads total/page, List reads data/isLoading.
// Page change → DataSource.setPage() → List auto-reloads.
```

