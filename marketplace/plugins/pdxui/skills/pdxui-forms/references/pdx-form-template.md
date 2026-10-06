### `<pdx-form-template>`

Render a whole form from a layout.

**Takes a DataSource:** give a schema field a `source`: the control it renders for that field reads it.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `schema` | — | object | `null` | FormSchema defining fields, sections, layout. |
| `form` | — | object | `null` | Optional pre-existing Form instance. If not provided, one is created from schema. |
| `autocomplete` | `autocomplete` | string | `'off'` | HTML autocomplete attribute for the generated form. |
| `formClass` | `formclass` | string | `''` | CSS class applied to the generated form. |
| `showActions` | `showactions` | boolean | `true` | Show default submit/reset buttons. Override via slot="actions". |

**Events:** `pdx-submit` → `detail: { values }` — Bubbles up from the inner `pdx-form` once the values validate; an invalid submit fires nothing and scrolls to the first error.

**Renders:** roles `button` · `group` · `tab` · `tablist`

**Slot:** `actions` — Replaces the default actions (the `pdx-form-actions` shown when `showActions`). Not rendered in the wizard layout, which has its own navigation.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Schema-driven (grid layout)** — Each field declares its `type`, `label`, validators and grid `size`. Submit to see the collected values.

```js
const schema = {
  layout: 'grid', columns: 12,
  fields: [
    { name: 'fullName', label: 'Full Name', type: 'text', required: true,
      validators: [{ type: 'required' }], size: 6 },
    { name: 'email', label: 'Email', type: 'email',
      validators: [{ type: 'email' }], size: 6 },
    { name: 'role', label: 'Role', type: 'select', size: 6,
      options: [{ label: 'Engineer', value: 'eng' }, { label: 'Designer', value: 'design' }] },
    { name: 'startDate', label: 'Start Date', type: 'date', size: 6 },
    { name: 'bio', label: 'Bio', type: 'textarea' },
    { name: 'active', label: 'Active', type: 'switch' },
  ],
};
```

```html
<pdx-form-template :schema="schema" @pdx-submit="onSubmit" />
```

**Sections (collapsible fieldsets)** — Group fields with `sections`; each field points at its section via `section`. A section can be `collapsible`. _(from the live demo)_

```html
<div class="demo-container">
  <pdx-form-template :schema="sectionedSchema"></pdx-form-template>
</div>
```

