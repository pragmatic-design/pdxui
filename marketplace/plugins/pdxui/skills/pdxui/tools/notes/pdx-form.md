**Use it when** you write the form by hand: fields laid out in markup, each `<pdx-form-field name="x">`
holding a control with the same `name`, wired by the compiler. **Not when** the fields come from a schema
or the grid's `FieldDefinition[]` → `pdx-auto-form`; nor to submit several separate forms together — that
is one `<pdx-form name>` each under `createFormCoordinator()` (recipes: *A long form filled in more than one sitting*).

**Pitfalls**
- Inside `<pdx-form :form>` a control binds its field through its model, `::value="form.x"`, and a form field
  names it, `:field="form.x"`: a control with only a `name` there is `PDX_REMOVED_FORM` (#128). Only a
  section — a component whose script calls `tryUseForm()` — still has its named controls wired, until #613.
- A section calls `tryUseForm()`, not `useForm()`: a child can set up before its form, and `useForm()` then throws.
- A `<pdx-field-group>` written in the PARENT does not prefix the controls of a section component inside
  it: put the group in the section.
- Inside a group a field is bound by its full path, `::value="form['customer.email']"`, and its control's `name`
  is the full path too: select `[name="customer.email"]`.
- With `warnUnsaved`, a save from `@pdx-submit` does not tell the form it succeeded: call `form.reset(saved)`
  before navigating away, or the page asks about work it just saved (recipes: *Do not leave with unsaved work*).
- `:source` + `record-id` does not find a record whose id is a number: pass the id the rows carry.

**Composes with** `pdx-form-field` (error, touched, warning) · `pdx-field-group` (nested `a.b` paths) ·
`pdx-field-list` (repeating rows) · `pdx-form-actions` (the submit bar) · `pdx-wizard` (steps grouped by form).
