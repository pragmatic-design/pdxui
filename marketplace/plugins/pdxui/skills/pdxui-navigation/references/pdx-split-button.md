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

**Events:** `pdx-click` → `detail: {}` — Fired on `pdx-click`.; `pdx-select` → `detail: { key, item }` — Fired when an item is selected.

**Renders:** roles `menu` · `menuitem`


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

