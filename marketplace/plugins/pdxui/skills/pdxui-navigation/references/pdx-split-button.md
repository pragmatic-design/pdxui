### `<pdx-split-button>`

A primary action plus a menu.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `label` | `label` | string | `''` | Primary button label |
| `icon` | `icon` | string | `''` | Primary button icon name |
| `items` | — | array | `[]` | Dropdown menu items |
| `variant` | `variant` | string | `'primary'` | Variant: primary, secondary, outline, ghost, danger |
| `size` | `size` | string | `'sm'` | Size: xs, sm, md, lg |
| `loading` | `loading` | boolean | `false` | Loading state (spinner on primary) |
| `disabled` | `disabled` | boolean | `false` | Disable entire button |
| `menuLabel` | `menulabel` | string | `''` | Accessible name for the dropdown trigger (chevron has no visible text). Empty: the split-button.menu component string, «More actions» in English. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `show()` | Shows it. |
| `close()` | Closes it. |
| `toggle()` | Toggles it open/closed. |
| `isOpen` _(read-only)_ | Read-only, via a ref: `el.isOpen`. |

**Events:** `open-change` → `detail: { value: boolean }` — The menu opened (`true`) or closed (`false`): its open state, read-only (#288). The parent never writes it, so it is not a model, and `::open` on it is an error.; `pdx-click` → `detail: Record<string, never>` — The primary button was pressed.; `pdx-select` → `detail: { key: string; item: MenuItem }` — An entry of the menu was chosen.

**Renders:** roles `menu` · `menuitem`

**States:** `:state(open)` — Matched with `:state(open)`.; `:state(loading)` — Matched with `:state(loading)`.

**Parts:** `[data-part="root"]` — The element reached as `[data-part="root"]`.; `[data-part="primary"]` — The element reached as `[data-part="primary"]`.; `[data-part="trigger"]` — The element reached as `[data-part="trigger"]`.; `[data-part="menu"]` — The element reached as `[data-part="menu"]`.; `[data-part="item"]` — The element reached as `[data-part="item"]`.; `[data-part="separator"]` — The element reached as `[data-part="separator"]`.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Click the left side for primary action. Click the arrow for dropdown.

```html
<pdx-split-button label="Save" icon="save" :items="items"
  @pdx-click="onSave" @pdx-select="onSelect">
</pdx-split-button>
```

```js
// items = [
//   { key: 'save-as', label: 'Save As...', icon: 'file-text' },
//   { key: 'save-copy', label: 'Save a Copy', icon: 'copy' },
//   { key: 'sep', type: 'separator' },
//   { key: 'export', label: 'Export', icon: 'download' },
// ]
```

**Variants** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-split-button label="Primary" icon="save" variant="primary" :items="saveItems"></pdx-split-button>
  <pdx-split-button label="Secondary" variant="secondary" :items="saveItems"></pdx-split-button>
  <pdx-split-button label="Outline" variant="outline" :items="saveItems"></pdx-split-button>
  <pdx-split-button label="Danger" icon="trash" variant="danger" :items="deleteItems"></pdx-split-button>
</div>
```

**Sizes** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-split-button label="Extra Small" variant="primary" size="xs" :items="saveItems"></pdx-split-button>
  <pdx-split-button label="Small" variant="primary" size="sm" :items="saveItems"></pdx-split-button>
  <pdx-split-button label="Medium" variant="primary" size="md" :items="saveItems"></pdx-split-button>
</div>
```

**Disabled** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-split-button label="Disabled" icon="save" variant="primary" disabled :items="saveItems"></pdx-split-button>
</div>
```

