### `<pdx-bulk-actions>`

An action bar for the current selection.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `count` | `count` | number | `0` | Number of selected items — drives visibility and the default label. |
| `actions` | — | array | `[]` | Actions to offer. |
| `label` | `label` | string | `''` | Label template; `{count}` is substituted. Default: the `bulk-actions.selected` component string, "{count} selected". |
| `clearable` | `clearable` | boolean | `true` | Show the trailing clear (✕) button. |

**Events:** `pdx-action` → `detail: { key, action }` — Fired on `pdx-action`.; `pdx-clear` → `detail: {}` — Fired when the value is cleared.

**Renders:** roles `toolbar`

**Shapes:** `BulkAction { key: string; label: string; icon?: string; tone?: string; disabled?: boolean; disabledReason?: string }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Standalone bar** — Adjust the selection count to show/hide the bar; click an action or clear.

```js
const actions = [
  { key: 'archive', label: 'Archive', icon: 'archive' },
  { key: 'export', label: 'Export', icon: 'download',
    disabled: true, disabledReason: 'Your role cannot export' },
  { key: 'delete', label: 'Delete', icon: 'trash', tone: 'danger' },
];
```

```html
<pdx-bulk-actions :count="count" :actions="actions"
  @pdx-action="onAction" @pdx-clear="onClear" />
```

