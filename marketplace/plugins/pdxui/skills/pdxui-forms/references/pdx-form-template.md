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

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `getForm()` | The Form the template renders: the `form` prop, or the one created from the schema. |
| `next()` | The next step, once the current one is valid. A promise: the validation may be async. |
| `prev()` | The previous step; never held. |
| `goTo(n)` | A step by index; forward only once the current step is valid. |

**Events:** `pdx-submit` → `detail: { values: Record<string, unknown>; saved?: boolean }` — The form submitted and its values validate; an invalid submit fires nothing and scrolls to the first error.; `pdx-submit-error` → `detail: { error: unknown }` — The form's `source` refused the save.

**Renders:** roles `button` · `group`

**Slot:** `actions` — Replaces the default actions (the `pdx-form-actions` shown when `showActions`). Not rendered in the wizard layout, which has its own navigation.

**Parts:** `[data-part="form"]` — The inner `pdx-form`.; `[data-part="content"]` — The box the generated fields go in.; `[data-part="fields"]` — The fields outside any section.; `[data-part="section"]` — A section's `<fieldset>`, outside the wizard layout.; `[data-part="wizard"]` — The `pdx-wizard` of the wizard layout; its panels are its `panel` parts.


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

