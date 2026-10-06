### `<pdx-field-list>`

Repeatable arrays of fields.

**It is one of TWO ways to build repeating rows, and they do not compose.** This component keeps each
row as dotted paths in the form (`rooms.0.type`), so a row is addressed by its INDEX and removing one
re-indexes every row after it. The other way is `createFieldArray` / `form.array(name)`, whose items
are `{ __id, value }` wrappers keyed by an id that survives a removal — and which draws nothing.

⚠️ **Never both on one name**: `form.getValues()` merges the field arrays back last, so one call to
`form.array('rooms')` on a name this component manages discards everything it has written. The full
comparison, and which to choose, is in the recipe "Rows that repeat".

`itemFields` builds **plain controls only** — text, email, number, textarea, checkbox, switch. A
`select` gets no options, and anything else becomes a text input: a row that needs a picker, a select
with options or a component of its own goes in the `row` slot, which receives
`{ item, index, fields, remove }`.

**Use it when** a form field is a list of plain sub-records — order lines, contacts, addresses — and you want
the rows, add and remove, min and max drawn for you; or a row field must be `required`: a rule written inside
`@form`'s `[{ … }]` is dropped (`PDX_FORM_ARRAY_RULES_IGNORED`), while `itemFields` registers it as each row is
added. **Not when** you want keyed rows that survive a removal → `createFieldArray` / `form.array(name)`.

**Pitfalls**
- It needs a form: `:form`, or an enclosing `<pdx-form>`. Without one the add button does nothing, silently.
- A row's fields are not in `form.fields` until the row exists; a per-step check reads them by dotted path,
  `lines.${i}.activity`.
- `form.fields.<name>` — the array itself — mirrors the rows only when the array was seeded EMPTY; a filled
  initial array has no such leaf, and the dotted fields are the only state.
- Inside a `<pdx-field-group>` its rows are prefixed with the group's path.

**Composes with** `pdx-form` (the form it writes into) · `pdx-field-group` (a nested path) · `pdx-wizard` (rows
inside a step) · `pdx-select` and other components in the `row` slot.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `name` | `name` | string | `''` | Array field name in the form (e.g., 'items'). |
| `label` | `label` | string | `''` | Optional label rendered above the list. |
| `form` | — | object | `null` | Form instance. If not provided, uses form context. |
| `itemFields` | — | array | `[]` | Field definitions per array item. Builds one plain control per `type` — text, email, number, textarea, checkbox, switch (a `select` gets no options; anything else is a text input). A row that needs a component of its own, a picker or a select with options, goes in the `row` slot. |
| `itemDefault` | — | object | `null` | Default values for a new item. |
| `minItems` | `minitems` | number | `0` | Minimum number of items (default: 0). |
| `maxItems` | `maxitems` | number | `999` | Maximum number of items (default: 999). |
| `addLabel` | `addlabel` | string | `''` | Label for the add button. Empty: the `field-list.add` component string ("+ Add" in English). |
| `removable` | `removable` | boolean | `true` | Allow removing items (default: true). |
| `display` | `display` | string | `'inline'` | Display mode: inline (default), dialog. |

**Renders:** roles `dialog`

**Slot:** `row` — Scoped — renders one row. Receives `{ item, index, fields, remove }` (`item` holds that row's values; `remove()` removes the row, for a row that draws its own button — the list also draws its remove button after the slot's content).

**Shapes:** `FieldListItemSchema { name: string; type?: string; label?: string; placeholder?: string; required?: boolean }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Rows from itemFields** — `itemFields` describes a row's columns, `itemDefault` fills a new one. The initial rows come from the form's `initialValues`. Add a line, edit it, remove one, then submit.

```html
<pdx-form :form="orderForm" @pdx-submit="submitOrder">
  <pdx-field-list name="lines" label="Order lines" addLabel="+ Add line"
    :itemFields="lineFields" :itemDefault="lineDefault"></pdx-field-list>
  <pdx-form-actions submitLabel="Submit order"></pdx-form-actions>
</pdx-form>
```

```js
const lineFields = [
  { name: 'product', type: 'text', label: 'Product' },
  { name: 'qty', type: 'number', label: 'Qty' },
  { name: 'gift', type: 'checkbox', label: 'Gift wrap' },
];
const lineDefault = { product: '', qty: 1, gift: false };
const orderForm = createForm({
  initialValues: { lines: [{ product: 'Notebook', qty: 2, gift: false }, { product: 'Pen', qty: 10, gift: true }] },
});
```

**Minimum and maximum** — `minItems="1"` hides the remove button on the last row; `maxItems="3"` hides the add button once there are three. _(from the live demo)_

```html
<pdx-form :form="contactsForm">
  <pdx-field-list name="contacts" label="Contacts (1 to 3)" addLabel="+ Add contact" minItems="1" maxItems="3" :itemFields="contactFields" :itemDefault="contactDefault"></pdx-field-list>
</pdx-form>
```

**A row of your own — the row slot** — `itemFields` builds plain controls. A row that needs a component of its own — here a `<pdx-select>` with options — goes in the `row` slot, which receives `item` (that row's values) and `index`. The slot writes back through the form's field at `tasks.{index}.assignee`. The list still draws each row's remove button; a row that wants its own calls `remove()`, which the slot also receives.

```html
<pdx-field-list name="tasks" :itemFields="taskFields" :itemDefault="taskDefault">
  <slot name="row" let:item let:index>
    <pdx-input :value="item.title" @pdx-input="e => setTask(index, 'title', e.detail.value)"></pdx-input>
    <pdx-select :options="people" :value="item.assignee"
      @pdx-change="e => setTask(index, 'assignee', e.detail.value)"></pdx-select>
  </slot>
</pdx-field-list>
```

```js
function setTask(index, key, value) {
  taskForm.fields['tasks.' + index + '.' + key].onChange(value);
}
```

**Dialog display** — `display="dialog"` shows the rows as a read-only summary; a click on a row, on ✎, or on add opens its fields in a dialog. Escape or Done closes it. _(from the live demo)_

```html
<pdx-form :form="addressForm">
  <pdx-field-list name="addresses" label="Addresses" display="dialog" addLabel="+ Add address" :itemFields="addressFields" :itemDefault="addressDefault"></pdx-field-list>
</pdx-form>
```

