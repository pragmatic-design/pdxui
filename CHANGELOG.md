# Changelog

Changes that an app built on PDX UI can notice. Newest first.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and
[Conventional Commits](https://www.conventionalcommits.org/). Pre-release versions (`-alpha.N`)
may introduce breaking changes between versions; stable releases (`1.0.0` and later) follow strict
semver.

## Unreleased

### Features

- Initial public release.
- `@params` and `@search` report a field they cannot read with `PDX_ROUTE_FIELD_INVALID`, an error,
  instead of dropping it; a quoted type (`id: 'number'`) carries the fix to `id: number`. Both
  blocks may span several lines. (#105)
- `createAuthStore()` returns `getRefreshToken()`: the refresh token `setTokens` stored (and
  persisted with `storageKey`), or `null`. The store kept it and gave no way to read it, so an app
  that refreshes a session had to store it a second time. (#43)
- `PDX_SIGNAL_MUTATED_IN_PLACE` (warning): a `$signal`'s value changed in place — `items.push(x)`,
  `splice`, `sort`, a `Map`/`Set` `set`/`add`/`delete`/`clear`, `user.name = v`, `items[0] = v` —
  sets nothing, so nothing that reads it updates. Reported where it is written, with a fix for a push
  (`items = [...items, x]`) and a field (`user = { ...user, name: v }`). A `$store` and a `:ref`
  target are not reported. (#151)
- `<pdx-button :action="save" :action-arg="dto">` runs a write: a click calls `save.execute(dto)`,
  and while `save.pending()` the button is busy and refuses clicks, so a double click sends one
  write. A refusal stays on `save.error()` and is announced as `pdx-action-error`. Any object with
  `execute` and `pending` qualifies, a `mutation()` among them. (#49)

### Changed

- A project made by `pdx new project` imports `@pdxui/design/base` and `@pdxui/design/themes/neutral`
  instead of the whole design system, and depends on `@pdxui/design`: each component brings its own
  CSS, and the page no longer loads every component's CSS and all 13 themes before it renders one.
  `@pdxui/framework/css` still loads everything. (#46)
- Dependency tracking keeps an effect's or a computed's subscriptions between runs and updates them
  in place: a source read twice in one run is recorded once, and a re-run that reads the same
  sources touches no subscription. Measured on the flush benchmark, 1.2× to 4× the updates per
  second depending on the case. Nothing a run sees changes. (#116)
- An effect reading a computed runs only when the computed's value changed. A source change used
  to re-run it even when the computed recomputed to the same value: `computed(() => n() % 2)` and
  three writes of `n` that keep it at 1 ran an effect on it three times, now none. (#115)
- A template event handler runs inside `batch()`: `@click="a = 1; b = 1; c = 1"` runs an effect
  reading the three once, on the finished state, instead of three times on states half written. An
  `async` handler is batched up to its first `await`; code outside a template handler still flushes
  per write. `batchHandler(fn)`, which the compiler emits, is exported from `@pdxui/core`. (#114)
- A `mutation()` called while it is pending queues the call instead of rejecting with "Mutation
  already in progress": calls run one at a time, in call order, each with its own result, and a
  failed one does not stop the next. `pending()` stays true until the queue is empty. The
  double-submit guard is `<pdx-button :action>`. (#50)
- Context requests follow the Web Components context protocol: the `context-request` event carries
  the key itself, compared by identity, with `callback` and `subscribe`. A provider or consumer
  from another library (Lit's `@lit/context`, for one) and PDX now find each other; a request
  built with the old private `{ name: key }` shape is no longer answered. `provide` honours
  `subscribe: true` for a provided signal. (#103)
- Without a DOM, `html``` throws an error that names the call instead of returning an empty
  fragment. (#93)

### Fixes

- Page declarations compile to the route they describe. `@page '/x' { keepAlive: true }` registers
  `keepAlive: true`, not `NaN`. `@search`'s `searchParams` is read as a `$derived` in the script too —
  `searchParams.page + 1` was `NaN` — and is declared for `pdx check` and the editor. A `@page`
  options block or a route `@meta` may span lines. A page's second path and an `@alias` carry every
  field of its route and are checked like the first. `@route`'s `search`, `params` and `meta` are read
  to their own closing brace, and their fields are checked with `PDX_ROUTE_FIELD_INVALID`. (#204)
- `@fetch` options read signals and props like the rest of the script: `enabled: () => ready`
  threw `ReferenceError: ready is not defined`, and `ready` was reported unused. A declaration whose
  options block goes on to the next lines keeps it. `@form` imports from `@pdxui/core` only core's
  validators, an object's sub-field rules included; a rule of the script's own is called as its
  function, and a rule that is neither is `PDX_FORM_UNKNOWN_RULE` (error). A form whose schema,
  `validate`, `source`, `parent` or own rule reads a `const` of the script is created after it,
  instead of reading it before it is initialised. (#203)
- Three script forms compile as written. `$derived(a * 2,)` — a trailing comma, also in `$signal`
  and `$store` — no longer emits a module that does not parse, and a `$derived` the compiler cannot
  read reports `PDX_REWRITE_FALLBACK` as a warning instead of only on the console.
  `@event pdx-change: number;` is `PDX_MALFORMED_EVENT` (error) instead of declaring an event named
  `pdx`; `$emit('pdx-change', value)` dispatches a hyphenated name. `let state = $store(…)` keeps
  `let`, so assigning it again no longer throws. (#202)
- The names a block binds are in its scope whatever they are called: `@catch (problem, again)` and
  `@await … @error (fail, again)` read `problem`, `fail` and `again` instead of `ctx.problem`, which
  threw when the error rendered — only `err`, `retry` and a few other names worked. A destructured
  `@for (pairs as { key, value }; …)` no longer reports `key` and `value` as `PDX_UNDECLARED_REF`.
  (#201)
- A production build compiles `<component :is="view" @keepAlive>` and the shorthand `<input :value>`
  to a module that parses — both were a `SyntaxError` that stopped the page loading — and a scoped
  slot outlet `<slot :row="row">` to the same `renderSlot` call as in dev, not a literal `<slot>`
  element. (#200)
- A template pipe renders its value: `{{ name | upper }}`, a chain, and `{{ price | money('EUR') }}`
  (the value first, then the arguments), in dev and in a build, following the signal it reads. The
  compiled module called core's signal operator `pipe` instead of the value chain `templatePipe`, so
  the page showed a function's source; a pipe the script imports is now called by its own name.
  (#199)
- `pdx build` and `pdx dev` on a project whose `vite.config` registers `pdx()` — as the one
  `pdx new project` writes does — use that plugin and add no second one. With two, every module was
  compiled twice and a production build rendered nothing (`component is not defined`). (#197)
- `$signal()` with no initial value compiles to a signal that starts at `undefined`. It compiled to
  `signal(, { name })`, a module that did not parse wherever it was imported. (#186)
- `@params { id: number }` declares `id` for the page: the template reads `{{ id }}` and the script
  `id`, coerced to the declared type, and it follows a navigation that changes the param without a
  remount. The compiler emitted the value under another name, so the template raised
  `PDX_UNDECLARED_REF` and the script read `undefined`; the editor declares the name too. (#185)
- In a `<style scoped>`, the rule after a statement at-rule (`@layer a, b;`, `@import …;`,
  `@charset …;`) is scoped: it was read as part of the at-rule and applied to the whole page. At-rule
  names are matched in any case and as whole names, so `@CONTAINER` is scoped like `@container` and
  `@media-x` is not treated as `@media`. (#180)
- A production build renders a component that uses `@let`: the build read the `@let` name as a
  signal and the component threw at mount (`ctx.total is not a function`), rendering nothing. (#162)
- Two dialogs opened from code in one batch — `dialog.open(…)` then `dialog.confirm(…)` in one
  click — each close on Escape. The one underneath registered its Escape for the dialog on top and
  never closed. `overlayStack.onDismiss(id, callback)` registers for a given overlay. (#114)
- Scoped `<style scoped>` rules inside `@container` and `@starting-style` now apply only to the
  component. Before, they were emitted unscoped and applied to every matching element on the page.
  (#104 — entry by @jay23606, from #166)
- A production build keeps `@transition`, `@stagger`, `@mode` and `@move` on `@if` and `@for`: the
  inline render path dropped them, so an animation played in dev and not in the shipped app. (#85)
- `@pdxui/core`, a compiled component and a `@pdxui/ui` component can be imported in Node:
  `component()` registers nothing where there is no custom element registry. (#93)
- A `@fetch` URL that interpolates a signal or a prop refetches when it changes. It used to name a
  variable that does not exist. (#101)
- A subscriber or an error handler that throws during a write no longer stops every later effect in
  the page. (#102)
- A top-level `const` or `let` with a type annotation (`const SORT: Sort[] = […]`) reaches the
  template. It was left out of the setup's return: `undefined` in dev, and in a production build
  the component threw at mount and rendered nothing. (#44)
- In a production build, `::value` on a component (`<pdx-select ::value="country">`) and on a
  `<select>` updates the signal again: the build listened to `input` on everything, and a
  component's `pdx-change` or a select's `change` never reached it. Both builds now share core's
  `bindTwoWay`, newly exported, which also sanitises a URL name such as `::formaction`. (#97)
- A production build loads a component used only inside `@defer`: the trigger used to fire and
  leave an unknown, empty element. (#98)
- In a production build, a binding writes a property only when its value changes. It wrote again
  whenever the row it read from was replaced, so a field being typed in took back the saved value
  when another field's save landed. (#44)
- Pasting HTML into `pdx-rich-text` no longer leaves a stray space node between two blocks: the
  whitespace a source puts between `<p>`s is layout, and is dropped. A space between inline nodes is
  kept. (#74)
