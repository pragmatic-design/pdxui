---
title: Forms API
description: "Forms, fields, field arrays, validators, schemas and form-associated custom elements."
order: 24
parent: api
---

# Forms API

Forms, fields, field arrays, validators, schemas and form-associated custom elements. 42 exports, from `@pdxui/core`.

Part of the [API reference](/docs/api), generated from the source by `packages/site/scripts/gen-api.mjs`.

## `clearValidationLocale`

```ts
import { clearValidationLocale } from '@pdxui/core';

function clearValidationLocale(): void
```

Clear the locale resolver (for testing).

## `createFieldArray`

```ts
import { createFieldArray } from '@pdxui/core';

function createFieldArray(initialValues: T[]): FieldArray<T>
```

A repeating group of fields — the "add another line" pattern.

Add a row with `append()`, `prepend()` or `insert()`; take one away with `remove()`; reorder with
`move()` or `swap()`; write one row with `update()`; read the plain values with `getValues()`, and
start over with `reset()`. There is no `add`.

**An item is a wrapper, not your object.** `items()` gives `{ __id, value }`, so a row's field is
`item.value.name` — `item.name` is undefined, and a template that writes it renders empty fields
and reports nothing.

```ts
const rooms = createFieldArray([{ type: 'kitchen', area: 0 }]);
rooms.append({ type: 'bath', area: 0 });
// one field of one row: rebuild that row's value and update it by index
rooms.update(0, { ...rooms.getValues()[0], area: 12 });
// @for (rooms.items() as room; track room.__id) { room.value.type, room.value.area }
```

The `__id` is a stable internal key that survives reorder, removal and `update()`. That is the
whole point: keyed by index, removing the second of three rows makes the third inherit the
second's DOM, its focus and its validation error. Render with `track item.__id`.

`replace()` takes the WHOLE array — `replace(values: T[])`, not an index and a value — and re-keys
every item, which is why writing a single field through `getValues()` + `replace()` costs every
other row its identity. Use `update()` for that.

Inside a form the same object is reached as `form.array('items')`, and its values are merged back
into `form.getValues()` and into submit.

This is the primitive, which draws nothing. `<pdx-field-list name="items" :form>` is the other
way to build repeating rows: a component that draws them, keeping each row as dotted paths in
the form (`items.0.name`) rather than as wrappers. **They do not compose** — the merge above
happens last, so calling `form.array(name)` on a name a field list manages discards what the
list has written. Pick one per name; the comparison is in the recipe "Rows that repeat".

## `createForm`

```ts
import { createForm } from '@pdxui/core';

function createForm(config: FormConfig<T>): Form<T>
```

A form as reactive state: values, errors, touched flags, validity and submission, from an initial
object and a set of validators.

Nested initial values are FLATTENED into dotted paths — `{ customer: { name } }` becomes
`'customer.name'` — so a field addresses itself the same way however deep it sits, and validators
are declared against one flat key space.

`validateOn` decides when errors appear: `onBlur` by default, because validating while someone is
still typing shows them an error for a value they have not finished writing. Async validators are
debounced (300ms) for the same reason.

In a `.pdx` file `@form UserDto` compiles to this, and `<pdx-form :form>` shares it with the
fields below it — which is what `provideForm`/`useForm` are for.

## `createFormCoordinator`

```ts
import { createFormCoordinator } from '@pdxui/core';

function createFormCoordinator(): FormCoordinator
```

Aggregates several independent forms into one: validate all, submit all, and one dirty/valid/
submitting flag over the lot.

For a screen made of sections that each own a form — a wizard step, a master-detail page — where
the Save button must reflect all of them and submitting must not start unless every one is valid.
`submitAll` validates FIRST and stops on failure, so a half-saved screen is not reachable through
it.

A parent provides the coordinator, children register themselves; unregistering on unmount is the
child's job, or a removed section keeps the button disabled forever.

## `createFormFromSchema`

```ts
import { createFormFromSchema } from '@pdxui/core';

function createFormFromSchema(schema: FormSchema): Form<Record<string, unknown>>
```

Create a Form instance from a FormSchema.
Automatically generates initialValues, validators, and fieldConfig.

## `email`

```ts
import { email } from '@pdxui/core';

function email(msg?: string): Validator<string>
```

Rejects a string that is not shaped like an email address.

Deliberately permissive — something@something.something — because the only real validation of an
address is sending to it, and a stricter regex rejects valid addresses more often than it catches
invalid ones. An EMPTY value passes: combine with {@link required} when the field is mandatory.

## `evaluateVisibility`

```ts
import { evaluateVisibility } from '@pdxui/core';

function evaluateVisibility(condition: VisibilityCondition, values: Record<string, unknown>): boolean
```

Evaluate a visibility condition against current form values.

## `flattenValues`

```ts
import { flattenValues } from '@pdxui/core';

function flattenValues(obj: Record<string, unknown>, prefix = ''): Record<string, unknown>
```

Flatten a nested object into dotted-path keys.
`{ customer: { name: 'Jane' } }` → `{ 'customer.name': 'Jane' }`.
Arrays of objects flatten per-item: `items: [{ qty: 2 }]` → `{ 'items.0.qty': 2 }`.
Arrays of primitives stay as-is: `tags: ['a','b']` → `{ 'tags': ['a','b'] }`.

