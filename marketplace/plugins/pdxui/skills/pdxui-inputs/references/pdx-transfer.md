### `<pdx-transfer>`

Move items between two lists.

**Takes a DataSource:** bind one to `:source`.

**The rows are options, not checkboxes.** Each item is a `div.pdx-transfer-item[role=option]`
with `aria-selected`, inside a `role="listbox"` per side. In `checkbox` mode the tick is a
presentational `span.pdx-transfer-check` (`aria-hidden`), not an `<input>`: a control inside an
option breaks WAI-ARIA. Select by clicking the row, and read the state from `aria-selected` or
`.checked`. `input[type=checkbox]` finds nothing.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | array | `[]` | All items — array of { value, label, disabled? } |
| `value` | — | array | `[]` | Values currently in the target (right) panel |
| `source` | — | object | `null` | DataSource or raw array of objects |
| `labelField` | `labelfield` | string | `'label'` | Field to use as item label (default: 'label') |
| `valueField` | `valuefield` | string | `'value'` | Field to use as item value/id (default: 'value') |
| `assignedField` | `assignedfield` | string | `''` | Field that determines left vs right panel (boolean or matched value) |
| `assignedValue` | `assignedvalue` | string | `''` | Value to match against assignedField for target panel (if omitted, treats as boolean) |
| `mode` | `mode` | string | `'checkbox'` | Selection mode: 'checkbox' (default) \| 'simple' (click highlight) \| 'direct' (click to move) |
| `searchable` | `searchable` | boolean | `false` | Show search input in panels |
| `sourceTitle` | `sourcetitle` | string | `''` | Left panel title |
| `targetTitle` | `targettitle` | string | `''` | Right panel title |
| `disabled` | `disabled` | boolean | `false` | Disabled state |
| `size` | `size` | string | `''` | Component size |
| `showAllButtons` | `showallbuttons` | boolean | `false` | Show "move all" buttons |
| `draggable` | `draggable` | boolean | `false` | Enable drag and drop |
| `name` | `name` | string | `''` | Form field name |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `getValue()` | The keys currently on the target side. |
| `setValue(v)` | Replace the target side and emit `pdx-change`, dropping any move not yet committed. |
| `clear()` | Clears the value. |

**Events:** `pdx-change` → `detail: { changes, targetValues, direction } | { value }` — Fired when the value changes.; `pdx-clear` — Fired when the value is cleared.

**Renders:** roles `group` · `listbox` · `option`

**Shapes:** `TransferItem { value: string; label: string; disabled?: boolean; _raw?: any }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic Transfer** — Check items, click arrow buttons to move between panels. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-transfer
    :items="basicItems"
    :value="basicValue"
  ></pdx-transfer>
</div>
```

**Searchable** — Filter items by typing in the search box. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-transfer
    searchable
    :items="manyItems"
    :value="['item-3', 'item-7', 'item-11']"
    sourcetitle="Available"
    targettitle="Selected"
  ></pdx-transfer>
</div>
```

**Custom Titles & Move All** — Custom panel titles and "move all" buttons (`showallbuttons`). _(from the live demo)_

```html
<div class="demo-row">
  <pdx-transfer
    :items="roleItems"
    :value="['write', 'delete']"
    sourcetitle="Available Permissions"
    targettitle="Granted"
    showallbuttons
  ></pdx-transfer>
</div>
```

**Disabled Items** — Some items cannot be moved (e.g., locked permissions). _(from the live demo)_

```html
<div class="demo-row">
  <pdx-transfer
    :items="disabledItems"
    :value="['admin']"
    sourcetitle="Roles"
    targettitle="Assigned"
  ></pdx-transfer>
</div>
```

**Direct Mode** — Click an item to move it immediately. No checkboxes, no buttons. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-transfer
    mode="direct"
    :items="basicItems"
    sourcetitle="Available"
    targettitle="Selected"
  ></pdx-transfer>
</div>
```

**Simple Selection** — Click to highlight, then use arrow buttons. No checkboxes. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-transfer
    mode="simple"
    :items="roleItems"
    sourcetitle="Available"
    targettitle="Assigned"
  ></pdx-transfer>
</div>
```

**Drag & Drop** — Drag items between panels. Combined with checkbox mode. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-transfer
    draggable
    :items="basicItems"
    :value="['fish']"
    sourcetitle="Source"
    targettitle="Target"
  ></pdx-transfer>
</div>
```

**Disabled** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-transfer
    disabled
    :items="basicItems"
    :value="['cat', 'dog']"
  ></pdx-transfer>
</div>
```

**DataSource Mode (assignedField)** — Single dataset with a boolean field (`assignedField`) that determines which panel an item belongs to. On move, emits `changes` diff for persistence. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-transfer
    :source="permissionData"
    labelfield="name"
    valuefield="id"
    assignedfield="granted"
    sourcetitle="Available Permissions"
    targettitle="Granted Permissions"
    searchable
  ></pdx-transfer>
</div>
```

**DataSource + AssignedValue** — Match a specific value: items where `team === 'alpha'` are in the target panel. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-transfer
    :source="teamData"
    labelfield="name"
    valuefield="id"
    assignedfield="team"
    assignedvalue="alpha"
    sourcetitle="Unassigned"
    targettitle="Team Alpha"
  ></pdx-transfer>
</div>
```

