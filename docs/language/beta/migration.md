# Migration: alpha → beta

Every alpha form that the beta changes or removes.

- A **language change** is an error, `PDX_REMOVED_FORM`, naming the beta form; there is no alpha
  level to keep it compiling (decisions.md 36).
- A **fix** changes behaviour, because the alpha behaviour was a defect (#187).
- A **target change** depends on `pdx({ target })` (#152, #156).

«Mechanical» means `pdx migrate` rewrites it; «flagged» means it reports the location and the beta
form and a person rewrites it; «behaviour» means the source stays valid but its meaning changes —
the compiler is silent there, and `pdx migrate` rewrites or flags it (#121 registers these as
`changed` entries).
The column **Source** says who specifies the migration: the issue, or this specification (†), whose
proposals the implementing issue may change.

## The file and the configuration

| Alpha | Beta | `pdx migrate` | Source |
|---|---|---|---|
| `<script setup>` | `<script>` | mechanical (landed: `script-setup`; a script without legacy markers already reads the same under both, and the repository's `.pdx` files are converted) | #158 |
| `defineProps({ x: { type: String, default: 'a' } })` | `@prop x: string = 'a';` | mechanical (landed: `legacy-script`; a prop with no default becomes `T \| undefined = undefined`, as optional as it was) | #158 |
| `defineEmits(['e'])` | `@event e: unknown;` | mechanical (landed: the alpha accepted `defineEmits()` and `defineEmits<{ e: T }>()`, which become `@event e: unknown;` / `@event e: T;`, and `emit('e', x)` becomes `e(x)`) | #158 |
| a top-level `return { … }` | removed: every top-level name reaches the template | mechanical (landed, when every entry is a plain name) | #158 |
| a legacy form `pdx migrate` cannot convert | — | flagged (landed) | #158 |
| application tag `pdx-<file>` | `app-<file>` (or `pdx({ prefix })`) | mechanical in templates, app CSS and `@tag`; flagged inside strings — landed: `app-prefix`, `app-prefix-string` | #136 |
| `pdx({ inlineBindings })` | removed | `PDX_INLINE_BINDINGS_IGNORED`; flagged | #107 (flagging †) |
| `:scope` in a scoped block under `target: 'baseline-2024'` | the host, as under `'baseline-2026'` | **target change**: nothing to rewrite | † (decision 20) |

## Script

| Alpha | Beta | `pdx migrate` | Source |
|---|---|---|---|
| `@prop x: T;` (optional, its type's empty value) | `@prop x?: T;` — without `?` it is required | mechanical: adds `?` to every `@prop` without a default — landed: `prop-required` | #130 |
| `$emit('saved', v)` | `saved(v)`, with `@event saved: …;` | mechanical; adds `@event saved: unknown;` when missing (and `(bubbles)`, as `$emit` bubbled); a hyphenated name is flagged — landed: `emit-removed` | #138 |
| `@event saved: T;` (bubbles) | `@event(bubbles) saved: T;` keeps that; `@event saved` no longer bubbles | mechanical: adds `(bubbles)` to every existing `@event`; `PDX_EVENT_BUBBLES_UNUSED` lists the removable ones — landed: `event-bubbles` | #138 |
| a listener above a `@pdxui/ui` component (`<section @pdx-change>`) | the listener on the component itself | not detected: library events no longer bubble (#138), listed in the release notes | #138 |
| `@provide user = v;` / `@inject user;` / `@inject user as me;` | `@provide User = v;` / `@inject user from User;` / `@inject me from User;` | mechanical: generates `contexts.ts`, one token per key, and maps the library's keys to its tokens (`errorContext` → `ErrorContext`) — landed: `context-string-provide`, `context-string-inject`, `context-tokens` | #139 (landed, #497) |
| `useProvided`, `tryUseProvided`, `tryInject`, `requestContext`, `provideWritable`, `useWritable`, `tryUseWritable` | `inject(token, host, default?)`, `@inject` | flagged | #139 (landed, #495) |
| `createBus`, `createChannel`, `createCommands`, `createCompoundParent` | `@store`, `@provide`/`@inject`, `@expose` + refs | flagged | #144 (landed) |
| `x = (v) => …` on a `$signal`, meaning «update from the previous value» | `x = …` stores the function; write the update (`x = x + 1`, `x++`) | **fix**, behaviour: flagged where an arrow function is assigned to a `$signal` not typed as a function | #187 (flagging †) |
| `count.peek()` read the value's `peek` | the signal's own `peek` | fix (the alpha form was broken) | #187 |
| `handler ??= fn` (and `\|\|=`, `&&=`) on a `$signal`, which called `fn` as an updater | stores `fn`, short circuit kept | **fix**, behaviour: flagged where the right side is a function | #187 (logical assignment †) |
| `onSave()` with `onSave` a `$signal` (named nothing in alpha) | read, then called: `__onSave()()` | **fix**, nothing to rewrite | † (decision 17) |
| `@mixin './x.ts' as name` | `const name = useX();` — an imported function | flagged (landed: `mixin-removed`; the module's `setup(ctx)` signature changes) | #158 (decision 6) |
| a script `@snippet` body with `${arg}` | the body is a template: `{{ arg }}` | mechanical | † (decision 9) |
| a rune outside its position (`$signal` in a function body) | `PDX_RUNE_POSITION`; the core function (`signal()`) | flagged — landed: `rune-position` | #278 (decision 12) |

## Component contract and templates

| Alpha | Beta | `pdx migrate` | Source |
|---|---|---|---|
| `::x` on a component prop that is not two-way | `@model x` in the child | flagged (the child is another file, maybe another package) — landed: `two-way-not-model` | #124 (flagging †) |
| `@await (x as T)`, where `as T` was a TypeScript assertion (alpha has no `as` binding) | `@await ((x as T))`: in the beta a trailing `as Name` binds the value | mechanical: parenthesises every `@await` whose expression ends in `as <Identifier>` where the identifier is a type — a primitive, or a name the file declares as a type or imports with a capital — so a beta binding is left alone and a second run changes nothing — landed: `await-as-assertion` | #145 (decision 18) |
| `<pdx-pin-input>` | `<pdx-otp-input mask length="4">` — pin-input defaulted to 4 cells, otp-input to 6; every other attribute, binding and handler is carried over, an explicit `length` or `:length` too; `numeric` is not written, its default is `true` in both. With `mask`, otp-input takes pin-input's other two defaults: `autocomplete="off"` and the group name `otp-input.maskedLabel`, «PIN» | mechanical — landed: `pin-input-removed` | #286 (decision 48) |
| an override of the `pin-input` component strings (`setComponentStrings('pin-input', …)`, a `'pin-input'` key in `setLocaleStrings`) | the `otp-input` strings, key `maskedLabel` | flagged — landed: `pin-input-strings`, not an error: the override is valid code that names nothing | #286 |
| `<pdx-otp-input mask>` with no `label` or no `autocomplete` | the PIN defaults above (`off`, «PIN»), where it had `one-time-code` and «Verification code»; set them to keep the old ones | flagged — landed: `otp-input-mask-defaults` | #286 |
| a selector on the frame classes of `pdx-input`, `pdx-textarea`, `pdx-password-input`, `pdx-search-input`, `pdx-masked-input` or `pdx-number-input` — `pdx-input .pdx-input-wrap.error` (and `.success`, `.warning`, `.disabled`, `.readonly`), `.pdx-input-count.over`, the number input's `.pdx-number-group.disabled`, `.pdx-number-negative`, `.pdx-number-positive`, or an inner class as `.pdx-input-wrap`, `input.pdx-input`, `textarea.pdx-input`, `.pdx-number-group` | the host's custom states and its parts: `pdx-input:state(invalid) [data-part="root"]` (and `success`, `warning`, `disabled`, `readonly`, `loading`, whichever the component declares), `:state(over-limit) [data-part="count"]`, `pdx-number-input:state(negative) [data-part="field"]` (and `positive`); `[data-part="root"]`, `[data-part="input"]`, and the number input's `[data-part="field"]`. A native field keeps the classes: only the components stopped writing them. `pdx-textarea`, `pdx-password-input` and `pdx-number-input` mark `aria-busy` on the textbox while `loading`, no longer on the host | flagged in a `<style scoped>` — landed: `scoped-reaches-child` (#152) names any selector that descends into a component; a global stylesheet is not read | #286 |
| a selector on `pdx-otp-input`'s state classes — `pdx-otp-input .pdx-otp-wrap.error`, `.pdx-otp-wrap.disabled` | the host's custom states and its parts: `pdx-otp-input:state(invalid) [data-part="cell"]`, `:state(disabled)`; `[data-part="root"]`, `[data-part="cell"]`, `[data-part="separator"]`. With `error` each cell is `aria-invalid`. A native `.pdx-otp-wrap.error` keeps the class | flagged in a `<style scoped>` — landed: `scoped-reaches-child` (#152) | #286 |
| a selector on `pdx-tag-input`'s state classes — `pdx-tag-input .pdx-tag-input.error` (and `.success`, `.warning`, `.disabled`, `.readonly`) — or its `aria-busy` read on the host | the host's custom states and its parts: `pdx-tag-input:state(invalid) [data-part="root"]` (and `success`, `warning`, `disabled`, `readonly`, `loading`); `[data-part="root"]`, `[data-part="input"]`, `[data-part="tag"]`, `[data-part="remove"]`. While `loading` the group is `aria-busy`, no longer the host; with `error` the text box is `aria-invalid`. A native `.pdx-tag-input.disabled` keeps the class | flagged in a `<style scoped>` — landed: `scoped-reaches-child` (#152) | #286 |
| a selector on `pdx-inline-edit`'s state classes — `pdx-inline-edit .pdx-inline-edit.editing` (and `.disabled`, `.readonly`) | the host's custom states and its parts: `pdx-inline-edit:state(editing)` (and `disabled`, `readonly`); `[data-part="root"]`, `[data-part="display"]`, `[data-part="editor"]`, `[data-part="save"]`, `[data-part="cancel"]`. A native `.pdx-inline-edit.editing` keeps the class | flagged in a `<style scoped>` — landed: `scoped-reaches-child` (#152) | #286 |
| a listener on an ancestor for `pdx-rich-text`'s `pdx-focus`, `pdx-blur` or `pdx-ready`, or a selector on its `.pdx-rt-readonly` class | the listener on the element itself: the three events are declared and no longer bubble (#138); `pdx-rich-text:state(readonly)`, and the parts `[data-part="toolbar"]`, `[data-part="field"]`, `[data-part="input"]`. The read-only textbox is `aria-readonly` | flagged — a listener on an ancestor is not found by the compiler; a selector in a `<style scoped>` by `scoped-reaches-child` (#152) | #286 |
| a test or style that reaches `pdx-json-editor`'s fields by their classes (`.jfld`, `.jcomplex`, `.jed-box`), or that expects a `pdx-form-field`'s label to name the editor's first sub-field | the parts `[data-part="entry"]`, `[data-part="branch"]`, `[data-part="dialog"]`; the editor is a `role="group"`, named by the field's label or its schema's `label` | flagged in a `<style scoped>` — landed: `scoped-reaches-child` (#152) | #286 |
| a selector on the state classes of `pdx-checkbox`, `pdx-radio` or `pdx-switch` — `.pdx-checkbox-error`, `.pdx-radio-error`, `.pdx-toggle-error`, `.pdx-toggle-loading` on the control, `.disabled` on its `-wrap` | the host's custom states: `:state(checked)`, `:state(invalid)`, `:state(disabled)`, and `:state(indeterminate)` on the checkbox, `:state(loading)` on the switch; the parts `[data-part="root"]` (the native control, as before), `[data-part="label"]`, `[data-part="description"]`. A native `.pdx-checkbox-error` keeps the class. pdx-switch is now `aria-invalid` with `error` and `aria-busy` while `loading` | flagged in a `<style scoped>` — landed: `scoped-reaches-child` (#152) | #286 |
| a selector on `pdx-radio-group`'s or `pdx-checkbox-group`'s `horizontal` class | `[orientation="horizontal"]` on the host, a variant axis; and `:state(invalid)`, `:state(disabled)`. The hosts keep the `pdx-choice-group` class | flagged in a `<style scoped>` — landed: `scoped-reaches-child` (#152) | #286 |
| a selector on the classes `pdx-toggle` wrote on its button — `.pdx-toggle-on`, or `.pdx-outline`, `.pdx-ghost`, `.pdx-solid` next to `.pdx-toggle-btn` | `pdx-toggle[variant="ghost"]` (and `outline`, `solid`), a variant axis reflected on the host; `:state(pressed)`, `:state(disabled)`; the button is `[data-part="root"]`, `[aria-pressed="true"]` when pressed. A native `.pdx-toggle-btn.pdx-ghost` keeps the class; `.pdx-toggle-on` is gone, the pressed look keys by `aria-pressed` | flagged in a `<style scoped>` — landed: `scoped-reaches-child` (#152) | #286 |
| a selector on `pdx-segmented`'s `.pdx-segmented-vertical` class, or on its inner classes `.pdx-segmented`, `.pdx-segmented-item` | `[orientation="vertical"]` on the host, a variant axis; `:state(disabled)`; the parts `[data-part="root"]` (the radiogroup) and `[data-part="item"]` (a segment). A native `.pdx-segmented-vertical` keeps the class | flagged in a `<style scoped>` — landed: `scoped-reaches-child` (#152) | #286 |
| a selector on `pdx-toggle-group`'s inner `.pdx-toggle-group` element or its `.pdx-toggle-group-vertical` class, or a read of its `aria-orientation` | the host is the group: it carries the `pdx-toggle-group` class, `role="group"` and `aria-disabled`; `[orientation="vertical"]` on the host, a variant axis; `:state(disabled)`. No `aria-orientation`: a `group` may not carry it | flagged in a `<style scoped>` — landed: `scoped-reaches-child` (#152) | #286 |
| `<pdx-button toggle :pressed="p">` | `<pdx-toggle variant="solid" ::pressed="p">` (an explicit outline or ghost variant is kept) | mechanical | † (decisions 49, 53) |
| `<pdx-button-group mode="multiple">` or `mode="single"`, its `value` and `@pdx-change` | `<pdx-toggle-group type="multiple">` or `type="single"`, with `pdx-toggle` items: each keeps its `value` or takes its text as one; the group's `variant` stays when outline or ghost, any other is `solid` (decision 53); `@pdx-change` is `@value-change`, whose detail is `{ value }` where it was the value itself. A single toggle group is the same radio group, but a click on the checked toggle clears the value, which `mode="single"` did not. `mode="none"` is dropped | mechanical where every child is a plain button holding text and the handler is inline; flagged otherwise, each finding saying why — landed: `button-group-modes` (#286) | #286 (decision 51) |
| `<pdx-relative-time style="short">` | `<pdx-relative-time format-style="short">`: a prop `style` replaced the element's own | mechanical for `long`, `short`, `narrow`; any other `style` is an inline style — landed: `relative-time-style` | #545 |
| `@pdx-open` / `@pdx-close` on an overlay | `@open-change` (`$event.detail.value`) | mechanical | † (decision 50) |
| overlay `hide()`, dropdown-menu/fab/context-menu `open()`; wizard `goNext()`/`goPrev()`/`goto()`, carousel `goto()`, pagination `goto()` | `close()`, `show()`; `next()`/`prev()`/`goTo(n)` | mechanical in templates and `:ref` calls; flagged elsewhere | † (decision 50) |
| `:style.color="c"`, `:style.--accent="c"` | `:style="{ color: c, '--accent': c }"` | mechanical (merged into an existing object) — landed: `style-dot` | #129 (decision 5) |
| `{{ price \| money }}` (a single pipe) | still valid; `PDX_PIPE_SINGLE` (info) suggests `{{ money(price) }}`; chains of two or more stay | a fix offered by the diagnostic (`pdx check --fix`), not by `pdx migrate` — landed | #129 (decision 4) |
| `@pdx-change="…"` on a library value component | `@<model>-change="…"` — `@checked-change` on `pdx-checkbox` and `pdx-switch`, `@pressed-change` on `pdx-toggle`, `@value-change` on the others — **with the payload converted**: each `$event.detail.<field>` / `e.detail.<field>` read is rewritten through the component's mapping in the manifest (on `pdx-checkbox`: `detail.checked` → `detail.value`; `detail.value`, the choice identifier → `$event.currentTarget.value`; `detail.indeterminate` → `$event.currentTarget.indeterminate`) | mechanical only when the handler is written inline and every `detail` read in it has a mapping; **flagged** when the handler is a reference to a script function, passes `detail` or the event on, or reads a field with no mapping — the tooling landed: `alpha-change-event` (#478), driven by each component's `alphaEvents` / `alphaDetail` in the manifest, so a component switches over when its batch of #125 records them. **Landed for the choice controls** (#480): `pdx-checkbox` (`checked`, and `indeterminate`), `pdx-switch`, `pdx-radio` (`checked`), `pdx-toggle` (`pressed`), `pdx-radio-group`, `pdx-checkbox-group`, `pdx-segmented`, `pdx-rating`, `pdx-slider` (`value`), and later `pdx-toggle-group` (`value`, #286: its `pdx-change` and `valuechange`, whose `detail.values` is `$event.detail.value.split(',').filter(Boolean)`); **and for the editors and the upload** (#482): `pdx-rich-text`, `pdx-json-editor`, `pdx-inline-edit`, `pdx-file-upload` (`value`); **and for the text fields** (#479): `pdx-input`, `pdx-textarea`, `pdx-number-input`, `pdx-password-input`, `pdx-search-input`, `pdx-masked-input`, `pdx-otp-input` (`value`) — there `@pdx-input` becomes `@value-change` and the commit, `@pdx-change`, becomes `@change`, the inner input's native event (`alphaCommit` in the manifest); **and for the pickers** (#481): `pdx-select`, `pdx-autocomplete`, `pdx-cascader`, `pdx-tree-select`, `pdx-transfer`, `pdx-tag-input`, `pdx-mention`, `pdx-date-picker`, `pdx-time-picker`, `pdx-calendar`, `pdx-color-picker` (`value`, the mode's whole value: `[start, end]` for a range) — on `pdx-autocomplete` and `pdx-tag-input` `@pdx-input`, the query and the draft, becomes the declared `@query-change` and `@draft-change` (`alphaRename` in the manifest), and on `pdx-color-picker` and `pdx-mention` the commit becomes `@change` | #125 (payload conversion †) |
| `@change`, `@valuechange`, `@pressedchange`, `@pdx-pressed-change` on a library value component | the model's change event | flagged — the tooling landed for `@change`: `alpha-change-listener` (#478), not an error, since a native `change` from an inner input still reaches the host; the other names are `alpha-change-event` where the manifest lists them | #125 |
| `::value.number` writes `0` for empty or invalid | writes `null` for empty; leaves the value and marks invalid otherwise | behaviour: flagged on every `.number` binding — landed: `two-way-number` | #126 (flagging †) |
| `:class.active="c"` | `:class="{ active: c }"` | mechanical (merged into an existing object; joined to a string `:class`) — landed: `class-dot` | #129 |
| `ref="el"` | `:ref="el"` | mechanical — landed: `ref-attribute` | #129 |
| `:show="c"` on an element | `@show (c) { <element> }` | mechanical — landed: `show-attribute` | #129 |
| child `<slot name="row" :item="it">fallback</slot>` | `@slot row?: (item: T);` + `@render row?.(it) @else { fallback }` — optional, as every alpha slot is, with its fallback kept | mechanical | #131 (optional + fallback †) |
| child `<slot name="row" :item="it"></slot>` (no fallback) | `@slot row?: (item: T);` + `@render row?.(it)` | mechanical | #131 (†) |
| parent `<slot name="row" let:item>…</slot>` / `@slot(row, { item }) { … }` | `@snippet row(item) { … }` inside the tag | mechanical | #131 |
| template props (`:item-template="fn"`) on library components | `@snippet item(o) { … }` | flagged | #131 (flagging †) |
| `component(tag, { props: { x: { type: String } } })` (TypeScript) | the typed descriptor | manual (library work) | #123 |
| `@await (…) { maxMs: n }` renders the body when `n` passes | `@error` with an `AwaitTimeoutError` when `n` passes; the body only with a result | behaviour: flagged on every `maxMs` — landed: `await-max-ms` | #145 (decision 26) |
| `@await (x)` on a plain value decides by truthiness: `null`, `0`, `''` stay on `@loading` | `undefined` waits, `false` is a condition, anything else renders the body (data.md, E5) | behaviour: flagged on every `@await` whose operand is neither a declared source nor promise-typed — landed: `await-plain-value` | #145 |
| `@defer (anything)` — an unknown trigger fires at once | `PDX_DEFER_UNKNOWN_TRIGGER` | flagged; `immediate` suggested when that is what it did | † (decision 27) |

## Data and routing

| Alpha | Beta | `pdx migrate` | Source |
|---|---|---|---|
| `@route { path, guard, loader, … }` | `@page` with its options, plus `@guard`, `@loader`, … one per line | mechanical — landed: `route-block` | #277 (decision 1) |
| `@alias '/people'` | a further `@page` path: `@page '/users', '/people'` | mechanical — landed: `page-alias` | #277 (decision 2) |
| `@head { title, meta: [...] }` | `@title` and `@meta` lines | mechanical — landed: `head-block` | #277 (decision 3) |
| `@transition 'fade';` in the script | `@page '/x' { transition: 'fade' }` | mechanical — landed: `page-transition` | #277 (decision 7) |
| `@meta { requiresAuth: true }` (route data) | `@page '/x' { meta: { requiresAuth: true } }` | mechanical — landed: `route-meta` | #277 (decision 8) |
| `@defer (hover)` | `@defer (interaction)` — the same trigger | mechanical — landed: `defer-hover` | #281 (decision 37) |
| `@prefetch 'hover';` | `@page '/x' { prefetch: 'hover' }` | mechanical — landed: `page-prefetch` | #277 (decision 19) |
| a form field named like a form member (`valid`, `reset`, …) | another name | `PDX_FORM_FIELD_RESERVED`; flagged — landed: `form-field-reserved` | #128 (decision 13) |
| `x.isPending()` | `x.pending()` | mechanical — landed: `async-is-pending` | #141 |
| `x.loading()`, `x.status()`, `x.isLoading()`, `state()` values `loading`/`reloading`/`stale`/`local` | the async vocabulary (`x.loading()` is `x.state() === 'pending' && !x.data()`) | flagged — landed: `async-alpha-names` (where the file declares the source) | #141 |
| a control with `name="x"` inside `<pdx-form :form="f">` | `::<model>="f.x"`, the model read from the control's manifest: `::checked` on `pdx-checkbox`/`pdx-switch`, `::pressed` on `pdx-toggle`, `::value` on the others and on native inputs (`checked` for a native checkbox or radio) | mechanical — landed: `form-name-binding`; **flagged** for a control with no manifest entry or more than one model (`pdx-checkbox`) | #128 |
| a control with `name="x"` in a form section | `::<model>="f.x"` on the form the section declares, `@form f: Values from parent;` | mechanical — landed: `form-name-binding`; **flagged** in a section that only calls `useForm()` / `tryUseForm()`, which names no values type | #613 |
| `<pdx-form-field name="email">` | `<pdx-form-field :field="f.email">` | mechanical — landed: `form-name-binding` | #128 |
| `f.fields.email` | `f.email` | mechanical — landed: `form-fields-member` | #128 (see decision 13) |
| `required` on a bound control | a rule in the schema | `PDX_FORM_REQUIRED_IN_MARKUP`; flagged — landed: `form-required-in-markup` | #128 |
| `@loader loadUser;` + `currentLoaderData()` | `@loader loadUser: loadUser;` + `loadUser.data()` | mechanical; reports the rename — landed: `loader-anonymous`, `loader-readers`; an import of `currentLoaderData` flagged (`export:@pdxui/router:currentLoaderData`) | #146, #506 |
| `currentLoaderState()` | `<name>.state()` | mechanical where the page has one loader; flagged otherwise — landed: `loader-readers` | #141, #146, #506 |
| a loader reading params from `location` or `currentParams()` | `({ params, signal })` | flagged — landed: `loader-reads-address` | #146, #506 |
| `navigate('/users/42')` | `navigate.url('/users/42')`, or `navigate('/users/:id', { id: 42 })` | mechanical to `navigate.url` when the literal is not one of the project's patterns; a computed path, or a URL with more arguments, flagged — landed: `navigate-url`, `navigate-url-manual` | #150 |
| `@store x { persist: 'other' }` | `'local'` or `'session'` | flagged — landed: `store-persist` | #278 (decision 14) |

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
| a scoped rule that styled a child component's inside | `[data-part]`, `:state()` or the child's tokens | **target change** under `baseline-2026`; flagged where a scoped selector descends into a component tag, or its subject is neither written by a template that renders components nor put on an element by the script — landed: `scoped-reaches-child` | #152 (flagging †) |
| variant props mapped to classes by hand | `@variants` + `@variant` | manual (library work) | #153 |
| theme overrides with the hand-written nested-theme guard | `@pdx-theme <name> { … }` in `theme-sources/<name>.css`, generated into `src/themes/<name>.css` | design migration, output byte-compared (landed: the 13 themes differ by one generated-file line) | #155 |
| behaviour attributes synced by `setTheme` | custom properties read with style queries | **target change**, no source change for an app (landed); an app that set the attributes by hand stops needing to, and a theme that set one only as an attribute declares its token | #156 |
| an inline `--pdx-density-factor` set beside `pdx-density` | `pdx-density` alone | a fix of the design package (#157), not a language change; an app's inline override keeps working | #157 |
