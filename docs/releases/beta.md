# PDX UI beta — release notes

The beta replaces the alpha. There is no compatibility level and no option that keeps an alpha form
compiling (decisions.md 36): each form the beta removes is an error, `PDX_REMOVED_FORM`, whose message
names the beta form. The language reference, [docs/language](../language/README.md), describes the
beta, and [migration.md](../language/migration.md) lists every alpha form that changed, its beta form,
and what `pdx migrate` does with it. These notes say what to do, and what `pdx migrate` cannot do for
you.

## Upgrading

1. Run `pdx migrate --dry` in the project. It reads `.pdx` files, scripts, `vite.config.*` and the HTML
   page that mounts the app, and lists each rewrite it would make and each place a person has to look
   at. Then run `pdx migrate` to write the rewrites. It is idempotent.
2. Rewrite by hand what it flagged. Each flag names the form and what replaces it.
3. Read the changes below that `pdx migrate` does not detect, and the runtime behaviour that changed.

A `changed` entry flags valid source whose meaning changed, and so it also fires on code that was
written for the beta. For example, `event-bubbles` adds `(bubbles)` to every `@event` so that an alpha
event keeps bubbling. Run `pdx migrate` once, on alpha code; after that, read its `changed` reports
instead of applying them.

## What changed, by area

Each area is a section of [migration.md](../language/migration.md), with every row and its issue:

