### `<pdx-pagination>`

Page through long results.

**Takes a DataSource:** bind one to `:source`, or place the component inside a [`<pdx-data-source>`](../../pdxui-data/references/pdx-data-source.md), which it injects.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `source` | — | object | `null` | DataSource instance — auto-binds total, page, pageSize |
| `total` | `total` | number | `-1` | Total number of items (overrides DataSource) |
| `pageSize` | `pagesize` | number | `-1` | Items per page (overrides DataSource) |
| `page` | `page` | number | `-1` | Current page 1-based (overrides DataSource) |
| `showEdges` | `showedges` | boolean | `true` | Show first/last buttons |
| `showPageSize` | `showpagesize` | boolean | `false` | Show page size selector |
| `pageSizes` | — | array | `[10, 20, 50, 100]` | Page size options |
| `simple` | `simple` | boolean | `false` | Simple mode (prev/next only, no page numbers) |
| `showTotal` | `showtotal` | boolean | `false` | Show total info text |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `goto(p)` | Go to a page, clamped to 1..total. Emits `pdx-change`, and moves the bound DataSource with it. |
| `next()` | Advances to the next item. |
| `prev()` | Goes to the previous item. |
| `first()` | The first page, through the same path as `goto`. |
| `last()` | The last page, through the same path as `goto`. |
| `currentPage` _(read-only)_ | Read-only, via a ref: `el.currentPage`. |

**Events:** `pdx-change` → `detail: { page, pageSize }` — Fired when the value changes.

**Renders:** roles `navigation`

**Slot:** `page` — Scoped — renders one page button. Receives `{ page, isActive }`.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — 10 pages. Click page numbers or arrows to navigate.

```html
<pdx-pagination :total="100" :pageSize="10" :page="1" @pdx-change="onPageChange">
</pdx-pagination>
```

**Many Pages (50)** — Ellipsis appears for large ranges. Current page surrounded by neighbors.

```html
<pdx-pagination :total="500" :pageSize="10" :page="25"></pdx-pagination>
```

**At Start & End** _(from the live demo)_

```html
<div class="demo-stack">
  <div>
    <span class="pdx-txt-small pdx-ink-muted">Page 1 (prev disabled):</span>
    <pdx-pagination :total="200" :pageSize="10" :page="1"></pdx-pagination>
  </div>
  <div>
    <span class="pdx-txt-small pdx-ink-muted">Last page (next disabled):</span>
    <pdx-pagination :total="200" :pageSize="10" :page="20"></pdx-pagination>
  </div>
</div>
```

**Simple Mode** — Prev/Next only with page indicator. No numbered buttons.

```html
<pdx-pagination :total="100" :pageSize="10" :page="3" simple></pdx-pagination>
```

**With Total Info** — Shows "X–Y of Z" before the page buttons.

```html
<pdx-pagination :total="247" :pageSize="20" :page="2" showtotal></pdx-pagination>
```

**Without First/Last Buttons** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-pagination :total="100" :pageSize="10" :page="5" :showEdges="false"></pdx-pagination>
</div>
```

**Few Pages (3)** — No ellipsis when all pages fit. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-pagination :total="30" :pageSize="10" :page="2"></pdx-pagination>
</div>
```

