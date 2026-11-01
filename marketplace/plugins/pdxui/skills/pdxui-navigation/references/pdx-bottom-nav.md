### `<pdx-bottom-nav>`

Mobile bottom navigation.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | array | `[]` | The data items to render. |
| `activeKey` | `activekey` | string | `''` | Key of the active item. |

**Events:** `pdx-select` → `detail: { key: string; item: BottomNavItem }` — An item was chosen: its `key` and its item.

**Renders:** roles `navigation`

**States:** `:state(ready)` — Its bar is drawn, pinned to the bottom of the viewport.

**Parts:** `[data-part="bar"]` — The row of items.; `[data-part="item"]` — An item, a button; the current one is `aria-current="page"`.; `[data-part="icon"]` — An item's icon, and the badge over it.; `[data-part="badge"]` — An item's count.; `[data-part="label"]` — An item's text.

**Shapes:** `BottomNavItem { key: string; label: string; icon: string; badge?: string; badgeVariant?: 'default' | 'primary' | 'danger' }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Preview** — Click the tabs to switch. Active tab is highlighted.

```html
<pdx-bottom-nav :items="navItems" activekey="home" @pdx-select="onSelect">
</pdx-bottom-nav>
```

```js
// items = [
//   { key: 'home', label: 'Home', icon: 'home' },
//   { key: 'search', label: 'Search', icon: 'search' },
//   { key: 'add', label: 'Create', icon: 'plus-circle' },
//   { key: 'messages', label: 'Messages', icon: 'message-circle' },
//   { key: 'profile', label: 'Profile', icon: 'user' },
// ]
```

**With Badges** — Badges show counts on tabs. Click to switch.

```js
// Badge items
// { key: 'messages', label: 'Messages', icon: 'message-circle',
//   badge: '3', badgeVariant: 'danger' }
// { key: 'notifications', label: 'Alerts', icon: 'bell',
//   badge: '12', badgeVariant: 'primary' }
```

