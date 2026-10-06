### `<pdx-nav-menu>`

A multi-level navigation menu.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | array | `[]` | Menu items |
| `activeKey` | `activekey` | string | `''` | Currently active item key |
| `collapsed` | `collapsed` | boolean | `false` | Collapsed mode (show only icons, hide labels) |
| `indent` | `indent` | number | `36` | Indent per nesting level (px) |
| `iconSet` | `iconset` | string | `''` | Icon set name (for pdx-icon set attribute) |
| `size` | `size` | 'md' \| 'sm' | `'md'` | `sm`: a compact menu — smaller type, icons, chevrons and row padding, for a dense sidebar. |
| `indicator` | `indicator` | 'fill' \| 'border' | `'fill'` | How the current entry is marked: `fill` tints it; `border` also draws a bar on its start edge. |
| `chevron` | `chevron` | 'start' \| 'end' | `'start'` | Where a group's chevron sits: before its icon, or at the end of its row. |
| `actions` | `actions` | 'inline' \| 'overlay' | `'inline'` | `overlay`: the `actions` slot is laid over the row's end and shown on hover and focus, taking no width at rest. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `toggleGroup(key)` | Expand or collapse one group by key. It selects nothing. |
| `expandAll()` | Expand every group that has children, at any depth. |
| `collapseAll()` | Collapse every group. |

**Events:** `pdx-select` → `detail: { key, item, href }` — Fired when an item is selected.; `pdx-toggle` → `detail: { key, expanded }` — Fired when toggled open or closed. Does not bubble.

**Renders:** roles `group` · `navigation`

**Slot:** `item` — Scoped — renders one navigation entry, a group's included. Receives `{ item, level, expanded, active }`.; `actions` — Scoped — controls BESIDE a leaf entry (a pin, an «open in a new tab»), in a `.pdx-nav-row` with its link, never inside it: a link may hold no interactive content. Receives `{ item, level, active }`.

**Shapes:** `NavMenuItem { key: string; label: string; icon?: string; badge?: string; badgeVariant?: 'default' | 'primary' | 'danger' | 'success'; children?: NavMenuItem[]; type?: 'item' | 'header' | 'separator'; href?: string; disabled?: boolean; expanded?: boolean; collapsed?: boolean; data?: Record<string, string> }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic Navigation** — Simple flat list of navigation items.

```html
<pdx-nav-menu :items="items" activekey="dashboard"></pdx-nav-menu>
```

```js
// items = [
//   { key: 'dashboard', label: 'Dashboard' },
//   { key: 'projects', label: 'Projects' },
//   { key: 'settings', label: 'Settings' },
// ]
```

**With Icons** — Uses Pragmatic icon set. Required for collapsed mode.

```html
<pdx-nav-menu :items="items" activekey="inbox"></pdx-nav-menu>
```

```js
// { key: 'inbox', label: 'Inbox', icon: 'mail' }
// { key: 'sent', label: 'Sent', icon: 'send' }
```

**With Badges** — Badges for counts, status, or notifications.

```html
<pdx-nav-menu :items="items" activekey="inbox"></pdx-nav-menu>
```

```js
// { key: 'inbox', label: 'Inbox', icon: 'mail', badge: '12', badgeVariant: 'primary' }
// { key: 'spam', label: 'Spam', icon: 'alert-triangle', badge: '99+', badgeVariant: 'danger' }
```

**Nested Collapsible Groups** — Click a group header to expand/collapse. Supports multiple nesting levels.

```html
<pdx-nav-menu :items="items" activekey="users"></pdx-nav-menu>
```

```js
// { key: 'admin', label: 'Administration', icon: 'settings', expanded: true, children: [
//   { key: 'users', label: 'Users' },
//   { key: 'roles', label: 'Roles' },
// ]}
// { key: 'content', label: 'Content', icon: 'file-text', children: [
//   { key: 'media', label: 'Media Library', children: [
//     { key: 'images', label: 'Images' },
//   ]},
// ]}
```

**Section Headers & Separators** — Organize items into visual sections. _(from the live demo)_

```html
<div class="demo-sidebar">
  <pdx-nav-menu :items="sectionItems" activekey="profile"></pdx-nav-menu>
</div>
```

**Collapsed Mode (Icon Only)** — Set `collapsed` for icon-only mode. Hover shows tooltip with label. _(from the live demo)_

```html
<div class="demo-row">
  <div class="demo-sidebar demo-sidebar-narrow">
    <pdx-nav-menu :items="iconItems" activekey="inbox" collapsed></pdx-nav-menu>
  </div>
  <div class="demo-sidebar">
    <pdx-nav-menu :items="iconItems" activekey="inbox"></pdx-nav-menu>
  </div>
</div>
```

**Compact, a Bar, the Chevron at the End** — `size="sm"` makes a dense sidebar's menu: smaller type, icons, chevrons and rows. `indicator="border"` marks the current entry with a bar on its start edge. `chevron="end"` moves a group's chevron to the end of its row, so its icon stays in the column.

```html
<pdx-nav-menu :items="items" activekey="users" size="sm" indicator="border" chevron="end"></pdx-nav-menu>
```

**Actions Over the Row** — The `actions` slot puts controls beside an entry's link. With `actions="overlay"` they are laid over the row's end and shown on hover and focus, taking no width from the label at rest.

```html
<pdx-nav-menu :items="items" actions="overlay">
  <slot name="actions" let:item>
    <button type="button" :aria-label="'Pin ' + item.label">☆</button>
  </slot>
</pdx-nav-menu>
```

**A Type per Level** — Custom properties on the menu, for levels 1 to 3 (the third stands for every deeper one). Here: categories bold, sub-groups muted, the third level smaller and further in.

```js
.tree-look {
  --pdx-nav-level1-group-weight: 600;
  --pdx-nav-level1-group-color: var(--pdx-color-text);
  --pdx-nav-level2-size: 0.76rem;
  --pdx-nav-level3-size: 0.72rem;
}
```

**Full Sidebar Example** — Realistic sidebar with all features combined. _(from the live demo)_

```html
<div class="demo-sidebar demo-sidebar-full">
  <div class="sidebar-header">
    <pdx-icon name="package" size="24"></pdx-icon>
    <span class="sidebar-title pdx-txt-body">Pragmatic App</span>
  </div>
  <pdx-nav-menu :items="fullSidebar" activekey="analytics" @pdx-select="onSelect"></pdx-nav-menu>
  <div class="sidebar-footer pdx-txt-small pdx-ink-muted">v1.0.0</div>
</div>
<div class="event-log pdx-txt-mono pdx-txt-small" id="nav-event-log">{{ navLog }}</div>
```

**With the Router** — An entry with `href` is a plain link, and followed by the browser it loads the whole page. `pdx-select` is cancelable: prevent it and navigate with the router, and the menu stops the link. A Ctrl, Cmd or Shift click is left to the browser, so opening in a new tab still works.

```html
<pdx-nav-menu :items="items" :active-key="current" @pdx-select="go"></pdx-nav-menu>
```

```js
// navigate and currentPath come from @pdxui/router
// const current = $derived(keyForPath(currentPath()));

// function go(e) {
//   if (!e.detail.href) return;
//   e.preventDefault();       // the menu does not follow the link
//   navigate(e.detail.href);  // the router does, with no page load
// }
```