- **The file and the configuration.** One script grammar (#158): `defineProps`, `defineEmits` and a
  top-level `return { … }` are removed (`PDX_REMOVED_FORM`), and `setup` on `<script>` means nothing
  (`PDX_SETUP_REDUNDANT`, info). An application's tags take the app
  prefix, `app-` by default, and `pdx-` is reserved for `@pdxui/*` (#136). `pdx({ inlineBindings })`
  selects nothing (#107).
- **Script.**
  - A `@prop` with no default is required; write `?` for an optional one (#130).
  - `$emit` is removed: an event is declared with `@event`, and dispatched by the function the
    declaration creates (#138).
  - `@provide`/`@inject` take tokens (#139).
  - The bus, the channel and the command helpers are removed (#144).
  - A script `@snippet` body is a template, so `${arg}` in it is text (#131).
- **The component contract and templates.**
  - Typed snippets replace scoped slots and template props (#131, #492).
  - A component's event does not bubble unless it is declared `@event(bubbles)` (#138).
  - The library's value components announce `<model>-change` with `{ value }` (#125).
  - One spelling per template form: `:ref`, `@show`, an object `:class` and `:style` (#129).
  - `::x` binds only a `@model` (#124).
  - `@expose` of a `$signal` or `$derived` is its value on the element: `ref.count`, not
    `ref.count()` (#752).
  - The constructor prop form is removed from `component()` (#300, below).
- **The library's components** take the beta contract (#286–#293, #512, #627–#633):
  - An overlay's verbs are `show()`, `close()`, `toggle()` and `isOpen`, its `open` a model
    announced by `open-change`.
  - A component's look is an attribute of its host, a variant axis (`<pdx-input size="sm">`), and
    its conditions are custom states (`:state(invalid)`); its pieces are parts (`[data-part="root"]`).
    The classes it wrote on its own elements — `.pdx-input-sm`, `.pdx-input-wrap.error`,
    `.pdx-primary` on pdx-button's inner button, `pdx-list-root` on pdx-list's host — are gone.
  - `pdx-button`'s toggle mode is `<pdx-toggle>`; `pdx-filter-builder`, `pdx-fieldset` and
    `pdx-field-group` announce models; `pdx-form-template`'s wizard is `next()`, `prev()`,
    `goTo(n)`; a `pdx-data-grid` column's `format` is shown as text.
  - Inside a native `<form>` every value component submits as a native control does (#135), which
    changes what a server receives: see below.
- **Data and routing.**
  - `@page` is the one home of every route field: `@route`, `@alias`, `@prefetch`, the script
    `@transition` and `@head` are removed (#277).
  - A loader is named, `@loader user: loadUser;`, and the untyped readers are removed (#146, #506).
  - The async vocabulary — `data()`, `error()`, `state()`, `pending()`, `stale()` — replaces the
    alpha names (#141).
  - `navigate()` takes a declared pattern, and a built URL goes to `navigate.url()` (#150).
- **Styles and themes.** A scoped style stops at nested components under `baseline-2026` (#152).
  `pdx migrate` flags a selector that reached inside a child, but it reads selectors, not the
  rendered page, so some of what it flags still applies. Check each one in the browser.

## The constructor prop form is removed from `component()` (#300)

A prop is declared with `prop<T>(default, { type? })`, `prop.required<T>()` or `prop.optional<T>()`,
and a model with `model<T>()`. `props: { label: { type: String, default: '' } }` written by hand is a
type error, and in development `component()` throws, naming the prop and the builder to use. The types
`PropDefinition` and `TypedProp` are removed; `PropMap` names a component's props. This is TypeScript,
not `.pdx`: `pdx migrate` does not rewrite it.

## Removed exports

An import of one of these in a `.pdx` script is `PDX_REMOVED_FORM`, naming the replacement; in a
`.ts` module it no longer resolves.

| Package | Export | Use instead | Issue |
|---|---|---|---|
| `@pdxui/core` | `tryInject` | `inject(token, host, undefined)` | #495 |
| `@pdxui/core` | `useProvided` | `inject(token, host)`, or `@inject` in a .pdx | #495 |
| `@pdxui/core` | `tryUseProvided` | `inject(token, host, undefined)`, or `@inject` in a .pdx | #495 |
| `@pdxui/core` | `requestContext` | `inject(token, host)`, which asks the context protocol too | #495 |
| `@pdxui/core` | `provideWritable` | `provide(token, signal, host)`: a provided signal is writable, and `inject(token, host)` returns it | #495 |
| `@pdxui/core` | `useWritable` | `inject(token, host)`, which returns the provided signal, or `@inject` in a .pdx | #495 |
| `@pdxui/core` | `tryUseWritable` | `inject(token, host, undefined)`, or `@inject` in a .pdx | #495 |
| `@pdxui/core` | `createBus` | a `@store` for state the whole app shares, or an `@event` the component dispatches for a message | #144 |
| `@pdxui/core` | `createChannel` | `@prop` / `@model` down and `@event` up between a parent and its child, or `@expose` + a typed ref for an order | #144 |
| `@pdxui/core` | `createCommands` | `@expose` + a typed ref (or `commandfor`) for a parent that orders its child | #144 |
| `@pdxui/core` | `createCompoundParent` | a token the parent provides with `@provide` and its children read with `@inject`, holding what they register in | #144 |
| `@pdxui/core` | `snippetOrSlot` | `declaredSnippet(ctx, name, args)`: a component reads its parent's snippet only | #492 |
| `@pdxui/core` | `renderSlot` | `@render name?.(args)` in a .pdx, or `renderSnippet(source, args, fallback)` | #492 |
| `@pdxui/core` | `slotCarrier` | `@snippet name(params) { … }` inside the component's tag, or set the snippet as the element's property | #492 |
| `@pdxui/core` | `PropDefinition`, `TypedProp` (types) | `prop<T>()` and its spec; `PropMap` for a component's props | #300 |
| `@pdxui/router` | `currentLoaderData` | the page's named loader, `user.data()`, or `loaderData('/pattern')` for a level by its pattern | #506 |
| `@pdxui/router` | `currentLoaderState` | the page's named loader, `user.state()`, or `loaderState('/pattern')` for a level by its pattern | #506 |
| `@pdxui/compiler` | `registerCompilerFormControl` | bind each control to its field, `::value="form.field"`: a control is no longer wired by its `name` | #613 |

Two options went with it, with no replacement: `pdx({ formControls })`, which registered into a
registry nothing read, and `compile()`'s `modelEventOf`. A `vite.config.ts` that still passes
`formControls` is a type error; a JavaScript config passes an option the plugin no longer reads.

## Changes `pdx migrate` does not detect

- **A listener above a `@pdxui/ui` component.** Library events no longer bubble (#138). A listener on
  an ancestor, `<section @value-change>`, hears nothing: put it on the component itself.
- **A selector on a library component's own classes in a global stylesheet or a theme** (#286–#293,
  #512, #627–#633). `pdx migrate` flags such a selector in a `<style scoped>` (`scoped-reaches-child`);
  it does not read `.css` files. The classes the components wrote on their own elements are gone —
  `.pdx-input-wrap.error`, `.pdx-input-sm`, `.pdx-primary` on pdx-button's inner button,
  `pdx-list-root` on pdx-list's host, the classes on pdx-data-grid's inner wrapper — and a selector
  on them matches nothing. Select the host's attribute, its state and its part:
  `pdx-input:state(invalid) [data-part="root"]`,
  `pdx-button[variant="primary"] > [data-part="root"]`. migration.md has a row per component.
  Native markup styled with the classes keeps them.
- **What a native `<form>` sends** (#135). A server that parsed the alpha's form entries reads
  something else now, with no error on either side:
  - a list is one entry per item under the name, not a JSON array, a comma-joined or a `start/end`
    string: `pdx-tag-input`, `pdx-checkbox-group`, a multiple `pdx-select` or `pdx-tree-select`,
    `pdx-transfer`, a range `pdx-date-picker`, a `pdx-cascader` path; a range `pdx-slider` sends the
    low and the high, not `"20,80"`;
  - an empty `pdx-otp-input`, `pdx-pin-input`, `pdx-masked-input` or `pdx-color-picker` sends an
    empty entry, as a text input does, where it sent none;
  - a picked `pdx-autocomplete` suggestion sends its value, not the label shown;
  - `pdx-inline-edit` sends text, numbers and booleans as they are, JSON only for an object, and
    nothing when it has no value;
  - `pdx-rich-text` and `pdx-json-editor` submit under their `name`; an empty `pdx-file-upload`
    sends what an empty file input does, one file with no name.

  The CHANGELOG entry has the detail.
- **A `pdx-data-grid` column's `format` that returns markup** is now shown as text (#292). Draw it
  with a typed cell renderer or the grid's `cell` snippet. `format` is a function of the script,
  which no rule reads.
- **`ref.count()` on an exposed `$signal` outside a `.pdx`** (#752). The value is a property now,
  `ref.count` and `ref.count = 5`. `pdx migrate` flags the call on the `:ref` of a project component
  in a `.pdx`; a `.ts` module that reaches the element is not read.
- **The context's `ctx.slot()`.** A hand-written component reads its parent's snippet with
  `declaredSnippet(ctx, name, args)` (#131, #492).
- **A stepper or a push drawer written with the design system's classes alone** (#891). The attribute
  moves to the element it styles. A connector after a done step carries the status itself,
  `<div class="pdx-step-connector" data-status="done">`, where `.pdx-step[data-status="done"] +
  .pdx-step-connector` coloured it from the step before. A push-mode backdrop carries `push`,
  `<div class="pdx-drawer-backdrop" push>`, where `.pdx-drawer[push] ~ .pdx-drawer-backdrop` found it
  from the panel. Without the attribute, the connector keeps the border colour and the backdrop dims
  the page. `pdx-wizard` and `pdx-drawer` set both themselves: nothing changes for an app that uses
  the components.
- **Whitespace at the edges of an element or a block** (#907). `<li> <b>x</b> </li>` renders
  `<li><b>x</b></li>`, and `@if (c) { <b>x</b> }` places no space around the `<b>`; the space between
  two nodes stays. An `inline-block` or inline element whose layout relied on a space at its parent's
  edge, or a test that reads `textContent` with those spaces, changes. Write `&nbsp;` where a space at
  an edge is meant. `<pre>`, `<textarea>` and `@raw` text are unchanged.

## Fixes `pdx migrate` only reports

Each of these changed because the alpha behaviour was a defect (#187, decisions.md 15). Nothing is an
error; `pdx migrate` lists the places where the old behaviour could have been relied on:

- **`x = (v) => …` on a `$signal`** stores the function. In the alpha it was called as an updater
  with the previous value. Flagged where an arrow function is assigned to a `$signal` that is not typed
  as a function (`signal-arrow-assignment`).
- **`handler ??= fn` (and `||=`, `&&=`) on a `$signal`** stores `fn`, and the short circuit stays.
  Flagged where the right side is a function (`signal-logical-assignment`).
- **`count.peek()`** reads the signal's own `peek`; **`onSave()`** with `onSave` a `$signal` reads it
  and then calls it. Neither form worked in the alpha, so there is nothing to rewrite.

## Runtime behaviour that changed

The execution contract of every asynchronous source (data.md, E1–E9, F1–F7) changes behaviour that code
may have relied on: `abort()` no longer leaves a source pending, a timeout is an `HttpTimeoutError`,
`error()` is `null` and is cleared only by a success, `PUT` and `DELETE` are no longer retried by
default, one key makes one request, and a submit never sends a value it did not validate. The table is
in [migration.md](../language/migration.md), «Runtime behaviour that changes with the execution
contract». Nothing in it is rewritten.

## Browser targets

`pdx({ target })` selects which platform features the compiled output relies on (decisions.md 16).

- **`'baseline-2026'` is the default.**
- **`'baseline-2024'`** is the support target for existing projects whose users run older browsers.
  - It is maintained frozen: fixed, not developed.
  - It is certified by a reduced run: Dim 1, the contract math, on the 13 themes.
  - It is retired when `@scope` is Baseline widely available, in September 2028.
- **Under `'baseline-2024'`, a scoped style still reaches inside child components.** This is the one
  difference in meaning between the two targets. The full table is in
  [file.md](../language/file.md#browser-targets).

## Diagnostics no longer reported

`PDX_LEGACY_IN_SETUP` and `PDX_TEMPLATE_NAME_NOT_PROVIDED` belonged to the legacy script mode, which is
removed (#158). They no longer occur. `PDX_INLINE_NODE_UNSUPPORTED` stays.
