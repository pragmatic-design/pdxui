### `<pdx-json-editor>`

Edit nested JSON through a schema.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `schema` | — | object | `null` |  |
| `value` | — | unknown | `null` | The current value. |

**Events:** `value-change` → `detail: { value: unknown }` — Fired when the component writes `value`. Does not bubble.

**Renders:** roles `dialog`

**Parts:** `[data-part="entry"]` — One scalar field: its caption and its control.; `[data-part="branch"]` — One object or list of objects: its caption, a summary and the button that opens it.; `[data-part="dialog"]` — The sub-modal a branch opens, `role="dialog"`, appended to the page's body.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Object with a nested list** — Edit the fields; the "Contacts" branch (a list of objects) opens a sub-modal. The live value is shown below.

```html
<pdx-json-editor :schema="schema" ::value="config"></pdx-json-editor>
```

**In a form field** — Inside `<pdx-form-field>` the editor is one group, named by the field's label and described by its hint and error. Its sub-fields keep their own names: the requirement and the error are the document's.

```html
<pdx-form-field label="Shipping profile" hint="Where the order goes" required>
  <pdx-json-editor :schema="schema" ::value="profile"></pdx-json-editor>
</pdx-form-field>
```

