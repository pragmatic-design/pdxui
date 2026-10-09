---
title: Diagnostics
description: "Every PDX_* code the compiler, pdx check and the editor report: what it means and what to write instead. Generated from the catalog."
order: 25
---

# Diagnostics

Every finding the compiler, `pdx check` and the editor report carries a `PDX_*` code — 64 of them. Each is listed here with what it means and what to write instead, generated from the catalog in `packages/compiler/src/diagnostics/`. From a terminal, `pdx explain <CODE>` prints the same entry; `--json` prints it for an agent. A finding in `pdx check --json` links its entry with `url`.

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
  <p>{{ users.value() }}</p>
</template>
<script setup>
@fetch users: 'GET /api/users' as string[];
</script>
```

write:

```html
<template>
  @if (users.state() === 'error') { <p>Could not load</p> } <p>{{ users.value() }}</p>
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

### PDX_GLOBAL_SELECTOR

*warn* — `:global()` in a style.

`:global()` is not CSS, and the browser drops the whole rule. A scoped style already reaches the descendants a child component renders.

**Fix.** Remove the wrapper: `:global(.x) .y` → `.x .y`.

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

### PDX_INLINE_NODE_UNSUPPORTED

*warn* — A template node the inline render path cannot compile.

The node would be left out of the production render. The warning makes a missing feature visible instead of silent.

**Fix.** Build with `pdx({ inlineBindings: false })`, and report the node type.

### PDX_INVALID_ENUM_VALUE

*warn* — A static or literal attribute value (`size="huge"`, `:size="'huge'"`) outside the values its prop declares.

A component receives a value its type does not admit and falls back to its default, silently.

**Fix.** Use one of the allowed values the hint lists.

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

**Fix.** Emit the new value with an `@event`; for a starting value, copy it into a `$signal`.

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

### PDX_REWRITE_FALLBACK

*warn* — A fragment of the setup the signal rewriter could not parse.

The fragment is kept as written, so a signal read inside it is not called and is not reactive.

**Fix.** Fix the syntax, or move the fragment out of the setup body.

### PDX_SCRIPT_SYNTAX_ERROR

*error* — The `<script setup>` does not parse.

A syntax error in the setup would reach the generated module as broken code. It is reported with its position in the script.

**Fix.** Fix the syntax at the reported line.

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

### PDX_TS

*error* — A TypeScript error in the script or a template expression (`pdx check --types`).

The type-check the editor shows, run headless: the script and every template expression are checked with the runes typed as their values, and the TypeScript code is in `tsCode`. The compiler builds the file anyway; this is the error the editor underlines.

**Fix.** Fix the type the message names — the finding is at its line in the .pdx.

### PDX_TS_UNSUPPORTED

*error* — TypeScript in a `.pdx` script that has a runtime of its own: an enum, a namespace, a parameter property, `import = require()`.

The compiler erases a script's TypeScript, types only, keeping every position. These constructs are not types: an `enum` and a `namespace` create objects, a parameter property assigns a field, `import =` loads a module. There is no erasure that keeps what they do, and the compile stops at them instead of shipping code the browser rejects.

**Fix.** Write it as JavaScript: a frozen object for an enum (`const Color = Object.freeze({ Red: 0 })`), a module for a namespace, an assignment in the constructor for a parameter property, an `import` for `import =`.

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

*error* — A known `@` declaration written in a shape the compiler does not recognise.

The line is dropped and nothing is generated for it; left in the body it would make the module unparseable.

**Fix.** Write it in the shape the hint shows for that keyword.

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
