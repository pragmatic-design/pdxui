---
name: pdxui-forms
description: "PDX (@pdxui/ui) form-building components — pdx-form, auto-form, form-template, json-editor, form-field/section/actions, fieldset, field-group/list, input-group, inline-edit, wizard — with props and events. Use when building a form, an edit screen or a wizard in a .pdx app."
---

# UI · Form building

> Form composition, sections, auto-form, wizard.  (13 components)  ·  catalogue generated from the library's custom-elements manifest.
> Cross-cutting playbook, recipes and gotchas: the **`pdxui`** skill.
> **Names.** Bind a prop by its kebab-case name, `:max-height="620"`, `:empty-title="t"`: the component
> receives the camelCase prop (`maxHeight`). In a `.pdx` template the camelCase form, `:maxHeight`, compiles
> to the same binding. **Attr** is the HTML attribute for a static value — `maxheight`, and `max-height` too.

## Components

Each page has the props, events, slots and API, the notes, and the examples of the component's demo.

- [`<pdx-auto-form>`](references/pdx-auto-form.md) — A form generated from a schema.
- [`<pdx-field-group>`](references/pdx-field-group.md) — Group related fields together.
- [`<pdx-field-list>`](references/pdx-field-list.md) — Repeatable arrays of fields.
- [`<pdx-fieldset>`](references/pdx-fieldset.md) — A bordered, titled group of fields.
- [`<pdx-form>`](references/pdx-form.md) — Schema-driven form with validation.
- [`<pdx-form-actions>`](references/pdx-form-actions.md) — The submit/cancel action bar.
- [`<pdx-form-field>`](references/pdx-form-field.md) — Label, control, hint and error in one.
- [`<pdx-form-section>`](references/pdx-form-section.md) — A titled section within a form.
- [`<pdx-form-template>`](references/pdx-form-template.md) — Render a whole form from a layout.
- [`<pdx-inline-edit>`](references/pdx-inline-edit.md) — Click text to edit it in place.
- [`<pdx-input-group>`](references/pdx-input-group.md) — Inputs joined with addons and buttons.
- [`<pdx-json-editor>`](references/pdx-json-editor.md) — Edit nested JSON through a schema.
- [`<pdx-wizard>`](references/pdx-wizard.md) — A guided multi-step flow.
