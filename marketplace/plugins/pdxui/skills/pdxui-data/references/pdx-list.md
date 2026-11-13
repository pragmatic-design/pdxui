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
| `ariaLabel` | `arialabel` | string | `''` | The list's accessible name, `aria-label` on the host, written on the `role="list"` element (#1053): the host has no role, so a name left on it alone names nothing. |
| `ariaLabelledby` | `arialabelledby` | string | `''` | The id of the element that names the list, `aria-labelledby` on the host, written the same way. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `refresh()` | Reloads its data. |

**Events:** `pdx-click` → `detail: { item, index, id }` — Fired on `pdx-click`.

**Renders:** roles `list` · `listitem`

**Injects:** `DataSourceContext` (optional)

**Slot:** `item` — Renders one item: a snippet `item(item, index)`.; `empty` — Shown when the list has no items: a snippet `empty()`.

**States:** `:state(bordered)` — `bordered` is set (the default): the list is framed.; `:state(dividers)` — `dividers` is set: a rule between items.; `:state(loading)` — Its source is pending: the host is `aria-busy` too (A4).; `:state(empty)` — It has no items, and is not loading.

**Parts:** `[data-part="list"]` — The `role="list"` container of the items.; `[data-part="item"]` — An item's row, `role="listitem"`. A page of a larger source gives each its `aria-setsize` and `aria-posinset` (A3).; `[data-part="empty"]` — The empty state.; `[data-part="overlay"]` — The loading overlay, drawn while the source loads.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic (Static Array)** — Simple list from a static items array, each item drawn by the `item` snippet.

```html
<pdx-list :items="users" clickable dividers @pdx-click="onUserClick">
  @snippet item(item) {
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
  @snippet item(item) {
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
  @snippet item(item, index) {
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
  @snippet empty() {
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
  @snippet item(item) {
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
  @snippet item(item) { <strong>{{ item.name }}</strong> }
</pdx-list>
<pdx-pagination :total="ds.total()" :pageSize="5"
  :page="ds.page()" @page-change="onPage">
</pdx-pagination>
```

**pdx-data-source Wrapper** — Zero wiring: `pdx-data-source` provides DataSource to both List and Pagination via context. No explicit `:source` needed.

```html
<pdx-data-source url="/api/users" :page-size="5">
  <pdx-list clickable dividers>
    @snippet item(item) { {{ item.name }} }
  </pdx-list>
  <pdx-pagination></pdx-pagination>
</pdx-data-source>
```

```js
// Both components auto-inject the DataSource from context.
// Pagination reads total/page, List reads data/isLoading.
// Page change → DataSource.setPage() → List auto-reloads.
```

**A comment thread** — A composition, not a component (#1022): `pdx-list` draws the comments, `pdx-avatar` and `pdx-relative-time` fill each one, and a form with `pdx-textarea` and `pdx-button` adds to it. Replies go one level deep. Ctrl+Enter (⌘+Enter) sends, Escape closes a reply.

```html
<pdx-list :items="thread.comments" dividers>
  @snippet item(c) {
    <article :aria-label="c.author + ', ' + c.text">
      <span aria-hidden="true"><pdx-avatar :alt="c.author" size="sm"></pdx-avatar></span>
      <strong>{{ c.author }}</strong> <pdx-relative-time :datetime="c.at"></pdx-relative-time>
      <p>{{ c.text }}</p>
      <pdx-button variant="ghost" size="sm" @click="openReply(c, $event)">Reply</pdx-button>
    </article>
  }
  @snippet empty() { <p>No comments yet.</p> }
</pdx-list>

<form @submit.prevent="send()">
  <pdx-textarea ::value="draft" arialabel="Add a comment" @keydown="onComposerKey($event)"></pdx-textarea>
  <pdx-button type="submit" size="sm" :disabled="!draft.trim()">Comment</pdx-button>
</form>
<p class="pdx-sr-only" role="status">{{ announcement }}</p>
```

