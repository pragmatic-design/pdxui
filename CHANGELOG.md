# Changelog

Changes that an app built on PDX UI can notice. Newest first.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and
[Conventional Commits](https://www.conventionalcommits.org/). Pre-release versions (`-alpha.N`)
may introduce breaking changes between versions; stable releases (`1.0.0` and later) follow strict
semver.

## Unreleased

### Features

- A navigation in progress is visible: `navigation.pending()` from `@pdxui/router` is true from the
  moment the before-hooks accept a navigation until its page is shown, refused, denied or replaced,
  and `navigation.to()` is its target. A `.pdx` that reads `navigation` gets the import from the
  compiler — `@if (navigation.pending()) { <div class="route-progress"></div> }` needs no wiring.
  (#149)
- Kept-alive views are bounded where they live. `<pdx-router-outlet keep-alive-max="n">` keeps at
  most n frozen route pages (default 10), destroying the least recently used past it — before, every
  kept-alive page visited stayed until its own timeout, if it had one. `<component :is @keepAlive(n)>`
  sets the maximum of a dynamic component's cache (default 10); a value that is not a whole number of
  at least 1 is `PDX_KEEPALIVE_MAX`. (#270)
- Initial public release.
- A form's server field errors land on their fields: a submit rejected with RFC 9457 problem
  details carrying an `errors` map (in an `HttpError`'s body, or thrown as it is) shows each message
  on the field it names — `Email` reaches `email`, `Items[0].Name` reaches `items.0.name` — and the
  new `formError()` holds what names no field. They clear on the field's next edit, and all of them
  when a submit starts. (#280)
- A form's second submit waits for the first: `handleSubmit(fn)`'s handler returns the submit's
  promise, and a press while one runs sends nothing and returns the running one's — it used to
  resolve at once, before the save. An autosave keeps one save per field in flight: an
  `onFieldSave` callback that returns its save's promise holds the next save of that field until it
  settles, then sends the newest value once, so two writes of one field no longer race. (#279)
- `useQuery`'s refetch on focus and on reconnect no longer start a request while one is in flight
  for the key — switching tab and back during a slow first load used to abort it and start it
  again — the same rule polling already followed. And polling pauses on a hidden tab whatever
  `refetchOnFocus` says: with the focus refetch off it used to keep polling a background tab.
  (#259)
- Readers of one cache key share one request and one value, as the default cache always promised:
  two components with the same `@fetch` make one request, which is aborted only when the last of
  them goes; a `refetch()` from one replaces it for all, and a value one writes — its answer, its
  `mutate()` — reaches the others without a request. `Cache.subscribe(key, onWrite)` takes the
  listener that carries it (`CacheWriteListener`). (#258)
- One layer retries, and only reads. The HTTP client retries GET, HEAD and OPTIONS by default — no
  longer PUT and DELETE: a write is replayed only when its request asks, `{ retry: 2 }`
  (`RequestOptions.retry`, `false` turns it off for one request). A read source owns its retries:
  `@fetch` and `httpResource` turn the client's off, so `{ retry: 2 }` is three requests at most, not
  twelve. `resource()` and `useQuery` retry with the client's rule and backoff — never a 4xx, with
  jitter and `Retry-After`. **Behaviour change:** a `@fetch` with no `retry` option is no longer
  retried by the client; give it `retry` if it needs one. (#257)
- A request a newer one supersedes, or one in flight when its resource is aborted or disposed, is
  aborted on the network instead of running to the end for an answer nobody reads. `resource()`'s
  fetcher and `useQuery`'s query function receive `{ signal }` (type `ResourceFetcher`); `@fetch` and
  `httpResource` hand it to the HTTP client. A fetcher that takes no parameter keeps working, and its
  superseded requests are still only ignored. (#256)
- `resource().abort()` cancels instead of leaving the source loading for good: it goes back to
  `idle`, or to `success` when it has data, and `error()` is untouched. A request that outlives the
  HTTP client's `timeout` fails with the new `HttpTimeoutError` (exported from `@pdxui/core`) instead
  of an `AbortError`, so a timeout can be told from a cancel; neither is retried. A `catch` that
  tested `AbortError` to detect a timeout tests `HttpTimeoutError` now. (#255)
- A page ships the icons it draws, not the icon set. Each icon of the «pragmatic» set is its own
  module, `@pdxui/ui/icons/<name>`, whose default export is the SVG. The compiler imports the ones it
  can see — `<pdx-icon name="check">`, a literal icon prop (`<pdx-fab icon="edit">`), a literal
  `icon:` in the `.pdx` script — and any other name loads on demand the first time it is drawn. An
  app that wants an icon from a `.ts` module on its first screen imports it and hands it to
  `defineIcons` (from `@pdxui/ui/icon/pdx-icon`). `registerPragmaticIcons()` still puts the whole set
  on the page, and `import '@pdxui/ui'` does it first. On the showcase the `pdx-icon` chunk went from
  16.3 to 6.9 KB gzipped. (#47)
- `pdx-rich-text`'s toolbar registers `pdx-icon`: on a page where the editor drew the only icons,
  every button was empty. (#47)
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
  target are not reported. (#151) A template event handler is checked too — `@click="items.push(x)"`
  is reported at its attribute, with the same fixes; a name the template binds (a `@for` item, an
  arrow parameter) is not the signal. (#210)
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
- In a `.pdx`, an assignment to a `$signal` stores its value as it is: an arrow function assigned
  (`onSave = () => save()`) is now stored, not called, and `onSave()` calls it. `x ??= v`, `x ||= v`
  and `x &&= v` store `v` the same way; `x.peek()` and `x.setRaw(v)` reach the signal; `++`, `--`
  and `+=` are unchanged. (#187)

### Fixes

- The child components of a kept-alive route page keep their state when the page is frozen: they
  were destroyed by the move that froze it, and set up again on return. They are frozen with the
  page — `onHide`, then `onShow` — and destroyed with it when the outlet discards it. (#268)
- A template directive no plugin registers — `@tooltip ('Save') { … }` in an app without the plugin
  that provides it — raises `PDX_UNKNOWN_DIRECTIVE` (warning), once per name in a file. It was
  written into the page as text with no diagnostic. Literal `@word (…)` text is written `@@word`.
  (#296)
- A scoped slot outlet's fallback that interpolates or holds a block —
  `<slot name="row" :item="it"><span>{{ it.label }}</span></slot>` — renders inside the outlet, only
  when the parent gives no fill. It was emitted beside the outlet, so it rendered next to the parent's
  fill, with an orphan `</slot>` on the template path. The outlet is now one node of the template
  parser, its fallback a body like any block's. (#276)
- A `$signal`, `$derived` or `$store` whose type argument has a comma, parentheses or an arrow —
  `$signal<Record<string, string>>({})`, `$signal<(A & B)[]>([])`, `$signal<() => void>(…)` — is read
  as a rune. It was split in two or left as code, and in a `.pdx.ts` store shipped `$signal` in the
  JavaScript with no diagnostic. A plain `<script>` whose only rune has a type argument is in the new
  mode, and a rune declaration that cannot be read is `PDX_UNKNOWN_DECLARATION`. (#275)
- `@show` false hides text at the root of its block too: `@show (open) { Details: <b>…</b> }` left
  «Details:» on the page. A root text node is swapped for a placeholder while hidden and put back,
  current, when shown; elements still take `display: none`. The template path's text binding also
  updates a text node that is out of the page, as the inline path's did. (#265)
- A `pdx-list` that has finished loading no longer announces «Loading»: its loading overlay, a
  spinner with `role="status"`, stayed in the accessibility tree while transparent. It is
  `aria-hidden` unless drawn, and the list is `aria-busy` while its source loads. (#299)
- A `pdx-data-grid` column header is named by its label alone: a screen reader announced a sortable,
  filterable «Name» column as «Name Filter Name». Each header is `aria-labelledby` its label, and a
  `header:{field}` slot's content now sits in that label span (`.pdx-dg-th-label`), as the default
  text does. (#263)
- A `:ref` goes back to `null` when its element leaves the page — its `@if` branch turns false, its
  `@for` row is removed, the component is destroyed — on both render paths; it kept the detached
  element. Two branches of an `@if`/`@else` binding the same ref leave it on the element shown.
  Both paths bind through core's new `bindRef`. (#262)
- A `@defer` body rendered after its load or a later trigger is disposed with its block: its
  bindings belonged to no scope, so removing the block (an `@if` around it, the component destroyed)
  left them re-running on detached nodes. Each state of the block now renders in its own scope.
  (#261)
- A production build renders an interpolated array as its items, as dev does — it printed `a,b` — and
  fires `@click.enter` on a click: a key filter applies to keyboard events only. Both render paths
  now interpolate through core's new `bindInterpolation`. (#100)
- `@swipe.left|right|up|down`, `@longpress` and `@pinch` call their handler, in dev and in a build:
  neither render path wired them, and on the template path a handler such as `n++` ran once at render.
  Both now hand the element to core's new `bindGesture`, with the handler built as an `@event`'s is.
  (#99)
- A production build binds `:class` and `:style` written as objects: `<p :class="{ active: on }">`
  rendered `class="[object Object]"`, and `:style="{ color: c }"` set nothing. Both render paths now
  expand the object into one `:class.x` / `:style.x` per key, the same way. (#96)
- A scoped slot outlet, `<slot name="cell" :row="r">`, renders the parent's `@slot(cell, { row })`
  fill with its scope: the child collected the fills only after rendering, so the default was always
  shown. A self-closing outlet with no fill no longer fails the mount with `defaultFn is not a
  function`. (#221)
- `@stagger` and `@mode` on an `@for` animate the list: the n-th row that arrives waits n × stagger
  ms, `@mode('out-in')` holds arriving rows until the leaving ones are gone, and `@mode('in-out')`
  keeps leaving rows until the arriving ones have entered. The list reconciler read only `enter`,
  `exit` and `move`, so both were accepted and did nothing. (#207)
- The editor no longer reports `Cannot find name` on a call to a `@snippet` or to `$emit`: the
  snippet is declared as a function of its parameters, `$emit(event, detail?)` is declared, and
  `$watch` takes `once` and `name` as core's `watch` does. (#206)
- Style rewrites produce the CSS that was written. A selector list inside `:is()`, `:where()`,
  `:not()` or `:has()` is scoped as one selector instead of being split. `responsive(1rem, 2rem)`
  grows by 1rem (taken as 16px) across the range instead of 1px. `bind()` follows a `$signal` and a
  `$derived`, which failed the mount with `ctx.name is not a function`. A `<style src>` block is no
  longer empty in a production build. A plain `<style>` rewrites `responsive()` and `bind()` as a
  scoped one does. (#205)
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
