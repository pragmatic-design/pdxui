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

- **The file and the configuration.** One script grammar: `<script setup>`, `defineProps`,
  `defineEmits` and a top-level `return { … }` are removed (#158). An application's tags take the app
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
  - The constructor prop form is removed from `component()` (#300, below).
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

## Changes `pdx migrate` does not detect

- **A listener above a `@pdxui/ui` component.** Library events no longer bubble (#138). A listener on
  an ancestor, `<section @pdx-change>`, hears nothing: put it on the component itself.
- **The context's `ctx.slot()`.** A hand-written component reads its parent's snippet with
  `declaredSnippet(ctx, name, args)` (#131, #492).

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
