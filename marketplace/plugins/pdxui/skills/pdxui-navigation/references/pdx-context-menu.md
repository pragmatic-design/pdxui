### `<pdx-context-menu>`

A right-click menu.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | array | `[]` | Menu items (static array or function returning items) |
| `disabled` | `disabled` | boolean | `false` | Disabled — prevents context menu from opening |
| `minWidth` | `minwidth` | number | `180` | Min width of the menu panel |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `open(clientX, clientY)` | Opens it. |
| `close()` | Closes it. |

**Events:** `pdx-select` → `detail: { key, item }` — Fired when an item is selected.

**Renders:** roles `menu` · `menuitem` · `menuitemcheckbox` · `menuitemradio` · `presentation` · `separator`

**Slot:** `item` — Scoped — renders one menu entry. Receives `{ item, key, type }` (`type` is the item's type, `'item'` when unset).


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Right-Click Area** — Right-click (or long-press on touch) anywhere in the box below — or Tab to it and press Shift+F10 or the menu key.

```html
<pdx-context-menu :items="menuItems" @pdx-select="onSelect">
  <!-- focusable, so Shift+F10 and the menu key can reach it -->
  <div class="target-area" tabindex="0" role="group" aria-label="Document area">Right-click here</div>
</pdx-context-menu>
```

```js
// menuItems = [
//   { key: 'cut', label: 'Cut', icon: 'scissors', shortcut: 'Ctrl+X' },
//   { key: 'copy', label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C' },
//   { key: 'paste', label: 'Paste', icon: 'clipboard', shortcut: 'Ctrl+V' },
//   { key: 'sep', type: 'separator' },
//   { key: 'delete', label: 'Delete', icon: 'trash', danger: true },
// ]
```

**With Disabled Items** _(from the live demo)_

```html
<pdx-context-menu :items="disabledItems" @pdx-select="onSelect">
  <div class="ctx-target ctx-target-sm" tabindex="0" role="group" aria-label="Area with disabled items">
    <p class="pdx-ink-muted">Right-click — some items disabled</p>
  </div>
</pdx-context-menu>
```

