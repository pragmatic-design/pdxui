### `<pdx-infinite-scroll>`

Load more as you scroll.

**Takes a DataSource:** bind one to `:source`, or place the component inside a [`<pdx-data-source>`](../../pdxui-data/references/pdx-data-source.md), which it injects.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `source` | — | object | `null` | DataSource instance for auto-paging |
| `threshold` | `threshold` | number | `200` | Pixels from bottom to trigger load |
| `disabled` | `disabled` | boolean | `false` | Disable loading more |
| `loading` | `loading` | boolean | `false` | External loading state override |
| `endMessage` | `endmessage` | string | `''` | Message when all data loaded. Empty: the infinite-scroll.end component string, «No more data». |
| `loadingMessage` | `loadingmessage` | string | `''` | Loading indicator text. Empty: the infinite-scroll.loading component string, «Loading...». |
| `showEndMessage` | `showendmessage` | boolean | `true` | Show end message when all data loaded |

**Events:** `pdx-load-more` → `detail: {}` — Fired on `pdx-load-more`.

**Renders:** roles `status`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic (100 items, 10 per page)** — Scroll down inside the container to load more. Uses DataSource with `loadMore()`.

```js
const ds = createDataSource({
  transport: { read: pagedFetch },
  pageSize: 10,
  autoLoad: true,
});
// ds.loadMore() appends next page
// ds.hasMore() checks if more pages available
```

```html
<div style="height:400px;overflow-y:auto">
  <pdx-infinite-scroll :source="ds">
    <div id="items"></div>
  </pdx-infinite-scroll>
</div>
```

**With End Message (20 items total)** — Only 20 items. After 2 pages, shows "No more data". _(from the live demo)_

```html
<div class="demo-container scroll-box" id="end-scroll-box">
  <pdx-infinite-scroll :source="endDS" :threshold="100" end-message="All items loaded!" show-end-message id="end-inf-scroll">
    <div id="end-items" :ref="endItems"></div>
  </pdx-infinite-scroll>
</div>
```

**Manual Trigger (Disabled auto-scroll)** — Auto-scroll disabled. "Load More" button inside the list at the bottom.

```js
// Manual trigger — button inside scroll container
```

```html
<div class="scroll-box">
  <div id="items"></div>
  <button @click="ds.loadMore()">Load More</button>
</div>
```

