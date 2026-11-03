### `<pdx-list>`

Data-driven list with custom rows.

**Takes a DataSource:** bind one to `:source`, or place the component inside a [`<pdx-data-source>`](../../pdxui-data/references/pdx-data-source.md), which it injects.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | T[] | `null` | The data items to render. |
| `source` | — | import('@pdxui/core').DataSource<T> \| null | `null` | The data source to render from. |
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

**Injects:** `DataSourceContext` (optional)

**Slot:** `item` — Renders one item: a snippet `item(item, index)`, or the scoped slot, which receives `{ item, index, id }` (`id` is the value of `id-field`).; `empty` — Shown when the list has no items: a snippet `empty()`, or the scoped slot, which receives nothing but is written `<slot name="empty" let:_>`: without a `let:` the compiler reads a `<slot>` as plain HTML and the template is ignored.

**States:** `:state(bordered)` — `bordered` is set (the default): the list is framed.; `:state(dividers)` — `dividers` is set: a rule between items.; `:state(loading)` — Its source is pending: the host is `aria-busy` too (A4).; `:state(empty)` — It has no items, and is not loading.

**Parts:** `[data-part="list"]` — The `role="list"` container of the items.; `[data-part="item"]` — An item's row, `role="listitem"`. A page of a larger source gives each its `aria-setsize` and `aria-posinset` (A3).; `[data-part="empty"]` — The empty state.; `[data-part="overlay"]` — The loading overlay, drawn while the source loads.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic (Static Array)** — Simple list from a static items array, each item drawn by the `item` snippet.

```html
<pdx-list :items="users" clickable dividers @pdx-click="onUserClick">
  &#64;snippet item(item) {
    <strong>{{ item.name }}</strong> {{ item.role }}
  }
</pdx-list>
```

**With DataSource + Loading** — Simulates a 1.5s fetch. Shows loading overlay, then data.

```js
const ds = createDataSource({
  transport: {
    read: () => fetch('/api/users').then(r => r.json()),
  },
  autoLoad: true,
});
```

```html
<pdx-list :source="ds" clickable dividers>
  &#64;snippet item(item) {
    <span>{{ item.name }}</span> <span class="role">{{ item.role }}</span>
  }
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

**Slot Template (Declarative)** — A snippet — declarative, no render function: `item(item, index)`, called by the list for each row.

```html
<!-- Template: the snippet receives item + index from the list -->
<pdx-list :items="users" clickable dividers>
  &#64;snippet item(item, index) {
    <div class="user-row">
      <span class="idx">{{ index + 1 }}.</span>
      <div class="info">
        <strong>{{ item.name }}</strong>
        <span class="muted">{{ item.email }}</span>
      </div>
      <span class="badge">{{ item.dept }}</span>
    </div>
  }
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

**Custom Empty State** — Override the empty state with the `empty()` snippet.

```html
<!-- The empty snippet overrides the default empty state -->
<pdx-list :items="[]">
  &#64;snippet empty() {
    <div class="custom-empty">
      <pdx-icon name="search" size="32"></pdx-icon>
      <p>Nothing here yet — try adding some items!</p>
    </div>
  }
</pdx-list>

.custom-empty {
  display: flex; flex-direction: column;
  align-items: center; gap: var(--pdx-space-sm);
  padding: var(--pdx-space-xl);
  color: var(--pdx-color-muted);
}
```

**Rich Item Template** — Avatar + name + role + badge layout.

```html
<pdx-list :items="richItems" dividers>
  &#64;snippet item(item) {
    <div class="avatar">{{ item.initials }}</div>
    <div><strong>{{ item.name }}</strong>
      <div class="role">{{ item.role }}</div></div>
    <span class="status">{{ item.status }}</span>
  }
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
<pdx-list :source="ds">
  &#64;snippet item(item) { <strong>{{ item.name }}</strong> }
</pdx-list>
<pdx-pagination :total="ds.total()" :pageSize="5"
  :page="ds.page()" @page-change="onPage">
</pdx-pagination>
```

**pdx-data-source Wrapper** — Zero wiring: `pdx-data-source` provides DataSource to both List and Pagination via context. No explicit `:source` needed.

```html
<pdx-data-source url="/api/users" :page-size="5">
  <pdx-list clickable dividers>
    &#64;snippet item(item) { {{ item.name }} }
  </pdx-list>
  <pdx-pagination></pdx-pagination>
</pdx-data-source>
```

```js
// Both components auto-inject the DataSource from context.
// Pagination reads total/page, List reads data/isLoading.
// Page change → DataSource.setPage() → List auto-reloads.
```

