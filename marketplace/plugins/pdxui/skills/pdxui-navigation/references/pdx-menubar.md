### `<pdx-menubar>`

A desktop-style menu bar.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | array | `[]` | Top-level menu items |
| `trigger` | `trigger` | string | `'click'` | Open mode: 'click' (default) opens on a click, and then the pointer moves between menus while one is open, as a desktop menubar does; 'hover' opens on mouseenter alone. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `openMenu(key, focus?)` | Open one top-level menu by key, focusing its first item (its last with 'last'). A disabled or unknown key opens nothing. |
| `closeMenu(_resetHasOpened)` | Close the open menu and any submenu under it. The boolean it takes is not read. |

**Events:** `pdx-check` → `detail: { key, checked, item } | { key, checked, radioGroup, item }` — Fired on `pdx-check`.; `pdx-select` → `detail: { key, item }` — Fired when an item is selected.

**Renders:** roles `menu` · `menubar` · `menuitem` · `menuitemcheckbox` · `menuitemradio` · `presentation` · `separator`

**Shapes:** `MenubarItem { key: string; label: string; children?: MenuItem[]; mega?: boolean; megaColumns?: MegaColumn[]; disabled?: boolean }` · `MegaColumn { title: string; items: MenuItem[] }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Click Mode (default)** — A click opens a menu; while one is open, moving onto another item switches to it. Crossing the bar with the pointer opens nothing. Default behavior.

```html
<pdx-menubar :items="menuItems"></pdx-menubar>
```

```js
// items = [
//   { key: 'file', label: 'File', children: [
//     { key: 'new', label: 'New File' },
//     { key: 'sep1', label: '', type: 'separator' },
//     { key: 'exit', label: 'Exit' },
//   ]},
//   { key: 'edit', label: 'Edit', children: [...] },
// ]
```

```html
<pdx-menubar :items="menuItems" trigger="hover"></pdx-menubar>
```

**Full-Featured: Icons, Shortcuts, Checkbox, Radio, Submenus** — Edit menu has icons + shortcuts. View menu has checkbox items. Format has radio groups. Insert has nested submenus.

```html
<pdx-menubar :items="fullMenubar" @pdx-select="onSelect" @pdx-check="onCheck"></pdx-menubar>
```

```js
// Items support: icon, shortcut, type: 'checkbox'|'radio'|'submenu'|'separator'|'label'
// { key: 'undo', label: 'Undo', icon: 'undo', shortcut: 'Ctrl+Z' }
// { key: 'sidebar', label: 'Sidebar', type: 'checkbox', checked: true }
// { key: 'sm', label: 'Small', type: 'radio', radioGroup: 'size' }
```

**Mega Menu** — The "Products" menu opens a wide multi-column panel instead of a dropdown list. Ideal for site navigation headers.

```html
<pdx-menubar :items="megaMenubar"></pdx-menubar>
```

```js
// { key: 'products', label: 'Products', mega: true,
//   megaColumns: [
//     { title: 'Development', items: [
//       { key: 'ide', label: 'Code Editor' }, ...
//     ]},
//   ]
// }
```

**Disabled Items** — Top-level menu items can be disabled.

```html
<pdx-menubar :items="items"></pdx-menubar>
```

```js
// { key: 'edit', label: 'Edit (disabled)', disabled: true, children: [] }
```

