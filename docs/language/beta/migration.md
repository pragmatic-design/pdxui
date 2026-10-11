# Migration: alpha → beta

Every alpha form that the beta changes or removes.

- A **language change** is an error, `PDX_REMOVED_FORM`, naming the beta form; there is no alpha
  level to keep it compiling (decisions.md 36).
- A **fix** changes behaviour, because the alpha behaviour was a defect (#187).
- A **target change** depends on `pdx({ target })` (#152, #156).

«Mechanical» means `pdx migrate` rewrites it; «flagged» means it reports the location and the beta
form and a person rewrites it; «behaviour» means the source stays valid but its meaning changes.
The column **Source** says who specifies the migration: the issue, or this specification (†), whose
proposals the implementing issue may change.

## The file and the configuration

| Alpha | Beta | `pdx migrate` | Source |
|---|---|---|---|
| `<script setup>` | `<script>` | mechanical | #158 |
| `defineProps({ x: { type: String, default: 'a' } })` | `@prop x: string = 'a';` | mechanical | #158 |
| `defineEmits(['e'])` | `@event e: unknown;` | mechanical | #158 |
| a top-level `return { … }` | removed: every top-level name reaches the template | mechanical | #158 |
| a legacy form `pdx migrate` cannot convert | — | flagged | #158 |
| application tag `pdx-<file>` | `app-<file>` (or `pdx({ prefix })`) | mechanical in templates, app CSS and `@tag`; flagged inside strings | #136 |
| `pdx({ inlineBindings })` | removed | `PDX_INLINE_BINDINGS_IGNORED`; flagged | #107 (flagging †) |
| `:scope` in a scoped block under `target: 'baseline-2024'` | the host, as under `'baseline-2026'` | **target change**: nothing to rewrite | † (decision 20) |

## Script

| Alpha | Beta | `pdx migrate` | Source |
|---|---|---|---|
| `@prop x: T;` (optional, `undefined`) | `@prop x?: T;` — without `?` it is required | mechanical: adds `?` to every `@prop` without a default | #130 |
| `$emit('saved', v)` | `saved(v)`, with `@event saved: …;` | mechanical; adds `@event saved: unknown;` when missing | #138 |
| `@event saved: T;` (bubbles) | `@event(bubbles) saved: T;` keeps that; `@event saved` no longer bubbles | mechanical: adds `(bubbles)` to every existing `@event`; `PDX_EVENT_BUBBLES_UNUSED` lists the removable ones | #138 |
| `@provide user = v;` / `@inject user;` / `@inject user as me;` | `@provide User = v;` / `@inject user from User;` / `@inject me from User;` | mechanical: generates `contexts.ts`, one token per key | #139 |
| `useProvided`, `tryUseProvided`, `tryInject`, `requestContext`, `provideWritable`, `useWritable`, `tryUseWritable` | `inject(token, host, default?)`, `@inject` | flagged | #139 |
| `createBus`, `createChannel`, `createCommands` | `@store`, `@provide`/`@inject`, `@expose` + refs | flagged | #144 |
| `x = (v) => …` on a `$signal`, meaning «update from the previous value» | `x = …` stores the function; write the update (`x = x + 1`, `x++`) | **fix**, behaviour: flagged where an arrow function is assigned to a `$signal` not typed as a function | #187 (flagging †) |
| `count.peek()` read the value's `peek` | the signal's own `peek` | fix (the alpha form was broken) | #187 |
| `handler ??= fn` (and `\|\|=`, `&&=`) on a `$signal`, which called `fn` as an updater | stores `fn`, short circuit kept | **fix**, behaviour: flagged where the right side is a function | #187 (logical assignment †) |
| `onSave()` with `onSave` a `$signal` (named nothing in alpha) | read, then called: `__onSave()()` | **fix**, nothing to rewrite | † (decision 17) |
| `@mixin './x.ts' as name` | `const name = useX();` — an imported function | flagged (the module's `setup(ctx)` signature changes) | † (decision 6) |
| a script `@snippet` body with `${arg}` | the body is a template: `{{ arg }}` | mechanical | † (decision 9) |
| a rune outside its position (`$signal` in a function body) | `PDX_RUNE_POSITION`; the core function (`signal()`) | flagged | † (decision 12) |

## Component contract and templates

| Alpha | Beta | `pdx migrate` | Source |
|---|---|---|---|
| `::x` on a component prop that is not two-way | `@model x` in the child | flagged (the child is another file, maybe another package) | #124 (flagging †) |
| `@await (x as T)`, where `as T` was a TypeScript assertion (alpha has no `as` binding) | `@await ((x as T))`: in the beta a trailing `as Name` binds the value | mechanical: parenthesises every `@await` whose expression ends in `as <Identifier>` | † (decision 18) |
| `:style.color="c"`, `:style.--accent="c"` | `:style="{ color: c, '--accent': c }"` | mechanical (merged into an existing object) | † (decision 5) |
| `{{ price \| money }}` (a single pipe) | still valid; `PDX_PIPE_SINGLE` (info) suggests `{{ money(price) }}`; chains of two or more stay | mechanical, optional | † (decision 4) |
| `@pdx-change="…"` on a library value component | `@<model>-change="…"` — `@checked-change` on `pdx-checkbox` and `pdx-switch`, `@pressed-change` on `pdx-toggle`, `@value-change` on the others — **with the payload converted**: each `$event.detail.<field>` / `e.detail.<field>` read is rewritten through the component's mapping in the manifest (on `pdx-checkbox`: `detail.checked` → `detail.value`; `detail.value`, the choice identifier → `$event.currentTarget.value`; `detail.indeterminate` → `$event.currentTarget.indeterminate`) | mechanical only when the handler is written inline and every `detail` read in it has a mapping; **flagged** when the handler is a reference to a script function, passes `detail` or the event on, or reads a field with no mapping | #125 (payload conversion †) |
| `@change`, `@valuechange`, `@pressedchange`, `@pdx-pressed-change` on a library value component | the model's change event | flagged | #125 |
| `::value.number` writes `0` for empty or invalid | writes `null` for empty; leaves the value and marks invalid otherwise | behaviour: flagged on every `.number` binding | #126 (flagging †) |
| `:class.active="c"` | `:class="{ active: c }"` | mechanical (merged into an existing object) | #129 |
| `ref="el"` | `:ref="el"` | mechanical | #129 |
| `:show="c"` on an element | `@show (c) { <element> }` | mechanical | #129 |
| child `<slot name="row" :item="it">fallback</slot>` | `@slot row?: (item: T);` + `@render row?.(it) @else { fallback }` — optional, as every alpha slot is, with its fallback kept | mechanical | #131 (optional + fallback †) |
| child `<slot name="row" :item="it"></slot>` (no fallback) | `@slot row?: (item: T);` + `@render row?.(it)` | mechanical | #131 (†) |
| parent `<slot name="row" let:item>…</slot>` / `@slot(row, { item }) { … }` | `@snippet row(item) { … }` inside the tag | mechanical | #131 |
| template props (`:item-template="fn"`) on library components | `@snippet item(o) { … }` | flagged | #131 (flagging †) |
| `component(tag, { props: { x: { type: String } } })` (TypeScript) | the typed descriptor | manual (library work) | #123 |
| `@await (…) { maxMs: n }` renders the body when `n` passes | `@error` with an `AwaitTimeoutError` when `n` passes; the body only with a result | behaviour: flagged on every `maxMs` | † (decision 26) |
| `@defer (anything)` — an unknown trigger fires at once | `PDX_DEFER_UNKNOWN_TRIGGER` | flagged; `immediate` suggested when that is what it did | † (decision 27) |

## Data and routing

| Alpha | Beta | `pdx migrate` | Source |
|---|---|---|---|
| `@route { path, guard, loader, … }` | `@page` with its options, plus `@guard`, `@loader`, … one per line | mechanical | † (decision 1) |
| `@alias '/people'` | a further `@page` path: `@page '/users', '/people'` | mechanical | † (decision 2) |
| `@head { title, meta: [...] }` | `@title` and `@meta` lines | mechanical | † (decision 3) |
| `@transition 'fade';` in the script | `@page '/x' { transition: 'fade' }` | mechanical | † (decision 7) |
| `@meta { requiresAuth: true }` (route data) | `@page '/x' { meta: { requiresAuth: true } }` | mechanical | † (decision 8) |
| `@defer (hover)` | `@defer (interaction)` — the same trigger | mechanical | † (decision 37) |
| `@prefetch 'hover';` | `@page '/x' { prefetch: 'hover' }` | mechanical | † (decision 19) |
| a form field named like a form member (`valid`, `reset`, …) | another name | `PDX_FORM_FIELD_RESERVED`; flagged | † (decision 13) |
| `x.isPending()` | `x.pending()` | mechanical | #141 |
| `x.loading()`, `x.status()`, `x.isLoading()`, `state()` values `loading`/`reloading`/`stale`/`local` | the async vocabulary (`x.loading()` is `x.state() === 'pending' && !x.data()`) | flagged | #141 |
| a control with `name="x"` inside `<pdx-form :form="f">` | `::<model>="f.x"`, the model read from the control's manifest: `::checked` on `pdx-checkbox`/`pdx-switch`, `::pressed` on `pdx-toggle`, `::value` on the others and on native inputs (`checked` for a native checkbox or radio) | mechanical; **flagged** for a control with no manifest entry or more than one model | #128 (model selection †) |
| `<pdx-form-field name="email">` | `<pdx-form-field :field="f.email">` | mechanical | #128 |
| `f.fields.email` | `f.email` | mechanical | #128 (rewrite †; see decision 13) |
| `required` on a bound control | a rule in the schema | `PDX_FORM_REQUIRED_IN_MARKUP`; flagged | #128 |
| `@loader loadUser;` + `currentLoaderData()` | `@loader loadUser: loadUser;` + `loadUser.data()` | mechanical; reports the rename | #146 |
| `currentLoaderState()` | `<name>.state()` | mechanical where the page has one loader; flagged otherwise | #141, #146 (†) |
| a loader reading params from `location` or `currentParams()` | `({ params, signal })` | flagged | #146 (†) |
| `navigate('/users/42')` | `navigate.url('/users/42')`, or `navigate('/users/:id', { id: 42 })` | mechanical to `navigate.url` | #150 |
| `@store x { persist: 'other' }` | `'local'` or `'session'` | flagged | † (decision 14) |

**Runtime behaviour that changes with the execution contract** (data.md E1–E9, F1–F7). These are
runtime fixes, not syntax: they apply when they land, and `pdx migrate`
has nothing to rewrite. They are listed because code may rely on the old behaviour.

| Before | After | Who notices | Source |
|---|---|---|---|
| `abort()` leaves the source pending | back to its last settled state | code that waited for a pending source after aborting it | † E3 |
| a transport timeout is an `AbortError` | an `HttpTimeoutError`, shown by `error()` | a `catch` that tested `AbortError` for timeouts | † E3 |
| a failed refresh is `state() === 'stale'` | `'error'`, data kept | code comparing to `'stale'` (already a #141 alias) | #141, E4 |
| `error()` is `undefined` when there is none, cleared when a request starts | `null`, cleared only by a success | strict comparisons with `undefined` | #141, † E3 |
| `PUT` / `DELETE` retried by the transport by default | retried only when the request asks | an app that relied on the retry | † E6 |
| `useQuery` retry on top of the transport's | the source's retry only | fewer attempts against a flaky endpoint | † E6 |
| two consumers of one key, two requests | one shared request | a test that counted requests | † E7 |
| a fetcher resolving `undefined` | a development warning | — | † E5 |
| submit sends a value changed during its validation | the submit returns invalid | a form submitted while typing | † F4 |

## Styles and themes

| Alpha | Beta | `pdx migrate` | Source |
|---|---|---|---|
| a scoped rule that styled a child component's inside | `[data-part]`, `:state()` or the child's tokens | **target change** under `baseline-2026`; flagged where a scoped selector matches inside a component tag of the same template | #152 (flagging †) |
| variant props mapped to classes by hand | `@variants` + `@variant` | manual (library work) | #153 |
| theme overrides with the hand-written nested-theme guard | `@pdx-theme <name> { … }` | design build migration, output byte-compared | #155 |
| behaviour attributes synced by `setTheme` | custom properties read with style queries | **target change**, no source change for an app | #156 |
| an inline `--pdx-density-factor` set beside `pdx-density` | `pdx-density` alone | a fix of the design package (#157), not a language change; an app's inline override keeps working | #157 |
