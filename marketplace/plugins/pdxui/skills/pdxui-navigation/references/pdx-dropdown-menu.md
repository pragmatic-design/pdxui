### `<pdx-dropdown-menu>`

A button that opens an action menu.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | array | `[]` | The data items to render. |
| `label` | `label` | string | `''` | Visible label text. |
| `variant` | `variant` | string | `'outline'` | Visual variant. |
| `size` | `size` | string | `'sm'` | Size of the control (e.g. sm, md, lg). |
| `icon` | `icon` | string | `''` | Icon to display. |
| `placement` | `placement` | string | `'bottom-start'` | Position relative to the anchor element. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `minWidth` | `minwidth` | number | `200` | Minimum width of the menu panel. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `open(focus?)` | Opens it. |
| `close()` | Closes it. |
| `toggle()` | Toggles it open/closed. |

**Events:** `pdx-check` → `detail: { key, checked, radioGroup, item }` — Fired on `pdx-check`.; `pdx-select` → `detail: { key, item }` — Fired when an item is selected.

**Renders:** roles `button`

**Slot:** `trigger` — The menu button, when it is not this component's own: an avatar, a chip. The element placed here gets `aria-haspopup`, `aria-expanded`, `aria-controls` while open, the keys (click, ArrowDown/ArrowUp, and Enter/Space when it is not a native button) and the focus back on close. `label`, `icon`, `variant` and `size` are for the built-in button, and are ignored with it.; `item` — Scoped — renders one menu entry. Receives `{ item, key, type }` (`type` is the item's type, `'item'` when unset).


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Items with icons and shortcuts; a divider separates the destructive action.

```js
const items = [
  { key: 'edit', label: 'Edit', icon: 'pencil', shortcut: 'Ctrl E' },
  { key: 'dup', label: 'Duplicate', icon: 'copy' },
  { key: 'd1', label: '', type: 'separator' },
  { key: 'del', label: 'Delete', icon: 'trash', danger: true },
];
```

```html
<pdx-dropdown-menu label="Actions" :items="items" @pdx-select="onSelect" />
```

**Variants & placement** — Inherits button `variant`/`size`; `placement` controls where it opens. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-dropdown-menu label="Primary" variant="primary" :items="basicItems"></pdx-dropdown-menu>
  <pdx-dropdown-menu label="Ghost" variant="ghost" :items="basicItems"></pdx-dropdown-menu>
  <pdx-dropdown-menu label="Icon" icon="menu" :items="basicItems"></pdx-dropdown-menu>
  <pdx-dropdown-menu label="Open up" placement="top-start" :items="basicItems"></pdx-dropdown-menu>
</div>
```

**Checkbox & radio items** — `type: 'checkbox'` renders a checkbox item; `type: 'radio'` with a shared `radioGroup` makes a single-choice group. `checked` is the initial state. Toggling one emits `pdx-check` with the item and keeps the menu open.

```js
const items = [
  { key: 'grid', label: 'Grid view', type: 'radio', radioGroup: 'view', checked: true },
  { key: 'list', label: 'List view', type: 'radio', radioGroup: 'view' },
  { key: 'd1', label: '', type: 'separator' },
  { key: 'compact', label: 'Compact rows', type: 'checkbox', checked: false },
  { key: 'lines', label: 'Show grid lines', type: 'checkbox', checked: true },
];
```

```html
<pdx-dropdown-menu label="View options" :items="items" @pdx-check="onCheck" />
```

**Submenus & disabled** — `type: 'submenu'` with `children` opens a nested menu on hover or →; ← closes it and returns to its item. A `disabled` dropdown cannot be opened.

```js
{ key: 'shapes', label: 'Shapes', type: 'submenu', children: [
  { key: 'rect', label: 'Rectangle' },
  { key: 'circle', label: 'Circle' },
] }
```

**Custom trigger** — An element in `slot="trigger"` is the menu button: an avatar, a chip. The dropdown gives it `aria-haspopup`, `aria-expanded`, the keys and the focus back on close. An element that is not a `<button>` also gets `role="button"`, a tab stop, and Enter / Space.

```html
<pdx-dropdown-menu :items="accountItems" placement="bottom-end">
  <button slot="trigger" aria-label="Account: Ada Lovelace">
    <pdx-avatar alt="Ada Lovelace" size="sm" />
  </button>
</pdx-dropdown-menu>
```

