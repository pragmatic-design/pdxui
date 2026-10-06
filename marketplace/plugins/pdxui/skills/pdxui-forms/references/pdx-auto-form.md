### `<pdx-auto-form>`

A form generated from a schema.

**Takes a DataSource:** bind one to `:source`.

**Use it when** the whole form comes from data: a `FormSchema`, or the same `FieldDefinition[]` that drives
the grid's columns and the filter builder. **Not when** you lay the fields out by hand or split a long form
into section components → `<pdx-form :form>`; editing a grid row in a side panel → `pdx-edit-drawer`.

**Pitfalls**
- `schema` names a field `name`; `FieldDefinition`, `ColumnDef` and `FilterField` name it `field`. A filter
  field written with `name` is dropped without a word.
- The form is built a frame after it connects: `getValues()` and `validate()` answer `undefined` until then.
- A change to `fields`, `schema`, `source`, `record-id`, `layout`, `columns` or `show-actions` rebuilds the form
  from scratch: what the user typed is gone.
- With `:source` and no `record-id`, every Save is `add()` + `sync()`: a second click creates a second record.
  With a `record-id` that is not in the source, Save updates nothing and still emits `pdx-submit`.

**Composes with** `pdx-dialog` (the create modal) · `pdx-data-grid` + `pdx-filter-builder` (one field list for
all three) · `pdx-data-source` (`:source` load and save).

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `fields` | — | array | `null` | Field definitions (FieldDefinition[]). Converted to FormSchema internally. |
| `schema` | — | object | `null` | FormSchema JSON (alternative to fields). |
| `source` | — | object | `null` | DataSource for auto-load/save. |
| `recordId` | `recordid` | string | `''` | Record ID to load from DataSource. |
| `layout` | `layout` | string | `'stack'` | Form layout. |
| `columns` | `columns` | number | `12` | Grid columns (when layout='grid'). |
| `showActions` | `showactions` | boolean | `true` | Show submit/reset buttons. |
| `submitLabel` | `submitlabel` | string | `''` | Submit button label. Empty: the auto-form.submit component string, «Save». |
| `resetLabel` | `resetlabel` | string | `''` | Reset button label. Empty: the auto-form.reset component string, «Reset». |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `form` _(read-only)_ | Read-only, via a ref: `el.form`. |
| `getValues()` | The form values now, undefined while the form is not built. |
| `reset(values?)` | Resets to the initial state. |
| `validate()` | Runs validation and returns the result. |

**Events:** `pdx-submit` → `detail: { values, valid }` — Fired when the form is submitted.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**From FieldDefinition[]** — Pass the same field definitions used for the grid. The form auto-generates inputs with labels, types, and validation from the field schema.

```js
const fields = [
  { field: 'name', label: 'Name', type: 'text', required: true,
    validators: [{ type: 'required' }] },
  { field: 'email', label: 'Email', type: 'email',
    validators: [{ type: 'email' }] },
  { field: 'role', label: 'Role', type: 'enum',
    options: [{ label: 'Engineer', value: 'Engineer' }, ...] },
  { field: 'salary', label: 'Salary', type: 'currency' },
  { field: 'active', label: 'Active', type: 'boolean' },
];
```

```html
<pdx-auto-form :fields="fields" layout="grid" :columns="12">
</pdx-auto-form>
```

**Server-side Lookup (autocomplete)** — A `type: 'lookup'` field with `optionsSource` loads its options from the server as you type (a remote autocomplete). Type "ro" in City; the multi-value lookup below it picks several, as chips.

```js
function loadCities(query) {
  return fetch('/api/cities?q=' + query).then(r => r.json()); // [{ label, value }]
}

const schema = { fields: [
  { name: 'name', label: 'Name', type: 'text', required: true },
  { name: 'city', label: 'City', type: 'lookup', optionsSource: loadCities },
  // many-to-many: multi-value lookup → chips, value is an array
  { name: 'cities', label: 'Cities', type: 'lookup', multiple: true, optionsSource: loadCities },
] };
```

**One JSON — Grid + Form + Filter** — The same `FieldDefinition[]` drives all three components. Filter the grid, then edit the first record in the form below and save: the grid shows the change.

```js
// ONE definition → three components
const fields = [...];
```

```html
<pdx-filter-builder :fields="fields" :source="ds" />
<pdx-data-grid :source="ds" :columns="toColumnDefs(fields)" />
<pdx-auto-form :fields="fields" :source="ds" record-id="1" />
```

