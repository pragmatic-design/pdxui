---
title: Diagnostics
description: "Every PDX_* code the compiler, pdx check and the editor report: what it means and what to write instead. Generated from the catalog."
order: 25
---

# Diagnostics

> **Formal reference:** [docs/language/diagnostics.md](https://github.com/pragmatic-design/pdxui/blob/main/docs/language/diagnostics.md) indexes the same codes by the construct that raises them.

Every finding the compiler, `pdx check` and the editor report carries a `PDX_*` code — 87 of them. Each is listed here with what it means and what to write instead, generated from the catalog in `packages/compiler/src/diagnostics/`. From a terminal, `pdx explain <CODE>` prints the same entry; `--json` prints it for an agent. A finding in `pdx check --json` links its entry with `url`.

## Defects

Something is wrong: the output differs from what was written, or nothing is generated for it.

### PDX_AWAIT_NO_LOADING

*info* — `@await` without a `@loading` block.

The user sees nothing while the promise is pending.

**Fix.** Add `@loading { … }` with a placeholder.

### PDX_CIRCULAR_DERIVED

*error* — `$derived` values that depend on each other in a cycle.

A cycle has no first value to compute; the runtime breaks it and the values are wrong.

**Fix.** Make one of them a `$signal` that the other writes.

### PDX_COMMAND_TARGET_MISSING

*error* — A `commandfor` whose target id is not in the template.

The browser finds the target of `commandfor="x"` by id when the button is pressed. With no `id="x"`, the button does nothing, and nothing says so.

**Fix.** Give the element it controls the id `commandfor` names.

Instead of:

```html
<template>
  <button commandfor="d" command="--show">Open</button><pdx-dialog title="T">x</pdx-dialog>
</template>
<script setup>
let a = $signal(1);
</script>
```

write:

```html
<template>
  <button commandfor="d" command="--show">Open</button><pdx-dialog id="d" title="T">x</pdx-dialog>
</template>
<script setup>
let a = $signal(1);
</script>
```

### PDX_COMMAND_UNKNOWN

*error* — A command its target does not answer: a `--name` the component does not expose, or a built-in command for another element type.

A custom command `--name` calls the method `name` the target component exposes; a built-in one (`show-modal`, `toggle-popover`, …) is the platform's, for a `<dialog>` or a popover. Any other pairing does nothing when the button is pressed.

**Fix.** Use a method the component exposes (`command="--show"` on pdx-dialog), or point a built-in command at an element that has it.

Instead of:

```html
<template>
  <button commandfor="d" command="show">Open</button><pdx-dialog id="d" title="T">x</pdx-dialog>
</template>
<script setup>
let a = $signal(1);
</script>
```

write:

```html
<template>
  <button commandfor="d" command="--show">Open</button><pdx-dialog id="d" title="T">x</pdx-dialog>
</template>
<script setup>
let a = $signal(1);
</script>
```

### PDX_DEFER_UNKNOWN_TRIGGER

*error* — A `@defer` trigger the runtime does not know (`@defer (viewprt)`).

The runtime loads a block whose trigger it does not recognise at once — the opposite of deferring it — and nothing else says so. Triggers combine with `|`, and each part is checked.

**Fix.** Use one of `immediate`, `viewport`, `idle`, `idle(ms)`, `interaction`, `hover`, `timer(ms)`; write `immediate` to load at once.

Instead of:

```html
<template>
  @defer (viewprt) { <p>chart</p> }
</template>
<script setup>

</script>
```

write:

```html
<template>
  @defer (viewport) { <p>chart</p> }
</template>
<script setup>

</script>
```

### PDX_DERIVED_WRITE

*warn* — Code that writes into the object a `$derived` returned (CD-S2).

The derived's next computation replaces the object, so the written value lies until something patches it again.

**Fix.** Derive the field from its source; if a reader overrides it, it is a `$signal` reset by `$watch` on the source.

### PDX_DOCUMENT_QUERY

*warn* — `document.querySelector` (or a sibling) in a component (CD-A1).

It finds whatever matches in the whole page — another instance included — and nothing when the element is elsewhere.

**Fix.** Bind the element with `:ref`; for a child component, ask it through `@expose`.

### PDX_DUP_DECLARATION

*error* — The same name declared twice at the top of the script: runes, `@prop`, functions, classes, plain variables.

The compiled component keeps one of them, and nothing says which. A signal is renamed in the output, so a `$signal` and a `function` of one name do not even clash as JavaScript would: the template sees whichever the component returns last.

**Fix.** Rename one, or remove the one you do not mean.

### PDX_DUP_EVENT

*error* — The same `@event` declared twice.

Two declarations of one event: only one emitter is generated.

**Fix.** Remove the duplicate `@event`.

Instead of:

```html
<template>
  <p>x</p>
</template>
<script setup>
@event changed: number;
@event changed: number;
</script>
```

write:

```html
<template>
  <p>x</p>
</template>
<script setup>
@event changed: number;
</script>
```

### PDX_DUP_PROP

*error* — The same `@prop` declared twice.

Two declarations of one prop: only one is generated.

**Fix.** Remove the duplicate `@prop`.

Instead of:

```html
<template>
  <p>{{ a }}</p>
</template>
<script setup>
@prop a: string = 'x';
@prop a: string = 'y';
</script>
```

write:

```html
<template>
  <p>{{ a }}</p>
</template>
<script setup>
@prop a: string = 'x';
</script>
```

### PDX_DUPLICATE_SCRIPT

*error* — A second `<script>` block in a `.pdx`.

A `.pdx` has one `<script>`. The parser reads the first; a second would be dropped without a word — its declarations surfacing only as undeclared names in the template, its statements (an `onMount(…)`) never running. So the compile stops at it, naming its line.

**Fix.** Move its code into the first `<script setup>`.

### PDX_DUPLICATE_TEMPLATE

*error* — A second `<template>` block in a `.pdx`.

A `.pdx` has one `<template>`; the parser reads the first, and the markup of a second would never render. So the compile stops at it, naming its line.

**Fix.** Move its markup into the first `<template>`.

### PDX_DYNAMIC_CONTENT

*warn* — Content between `<component :is>` and `</component>`.

The dynamic component takes no children: what is written between the tags is not rendered, in dev or in a build. Whitespace alone is not reported.

**Fix.** Move the content beside the tag, or pass what the component needs as a prop: `<component :is="view" :title="t" />`.

Instead of:

```html
<template>
  <component :is="view"><p>Welcome</p></component>
</template>
<script setup>
let view = $signal('pdx-home');
</script>
```

write:

```html
<template>
  <p>Welcome</p>
  <component :is="view" />
</template>
<script setup>
let view = $signal('pdx-home');
</script>
```

### PDX_EMPTY_FOR

*warn* — An `@for` with an empty body.

The loop renders nothing for every item.

**Fix.** Put the row inside the block, or remove the loop.

Instead of:

```html
<template>
  @for (items as item; track item) {}
</template>
<script setup>
let items = $signal([1, 2]);
</script>
```

write:

```html
<template>
  @for (items as item; track item) { <p>{{ item }}</p> }
</template>
<script setup>
let items = $signal([1, 2]);
</script>
```

### PDX_EMPTY_SOURCE

*error* — An empty `.pdx` file (build error).

An empty file would compile to a component that registers and renders nothing — indistinguishable from a working one. Usually a file read while it was being saved.

**Fix.** Save the file again; if it really is empty, write its template.

### PDX_EVENT_NAME_CASE

*warn* — An `@event` name with an uppercase letter.

HTML lowercases attribute names, so a parent's `@savedItem="…"` listens for `saveditem` and never hears it.

**Fix.** Use a lowercase name: `@event saveditem: Item;`. The fix renames it in the script; when the template uses the name, the rename is left to you. `pdx check --fix` and the editor apply it.

### PDX_EXPOSE_UNDECLARED

*error* — `@expose` names something the component does not declare.

There is nothing to expose: the method a parent calls does not exist.

**Fix.** Declare it first (`function close() { … }`), or remove it from `@expose`.

### PDX_FETCH_INVALID

*error* — `@fetch` without a valid `'METHOD /url'`.

The resource cannot be generated; dropping it silently would break the component with no message.

**Fix.** `@fetch users: 'GET /api/users' as User[];`

### PDX_FETCH_METHOD

*error* — `@fetch` with a method other than GET.

`@fetch` reads. A POST, PUT or DELETE written here used to compile to a GET of the same URL, and nothing said so.

**Fix.** For a read, `'GET /url'`. For a write, a `mutation()`.

### PDX_FETCH_NO_ERROR_UI

*info* — An `@fetch` whose error state the template never shows.

A failed request leaves the screen as it was, with nothing telling the user.

**Fix.** Show it: `@if (users.state() === 'error') { … }`.

Instead of:

```html
<template>
  <p>{{ users.data() }}</p>
</template>
<script setup>
@fetch users: 'GET /api/users' as string[];
</script>
```

write:

```html
<template>
  @if (users.state() === 'error') { <p>Could not load</p> } <p>{{ users.data() }}</p>
</template>
<script setup>
@fetch users: 'GET /api/users' as string[];
</script>
```

### PDX_FETCH_TYPE_COLON

*error* — `@fetch` with its type written after `:`.

The type is written with `as`. Written with `:` it was dropped, and the options block after it with it.

**Fix.** `@fetch users: 'GET /api/users' as User[];`

### PDX_FETCH_UNKNOWN_OPTION

*error* — `@fetch` with an option `resource()` does not take.

The options block is handed to `resource()`, which ignores a key it does not know: a misspelled `stalTime` does nothing.

**Fix.** Use one of `resource()`'s options: key, staleTime, retry, tags, enabled, transform, onSuccess, onError, cache, stale.

### PDX_FORM_ARRAY_RULES_IGNORED

*warn* — Validation rules inside a `@form` array field.

A rule written on a row field is parsed and then dropped: rows are never validated.

**Fix.** `<pdx-field-list :item-fields="[{ name, required: true }]">`, which registers the rule as each row is added.

### PDX_FORM_FIELD_UNPARSED

*warn* — A `@form` field the compiler did not understand.

No field is generated, so the control bound to it swallows what is typed.

**Fix.** Write the field as `name: type { rules }`, `name: string[]`, `name: { sub: type }` or `name: [{ sub: type }]`.

### PDX_FORM_NO_SUBMIT

*info* — A `@form` that nothing submits.

The form validates and holds values, and no `handleSubmit` sends them anywhere.

**Fix.** Wire `form.handleSubmit(async (values) => { … })`, or hand the form to `<pdx-form :form>`.

### PDX_FORM_UNKNOWN_RULE

*error* — A `@form` rule that is neither a core validator nor a function of the script.

The rule is called by its name, and nothing of that name exists: the form throws when it is created.

**Fix.** Use one of core's rules (`required`, `minLength`, `email`, …), or declare a function that returns a validator: `function shout() { return (v) => (ok ? null : 'message'); }`.

Instead of:

```html
<template>
  <p>x</p>
</template>
<script setup>
@form f: { name: string { shout } };
</script>
```

write:

```html
<template>
  <p>x</p>
</template>
<script setup>
@form f: { name: string { shout } };
function shout() { return (v) => (v === String(v).toUpperCase() ? null : 'Shout it'); }
</script>
```

### PDX_GLOBAL_SELECTOR

*warn* — `:global()` in a style.

`:global()` is not CSS, and the browser drops the whole rule. A scoped style already reaches the descendants a child component renders.

**Fix.** Remove the wrapper: `:global(.x) .y` → `.x .y`.

### PDX_HAND_WRITTEN_SIGNAL

*error* — A `signal()` or `computed()` written by hand in `<script setup>` and read bare by the template (`{{ name }}`, `:title="name"`).

The template reads the names the runes declare as values. A signal created by hand is a function, and the template shows the function itself — its source text in the page, or the function assigned to a property. Calling it in the template (`{{ name() }}`) shows the value, and a hand-written signal the template does not read is not reported.

**Fix.** Declare it with the rune: `let name = $signal('World');` for `signal()`, `const total = $derived(a + b);` for `computed()` — the expression, not a function.

### PDX_HOST_INVALID_ATTRIBUTE

*error* — On `@host`, a form with no meaning on a host: `::x`, `data-part`, a generic argument.

The host is the component's own element. It has no two-way binding — the parent's `::x` is the component's `@model x` — it is not a part of itself, and a generic argument (`T="User"`) is the parent's to give. The message names which of the three it is; the attribute is not compiled.

**Fix.** Remove it from `@host`: declare `@model x` for a two-way value, put `data-part` on an element of the template, declare a type parameter with `@generic`.

Instead of:

```html
<template>
  <p>x</p>
</template>
<script setup>
@host { role="button" data-part="root" }
</script>
```

write:

```html
<template>
  <p>x</p>
</template>
<script setup>
@host { role="button" }
</script>
```

### PDX_I18N_MISSING_KEY

*warn* — A translation key present in one locale and missing in another (`pdx check --i18n`).

The screen in that locale shows the key, or the fallback language, where a translation was meant.

**Fix.** Add the key to the locale file the message names.

### PDX_IGNORE_UNUSED

*warn* — A `pdx-ignore` that silences nothing.

What it exempted is gone, or it sits on the wrong line. Left there, it would silence the next finding of that code without anyone deciding to. Reported by `pdx check`, which runs every check.

**Fix.** Remove it, or move it to the line before the finding.

### PDX_IGNORE_WITHOUT_REASON

*error* — A `pdx-ignore` comment that does not say why.

An exemption is a decision, and one without its reason cannot be reviewed or retired: it exempts nothing until the reason is written.

**Fix.** Add the reason after a colon: `<!-- pdx-ignore PDX_COLOUR_LITERAL: a palette swatch -->`.

Instead of:

```html
<template>
  <!-- pdx-ignore PDX_RAW_INTERPOLATION -->
  <p>x</p>
</template>
<script setup>
let a = $signal(1);
</script>
```

write:

```html
<template>
  <!-- pdx-ignore PDX_RAW_INTERPOLATION: shown as written -->
  <p>x</p>
</template>
<script setup>
let a = $signal(1);
</script>
```

### PDX_INLINE_BINDINGS_IGNORED

*warn* — `pdx({ inlineBindings })` is given, and no longer selects a render path.

A `.pdx` compiles with one render path, the inline one, in dev and in a build, so a feature cannot exist in one and be missing from the other. The option changes nothing; the warning says so once per build or dev server.

**Fix.** Remove `inlineBindings` from the `pdx()` options.

### PDX_INLINE_NODE_UNSUPPORTED

*warn* — A template node the inline render path cannot compile.

The node would be left out of the render, in dev and in a build — the inline path is the only one a `.pdx` compiles with. The warning makes a missing feature visible instead of silent.

**Fix.** Open an issue naming the node type.

### PDX_INVALID_ENUM_VALUE

*warn* — A static or literal attribute value (`size="huge"`, `:size="'huge'"`) outside the values its prop declares.

A component receives a value its type does not admit and falls back to its default, silently.

**Fix.** Use one of the allowed values the hint lists.

### PDX_KEEPALIVE_MAX

*error* — A `<component :is @keepAlive(n)>` whose maximum is not a whole number of at least 1.

`@keepAlive(n)` keeps at most n views, dropping the least recently shown. A value that is not a positive whole number keeps no meaning; the component is compiled with the default of 10.

**Fix.** Write `@keepAlive(3)` for three views, or `@keepAlive` alone for the default of 10.

Instead of:

```html
<template>
  <component :is="view" @keepAlive(0)></component>
</template>
<script setup>
let view = $signal('pdx-a');
</script>
```

write:

```html
<template>
  <component :is="view" @keepAlive(3)></component>
</template>
<script setup>
let view = $signal('pdx-a');
</script>
```

### PDX_LABEL_NOT_FOUND

*warn* — A route's label names a function the script does not declare.

The route contributes no crumb to the breadcrumb.

**Fix.** Declare it: `function crumb(params) { … }`, or write the crumb as a string.

### PDX_LEGACY_IN_SETUP

*warn* — A legacy marker (`defineProps`, `defineEmits`, a top-level `return`) in `<script setup>`.

With runes beside it, the marker does nothing; without runes, the file compiles in the legacy mode and any rune added later is inert.

**Fix.** Remove the marker — `<script setup>` returns what it declares — or write plain `<script>` for a deliberately legacy file.

### PDX_LIBRARY_INTERNALS

*warn* — A style that targets a library component's internal class (CD-C2).

Internal classes are not an API: a rename in the library breaks the rule without a sound.

**Fix.** Use the component's props, variants or documented `--pdx-*` properties; if several pages need it, the component needs a prop.

### PDX_LISTENER_LEAK

*warn* — An `addEventListener` on a global target with no matching removal (CD-D3).

The listener outlives the component and keeps acting on a screen that is gone.

**Fix.** Add it in `onMount` and remove it in an `onDestroy` beside it.

### PDX_LOADER_NOT_FOUND

*warn* — `@loader` names a function the script does not declare.

The route is registered without a loader, so the page renders with no data.

**Fix.** Declare it: `async function loadUser() { … }`.

### PDX_MALFORMED_EVENT

*error* — `@event` written in a shape the compiler does not recognise.

No emitter is generated for it, so calling it does nothing.

**Fix.** `@event saved: number;` — a lowercase name, a colon, a payload type.

Instead of:

```html
<template>
  <p>x</p>
</template>
<script setup>
@event (saved): number;
</script>
```

write:

```html
<template>
  <p>x</p>
</template>
<script setup>
@event saved: number;
</script>
```

### PDX_MALFORMED_STATE

*error* — `@state` written in a shape the compiler does not recognise.

A state is a name and the condition it is on for. Without both, nothing is declared and nothing sets it.

**Fix.** Write `@state name = condition;`, for example `@state expanded = open;`.

### PDX_NON_REACTIVE

*warn* — A plain `let` the template reads and the script changes.

Only `$signal` and `$derived` are tracked. A plain variable is read once: the template keeps showing its first value.

**Fix.** Declare it with `$signal`: `let count = $signal(0);`. `pdx check --fix` and the editor apply it.

### PDX_PAGE_EMPTY_CONSTRAINT

*error* — A route param with empty parentheses: `:id()`.

A constraint was meant and none was written.

**Fix.** `:id(number)`, or remove the parentheses.

### PDX_PAGE_INVALID_CONSTRAINT

*warn* — A route param constraint that is not a known type.

The constraint is not applied, so the param matches anything.

**Fix.** Use one of the constraints the hint lists: `:id(number)`.

### PDX_PAGE_INVALID_PATH

*error* — An `@page` path that does not start with '/'.

The route would never match an address.

**Fix.** `@page '/users';`

Instead of:

```html
<template>
  <p>x</p>
</template>
<script setup>
@page 'users';
</script>
```

write:

```html
<template>
  <p>x</p>
</template>
<script setup>
@page '/users';
</script>
```

### PDX_PART_DUPLICATE

*error* — A `@part` written on more than one element.

A part names one element. On two, a theme styles both under one name and the script's ref holds whichever rendered last.

**Fix.** Keep `data-part="x"` on one element, and give the others parts of their own.

Instead of:

```html
<template>
  <button data-part="action">A</button><button data-part="action">B</button>
</template>
<script setup>
@part action;
</script>
```

write:

```html
<template>
  <button data-part="ok">A</button><button data-part="cancel">B</button>
</template>
<script setup>
@part ok, cancel;
</script>
```

### PDX_PART_MISSING

*error* — A declared `@part` that no element of the template carries.

A part is a public name for one element: a theme styles `[data-part="x"]` and the script reads `x` as the element. With no element, both reach nothing, and the manifest lists a part that is not there.

**Fix.** Write `data-part="x"` on the element it names, or remove `x` from `@part`.

Instead of:

```html
<template>
  <button>Menu</button>
</template>
<script setup>
@part trigger;
</script>
```

write:

```html
<template>
  <button data-part="trigger">Menu</button>
</template>
<script setup>
@part trigger;
</script>
```

### PDX_PART_UNDECLARED

*error* — A `data-part` that names no `@part`.

Parts are the component's public styling surface and the manifest lists them from `@part`: an undeclared one is public by accident, and nothing says it exists.

**Fix.** Declare it, `@part x;`, or remove the attribute.

Instead of:

```html
<template>
  <div data-part="popup">x</div>
</template>
<script setup>
let open = $signal(false);
</script>
```

write:

```html
<template>
  <div data-part="popup">x</div>
</template>
<script setup>
@part popup;
</script>
```

### PDX_PREFETCH_POLICY

*error* — A route's `@prefetch` names a policy the router does not have.

The router treats a policy it does not know as `hover`: the route would prefetch on a hover whatever was written, and nothing would say so.

**Fix.** One of `'hover'` (the default), `'eager'`, `'viewport'`, `'never'`.

### PDX_PROP_INVALID_TYPE

*warn* — A `@prop`'s type annotation is malformed.

Unbalanced brackets or a trailing `|`, `&` or `,` — the generated `.d.ts` may be invalid.

**Fix.** Balance the type: `@prop items: Array<string> = [];`

### PDX_PROP_NAME_CASE

*warn* — A bound prop written in lowercase that matches a camelCase prop.

It reaches the prop only because the compiler knows the component; written for an unknown element it would not.

**Fix.** Write the declared name: `:maxItems`. `pdx check --fix` and the editor apply it.

### PDX_PROP_NO_TYPE

*error* — `@prop` without a type annotation.

The prop needs a type to coerce attributes and to generate its `.d.ts`; the declaration is not generated.

**Fix.** `@prop label: string = 'Hello';`

Instead of:

```html
<template>
  <p>{{ label }}</p>
</template>
<script setup>
@prop label;
</script>
```

write:

```html
<template>
  <p>{{ label }}</p>
</template>
<script setup>
@prop label: string = 'Hello';
</script>
```

### PDX_PROP_TYPE_MISMATCH

*warn* — A `@prop`'s default does not match its type.

A `number` prop with a string default is coerced at the first attribute write, and reads differently before and after.

**Fix.** Make the default match the type, or the type match the default.

### PDX_PROP_WRITE

*warn* — A component writes one of its own props (CD-A2).

The parent owns the prop: its next value overwrites the component's.

**Fix.** Declare it `@model` when the parent binds it both ways (`::name`); for a starting value, copy it into a `$signal`.

### PDX_RAW_INTERPOLATION

*warn* — A `${…}` in the template markup.

`${}` is evaluated once, when the template is built, so the text or attribute never updates. In a template, text is `{{ expr }}` and an attribute is bound with `:attr="expr"`.

**Fix.** Text: `{{ name }}`. Attribute: `:title="name"`. `pdx check --fix` and the editor apply it.

Instead of:

```html
<template>
  <p title="${n}">x</p>
</template>
<script setup>
let n = $signal(1);
</script>
```

write:

```html
<template>
  <p :title="n">x</p>
</template>
<script setup>
let n = $signal(1);
</script>
```

### PDX_RAW_INTERPOLATION_IN_BINDING

*error* — A `${…}` inside the value of a bound attribute (`:x`, `::x`, `@x`).

The value of a bound attribute is already an expression. `${x}` in it is written into the module as it is, and a production build (inline bindings) does not parse — the compile stops at the line instead.

**Fix.** Drop the `${ }`: `:label="${x}"` → `:label="x"`. A template literal inside the expression (`` :class="`btn-${size}`" ``) is fine. `pdx check --fix` and the editor apply it.

Instead of:

```html
<template>
  <p :title="${n}">x</p>
</template>
<script setup>
let n = $signal(1);
</script>
```

write:

```html
<template>
  <p :title="n">x</p>
</template>
<script setup>
let n = $signal(1);
</script>
```

### PDX_REMOVED_FORM

*error* — A form the beta removed from the language, with the form that replaces it.

The beta replaces the alpha: there is no language level that keeps an old form compiling. Each removed form is registered once in the compiler (`packages/compiler/src/language/changes.ts`) with how to find it, what replaces it and, when there is one, the mechanical rewrite. The message names the beta form. A form whose meaning changed but which is still valid is not an error: `pdx migrate` reports it.

**Fix.** Run `pdx migrate` (with `--dry` to see first): it rewrites every form it can and lists the places a person has to rewrite. Or write the beta form the message names.

### PDX_REWRITE_FALLBACK

*warn* — A fragment of the setup the signal rewriter could not parse.

The fragment is kept as written, so a signal read inside it is not called and is not reactive.

**Fix.** Fix the syntax, or move the fragment out of the setup body.

### PDX_ROUTE_FIELD_INVALID

*error* — A `@params` or `@search` field its parser cannot read, such as a type in quotes.

The field is dropped: the param is undefined in the page. `@search` reads string, number and boolean; `@params` a bare type name.

**Fix.** `@params { id: number }`, `@search { q?: string, page: number = 1 }` — the type without quotes. `pdx check --fix` and the editor apply it.

Instead of:

```html
<template>
  <p>{{ id }}</p>
</template>
<script setup>
@page '/users/:id';
@params { id: 'number' };
</script>
```

write:

```html
<template>
  <p>{{ id }}</p>
</template>
<script setup>
@page '/users/:id';
@params { id: number };
</script>
```

### PDX_SCRIPT_SYNTAX_ERROR

*error* — The `<script setup>` does not parse.

A syntax error in the setup would reach the generated module as broken code. It is reported with its position in the script.

**Fix.** Fix the syntax at the reported line.

### PDX_SIGNAL_MUTATED_IN_PLACE

*warn* — A `$signal`'s value changed in place: a mutating method (`push`, `splice`, `set`, `add`…) or a write to a member (`user.name = …`, `items[0] = …`).

A signal notifies when it is set, and `set` compares with `Object.is`. Changing the array or object it already holds calls no `set` at all, so nothing that reads the signal updates: the list on screen does not grow. It is reported in the script and in a template event handler (`@click="items.push(x)"`); a name the template binds itself — a `@for` item, an arrow parameter — is not the signal. A `$store` is a proxy, where in-place mutation is the point, and is not reported.

**Fix.** Assign a new value: `items = [...items, x]` for a push, `user = { ...user, name: v }` for a field. The fix rewrites those two; the other forms get the hint. A value meant to be changed in place is a `$store`. `pdx check --fix` and the editor apply it.

Instead of:

```html
<template>
  <p>{{ items.length }}</p>
</template>
<script setup>
let items = $signal<number[]>([]);
function add(x: number) {
  items.push(x);
}
</script>
```

write:

```html
<template>
  <p>{{ items.length }}</p>
</template>
<script setup>
let items = $signal<number[]>([]);
function add(x: number) {
  items = [...items, x];
}
</script>
```

### PDX_STATE_NOT_BOOLEAN

*error* — `@state` given something that is not a boolean.

A state is on or off: CSS matches it with `:state(name)`, and a number, a string or a `$signal(…)` is data, not a condition. `@state` is not Svelte's `$state`, which declares a reactive variable.

**Fix.** Give it the condition it is on for (`@state busy = count > 0;`); for reactive data, use `$signal`.

Instead of:

```html
<template>
  <p>x</p>
</template>
<script setup>
@state count = 0;
</script>
```

write:

```html
<template>
  <p>x</p>
</template>
<script setup>
let count = $signal(0);
@state busy = count > 0;
</script>
```

### PDX_STORE_EXPORT

*error* — An `export` in a `@store` module that reads a name the store owns.

A `@store` module's exports are emitted at module level, outside the store's factory, where the store's signals and functions do not exist: the export would throw a ReferenceError when the module loads. An export that reads none of them — a constant, a helper — is moved out as it is.

**Fix.** Read the store through its hook (`useMenu().selected`), or move the export to its own module.

### PDX_TAG_COLLISION

*error* — Two compiled `.pdx` files register the same tag (build error).

A custom element can be defined once; the second definition would throw in the browser.

**Fix.** Add `@tag 'pdx-unique-name';` to one of the files.

### PDX_TAG_COLLISION_RESOLVER

*warn* — Two component files derive the same tag; the second is not auto-importable.

Only one of the two is registered by auto-import, and which one depends on scan order.

**Fix.** Rename one of the files, or give one an explicit `@tag 'pdx-other-name';`.

### PDX_TEMPLATE_NAME_NOT_PROVIDED

*error* — A legacy-mode template reads a name its script does not provide.

In the legacy mode the template sees what `defineProps` declares and what the top-level `return { … }` returns. A `const` the script declares and does not return reads as undefined — and a plain `<script>` with no rune is the legacy mode.

**Fix.** Write `<script setup>`, which hands the template every name it declares — or add the name to the returned object.

### PDX_TS

*error* — A TypeScript error in the script or a template expression (`pdx check --types`).

The type-check the editor shows, run headless: the script and every template expression are checked with the runes typed as their values, and the TypeScript code is in `tsCode`. The compiler builds the file anyway; this is the error the editor underlines.

**Fix.** Fix the type the message names — the finding is at its line in the .pdx.

### PDX_TS_UNSUPPORTED

*error* — TypeScript in a `.pdx` script that has a runtime of its own: an enum, a namespace, a parameter property, `import = require()`.

The compiler erases a script's TypeScript, types only, keeping every position. These constructs are not types: an `enum` and a `namespace` create objects, a parameter property assigns a field, `import =` loads a module. There is no erasure that keeps what they do, and the compile stops at them instead of shipping code the browser rejects.

**Fix.** Write it as JavaScript: a frozen object for an enum (`const Color = Object.freeze({ Red: 0 })`), a module for a namespace, an assignment in the constructor for a parameter property, an `import` for `import =`.

### PDX_TWO_WAY_NOT_MODEL

*error* — `::x` on a component prop that is not one of its models (#124).

Two-way binding is a contract: the child declares which of its props it writes back, with `@model`, and dispatches `<name>-change` when it does. On any other prop nothing brings the value back, and the binding is silently one-way. Checked for project components and for library components whose manifest lists their models; native `value`, `checked` and `files` are the platform's models.

**Fix.** Declare `@model x` in the child, or bind it one way with `:x`.

### PDX_UNDECLARED_REF

*error* — A name the template reads that `<script setup>` does not declare.

At runtime the binding reads `undefined`, and a handler named this way does nothing when clicked; usually a misspelt signal, prop or function.

**Fix.** Declare it, or fix the spelling — when one declared name is within 2 edits the message names it, and the fix renames the read. `pdx check --fix` and the editor apply it.

Instead of:

```html
<template>
  <p>{{ coutn }}</p>
</template>
<script setup>
let count = $signal(0);
</script>
```

write:

```html
<template>
  <p>{{ count }}</p>
</template>
<script setup>
let count = $signal(0);
</script>
```

### PDX_UNKNOWN_DECLARATION

*error* — A known `@` declaration, or a `$signal` / `$derived` / `$store` declaration, written in a shape the compiler does not recognise; or a `$inline { … }` block, which is not part of the language.

The line is dropped and nothing is generated for it; left in the body it would make the module unparseable, or, for a rune, ship `$signal` in the JavaScript — a ReferenceError at run time. A rune is read as the whole initialiser of a named declarator, whatever its type argument holds. A `$inline` block is dropped whole: it used to be copied into the render, where the template could not reach what it declared and its signals were not rewritten (#361).

**Fix.** Write it in the shape the hint shows for that keyword; for a rune, `let name = $signal<Type>(initial);`. For a `$inline` block, declare what the template reads with `$derived`.

### PDX_UNKNOWN_DIRECTIVE

*warn* — A `@word (…)` or `@word { … }` in the template that is no directive and no plugin's (`@tooltip (msg) { … }` without its plugin).

The parser leaves an unknown `@word` as text, so literal `@`-text keeps working: the characters `@tooltip (msg) {` reach the page. A near typo of a built-in (`@fro` for `@for`) stops the compile instead. Reported once per name in a file, at its first occurrence.

**Fix.** Register the directive with a plugin's `templateDirectives`, or write `@@word` for the text (`@@media (pointer: coarse)`).

Instead of:

```html
<template>
  <p>@media (pointer: coarse) is CSS</p>
</template>
<script setup>

</script>
```

write:

```html
<template>
  <p>@@media (pointer: coarse) is CSS</p>
</template>
<script setup>

</script>
```

### PDX_UNKNOWN_PROP

*warn* — A bound name the component does not declare as a prop.

The value lands on an element property nothing reads.

**Fix.** Use the declared prop — the hint names the closest one. The fix renames it when one declared prop is within 2 edits. `pdx check --fix` and the editor apply it.

### PDX_UNRESOLVED_COMPONENT

*warn* — A custom-element tag that no component package and no project component defines.

The custom element is never registered: it renders as an empty unknown element, with no console error. Component packages are the dependencies whose package.json declares `customElements` (@pdxui/ui and @pdxui/router among them); project components are the .pdx files under `src/`, `pages/` and `pdx({ components })`. The hint lists what was searched.

**Fix.** Check the spelling — when one known tag is within 2 edits the message names it, and the fix renames the tag; otherwise add the package that defines it to package.json, or import the module that registers it. `pdx check --fix` and the editor apply it.

### PDX_UNUSED_REACTIVE

*info* — A `$signal` or `$derived` that nothing reads.

Reactive state no template, effect or function reads costs a subscription and says nothing.

**Fix.** Remove it, or prefix it with `_` if it is kept on purpose.

### PDX_VIRTUAL_SHAPE

*error* — A `@for … @virtual` without the shape it needs: alone in a native element, with one root element per row.

The element written around a virtual `@for` is the scroll container, and the rows stay its own children between two spacers. Another child beside the `@for` would scroll with the rows and break their offsets; a component tag projects its children elsewhere; a row of two elements cannot be measured as one.

**Fix.** Write the `@for` as the only content of a native element, `<ul class="feed">@for (…) @virtual { <li>…</li> }</ul>`, with one root element in the body.

Instead of:

```html
<template>
  <ul><li>Header</li>@for (rows as r; track r.id) @virtual { <li>{{ r.name }}</li> }</ul>
</template>
<script setup>
let rows = $signal([]);
</script>
```

write:

```html
<template>
  <ul>@for (rows as r; track r.id) @virtual { <li>{{ r.name }}</li> }</ul>
</template>
<script setup>
let rows = $signal([]);
</script>
```

### PDX_VIRTUAL_TRANSITION

*error* — A `@for … @virtual` with `@transition`, `@stagger`, `@mode` or `@move`.

A virtual list adds and removes rows as they scroll in and out of view. A row that scrolls out is not leaving the list, and one that scrolls in is not arriving: an enter or exit animation, a stagger or a move would play on every scroll.

**Fix.** Remove the transition modifiers from the virtual `@for`, or remove `@virtual` to animate the whole list.

Instead of:

```html
<template>
  <ul>@for (rows as r; track r.id) @transition('fade') @virtual { <li>{{ r.name }}</li> }</ul>
</template>
<script setup>
let rows = $signal([]);
</script>
```

write:

```html
<template>
  <ul>@for (rows as r; track r.id) @virtual { <li>{{ r.name }}</li> }</ul>
</template>
<script setup>
let rows = $signal([]);
</script>
```

## Design questions

Heuristics for a review, and the rules that read several files at once. They ask; they do not decide.

### PDX_COLOUR_LITERAL

*warn* — A colour written as a value in a `.pdx` style (CD-C3).

A literal colour is right in one theme and wrong in the other twelve, and in dark mode.

**Fix.** Use a token: `var(--pdx-color-*)`, the `*-ink` colours for text, `*-soft` for tints.

### PDX_EFFECT_STATE

*warn* — State written by an effect from what the effect reads (CD-D2, a heuristic).

If the value follows from its sources it is a `$derived`, and the effect is a second copy that can lag behind.

**Fix.** Declare it with `$derived(…)`; keep effects for what leaves the component — storage, the URL, the DOM, a request.

### PDX_REPEATED_LOGIC

*warn* — The same logic written in the same shape in several files (CD-L1, `pdx check --design`).

A fix made in one copy does not reach the others.

**Fix.** Move it into one module the pages import, so a fix lands once.

### PDX_ROUTE_RENDERS

*warn* — A route that renders many structural blocks inline, none a component (CD-B2, a heuristic).

A route composes the pieces of its screen; carrying their markup makes it the place every change lands.

**Fix.** Move each block into a `.pdx` of its own and compose them in the route.

### PDX_SEVERAL_PIECES

*warn* — One script holds several groups of state that share nothing (CD-B1, a heuristic).

Each group is a piece with its own state — a component of its own. Kept together, they grow together.

**Fix.** Move each group, with its markup, into a `.pdx` beside this one; what joins them stays here.

### PDX_SHARED_LOADING

*warn* — The same endpoint loaded by a route and by a route inside it (CD-D1, a heuristic, `pdx check --design`).

Two requests, and two copies of the data that can disagree.

**Fix.** Load it once, at the outer route, and hand it down.

### PDX_SHARED_STYLES

*warn* — One stylesheet serves several of the pieces CD-B1 finds (CD-C1, a heuristic).

When the pieces become components, the rules that belong to each have to be found and moved.

**Fix.** Give each piece its own `<style scoped>`; keep here only what lays them out.

### PDX_VERSION_COUNTER

*warn* — A `$signal` only ever bumped, and read only to be discarded (CD-S3, a heuristic).

A counter that forces a re-read means the state it stands for should itself be a signal.

**Fix.** Give the state one reactive owner — a small module holding a signal — and read that.
