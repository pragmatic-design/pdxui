### `<pdx-json-editor>`

Edit nested JSON through a schema.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `schema` | — | object | `null` |  |
| `value` | — | object | `null` | The current value. |

**Events:** `pdx-change` → `detail: { value }` — Fired when the value changes.

**Renders:** roles `dialog`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Object with a nested list** — Edit the fields; the "Contacts" branch (a list of objects) opens a sub-modal. The live value is shown below. _(from the live demo)_

```html
<pdx-json-editor :schema="schema" :value="value" @pdx-change="onChange"></pdx-json-editor>
<pre class="pdx-txt-small" style="background: var(--pdx-color-bg); padding: .75rem; border-radius: 8px; overflow: auto;">{{ output }}</pre>
```