## `FORM_INTERNALS`

```ts
import { FORM_INTERNALS } from '@pdxui/core';

const FORM_INTERNALS
```

Symbol-keyed internal API — not part of the public Form interface.

## `getFieldsByPrefix`

```ts
import { getFieldsByPrefix } from '@pdxui/core';

function getFieldsByPrefix(fields: Record<string, unknown>, prefix: string): string[]
```

Get all dotted-path keys that start with a given prefix.
Used by field-list to find all fields belonging to an array item.

## `getFieldTypeTag`

```ts
import { getFieldTypeTag } from '@pdxui/core';

function getFieldTypeTag(typeName: string): string | undefined
```

Get tag name for a schema field type (custom types).

## `getFormControlConfig`

```ts
import { getFormControlConfig } from '@pdxui/core';

function getFormControlConfig(tagName: string): FormControlConfig | undefined
```

Get config for a registered form control.

## `getNestedValue`

```ts
import { getNestedValue } from '@pdxui/core';

function getNestedValue(obj: unknown, path: string): unknown
```

Get a value from a nested object by dotted path.

## `getRegisteredFormControls`

```ts
import { getRegisteredFormControls } from '@pdxui/core';

function getRegisteredFormControls(): string[]
```

Get all registered control tag names (for compiler).

## `integer`

```ts
import { integer } from '@pdxui/core';

function integer(msg?: string): Validator<number>
```

Rejects a number with a fractional part.

A non-number passes, so an input that has not been coerced yet is not reported here — the field's
own type conversion runs first.

## `isFormControl`

```ts
import { isFormControl } from '@pdxui/core';

function isFormControl(tagName: string): boolean
```

Check if a tag is a registered form control (built-in or custom).

## `isStandardSchema`

```ts
import { isStandardSchema } from '@pdxui/core';

function isStandardSchema(obj: unknown): obj is StandardSchema
```

Check if an object implements Standard Schema v1.

## `max`

```ts
import { max } from '@pdxui/core';

function max(maxVal: number, msg?: string): Validator<number>
```

Rejects a number above `maxVal`. Inclusive: `maxVal` itself is valid.

## `maxLength`

```ts
import { maxLength } from '@pdxui/core';

function maxLength(max: number, msg?: string): Validator<string>
```

Rejects a string longer than `max` characters.

Pair it with the input's own `maxlength` for the typing experience: this is what stops a pasted or
programmatic value, which the attribute does not.

## `min`

```ts
import { min } from '@pdxui/core';

function min(minVal: number, msg?: string): Validator<number>
```

Rejects a number below `minVal`. Inclusive: `minVal` itself is valid.

## `minLength`

```ts
import { minLength } from '@pdxui/core';

function minLength(min: number, msg?: string): Validator<string>
```

Rejects a string shorter than `min` characters.

Length in JavaScript code units, so an emoji or an accented character composed of two code points
counts as two. For a "must be filled in" rule use {@link required} — this one passes on a value
that is not a string at all.

## `onLocaleChange`

```ts
import { onLocaleChange } from '@pdxui/core';

function onLocaleChange(cb: () => void): () => void
```

Register a callback to be notified when the validation locale changes. Returns unsubscribe.

## `pattern`

```ts
import { pattern } from '@pdxui/core';

function pattern(regex: RegExp, msg?: string): Validator<string>
```

Rejects a string that does not match `regex`.

An empty value passes, as with the other string rules. Give it a `msg`: the default is
"Invalid format", which tells the user nothing about what the pattern wants.

## `provideFieldGroupPath`

```ts
import { provideFieldGroupPath } from '@pdxui/core';

function provideFieldGroupPath(path: string, element?: HTMLElement): void
```

Provide a field group path prefix on a host element.
Children use useFieldGroupPath() to build their full dotted path.

## `provideForm`

```ts
import { provideForm } from '@pdxui/core';

function provideForm(form: Form<T>, element?: HTMLElement): void
```

Provide a Form instance on a host element.
Descendants can access it via useForm() / tryUseForm().

## `provideFormCoordinator`

```ts
import { provideFormCoordinator } from '@pdxui/core';

function provideFormCoordinator(coordinator: FormCoordinator, element?: HTMLElement): void
```

Provide a FormCoordinator for nested form orchestration.

## `registerFormControl`

```ts
import { registerFormControl } from '@pdxui/core';

function registerFormControl(tagName: string, config?: FormControlConfig): void
```

Register a custom element as a form control.
Once registered, the compiler auto-wires it inside <pdx-form>,
and pdx-form-template can render it via JSON schema.

## `registerFormFieldType`

```ts
import { registerFormFieldType } from '@pdxui/core';

function registerFormFieldType(typeName: string, tagName: string): void
```

Register a custom field type for JSON schema → component mapping.
Usage: `registerFormFieldType('datepicker', 'my-date-picker')`
Then in schema: `{ name: 'date', type: 'datepicker' }`

## `required`

