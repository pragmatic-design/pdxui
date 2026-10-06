---
name: pdxui-validation
description: "PDX (@pdxui) forms and validation: @form schemas, field binding, field arrays, a rule across two fields, when to save, one form split across components, several forms under one save. Use when a .pdx form must validate, save, or span several components."
---

# PDX · Forms and validation

The form model: schema, validators, binding, saving. The form COMPONENTS (`pdx-form`,
`pdx-form-field`, `pdx-auto-form`, `pdx-wizard`, …) are in `pdxui-forms`.

## Decide

| You want… | Do |
| --- | --- |
| a validated form | `@form user: { name: string { required } }` |
| a rule that reads two fields | a second block after the fields: `@form b: { … } { validate: rule }` |
| save as the user types, or on blur | `saveMode` / `saveDebounce`, globally or per field |
| a section in its own `.pdx` | `<pdx-form :form>` around it, `tryUseForm()` inside |
| several forms, one Save | `createFormCoordinator()` above them, `name` on each `<pdx-form>` |

The whole table is in [forms](references/forms.md) § In practice.

## Traps

- **The colon is not optional.** `@form user: {` — without it the declaration compiles to nothing.
  ([forms](references/forms.md) § In practice)
- **A field's own validator wins while it fails**: "required" and a cross-field message are not shown
  together. A message keyed to a name that is not a field still makes the form invalid.
  ([forms](references/forms.md) § A rule that reads two fields)
- **`tryUseForm()`, not `useForm()`, in a section**: a child can set up before its form, and
  `useForm()` then throws. ([forms](references/forms.md) § One form, several components)
- **A `<pdx-field-group>` in the parent does not prefix a section component's controls.** Put the
  group inside the section, around its controls. (same section)

## References

A copy of the site's docs page, regenerated with it: [forms](references/forms.md).
