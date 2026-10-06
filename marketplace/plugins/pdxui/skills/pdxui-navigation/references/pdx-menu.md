### `<pdx-menu>`

A list of actions.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | array | `[]` | Menu items (data-driven) |
| `open` | `open` | boolean | `false` | Open state |
| `minWidth` | `minwidth` | number | `180` | Minimum width |
| `menuId` | `menuid` | string | `''` | The id of the element that is `role="menu"`, for a trigger's `aria-controls`. |
| `menuClass` | `menuclass` | string | `''` | Classes added to the element that is `role="menu"`: the dropdown's panel is that element, and `.pdx-dropdown-menu-panel` is what apps and the certification select it by. |
| `renderItem` | — | function | `null` | Draws one entry, as the `item` slot does: `({ item, key, type }) => Node`. For a menu built from script — `pdx-dropdown-menu` hands its own `item` slot on through it. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `closeAll()` | Close the submenu and emit `pdx-close` on the menu itself. |
| `closeSubmenu()` | Close only the open submenu, leaving the menu itself open. |

**Events:** `pdx-check` → `detail: { key, checked, item } | { key, checked, radioGroup, item }` — Fired on `pdx-check`.; `pdx-close` → `detail: {}` — Fired when it closes. Does not bubble.; `pdx-select` → `detail: { key, item }` — Fired when an item is selected.

**Renders:** roles `menu` · `menuitem` · `menuitemcheckbox` · `menuitemradio` · `presentation` · `separator`

**Slot:** `item` — Scoped — renders one menu entry. Receives `{ item, key, type }` (`type` is the item's type, `'item'` when unset).

**Shapes:** `MenuItem { key: string; label: string; type?: 'item' | 'checkbox' | 'radio' | 'separator' | 'label' | 'submenu'; icon?: string; shortcut?: string; disabled?: boolean; danger?: boolean; checked?: boolean; radioGroup?: string; children?: MenuItem[]; className?: string; lang?: string }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Arrow keys move between items, Enter or Space activates, typing jumps to an item.

```html
<pdx-menu :open="shown" :items="fileItems" @pdx-select="onSelect" @pdx-close="hide"></pdx-menu>
```

```js
// items = [
//   { key: 'new', label: 'New File' },
//   { key: 'sep1', label: '', type: 'separator' },
//   { key: 'exit', label: 'Exit' },
// ]
```

**Icons & Keyboard Shortcuts** — Items with leading icons and right-aligned shortcut hints.

```js
// { key: 'undo', label: 'Undo', icon: 'undo', shortcut: 'Ctrl+Z' }
// { key: 'find', label: 'Find', icon: 'search', shortcut: 'Ctrl+F' }
```

**Checkbox & Radio Items** — Checkbox items toggle independently. Radio items are mutually exclusive within a group.

```js
// { key: 'bold', label: 'Bold', type: 'checkbox', checked: true }
// { key: 'md', label: 'Medium', type: 'radio', radioGroup: 'size', checked: true }
```

**Submenus** — Hover or press Arrow Right to open a nested menu. Arrow Left or Escape goes back to its item.

```js
// { key: 'shapes', label: 'Shapes', type: 'submenu', children: [
//   { key: 'rect', label: 'Rectangle' },
//   { key: 'circle', label: 'Circle' },
// ]}
```

**Danger & Disabled Items** — Destructive actions in red. Disabled items are skipped by the arrow keys.

```js
// { key: 'delete', label: 'Delete', danger: true }
// { key: 'unavail', label: 'Not available', disabled: true }
```

