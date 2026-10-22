<!-- Copied from packages/site/content/docs/forms.md by gen-topics.mjs: edit it there. -->

# Forms

> **Formal reference:** [docs/language/data.md](https://github.com/pragmatic-design/pdxui/blob/main/docs/language/data.md) defines the grammar of what this page teaches: what each construct accepts, what it generates, which diagnostic it raises.

Forms are where complexity piles up: every field's value, validation errors, touched/dirty state,
overall validity, when to save. Handling it by hand with one signal per field and validation
scattered around quickly becomes unmanageable. `@form` starts from a **schema** and generates all of
that for you.

## Inline schema

Describe the fields and rules; the compiler generates the form:

```pdx
@form user: {
  name: string { required, minLength: 3 },
  email: string { required, email },
  age: number
}
```

Three things are easy to get wrong, and the compiler accepts none of them:

- the **colon** after the name (`@form user: {`, not `@form user {`);
- fields separated by **commas**, not semicolons;
- rules in **braces** after the type (`string { required, email }`), not bare.

A missing colon **drops the whole declaration** — there is no form, and every read of `user` below
finds nothing: `PDX_UNKNOWN_DECLARATION`, an error naming the keyword and the shape it expected. A
semicolon or bare rules drop **the field**: the form is generated without it, and the control bound
to it swallows what is typed — `PDX_FORM_FIELD_UNPARSED`, a warning naming the field. The grammar is
in the [reference](https://github.com/pragmatic-design/pdxui/blob/main/docs/language/data.md#form).

That line becomes:

```ts
createForm({
  initialValues: { name: '', email: '', age: 0 },
  validators: { name: [required(), minLength(3)], email: [required(), email()] },
})
```

`user` is a `Form`: `user.name` (each with `value()`, `error()`, `touched()`, `onChange(v)`,
`onBlur()`), `user.valid()`, `user.errors()`, `user.getValues()`, `user.handleSubmit(fn)`,
`user.reset()`, `user.array(name)`. They are **signals** — `user.valid()` with parentheses, and
`user.errors()` gives the whole record.

In the editor and in `pdx check --types`, `user` has that type with the fields you declared:
`user.age.value()` is a `number`, and `user.nmae` or `user.values` is an error.
Fields are keyed the way the form keys them. A nested object's fields are dotted:
`user['address.street']`. A row's fields carry their index: `user['lines.0.qty']`.
`user.getValues()` gives the nested object back. A form on an external schema (`@form user: UserSchema`)
is a form whose fields the editor does not know.

Each field is a member of the form, beside the form's own members — so a field cannot be called like
one of them: a field named `reset`, `valid`, `errors`, `state`, `touched` or another member is
`PDX_FORM_FIELD_RESERVED`, and `createForm` refuses it when the page runs. A name you know only at run
time — read from a list, a column, a schema — goes through `formField(user, name)`, which returns the
field or `undefined`, never one of the form's members; `formFieldNames(user)` lists the fields. Before
#128 the fields lived under `user.fields`; `pdx migrate` rewrites `user.fields.name` to `user.name`.

## Binding the fields

Wrap the fields in `<pdx-form :form>`, bind each control to its field through the control's model —
`::value="user.email"` on a text input, `::checked="user.accepted"` on a checkbox or a switch,
`::pressed="user.bold"` on a toggle — and give each `<pdx-form-field>` its field, `:field="user.email"`.
The binding writes the field, marks the control invalid while the field shows an error and required
when the schema requires it, and leaving the control touches the field; the form field shows the
error, warning and required marker. The control keeps its `name`: it is what a native form submits
and what a test selects. A component of your own is submitted by a native form the same way when
its model is declared `@model value: T { form }` (Components → «`{ form }`»). A misspelled field is an error in the editor, and so is a field of the wrong
type for the model (`::checked` on a `string` field):

```pdx
<pdx-form :form="user" @pdx-submit="save($event.detail.values)">
  <pdx-form-field :field="user.name" label="Name"><pdx-input name="name" ::value="user.name" /></pdx-form-field>
  <pdx-form-field :field="user.email" label="Email"><pdx-input name="email" ::value="user.email" type="email" /></pdx-form-field>
  <pdx-button type="submit" :disabled="!user.valid()">Save</pdx-button>
</pdx-form>

<script>
@form user: {
  name: string { required, minLength: 3 },
  email: string { required, email },
  age: number
}

function save(values) { /* already validated */ }
</script>
```

The binding needs no `<pdx-form>` around it, and a form field needs no `name`:

```pdx
<pdx-form-field label="Email" :field="user.email">
  <pdx-input type="email" ::value="user.email" />
</pdx-form-field>
<pdx-form-field label="Age" :field="user.age">
  <pdx-input ::value.number="user.age" />
</pdx-form-field>
```

`.number`'s parse error («Enter a number.») is the field's error, until an entry parses. A
`::value.debounce(300)` binding writes what was typed before the form submits or validates, even when
`handleSubmit` or `validate()` is called from code rather than by a submit. Whether a field is required
is the schema's to say: `required` on a bound control is `PDX_FORM_REQUIRED_IN_MARKUP`, since the field
already marks its control required from its rules. Before #128
a control was wired to its field by its `name` alone; that is `PDX_REMOVED_FORM` now, and
`pdx migrate` writes the binding from the control's manifest — flagging a control with no manifest or
with several models, such as `pdx-checkbox` (`checked`, `indeterminate`). A form section — a component
that calls `tryUseForm()`, below — still has its named controls wired, until #613.

**A group of checkboxes or radios outside a form** binds to one signal with `::group`: checkboxes to
an array of the values that are checked, radios to the value of the one selected — no handler per
input:

```pdx
@for (options as t; track t) {
  <label><input type="checkbox" :value="t" ::group="toppings" /> {{ t }}</label>
}
<label><input type="radio" value="small" ::group="size" /> Small</label>
<label><input type="radio" value="large" ::group="size" /> Large</label>
```

On submit `<pdx-form>` validates every field and emits `pdx-submit` with the clean values **only if**
the form is valid; otherwise it scrolls to the first error. Never a value it did not validate: a field
edited while the submit waits for an async validator (a «username is free» check) cancels that
submit — the form stays where it is, the new value's errors show, and the next submit validates it.

Without `<pdx-form>`, `user.handleSubmit(save)` builds the same handler for a `<form>` of your own:
make it once in the script, `const onSubmit = user.handleSubmit(save);`, and bind it,
`<form @submit="onSubmit">`. Written inline, `@submit="user.handleSubmit(save)"` only builds a
handler on each submit and never calls it.

**A second submit waits for the first.** The handler returns the submit's promise. Pressed again
while a submit runs, it sends nothing and returns the running one's promise, so whatever awaits it —
a «saved» message, a test — runs after the save, not before.

**An autosave keeps one save per field in flight.** With a `saveMode` other than `onSubmit`, a
callback given to `onFieldSave` that returns its save's promise lets the form hold the next save of
that field until the one in flight settles; then it sends the field's newest value, once. Two writes
of one field never race, so the older can no longer land last. A callback that returns nothing is
called on every debounce, as before.

**The server's field errors land on their fields.** When the submit function rejects with
validation problem details (RFC 9457) — an `errors` member keyed by field path, as ASP.NET Core and
most servers send it, in an `HttpError`'s body or thrown as it is — each message shows on the field
it names: `Email` reaches `email`, `Items[0].Name` reaches `items.0.name`. What names no field is
`formError()`, for a line above the buttons. A field's server message clears when it is edited, and
all of them when the next submit starts; `submitError()` is still the rejection itself.

```ts
// The server answers 422 with { "errors": { "Email": ["Already registered"], "": ["Try later"] } }
signup.email.error();          // 'Already registered'
signup.formError();            // 'Try later'
```

**A required field says so, from the schema.** A field whose rules include `required` is marked
required with no prop on its `<pdx-form-field>`: its control gets `aria-required="true"`, so a screen
reader announces «Name, required» before any error, and its label gets the required marker (` *` by
default). The `required` prop still does the same for a field the form does not require. Code that
needs the answer reads `form.name.required`; it is `true` when the field's validators include
`required()`, the rows a field list adds included, and always `false` for a form validated by an
external Standard Schema, which does not say generically which fields it requires. A component that
holds a validator list of its own asks `isRequiredValidator(v)`: only `required()` counts, not a
hand-written function that happens to reject empty values.

The marker is presentation and is set in CSS, with one inherited custom property: on a `<pdx-form>`
for the whole form, on a `<pdx-form-field>` for one field, or in a theme. `aria-required` stays
whatever the marker is, and the marker is kept out of the field's accessible name: the field is
«Name», announced as required, not «Name star».

```css
pdx-form.compact { --pdx-field-required-marker: ' (required)'; }
pdx-form.quiet   { --pdx-field-required-marker: none; }
```

**A section in its own component is wired too.** The wiring is compile-time, so a control inside a
child component is compiled from another file. A child whose script calls `tryUseForm()` declares
itself a section of the `<pdx-form>` above it, and its named controls are wired to that form like the
ones beside `<pdx-form>`, with no `:value` and no event handler. A child that does not call it is not
wired.

```pdx
<template>
  <pdx-form-field name="phone" label="Phone"><pdx-input name="phone" /></pdx-form-field>
</template>
<script>
import { tryUseForm } from '@pdxui/core';
const form = tryUseForm();   // declares the section; answers undefined if the form is not there yet
</script>
```

## External schema (and .NET integration)

The schema can live outside the component and be imported:

```pdx
@form contact: ContactSchema;
```

This is the contact point with the backend: a schema generated by Pragmatic's .NET Source Generator
becomes the *same* source of truth for frontend and backend validation — no duplicate rules that
drift apart.

## Field arrays

A field that is a list of sub-objects — order lines, addresses, rooms — is declared with `[{ … }]`:

```pdx
@form order: {
  customer: string { required },
  lines: [{ product: string, qty: number }]
}
```

⚠️ **A rule inside the array's object is not applied.** `[{ product: string { required } }]` parses,
the form is built, and that `required` is dropped: the form's validators are keyed by field name, and
a row's path (`lines.0.product`) does not exist until the row does. The compiler says so —
`PDX_FORM_ARRAY_RULES_IGNORED` — rather than losing it quietly. To validate a row's fields, declare
the rows with `<pdx-field-list>` and mark them there:

```pdx
<pdx-field-list name="lines" :form="order"
  :item-fields="[{ name: 'product', label: 'Product', required: true }, { name: 'qty', type: 'number' }]" />
```

It registers the validator as each row is added, so an empty required cell fails `validate()` and
blocks the submit.

The list itself is reached with `order.array('lines')`, which is a `FieldArray`:

```pdx
@for (order.array('lines').items() as line; track line.__id) {
  <pdx-input :value="line.value.product" />
  <pdx-button @click="order.array('lines').remove($index)">×</pdx-button>
}
<pdx-button @click="order.array('lines').append({ product: '', qty: 1 })">Add line</pdx-button>
```

Three things that are easy to assume and are not so:

- it is **`append()`**, not `add()`;
- **`remove` takes an index**, not the item;
- an item is a **wrapper**: `{ __id, value }`. Read `line.value.product`, and track `line.__id` — that
  id is stable across removal and reorder, which is what keeps a row's DOM, focus and error attached
  to the right row. Writing one field of one row is `update(i, { ...values[i], qty: 2 })`; going
  through `replace()` re-keys every row.

If the rows are plain fields and you want the table, the add and remove buttons and the dialog mode
for free, use **`<pdx-field-list name="lines" :form>`** instead — it manages the same rows as dotted
paths in the form. The two do not compose: pick one per field name.

## A rule that reads two fields

A validator takes one value, so "the end must be after the start" has no home among them.
`validate` is the form's own rule: it sees **every** value and returns messages **by field**.

```pdx
@form booking: {
  starts: string { required },
  ends: string { required },
} {
  validate: windowRule
};

function windowRule(v) {
  return v.starts && v.ends && v.ends < v.starts
    ? { ends: 'The end precedes the start' }
    : {};
}
```

The braces of an inline `@form` are its fields, so its options go in a **second block** after
them. An external form has one too: `@form order: OrderSchema { validate: rule }`.

What it buys, and each half matters:

- the message is **the field's own error** — it renders in that field's `<pdx-form-field>`, beside
  the input, like every other message. Not a paragraph the page puts somewhere;
- **`valid()` knows**, so a submit that never went near your wizard or your guard still fails;
- it runs on the **same schedule as the field validators** — as the user types or leaves a field,
  per `validateOn`, and again on submit. Not only at the end.

Two rules of precedence, and they are worth knowing:

- a field's **own** validator wins while it is failing. "Required" and "the end precedes the
  start" at once is noise, and a cross-field rule is about a pair that are each individually fine;
- a message keyed to a name that is **not** a field still lands in `errors()` and still makes the
  form invalid. A typo in the key would otherwise read exactly like a rule that passed.

The rule is a recompute, not an accumulation: return `{}` and the message goes.

## When to save

The moment of saving is configurable, globally or per field:

- `onSubmit` (default) — save on submit.
- `onChange` / `onBlur` — save as the user edits or when they leave the field.
- `immediate` — sync right away.

They go in the options block after the fields, as `save`; per field, `fields` takes a `save` and a
`saveDebounce` in milliseconds (500 by default) — `fields` written on one line. `warnUnsaved` asks
before the user leaves with unsaved changes. Options are separated by `;` or a line break, not by
commas:

```pdx
@form profile: {
  name: string { required },
  bio: string
} {
  save: 'onBlur';
  fields: { bio: { save: 'onChange', saveDebounce: 400 } };
  warnUnsaved
}
```

The grammar of the options is in the [reference](https://github.com/pragmatic-design/pdxui/blob/main/docs/language/data.md#form).

## One form, several components

A section that becomes its own `.pdx` does not need the form passed down as a prop — `<pdx-form>`
provides it to its whole subtree. The section calls `tryUseForm()`, and that call is also what tells
the compiler to wire its named controls to that form (see *Binding the fields*):

```pdx
<template>
  <pdx-form-field name="iban" label="IBAN"><pdx-input name="iban" /></pdx-form-field>
</template>

<script>
import { tryUseForm } from '@pdxui/core';

const form = tryUseForm();   // the nearest <pdx-form>, or undefined if it is not there yet
</script>
```

`tryUseForm()` rather than `useForm()`: a child can set up before its form, and `useForm()` then
throws, while the wired controls look the form up themselves and catch up when it appears.
[Component Communication](../../pdxui-data-layer/references/provide-inject.md) covers that ordering with the rest of the context
mechanisms.

Inside a `<pdx-field-group name="address">`, a control reports itself as `address.city` rather than
`city` — within one file. A group written in the PARENT does not prefix the controls of a section
component inside it: put the `<pdx-field-group>` in the section, around its controls. A hand-written
row that builds its own path uses `useFieldGroupPath()` — that is how `pdx-field-list` names the
controls in a row.

**Several forms, one submit** is the other shape, and a different tool: when the sections are
genuinely separate forms — a wizard step, a master-detail screen — put a `createFormCoordinator()`
above them and give each `<pdx-form>` a `name`. Each registers itself; the coordinator aggregates
`dirty`, `valid` and `submitting`, and `submitAll()` validates everything **before** submitting
anything, so a half-saved screen is not reachable through it.

## In practice

| You want… | Do |
| --- | --- |
| a validated form | `@form user: { name: string { required } }` — the **colon** is not optional |
| read a field | `user.name.value()` |
| write a field | `user.name.onChange(v)` |
| show a field error | `@if (user.errors().name) { … }` |
| disable submit when invalid | `:disabled="!user.valid()"` |
| save only if valid | `<pdx-form :form="user" @pdx-submit="save($event.detail.values)">`, or `const onSubmit = user.handleSubmit(save)` bound to your own `<form @submit="onSubmit">` |
| a list of rows | `[{ … }]` in the schema, then `user.array('lines')` → `append()` / `remove(i)` |
| the same validation as the backend | `@form x: ExternalSchema` |
| one form across several components | `<pdx-form :form>` + `tryUseForm()` in each section: its named controls are wired |
| several forms, one Save | `createFormCoordinator()` above them, `name` on each `<pdx-form>` |