```ts
import { required } from '@pdxui/core';

function required(msg?: string): Validator
```

Rejects a value the user has not supplied: `null`, `undefined`, a string that is only whitespace,
or an empty array.

Note what it does NOT reject: `0` and `false` are values, and a required numeric or checkbox field
is satisfied by them. Pass `msg` to override the message; without it the text comes from the
active validation locale.

## `resolveValidationMessage`

```ts
import { resolveValidationMessage } from '@pdxui/core';

function resolveValidationMessage(result: ValidationResult): string | undefined
```

Resolve a ValidationResult to a display string.
Handles both plain strings and structured ValidationMessage objects.

## `setNestedValue`

```ts
import { setNestedValue } from '@pdxui/core';

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void
```

Set a value in a nested object by dotted path, creating intermediate objects/arrays as needed.

## `setValidationLocale`

```ts
import { setValidationLocale } from '@pdxui/core';

function setValidationLocale(resolver: LocaleResolver): void
```

Set a global locale resolver for validation messages.
The resolver receives an i18n key and params, returns the translated string.
Return undefined to fall back to the message's fallback string.

## `tryUseForm`

```ts
import { tryUseForm } from '@pdxui/core';

function tryUseForm(from?: HTMLElement): Form<T> | undefined
```

Try to inject the nearest Form. Returns undefined if none found.

Without an argument it must be called during setup(), and answers for that moment.

With `from`, it looks up from that element whenever it is called, in setup or not. When it finds
nothing, an effect that called it runs again as soon as a form is provided — so a component that
may be set up before its form reads it through `tryUseForm(ctx.el)` inside the code that uses it,
and keeps it once found.

## `unflattenValues`

```ts
import { unflattenValues } from '@pdxui/core';

function unflattenValues(flat: Record<string, unknown>): Record<string, unknown>
```

Reconstruct a nested object from dotted-path keys.
`{ 'customer.name': 'Jane' }` → `{ customer: { name: 'Jane' } }`.
Numeric path segments create arrays: `{ 'items.0.qty': 2 }` → `{ items: [{ qty: 2 }] }`.

## `url`

```ts
import { url } from '@pdxui/core';

function url(msg?: string): Validator<string>
```

Rejects a string the URL parser cannot parse.

Uses the platform's own `new URL()`, so it requires a scheme: `example.com` fails,
`https://example.com` passes. Empty passes. If you want to accept a bare host, normalise before
validating rather than loosening this.

## `useFieldGroupPath`

```ts
import { useFieldGroupPath } from '@pdxui/core';

function useFieldGroupPath(from?: HTMLElement): string | undefined
```

Get the current field group path prefix from the nearest ancestor.
Returns undefined if not inside a field-group.

Without an argument it must be called during setup(). With `from`, it looks up from that element
whenever it is called, and an effect that called it runs again whenever a group path is provided
— found or not, because a path can change after it is found: an inner group set up before the
outer one provides `inner` first and `outer.inner` once the outer path appears. So do not keep it:
read it where it is used.

## `useForm`

```ts
import { useForm } from '@pdxui/core';

function useForm(): Form<T>
```

Inject the nearest Form from an ancestor.
Must be called during setup(). Throws if no form found.

## `useFormAssociated`

```ts
import { useFormAssociated } from '@pdxui/core';

function useFormAssociated(ctx: ComponentContextBase, options: FormAssociatedOptions): void
```

Wire a component's value and validation to ElementInternals.
Call in setup() after signal initialization.

Usage:
  component('pdx-input', {
      formAssociated: true,
      setup(ctx) {
          // ... existing setup code ...
          useFormAssociated(ctx, {
              getFormValue: () => ctx.value() as string ?? null,
              getError: () => ctx.error() as string | undefined,
          });
      },
  });

## `useFormCoordinator`

```ts
import { useFormCoordinator } from '@pdxui/core';

function useFormCoordinator(from?: HTMLElement): FormCoordinator | undefined
```

Try to inject the nearest FormCoordinator. Returns undefined if none.

Without an argument it must be called during setup(). With `from`, it looks up from that element
whenever it is called, and an effect whose lookup found nothing runs again when a coordinator is
provided — the same contract as `tryUseForm(from)`.

## `validateSchema`

```ts
import { validateSchema } from '@pdxui/core';

function validateSchema(schema: StandardSchema<T>, values: unknown): Record<string, string>
```

Run a Standard Schema and return field-keyed errors.

## `VALIDATION_KEYS`

```ts
import { VALIDATION_KEYS } from '@pdxui/core';

const VALIDATION_KEYS
```

The translation keys the built-in validators emit, so an app can supply its own wording.

A validator returns `{ key, params, fallback }` rather than a finished string: the key is looked
up in the active validation locale and the params fill it in (`minLength` passes `{ min }`), with
the English fallback used when no locale provides it. Register translations under these exact
names — they are the contract between a validator and a locale file.

## `validationMessage`

```ts
import { validationMessage } from '@pdxui/core';

function validationMessage(key: string, fallback: string, params?: Record<string, unknown>): ValidationMessage
```

Create a ValidationMessage with key, params, and fallback.
Use this in custom validators for i18n support.
