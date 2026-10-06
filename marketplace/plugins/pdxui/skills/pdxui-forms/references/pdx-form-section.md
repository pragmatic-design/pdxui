### `<pdx-form-section>`

A titled section within a form.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `name` | `name` | string | `''` | Section name (used for identification). |
| `label` | `label` | string | `''` | Display label for the section header. |
| `fields` | `fields` | string | `''` | Comma-separated field names that belong to this section. |
| `validate` | `validate` | string | `'onSubmit'` | When to validate: 'onLeave' \| 'onSubmit' \| 'blocking'. Default: 'onSubmit'. |
| `active` | `active` | boolean | `true` | Whether the section is currently active/visible. |

**Renders:** roles `group`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Sections in a form** — Each section labels a group of fields; the form below has Personal, Contact and Address.

```html
<pdx-form :form="profileForm">
  <pdx-form-section name="personal" label="Personal">
    <pdx-form-field name="first" label="First name"><pdx-input name="first" /></pdx-form-field>
    <pdx-form-field name="last"  label="Last name"><pdx-input name="last" /></pdx-form-field>
  </pdx-form-section>
  <pdx-form-section name="contact" label="Contact"> … </pdx-form-section>
  <pdx-form-actions submit-label="Save profile" />
</pdx-form>
```

