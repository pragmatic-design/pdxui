# Changelog

Changes that an app built on PDX UI can notice. Newest first.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and
[Conventional Commits](https://www.conventionalcommits.org/). Pre-release versions (`-alpha.N`)
may introduce breaking changes between versions; stable releases (`1.0.0` and later) follow strict
semver.

## Unreleased

### Features

- A snippet of a library list or menu reads the app's own item (#651). A TypeScript descriptor declares
  a type parameter, `generics: { T: { extends: '{ key: string; label: string }', from: 'items' } }`, the
  manifest records it and types `items` as `T[]`, and the editor infers `T` from `:items`: an invented
  field (`it.lable`) is an error, and a field the app's items carry reads with its type. Declared by
  `pdx-nav-menu`, `pdx-list`, `pdx-sortable-list`, `pdx-breadcrumb`, `pdx-carousel`, `pdx-command`,
  `pdx-timeline`, `pdx-description-list`, `pdx-menu`, `pdx-dropdown-menu`, `pdx-context-menu`,
  `pdx-tree`, `pdx-tree-select`, `pdx-cascader`, `pdx-data-grid` (its rows) and `pdx-autocomplete`
  (an option's `raw`). A menu or a tree types its snippet over the children too, and leaves out what
  it draws itself: a header or a separator is left out when the app writes its `type` as a literal
  (`type: 'header' as const`). Before, every signature carried `[key: string]: unknown`, so an
  invented field was not an error and an app's field read as `unknown`. `pdx-select`, whose created
  option's `raw` is the typed text, and the components whose item is not the app's keep theirs.
- In a library `@variant` rule whose root part is further down a child chain,
  `:scope > .pdx-checkbox-wrap > [data-part="root"]`, the native form is the root part's own compound,
  `.pdx-checkbox-sm`, and the steps before it are dropped (#629). They are the component's markup
  around the element, which a native control does not have. Before, it kept them,
  `.pdx-checkbox-wrap > .pdx-checkbox-sm`, and a bare native input lost its size class.
- A library `@variant` rule may draw several components (#627): `@variant :is(pdx-input, pdx-textarea) size(sm) { … }`
  compiles to one selector, `:where(:is(pdx-input,pdx-textarea)[size="sm"]) …`, and is checked against each
  host's axes. Before, `:is(…)` in the prelude was read as an axis named `is`.
- A form section names the form it inherits (#613): `@form intake: IntakeValues from parent;` makes a
  component projected into `<pdx-form>` a section of that form, and its controls bind its fields as any
  control does, `::value="intake.email"` and `<pdx-form-field :field="intake.email">`. It compiles to
  core's new `inheritedForm(ctx.el)`: each `intake.x` reads the form when asked, so a binding made
  before the form is found — a child connects before its parent, a projected child mounts detached —
  follows it from the moment `<pdx-form>` provides it. The showcase's intake wizard and the employee
  identity group use it.
- `pdx-button` declares its variants (#512): `variant` and `size` are reflected on the host
  (`<pdx-button variant="ghost" size="sm">`), and `size` defaults to `'md'` instead of `''`. Its rules in
  `@pdxui/design` are written once as `@variant pdx-button …` and compiled for the host and for the
  native `<button class="pdx-ghost">`. So are the themes' button overrides, the stylesheets that reach
  the button (toolbar, input group, the coarse-pointer target, the link style), and the theme engine's
  rules, which it writes compiled.
- `@variant` takes several values of one axis, `@variant variant(ghost, danger) { … }`, and matches any of
  them, in a `.pdx` and in `@pdxui/design` alike (#512). Before, a list was ignored and the rule
  applied to every value.
- A TypeScript component declares its variants in its descriptor (#512):
  `variants: { size: ['md', 'sm', 'lg'], variant: { primary: '.pdx-primary', ghost: '.pdx-ghost' } }`.
  Each axis is a prop typed with its values (`ctx.size` is `Signal<'md' | 'sm' | 'lg'>`), defaults to its
  first value, and is reflected on the host as an attribute; a value outside the axis reflects the
  default. The manifest lists every axis with its values, its default and the native selectors a record
  gives (`variants` in `custom-elements.json`), and `pnpm certify:gen` generates one scenario per value,
  each with the rule that the host reflects it. `@pdxui/design` compiles `@variant` rules in its
  stylesheets and theme sources to the host's attribute test, bounded at nested components, plus the
  native selector a value maps, and checks them against the manifest. The library's migration follows
  in #512 and #627–#633.
- The library's menus and pickers take a parent's typed snippet (#491):
  - `pdx-select`: `item(option, index)` and `selected(option)`;
  - `pdx-autocomplete`: `option(option, index, highlighted)`;
  - `pdx-cascader`: `option(node, level, selected)`;
  - `pdx-tree-select`: `node(node, level, expanded)`;
  - `pdx-command`: `item(item, index, active)`;
  - `pdx-menu`, `pdx-dropdown-menu` and `pdx-context-menu`: `item(item)`.

  Each declares the slot in its descriptor, so a page's `@snippet` reaches it and the manifest records
  the slot's signature, which the editor types the snippet's parameters from. The alpha scoped slot
  still renders when no snippet is given. Core's `snippetOrSlot(ctx, name, args)` is what a TypeScript
  component reads either one with.
- The library's lists and navigation take a parent's typed snippet the same way (#595):
  - `pdx-list`: `item(item, index)` and `empty()`;
  - `pdx-sortable-list`: `item(item, index)`;
  - `pdx-description-list`: `value(item, index)`;
  - `pdx-timeline`: `content(item, index)`;
  - `pdx-tree`: `node(node, level, expanded)`;
  - `pdx-breadcrumb`: `item(item, index, isLast)`;
  - `pdx-nav-menu`: `item(item, level, expanded, active)` and `itemActions(item, level, active)`;
  - `pdx-pagination`: `item(page, active)`.

  `pdx-pagination`'s `page` slot and `pdx-nav-menu`'s `actions` slot share their names with a prop, so
  their snippets are named apart; the props and the alpha slots keep their names. `snippetOrSlot`
  takes the alpha slot's name as a fourth argument when it differs from the snippet's.
- So do the remaining inputs and media (#596): `pdx-carousel`'s `slide(slide, index, active)`,
  `pdx-field-list`'s `row(item, index, remove)`, `pdx-file-upload`'s `file(file, status, progress)`,
  `pdx-mention`'s `suggestion(item, index, active)` and `pdx-tag-input`'s `tag(tag, index)`.
  `pdx-nav-menu`'s signatures name every field of its items (`data`, `badgeVariant`, `disabled` and
  the rest).
- `pdx-data-grid` takes a parent's typed snippet, one for every column (#597): `cell(row, column,
  value)` and `header(column)` switch on `column.field`, and `detail(row)` draws an expanded row. A
  column the snippet draws nothing for is drawn by the grid, and a command column it leaves alone keeps
  its Edit and Delete buttons. The alpha slots `col:{field}`, `header:{field}` and `detail` still
  render; `col-edit:{field}`, `filter:{field}`, `filter-popover:{field}`, `toolbar-start`,
  `toolbar-end` and `empty` stay scoped slots for now.
- `@model value: T = d { form };` (`model<T>(d, { form: true })` in a descriptor) makes a component
  form-associated through its model: a native `<form>` submits the model under the host's `name` (a
  string as is, a number as its string, a boolean as a checkbox — its `value` or `on` when true,
  nothing when false —, an array as one entry per item, a `File` as the file, `null` as nothing);
  `form.reset()` and a restored form state write the model, so a parent's `::value` follows; the
  component's `required` and `error` props are its validity; a disabled fieldset sets its `disabled`
  prop. The option was read as part of the default or the type before, and broke the compiled module.
  (#135)
- Seventeen value components of `@pdxui/ui` declare their model `{ form }` instead of wiring the form
  by hand: autocomplete, checkbox, checkbox-group, color-picker, masked-input, mention, number-input,
  otp-input, pin-input, radio, radio-group, rating, segmented, slider, switch, tag-input and toggle.
  `form.reset()` now puts each back to the value it mounted with — before, it left them as they were
  — and a restored form state writes the model; a required `pdx-checkbox` makes the form invalid
  until it is checked. A component whose form value is not its model as it is says what it submits in
  its setup, `ctx.formValue(() => …)`: a clamped number, a group's selection, a mention's markup. A
  control inside another one with a form model — a checkbox in a checkbox group — is the outer one's:
  it does not reset or restore itself after it. (#135)
- The rest of the library's value components take part in a native form through their model, and a
  reset restores them (#135):
  - **The pickers that submitted through a hidden `<input>`:** select, date-picker, time-picker,
    cascader, tree-select and inline-edit. The host submits now, and the hidden input is gone.
  - **The components that did not take part at all:** transfer, rich-text, json-editor and
    file-upload. A file dropped on a `pdx-file-upload` is submitted too; before, only a file picked
    through the dialog reached the form.
  - **The text fields:** input, textarea, password-input and search-input keep submitting through
    their inner native field, which holds the `name` for autofill and password managers. A reset now
    puts the field and its model back to the mounted text; before, it emptied the field and left the
    model as it was.
- A value still waiting in a `::x.debounce(ms)` binding to a form field is written before the form's
  `handleSubmit` validates and before `validate()`, when the page calls them from code as well as on a
  submit event: the submitted value is the one typed (beta rule F6). `required` on a control bound to a form
  field is `PDX_FORM_REQUIRED_IN_MARKUP` (warning): it belongs in the field's rules; `pdx migrate`
  lists it. (#128)
- A control binds a form field through its model: `::value="f.email"`, `::checked="f.accepted"`,
  `::pressed="f.bold"`. The binding writes the field; the control is marked invalid while the field
  shows an error and required when the schema requires it (an `error`/`required` prop on a component,
  `aria-invalid`/`aria-required` otherwise), and leaving it touches the field. `.number`'s parse error
  is the field's error. `<pdx-form-field :field="f.email">` shows a field's error, warning and
  required marker with no `name` and no `<pdx-form>`. In the editor a field is checked as its value
  against the model: `::checked` on a `string` field is an error. A control bound this way is not
  wired again by its `name` inside `<pdx-form>`. (#128)
- In the editor and `pdx check --types`, a named loader's unannotated first parameter is typed from the
  page's pattern: `@page '/users/:id(number)'` gives `params: { id: number }`, as the router coerces it,
  and a param the pattern does not declare is an error. (#564)
- `@params` takes a name alone, `@params { id, tab }`, typed from the page's pattern by the same rule:
  `:id(number)` is a number, every other param a string. `name: type` stays; a name alone the path
  has no param for is `PDX_ROUTE_FIELD_INVALID`. (#564)
- A route loader's results are kept in core's cache, per route, params and query. A page entered
  again shows its kept result at once, `user.stale()` true, while the loader runs again; with
  `@loader user: loadUser { staleTime: 30_000 };` a result younger than that is used with no request.
  A level that stays on screen is not reloaded. `invalidate(['loader:/users/:id'])` — from an
  `@action` or anywhere — drops every result of the route and reloads it if it is on screen; a
  prefetched result enters the cache too. Any other option, or a `staleTime` the compiler cannot read
  as milliseconds, is `PDX_LOADER_UNKNOWN_OPTION`. (#148)
- A route loader decides where a navigation ends: `throw redirect(to, { replace? })` from
  `@pdxui/router` goes to `to` before the route is shown (replacing the abandoned address by default),
  and `throw notFound()` renders the not-found page of that level, with the levels above it kept and
  the address unchanged. `retryNavigation()` runs the navigation on screen again, for an app's own
  error page. (#147)
- A route loader receives a `LoaderContext` (exported from `@pdxui/router`): `params`, coerced by the
  pattern's constraints (`:id(number)` gives a number, every other param a string); `query`, with a
  repeated key as an array; and `signal`, aborted when a newer navigation starts, or the router
  clears its loaders. A prefetched call gets the same context with a signal of its own: the
  navigation that takes it over aborts it when superseded, and one that expires unused is aborted as
  it is dropped. `loaderError(pattern)` keeps a level's last failure until it loads again. A loader
  that takes no argument keeps working. (#505)
- An `@action … with { agent: '…', consequential: true }` is an action an agent may call. `pdx analyze`
  records it under `actions`, with `agent`, `consequential` and `input`, the JSON schema of its
  parameter's type read from the type's text (`{}` for a type it cannot read, such as an interface).
  Since an agent has no capability a person does not, such an action that no control of the template
  runs — no `:action="name"`, no handler calling `name.execute(…)` or `name(…)` — is
  `PDX_AGENT_ACTION_UNBOUND`. Registering the tool waits for the WebMCP adapter. (#502)
- `@action` declares a write in a `.pdx`, as `@fetch` declares a read:
  `@action save(dto: Dto, { signal }) when canSave with { invalidate: [...] } { … }` compiles to a
  `mutation()` whose `fn` runs the body, `when` is `save.enabled()`, and `with` passes
  `mutation()`'s options. The body may span lines and is rewritten like the rest of the script.
  - An unknown option, or a `concurrency` that is not one of the four, is
    `PDX_ACTION_UNKNOWN_OPTION`.
  - In the editor `save` is core's `Mutation`, typed by the parameter and by what the body returns,
    and the body is checked where it is written. (#501)
- `mutation()` takes a `concurrency` policy for a call made while another is pending: `'queue'`
  (the default, as before), `'drop'`, `'coalesce'` or `'parallel'`. No policy aborts the running
  write.
  - `fn` receives `(input, { signal })`, the call's own; `m.cancel()` aborts the running call's
    signal and drops the waiting ones, which reject with an `AbortError` and never become `error()`.
  - `enabled: () => boolean`, read as `m.enabled()`: a call whose turn comes while it is false does
    not run, and rejects with `ActionDisabledError`, exported from `@pdxui/core`.
  - The optimistic value is applied when a call starts and kept as one overlay per running call: a
    failing call removes its own, and a parallel call's value stays.
  - `<pdx-button :action>` stays clickable, showing loading, under `'coalesce'` and `'parallel'`;
    under `'queue'` and `'drop'` it refuses clicks while pending, as before. (#500)
- **Breaking:** one mechanism per direction. Four untyped messaging APIs leave `@pdxui/core`; an
  import of one in a `.pdx` is `PDX_REMOVED_FORM`, and `pdx migrate` flags it:
  - `createBus` → a `@store` for state the app shares, or an `@event` for a message;
  - `createChannel` → `@prop` / `@model` down and `@event` up, or `@expose` + a typed ref;
  - `createCommands` → `@expose` + a typed ref (or `commandfor`);
  - `createCompoundParent`, which no library component used → a token the parent `@provide`s and
    its children `@inject`.
  `discoverChildren` and `exposeOnElement` stay. (#144)
- **Breaking:** the `.pdx` context runes take a token: `@provide CurrentUser = me;`,
  `@inject user from CurrentUser;`, and `@inject theme from Theme = 'light';` for a default when
  nothing above provides one. The token is a `context<T>()` the script imports, and the editor types
  the injected name by it.
  - A string key — `@provide user = …`, `@inject user;`, `@inject user as me;` — is
    `PDX_UNKNOWN_DECLARATION` with the token form as its hint. So is a token the script declares
    itself: the script runs once per component, so the token would be a new one each time and
    nothing else could reach it.
  - The default is emitted as written, before the rest of the script: a literal or an imported
    name. (#496)
  - `pdx migrate` rewrites the string keys. It writes one token per key into `src/contexts.ts`
    (`contexts.ts` at the root without `src/`), keeping the tokens the module already declares, and
    rewrites both sides with an import of the token: `@provide user = v;` → `@provide User = v;`,
    `@inject user as me;` → `@inject me from User;`. The library's keys take the library's tokens
    (`errorContext` → `ErrorContext`, `dataSource` → `DataSourceContext`, `routeParams` →
    `RouteParams`). **A token it writes is `context<unknown>`: give each one its value's type.**
    (#497)
  - The manifests say which contexts a component needs. `pdx analyze` lists each component's
    `provides` and `injects`, each token with the module it is imported from, and an inject with a
    fallback as `optional`. The library's `custom-elements.json` records them under
    `x-pdx-context` — `pdx-list` injects `DataSourceContext`, `pdx-data-source` provides it — and
    the skill's component pages show them. (#498)
- Context values are keyed by typed tokens. `context<T>(name)` returns one; declare it once, in a
  module: `export const CurrentUser = context<User>('current-user');`. The token is the key, compared
  by identity, and carries the value's type (`ContextValue<typeof CurrentUser>` is `User`).
  - The API is `provide(token, value, host)` and `inject(token, host, fallback?)`. `inject` with no
    provider throws, naming the token and the component; with a third argument, `undefined`
    included, it returns that instead. It asks the context protocol too, so a Lit provider of the
    same token answers.
  - **Breaking:** seven functions leave `@pdxui/core`. An import of one in a `.pdx` is
    `PDX_REMOVED_FORM`, and `pdx migrate` flags it:
    - `tryInject(k, el)` and `tryUseProvided(k)` → `inject(token, el, undefined)`;
    - `useProvided(k)` → `inject(token, el)`, or `@inject`;
    - `requestContext(el, k)` → `inject(token, el)`;
    - `provideWritable(k, s)` → `provide(token, s, el)`, since a provided signal is writable;
    - `useWritable(k)` / `tryUseWritable(k)` → `inject(token, el)` / `inject(token, el, undefined)`.
  - **Breaking:** the library's and router's contexts are exported tokens:
    - `DataSourceContext` (`@pdxui/ui/data-source`) replaces `'dataSource'`;
    - `<pdx-data-source :token="Orders">` replaces `name` and its `ds:` key;
    - `ErrorContext` (`@pdxui/ui/error-boundary`) replaces `'errorContext'`;
    - `RouteParams` (`@pdxui/router`) replaces `'routeParams'`;
    - `<pdx-provide :token :value>` replaces `name`, and `:values` takes a `Map` of token to value.
  - A page's `@params` reads `RouteParams` with a fallback, so outside an outlet its params are
    empty instead of a throw.
  - The `.pdx` runes `@provide` / `@inject` take a token since #496. (#495)
- The editor types a `@snippet`'s parameters from the child's `@slot` signature, so `u.nmae` on a
  `User` is an error where it is written.
  - `@generic T extends { id: string };` declares a type parameter. The editor infers it from the
    props that use it (`:items="users"` gives `T = User`), and `T="User"` on the tag sets it.
  - Inside the component, `T` reads as its constraint.
  - `T="User"` is not written into the page.
  - `pdx check --types` does not type snippet parameters yet. (#490)
- Typed snippets: a component declares a template its parent provides, with a signature, and
  renders it where it wants with the values it chooses.
  - The child declares `@slot row: (item: User, index: number);` and renders `@render row(it, i)`.
    `@slot row?: (…)` is optional, and `@render row?.(it) @else { … }` renders the block when the
    parent gives none.
  - The parent writes `@snippet row(u, i) { <span>{{ u.name }}</span> }` inside the child's tag.
    A required slot left unfilled is `PDX_SLOT_REQUIRED`.
  - A snippet is a function the child calls, not a projection: one inside an `@if` that turns true
    later renders. Outside PDX it is a property of the element, `el.row = (item, i) => node`.
  - A `@snippet` in the script now has a template body, compiled like the template (`{{ arg }}`,
    bindings, blocks). A body that uses `${arg}` is still the alpha `html` function until #131
    migrates it. (#489)
- The editor and `pdx check --types` check template expressions under TypeScript's `strict` mode.
  `{{ user.name }}` on a `$signal<User | null>(null)` is an error until it is guarded, and an arrow
  handler's parameter (`@input="e => …"`) is typed as the event, so `e.taget` is an error too.
  - The script is still checked leniently. Its names reach the template with the types the script
    gives them: `$signal(null)`, `$signal([])`, `const rows = []` and an untyped `@prop` stay `any`.
  - A project that type-checks today may see new errors where a template reads a nullable value
    unguarded. (#468)
- A component's own values are tokens, `--pdx-<component>-<property>[-<state>]`, overridable at
  `:root`, on a subtree or on one element. `<pdx-button style="--pdx-button-bg: …">` restyles one
  button, in every theme, on every variant; `--pdx-button-bg-hover` and `--pdx-button-color` likewise.
  - Each component's tokens, with their defaults, are in the manifest (`cssProperties`) and on its
    docs page.
  - Renamed to the convention: `--pdx-button-hover-shadow` → `--pdx-button-shadow-hover`,
    `--pdx-button-hover-transform` → `--pdx-button-transform-hover`, `--pdx-accordion-open-transform` →
    `--pdx-accordion-transform-open`. The old names still apply. (#154)
- `@variants` declares a component's variants once.
  `@variants { variant: { primary, ghost } = primary; size: { sm, md } = md; }` makes each axis a prop
  typed with its values and reflected on the host as an attribute.
  - In the `<style scoped>`, `@variant variant(ghost) { … }` keys rules by it; `and` combines axes,
    and `:scope` in the body is the host. It compiles inside the donut scope on `baseline-2026`, to
    `[data-pdx-<hash>][variant="ghost"] …` on `baseline-2024`, and to `:host([variant="ghost"])` under
    `<template shadow>`.
  - A rule for a value that does not exist is `PDX_VARIANT_UNKNOWN`; a declared value no rule styles,
    `PDX_VARIANT_UNSTYLED`; an axis that cannot be read, `PDX_VARIANTS_MALFORMED`.
  - Library components follow in #512. (#153)
- `attach:` attaches behaviour to an element. `<input attach:tooltip="'Search'">` calls
  `tooltip(el, () => 'Search')` when the element is rendered. Its returned cleanup runs when the
  value changes and when the element goes, with no ref, `onMount` or `onDestroy` written by hand. On
  a component it attaches to the host.
  - Core ships `autofocus`, `trapFocus` and `clickOutside` as attachments, exported from
    `@pdxui/core`; the compiler imports them where a template names them.
  - An unknown name is `PDX_ATTACH_UNKNOWN`, and the editor checks the value against the
    attachment's type.
  - `attach()` is core's runtime for it. (#143)
- `pdx migrate [paths] [--dry]` moves code written in alpha to the beta. Every form the beta removes or
  changes is registered once in the compiler; a removed form is an error, `PDX_REMOVED_FORM`, whose
  message names what to write instead. `pdx migrate` rewrites every form that has a mechanical
  rewrite and lists each place a person has to rewrite — among them, where an arrow function is
  assigned to a `$signal` not typed as a function (#187 changed what that does), a `??=`/`||=`/`&&=`
  with a function on the right, `pdx({ inlineBindings })` in `vite.config`, and an unknown `@defer`
  trigger. A second run changes nothing; `--dry` writes nothing. (#121)
- `pdx({ target: 'baseline-2026' | 'baseline-2024' })` names the browsers the compiled output may rely
  on; `'baseline-2026'` by default. The scoped style is the first output that depends on it (#152). `'baseline-2024'` is a support target
  for apps whose users run older browsers: maintained frozen — fixed, not developed — and retired when
  `@scope` is Baseline widely available, in September 2028. (#121)
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

- `pdx-json-editor` has a certification manifest and a showcase page (#286): its contract,
  axe, hostile CSS and keyboard in all 13 themes, and visual baselines of the editor and of its
  open sub-modal. The site's gallery is ported from the showcase page, like the others; the page
  written for the site is gone.
- `pdx-json-editor` takes the beta contract (#286): its host is a `role="group"` named by its
  schema's `label`; its parts are `entry` (a scalar field), `branch` (an object or list of objects)
  and `dialog` (the sub-modal a branch opens).
- **`pdx-form-field` around a json editor** (#286): it took the editor's first sub-field as its
  control, so the field's label named that one sub-field and its error described it alone; and it
  passed `error` to every `pdx-input` inside, so every sub-field turned red. The editor's group is the
  control now, named by the label and described by the hint and the error; its sub-fields keep their
  own names and are neither required nor in error. `disabled` still reaches them.
- **Breaking:** `pdx-rich-text` takes `pdx-input`'s contract (#286).
  - **Events.** `pdx-focus`, `pdx-blur` and `pdx-ready` are declared and no longer bubble (#138): a
    listener goes on the element.
  - **States.** `readonly` is a custom state on the host; the editing area no longer carries
    `pdx-rt-readonly`, and is `aria-readonly` while read-only.
  - **Parts.** `toolbar`, `field` (the frame around the text) and `input` (the editing area).
- **`pdx-form-field` wires a contenteditable textbox** (#286): `pdx-rich-text`'s editing area was no
  control the field knew, and got neither the label nor the error. It is now named by the label and
  takes `aria-required`, `aria-invalid` and the description; a task list's checkbox inside it is
  content, not the field's control.
- **Breaking:** `pdx-inline-edit` takes `pdx-input`'s contract (#286).
  - **States.** `disabled`, `readonly` and `editing` are custom states on the host; its root no
    longer carries them as classes.
  - **Parts.** `root`, `display` (the value at rest, `role="button"`), `editor`, `save`, `cancel`.
  - **Methods and events.** `startEdit()`, `confirmEdit()` and `cancelEdit()` are exposed through
    the declaration, no longer assigned to the element by hand; `focus()` and `blur()` join them.
    `pdx-cancel` is declared. `name` is a host binding.
- **`pdx-form-field` wires an inline edit at rest** (#286). Its display, a `role="button"`, was no
  control the field knew: it got neither the label nor the error. It is now named by the label and
  its value and described by the hint and the error; while the editor is open, the editor's text box
  takes the field's usual wiring.
- **Breaking:** `pdx-tag-input` takes `pdx-input`'s contract (#286).
  - **States.** `invalid`, `success`, `warning`, `disabled`, `readonly` and `loading` are custom
    states on the host; its frame no longer carries them as classes.
  - **Parts.** `root` (the frame, `role="group"`), `input` (the text box), `tag` and `remove`.
  - **A2 and A4.** With `error` the text box is `aria-invalid`; while `loading` the group is
    `aria-busy`, no longer the host.
  - **Host.** `name` is a host binding (#133).
- `pdx-mention` takes the same contract (#286): custom states `disabled` and `readonly`; parts
  `root`, `input` (the textarea), `list` and `option`; `pdx-select` declared; `focus()` and `blur()`
  exposed; `name` a host binding.
  - **Fixed:** `disabled` or `readonly` set after mount now reach the textarea. They were read once,
    when it was built, so a field disabled later stayed editable.
- **Breaking:** `pdx-otp-input` takes `pdx-input`'s contract (#286).
  - **States.** `invalid` and `disabled` are custom states on the host; its group no longer carries
    `error` or `disabled`.
  - **Parts.** `root` (the cells' group), `cell` and `separator`.
  - **A2.** With `error`, each cell is `aria-invalid`: the group's role may not carry it.
  - **Events.** `pdx-complete` is declared, with `detail: { value }`.
- **`pdx-form-field` wires a group control** (#286). Around a `role="group"` or `role="radiogroup"`
  (`pdx-otp-input`, `pdx-radio-group`, a time picker's segments, …) it now points the group's
  `aria-describedby` at the hint and the error. The error's `aria-invalid` goes on a radiogroup
  itself; in a `group`, whose role may carry neither, the text boxes inside take `aria-invalid` and
  `aria-required`. It marked none of them before.
- **Breaking:** `pdx-number-input` takes `pdx-input`'s contract (#286).
  - **States.** They are custom states on the host: `invalid`, `disabled`, `loading`, and with
    `color-by-sign` `negative` and `positive`. Its group and field no longer carry `disabled`,
    `error`, `pdx-number-negative` or `pdx-number-positive`.
  - **Parts.** `root` (the group), `field` (the frame around the text), `input`, `decrement`,
    `increment` and `sign`.
  - **Disabled is drawn.** A disabled number input is now dimmed like the other fields. The class
    used to sit on the group, where no rule drew it.
  - **Busy.** While `loading`, the textbox is `aria-busy`, not the host.
  - **The design CSS** reaches a frame that is the `field` part inside the `root`. This is the
    pickers' structure too.
- **Breaking:** `pdx-textarea`, `pdx-password-input`, `pdx-search-input` and `pdx-masked-input` take
  `pdx-input`'s contract (#286). Their states are custom states on the host, and their frames no
  longer carry state classes:
  - textarea: `invalid`, `success`, `warning`, `disabled`, `readonly`, `loading`, `over-limit`;
  - password: `invalid`, `disabled`, `loading`;
  - search: `disabled`, `loading`;
  - masked: `invalid`, which is also set when a complete date or time is out of range, and `disabled`.

  Their pieces are named parts: `root`, `input`, and the textarea's `footer`, `count`, `word-count`,
  the password's `toggle`, `strength`, the search's `prefix`, `spinner`, `clear`, `shortcut`. While
  `loading`, the textarea and the password input mark their textbox `aria-busy` rather than the host;
  the search input marks its searchbox, which nothing marked before. The over-limit colour reaches
  the character count by its part, so a textarea's word count is never coloured.
- **Breaking:** `pdx-input` shows its states as custom states on the host (#286): `:state(invalid)`,
  `success`, `warning`, `disabled`, `readonly`, `loading` and `over-limit`. Its frame no longer carries
  the `error`, `success`, `warning`, `disabled` and `readonly` classes, nor its count `over`. A
  stylesheet that selected them inside the component selects the state and the part instead,
  `pdx-input:state(invalid) [data-part="root"]`. Its parts are `root`, `input`, `prefix`, `suffix`,
  `clear`, `spinner` and `count`. A native `.pdx-input-wrap` keeps the classes. While `loading`, the
  textbox is `aria-busy`. The frame's state colours read `--pdx-input-border-color-invalid`,
  `-success` and `-warning`, which default to the semantic colours.
- **Breaking:** `pdx-pin-input` is removed (#286): a masked PIN is `<pdx-otp-input mask>`. With `mask`,
  the otp-input takes the two defaults the pin-input added: `autocomplete="off"`, and the group name
  «PIN», the new component string `otp-input.maskedLabel` (the `pin-input` strings are gone). Without
  `mask` nothing changes. `pdx migrate` rewrites `<pdx-pin-input>` to `<pdx-otp-input mask>` with
  `length="4"` where none was written (pin-input had 4 cells, otp-input has 6), and flags an override of
  the `pin-input` strings and an existing `<pdx-otp-input mask>` that leaves its label or autocomplete to
  the new defaults. The `@pdxui/ui/pin-input` subpath is gone.
- **Breaking:** `pdx-dialog` and `pdx-sidebar` declare their axes (#633), reflected on the host with
  their defaults, and drawn by `@variant` rules.
  - `pdx-dialog`: `size` (sm, md, lg, xl, full). Its panel, the root part, no longer carries
    `.pdx-dialog-{size}`; the class stays for pdx-alert-dialog, the overlay outlet and native markup.
  - `pdx-sidebar`: `position` (left, right). The host no longer carries `.pdx-sidebar-right`, and the
    class is gone from the CSS: nothing used it on native markup.
  - These keep their props: `pdx-drawer`'s `position`, `size` and `mode`, drawn on its panel, which
    an overlay drawer moves to `<body>` where no host rule reaches it, and whose `size` also takes
    any CSS width; and `pdx-edit-drawer`'s `position` and `size`, passed on to its drawer.
- **Breaking:** the surfaces, navigation and display components declare their axes (#632), reflected
  on the host with their defaults, and drawn by `@variant` rules; where native markup has a class for
  the same look, the rule compiles to it too.
  - `pdx-card`: `variant` (default, outline, elevated, flat). Its root no longer carries
    `.pdx-card-{variant}`; it is `data-part="root"`.
  - `pdx-fieldset`: `variant` (bordered, filled, plain) and `size` (sm, md, lg). Its fieldset no
    longer carries `.pdx-fieldset-{variant}` or `.pdx-fieldset-{size}`.
  - `pdx-tabs`: `variant` (line, card, pills). The host no longer carries `.pdx-tabs-card` or
    `.pdx-tabs-pills`, and those classes are gone from the CSS: nothing used them on native markup.
    `[pdx-tab-style="pill"]`, the theme's pill mode, is unchanged. With the class gone, the design
    reset no longer reaches into a card or pills tabs' panels, as it never did for line tabs.
  - `pdx-description-list`: `size` (sm, md, lg). Its list no longer carries `.pdx-dl-{size}`.
  - `pdx-statistic`: `size` (sm, md, lg). The host no longer carries `.pdx-statistic-sm`/`-lg`, and
    those classes are gone from the CSS.
  - `pdx-wizard`: `size` (md, sm). Its stepper, its root part, no longer carries `.pdx-stepper-sm`;
    a native stepper keeps it.
  - `pdx-nav-menu`: `size` (md, sm), `indicator` (fill, border), `chevron` (start, end) and
    `actions` (inline, overlay). The host no longer carries `.pdx-nav-{look}-{value}`, and those
    classes are gone from the CSS.
  - `pdx-kbd`: `size` (sm, md, lg). Its combo no longer carries `.pdx-kbd-{size}`; a native key keeps it.
  - `pdx-avatar-group`: `size` (xs, sm, md, lg, xl), still passed to every avatar. Its overflow badge
    no longer carries `.pdx-avatar-size-{size}`, and those classes are gone from the CSS.
  - These keep their props, since the CSS does not draw them: `pdx-divider`'s `variant` and
    `pdx-icon`'s and `pdx-avatar`'s `size` and `shape`, all inline styles (`pdx-icon` also takes a
    number of pixels).
- **Breaking:** `pdx-badge`, `pdx-banner`, `pdx-progress` and `pdx-toast` declare their axes (#631),
  reflected on the host with their defaults, and drawn by `@variant` rules that also compile to the
  native classes.
  - `pdx-badge`: `variant` (primary, secondary, success, danger, warning, info, muted, outline, and
    outline with a colour), `size` (sm, md, lg) and `shape` (pill, square). Its counter no longer
    carries `.pdx-badge-{variant}`, `.pdx-badge-{size}` or `.pdx-badge-square`, nor its dot
    `.pdx-dot-{variant}`; the element is `data-part="root"`. A native dot keeps its `.pdx-dot-{variant}`.
  - `pdx-banner`: `variant` (info, success, warning, danger, and error, danger's other name). Its root
    no longer carries `.pdx-banner-{variant}`.
  - `pdx-progress`: `size` (sm, md, lg). Its track and its ring no longer carry `.pdx-progress-{size}`.
  - `pdx-toast`: `position` (top-right, top-left, bottom-right, bottom-left, top-center, bottom-center).
    Its container no longer carries the `position` attribute; it is `data-part="root"`. A native
    `.pdx-toast-container` keeps its `position` attribute.
  - These keep their props, since they only pass them on or choose markup: `pdx-progress`'s `variant`,
    set as an attribute on its bar and ring, which the stylesheet draws; `pdx-alert-dialog`'s
    `variant`, which picks its confirm button's class; and `pdx-spinner`'s and `pdx-block-ui`'s
    `variant`, and `pdx-spinner`'s `size`, an inline pixel size.
- **Breaking:** `pdx-chip` and `pdx-fab` declare their axes (#630), reflected on the host with their
  defaults, and drawn by `@variant` rules that also compile to the native classes.
  - `pdx-chip`: `variant` — outline (the default, the base look), primary, success, danger, warning,
    info, tonal, tonal-primary, tonal-success, tonal-danger, tonal-warning — and `size` (sm, md, lg).
    Its pill no longer carries `.pdx-chip-{variant}` or `.pdx-chip-{size}`; it is `data-part="root"`:
    `pdx-chip[variant="danger"] > [data-part="root"]`.
  - `pdx-fab`: `variant` (primary, secondary, danger), `size` (sm, md, lg) and `position` (bottom-right,
    bottom-left, top-right, top-left). Its button no longer carries `.pdx-fab-{variant}` or
    `.pdx-fab-{size}`; it is `data-part="root"`. The host no longer carries `.pdx-fab-{position}`: the
    `position` attribute places it, `pdx-fab[position="top-left"]`.
  - `pdx-button-group`, `pdx-toggle`, `pdx-split-button` and `pdx-dropdown-menu` keep `variant` and
    `size` as plain props: they only forward them to a `pdx-button` or to a native button, which draw
    them.
- **Breaking:** the choice controls declare `size` as a variant axis, sm, md and lg, and `pdx-slider`
  its `color`, primary, success and warning (#629). Each is reflected on the host, the default
  included, and drawn by `@variant` rules that also compile to the native classes on the element
  alone, so `<input type="checkbox" class="pdx-checkbox pdx-checkbox-sm">` is sized as before. CSS that
  reached a control through the class it put on its own elements must target the host instead:
  - `pdx-checkbox`, `pdx-radio` and `pdx-switch` no longer put `.pdx-checkbox-{size}`,
    `.pdx-radio-{size}` and `.pdx-toggle-{size}` on their input, which carries `data-part="root"`:
    `pdx-checkbox[size="sm"] > label > [data-part="root"]`.
  - `pdx-segmented`, `pdx-slider` and `pdx-rating` no longer put `.pdx-segmented-{size}`,
    `.pdx-slider-{size}` and `.pdx-rating-{size}` on their root, nor `pdx-slider` `.pdx-slider-{color}`:
    `pdx-slider[color="success"] > [data-part="root"] .pdx-slider-fill`.
  - `pdx-checkbox-group` and `pdx-radio-group` keep `size` as a plain prop: they pass it to their
    children, which carry the axis. `pdx-rating`'s `color` stays a plain prop: it takes any colour.
- **Breaking:** the pickers declare `size` as a variant axis (#628), as the text fields do (below). It
  is reflected on the host, `md` included, and drawn by `@variant` rules that also compile to the
  native classes, so native markup is styled as before. CSS that reached a picker through the class
  it put on its own elements must target the host's `size` instead:
  - `pdx-select`, `pdx-autocomplete`, `pdx-cascader`, `pdx-tree-select` and `pdx-date-picker` no
    longer put `.pdx-input-{size}` on their trigger, which carries `data-part="root"` and shares the
    text fields' size rules: `pdx-select[size="sm"] > [data-part="root"]`.
  - `pdx-time-picker` no longer puts `.pdx-time-picker-{size}` on its fields' group, `pdx-color-picker`
    `.pdx-color-swatch-{size}` on its swatch, and `pdx-file-upload` `.pdx-file-upload-{size}` on its
    root: each is `data-part="root"`, and the sizes are sm, md and lg. pdx-time-picker now follows a
    size set after it is drawn; it read it once.
  - `pdx-transfer` keeps `size` as a plain prop: its `.pdx-transfer-{size}` class was drawn by no rule.
- **Breaking:** the text fields declare `size` as a variant axis (#627). It is reflected on the host,
  `md` included (`<pdx-input size="md">`), and drawn by `@variant` rules in `@pdxui/design` keyed on it,
  which also compile to the native classes, so `<input class="pdx-input pdx-input-sm">` is styled as
  before. A size outside the axis reflects `md`. CSS that reached a component through the class it put
  on its own elements must target the host's `size` instead:
  - `pdx-input`, `pdx-password-input`, `pdx-search-input`, `pdx-textarea`, `pdx-masked-input`,
    `pdx-tag-input` and `pdx-number-input` no longer put `.pdx-input-{size}` on their frame. The frame
    carries `data-part="root"`: `pdx-input[size="sm"] > [data-part="root"]`. pdx-number-input's inner
    field is `data-part="field"`.
  - `pdx-otp-input` no longer puts `.pdx-otp-{size}` on its cells' wrapper:
    `pdx-otp-input[size="sm"] > [data-part="root"] .pdx-otp-cell`.
  - `pdx-label` and `pdx-form-field` no longer put `.pdx-field-label-{size}` on their label:
    `pdx-label[size="sm"] > [data-part="root"]`, `pdx-form-field[size="sm"] > [data-part="root"] > .pdx-field-label`.
  - `pdx-form-field` passes a size other than `md` on to its controls, as it passed any size it was
    given; its reflected default is not passed on.
  - `pdx-input-group`, `pdx-pin-input` and `pdx-inline-edit` keep `size` as a plain prop. They pass
    it on to their children and draw no size of their own.
- **Breaking:** in a form section, a control is no longer wired to the form above by its `name`, nor a
  `<pdx-form-field>` by its `name` (#613). A section is a component that declares
  `@form x: Values from parent;` or calls `useForm()` / `tryUseForm()`. A named control with no binding
  there is `PDX_REMOVED_FORM`, as inside `<pdx-form :form>` since #128.
  - `pdx migrate` (`form-name-binding`) rewrites it to the declared form, `::<model>="x.email"` and
    `:field="x.email"`. A section that only calls `useForm()` / `tryUseForm()` names no values type,
    so it is flagged: declare `@form x: Values from parent;` and bind to it.
  - `pdx-form` no longer pushes its values into the controls it finds by `name`. A control shows its
    field through its binding, so `setValues()` and `reset()` reach every bound control.
  - With the wiring gone, `registerCompilerFormControl()` is gone from `@pdxui/compiler`, and so are
    `pdx({ formControls })` and `compile()`'s `modelEventOf` option. `formControls` had stopped
    reaching the compiler: it registered into a registry nothing read.
  - The showcase's intake window, details and billing steps and its employee identity group are
    migrated. The refused-on-another-tab count reads each field's name from its control.
- **Breaking:** `pdx-button` no longer puts its variant class on its inner `<button>` (#512). The
  variant is the host's attribute, `<pdx-button variant="ghost">`, and the design system styles it
  through `@variant pdx-button` rules; the inner `<button>` carries `data-part="root"`, its base class
  `pdx-button`, the same for every variant, and its state classes, `pdx-loading` and `pdx-pressed`. CSS that styled a `pdx-button` through
  `.pdx-primary` and friends on its inner button must target the host instead:
  `pdx-button[variant="primary"] > [data-part="root"]`. A native `<button class="pdx-primary">`
  is styled as before.
- **Breaking:** what a native `<form>` receives from some value components (#135).
  - **Lists:** `pdx-tag-input` and `pdx-checkbox-group` submit one entry per item under their `name`,
    as a native multi-select does, instead of one entry holding the JSON array. A range `pdx-slider`
    submits two entries, the low and the high, instead of `"20,80"`.
  - **Empty fields:** an empty `pdx-otp-input`, `pdx-pin-input`, `pdx-masked-input` or
    `pdx-color-picker` submits an empty entry, as a native text input does, instead of none.
  - **Autocomplete:** a picked `pdx-autocomplete` suggestion submits its value, the code its model
    holds, instead of the label shown. Free text is submitted as typed, as before.
  - **More lists:** a multiple `pdx-select`, a multiple `pdx-tree-select`, `pdx-transfer`, a range
    `pdx-date-picker` and a `pdx-cascader` path submit one entry per item instead of a comma-joined,
    JSON or `start/end` entry.
  - **Inline edit:** `pdx-inline-edit` submits text and numbers as they are and a boolean as
    `true`/`false`, with JSON only for an object, instead of JSON for every value (`"\"Jane\""`). With
    no value it submits nothing, instead of an empty entry.
  - **Documents and files:** `pdx-rich-text` (a JSON document as JSON) and `pdx-json-editor` submit
    under their `name`. An empty `pdx-file-upload` submits what an empty native file input does: one
    file with no name.
- **Breaking:** inside `<pdx-form :form="f">`, a control is no longer wired to its field by its `name`,
  nor a `<pdx-form-field>` by its `name`: each is `PDX_REMOVED_FORM`. A control binds through its
  model, `::value="f.email"`, and a form field names its field, `:field="f.email"`. `pdx migrate`
  (`form-name-binding`) writes both, the control's model from its manifest, and keeps the control's
  `name` as the full path inside a `<pdx-field-group>`; a control with no manifest entry or with
  several models (`pdx-checkbox`: `checked`, `indeterminate`) is flagged. A form section follows in
  #613, below. The showcase's and the demo pages' forms are migrated. (#128)
- **Breaking:** a form's fields are its members: `f.email`, a nested one `f['customer.name']`, beside
  `f.valid()` and `f.reset()`. `f.fields` is gone; `f.fields.x` in a `.pdx` is `PDX_REMOVED_FORM`, and
  `pdx migrate` rewrites it to `f.x` in `.pdx` and `.ts` files, for the names a file declares as a form.
  - A field named like a member of the form — `valid`, `errors`, `reset`, `dirty`, `state`, `touched`,
    `getValues`, `handleSubmit`, `array` and the others — is `PDX_FORM_FIELD_RESERVED` on an inline
    `@form`, and `createForm` throws with that code for any form. `pdx migrate` flags it: the field's
    name is also the server's, so the rename is the author's.
  - A name known only at run time is read with `formField(form, name)`, which returns the field or
    `undefined` and never a member; `formFieldNames(form)` lists the fields. Both are exported from
    `@pdxui/core`. A form typed by a record types no field members: it reads them this way. (#128)
- **Breaking:** `pdx-relative-time`'s wording length is `format-style` (`formatStyle`), no longer
  `style`. A prop named `style` replaced the element's own `style`, so `el.style.color = …` threw.
  `pdx migrate` rewrites `style="long"`, `"short"` and `"narrow"` on the tag; any other `style` is an
  inline style and is left. (#545)
- One reading rule for declarations: any of them may span lines when it opens a balanced `{ … }` or
  `( … )` on its first line. `@prop size: {`, a `@slot` signature, `@fetch`'s and `@loader`'s options,
  `@title $t(…)` and a `@snippet`'s parameters were misread when wrapped; they compile as their
  one-line form. A body (`@raw`, `@action`, `@snippet`) keeps its lines. (#524)
- A design stylesheet that reads another component's token, as the first argument of a `var()`, fails
  `pnpm lint`. What components shared is now global: `--pdx-control-min-height` and
  `--pdx-control-radius`, read with the old token as the fallback alias, so a theme that sets
  `--pdx-button-min-height`, `--pdx-input-min-height` or `--pdx-button-radius` still applies.
  `pdx-input`'s manifest no longer lists `--pdx-input-height`, which nothing declared. (#514)
- A `<style scoped>` block of a component whose template writes nothing inside a component's tag
  compiles, on `baseline-2026`, to the donut scope's single-root form: `@scope ([data-pdx-H]) to (…)`,
  each selector `:scope S` alone, same specificity. The showcase's CSS falls 63.0 → 62.3 KB gzip. (#511)
- A level whose own params are unchanged but whose query changed runs its loader again: the query is
  part of what a loader is called with, and two queries are two results. (#148)
- The router keeps loader results in core's cache, which is now part of every routed app's entry:
  about 1.5 KB gzip, measured on the showcase (41.1 → 42.6 KB). (#148)
- A route loader that fails no longer mounts its page as if nothing had happened: the level renders
  its error page, with a **Try again** button that runs the loader again, and the levels above it stay.
  `currentNavError()` is `'500'` there, at `currentNavErrorDepth()`; a registered error page for
  `'500'` replaces the default one. The router's strings gain `loaderFailed` and `retry`. (#147)
- `@loader` names what it loads: `@loader user: loadUser;` declares `user`, a source with the async
  vocabulary read from the router's state of the page's pattern — `user.data()`, `user.state()`,
  `user.error()`, `user.pending()`, and `@await (user as u)` reads it. In the editor `user.data()` is
  typed by what the function returns. `loaderSource(pattern)` and the `LoaderSource` type are exported
  from `@pdxui/router`.
  - The anonymous `@loader loadUser;` is `PDX_REMOVED_FORM`, and so are `currentLoaderData()` and
    `currentLoaderState()`, which leave `@pdxui/router`. `pdx migrate` names the loader after its
    function, `@loader loadUser: loadUser;`, rewrites the page's readers to `loadUser.data()` and
    `loadUser.state()`, and flags them on a page with no loader. It flags a loader that reads
    `location` or `currentParams()`: the router hands it its params. (#506)
- **Breaking:** `::x` on a component listens to its model's event only. The alpha listening to
  `pdx-input` and `pdx-change` is gone: every value component of the library declares its model, the
  last one, `pdx-pin-input`, with this change (`value-change`; it no longer emits `pdx-input`).
  - On a library component's prop that is not a model, `::x` is now `PDX_TWO_WAY_NOT_MODEL`, as on a
    project's component: `::page` on `pdx-pagination` was one-way in all but name.
  - An element whose class is defined after the binding — a component loaded later — is listened to
    once it is defined; it bound one way.
  - The form binding, compiled without the library's manifest, binds a control by the beta convention,
    `value-change` and `detail.value`, not `pdx-change`. (#125)
- The pickers declare their value as a model, announced with `value-change` and `{ value }`:
  `pdx-select`, `pdx-autocomplete`, `pdx-cascader`, `pdx-tree-select`, `pdx-transfer`, `pdx-tag-input`,
  `pdx-mention`, `pdx-date-picker`, `pdx-time-picker`, `pdx-calendar` and `pdx-color-picker`. `::value`
  binds each both ways, and a form binds each to its model.
  - The value is the mode's whole value: a multiple select's array of values, the cascader's path,
    `[start, end]` for a range or a week of the calendar and the date picker, and in `datetime` mode the
    date and its time, `2026-03-14T09:30` — so changing the time alone is a change of the value.
  - **Breaking:** they no longer emit `pdx-change`, `pdx-input` or `change`. A listener on one is
    `PDX_REMOVED_FORM`, and `pdx migrate` rewrites an inline handler through each component's mapping:
    the parts that are not the value are read from the element — `selectedItem`, `getLabels()`,
    `getLabel()`, `getRange()`, `getTime()`, `getQuarter()`, `getHex()`, `getChanges()` and the rest.
  - `pdx-autocomplete`'s value is the committed value — the picked suggestion's value field, or free
    text confirmed — not the text typed: `el.value` is the code, `getText()` the label shown and
    `getSelectedItem()` the suggestion. The text typed is a declared event, `query-change`, and
    `pdx-tag-input`'s draft is `draft-change`; `pdx migrate` rewrites `@pdx-input` on them to those
    (`alphaRename` in the manifest, `@alpharename` on the JSDoc).
  - `pdx-color-picker` and `pdx-mention` commit with a native `change` bubbling to the host, as the text
    fields do: on the hex field's or the textarea's own, and dispatched when a drag ends, a preset or a
    mention is picked.
  - At its `min` or `max`, `pdx-time-picker` announces nothing: the step comes back to the value it
    holds.
  - `pdx-json-editor` no longer drops, after its first edit, a sub-modal's apply, a removed row, or now
    a select or tag input inside it: the rebuild guard marked the build stale when the editor's own
    write re-ran its track. (#481)
- The text fields declare their value as a model, announced live with `value-change` and `{ value }`:
  `pdx-input`, `pdx-textarea`, `pdx-number-input` (`number | null`), `pdx-password-input`,
  `pdx-search-input`, `pdx-masked-input` (the unmasked value) and `pdx-otp-input`. `::value` binds each
  both ways, and a form binds each to its model.
  - They no longer emit `pdx-input` or `pdx-change`. The commit, on blur or Enter, is the inner input's
    native `change`, which bubbles to the host: `@change` saves on commit and reads
    `$event.currentTarget.value`. A stepper of `pdx-number-input` and the clear buttons dispatch that
    `change` themselves.
  - `pdx migrate` rewrites `@pdx-input` to `@value-change` and `@pdx-change` to `@change`, so a commit
    handler stays a commit handler, and `detail.value` reads the element's `value`. The manifest
    records the commit event as `alphaCommit` (`@alphacommit` on the JSDoc).
  - `pdx-masked-input`'s alpha `detail.formatted` and `detail.valid` are its methods `getFormatted()`
    and `isValid()`, and `pdx migrate` rewrites them so.
  - `::value.lazy` on a component's model writes on that native `change`, not on the model's event.
  - `pdx-search-input` keeps `pdx-search` and `pdx-clear`, `pdx-otp-input` keeps `pdx-complete`, and
    `pdx-pin-input` still announces `pdx-input`.
  - A library control created before its class is defined — `pdx-field-list` creates its controls
    without importing them — is wired to its model's event once the class is defined; it was wired to
    the alpha one.
  - In the editor and `pdx check --types`, a handler's `$event.currentTarget` on a component is that
    component's element, with the props, models and methods its manifest lists, so
    `@change="e => save(e.currentTarget.value)"` is checked. `pdx check --types` types the project's
    components as the editor does; it typed none. (#479)
- The editors and the upload declare their value as a model, announced with `value-change` and
  `{ value }`: `pdx-rich-text`, `pdx-json-editor`, `pdx-inline-edit`, and `pdx-file-upload`, whose
  value is the `File[]` it holds. `::value` binds each both ways — on `pdx-file-upload` for the first
  time: it had no `value`.
  - They no longer emit `pdx-change`. A listener on it is `PDX_REMOVED_FORM`, and `pdx migrate`
    rewrites an inline handler: `detail.doc`, `detail.html` and `detail.text` of the rich text are
    `detail.value`, and its `detail.wordCount` is `getWordCount()`. The rich text's event no longer
    bubbles.
  - `getFormControlConfig()` describes the choice controls (#480) and `pdx-inline-edit` by their
    model's event, not the alpha one. (#482)
- The choice controls declare their value as a model and announce it with the model's event, whose
  detail is `{ value }`: `checked-change` on `pdx-checkbox`, `pdx-switch` and `pdx-radio`,
  `pressed-change` on `pdx-toggle`, `value-change` on `pdx-radio-group`, `pdx-checkbox-group`,
  `pdx-segmented`, `pdx-rating` and `pdx-slider`. `::checked`, `::pressed` and `::value` bind them both
  ways, and a form binds each to its model.
  - They no longer emit `pdx-change`, `change`, `pdx-pressed-change` or `pressedchange`. A listener on
    one is `PDX_REMOVED_FORM`, and `pdx migrate` rewrites an inline handler — `e.detail.checked` on a
    checkbox becomes `e.detail.value`, its `value` and `indeterminate` the element's — and lists a
    handler it cannot. `@change` is flagged, not rewritten: a native `change` from the inner input
    still reaches the host.
  - `pdx-checkbox` also has `indeterminate` as a model, `indeterminate-change`, so a tristate's step
    from indeterminate to unchecked is announced.
  - `pdx-checkbox-group`'s value is the comma-separated selection; `values` is `value.split(',')`.
  - `pdx-slider` keeps `pdx-change-end` at the end of a drag. (#480)
- `@defer` has two phases. `@defer (interaction; prefetch idle)` fetches the block's code when the
  browser is idle and mounts it on the first pointer or focus entry; without `; prefetch` both start
  together, as before. A prefetch goes through the prefetch queue, the render's load ahead of it, and a
  prefetch that fails shows nothing: the render loads again.
  - `when (expr)` is a trigger in either phase: it fires the first time the expression is true, and
    does not un-fire.
  - `@error (err, retry)` names the load's error and a `retry` that loads the code again, as
    `@await`'s `@error` does.
  - `@defer (hover)` is `PDX_REMOVED_FORM`: it was `interaction` under another name, and `pdx migrate`
    rewrites it. (#281)
- Two script forms the compiler read wrongly, in silence, are errors. A `$` rune outside its place —
  `$signal`, `$derived`, `$store` that are not the whole initialiser of a top-level declaration,
  `$effect`, `$watch` that are not a top-level statement — is `PDX_RUNE_POSITION`, its hint naming the
  core function for that place; it was left as written and undefined at run time, and an `$effect`
  inside an `if` was lifted out of it. An `@store` `persist` other than `'local'` or `'session'` is
  `PDX_UNKNOWN_DECLARATION`; it kept the store in `sessionStorage`. `pdx migrate` lists both. (#278)
- `@page` is the one home of every route field. Further paths are aliases, and the options are
  `keepAlive`, `preload`, `prefetch`, `label`, `transition` and `meta`:
  `@page '/users', '/people' { prefetch: 'hover', transition: 'fade', meta: { requiresAuth: true } };`.
  - `@route { … }`, `@alias`, `@prefetch`, the script's `@transition` and `@meta { … }` are
    `PDX_REMOVED_FORM`; `@meta name: '…'` writes the head only. The template's `@transition` modifier
    of `@if` and `@for` stays.
  - `@head { … }` is removed: `@title` and `@meta` write the head.
  - An option `@page` does not have is `PDX_PAGE_UNKNOWN_OPTION`; it used to be ignored.
  - `pdx migrate` rewrites each removed form: `@route` into `@page` and the declarations it carried,
    `@head` into `@title` and `@meta` lines. (#277)
- A `<style scoped>` stops at nested components. Under the default `target: 'baseline-2026'` a scoped
  block compiles to a CSS `@scope` that starts at the host and ends where a child component begins,
  so a rule styles the component's own elements and no longer the inside of a child.
  - Content a component writes inside a child's tag stays in its scope: the compiler marks it
    `data-pdx-<hash>-in`. Core sets `data-pdx-root` on every component host.
  - `:scope` in a scoped block is the host, on both targets.
  - A scoped rule weighs what it weighed before against global CSS.
  - `target: 'baseline-2024'` keeps the ancestor form, which still reaches into children.
  - A child is styled through its `[data-part]`, `:state()` and tokens. `pdx migrate` lists each
    scoped selector that reached inside one (`scoped-reaches-child`).

  (#152)
- Routes are types. The build and the dev server write `.pdx/routes.d.ts` from the app's `@page`
  patterns, and the editor and `pdx check --types` read it.
  - `navigate('/users/:id', { id: 42 })` checks; an unknown path, a wrong param, or a concrete URL in `navigate()` is a type error.
  - A param is typed by its constraint: `:id(number)` is a `number`, anything else a `string`.
  - A concrete URL is `navigate.url('/users/42')`.
  - `<pdx-link to="/users/:id" :params="{ id: u.id }">` is checked the same way. It now takes `params` as a property, so a binding works, and points its `href`, click and active state at the filled URL; the pattern used to end up in the `href`.
  - `pdx migrate` turns a literal URL in `navigate()` into `navigate.url()` and lists the calls whose path is computed.
  - `RouteRegistry`, `RoutePath`, `RouteParams` and `RouteArgs` are exported from `@pdxui/router`.

  (#150)
- `@await` understands a source, binds its result with `as`, and decides by state, not truthiness.
  `@await (users as list) { … } @loading { … } @error (e, retry) { … }` takes an `@fetch`, a resource,
  `useQuery` or a promise.
  - `@loading` shows while there is no data yet, and `@error` when a first load fails; `retry` calls `refetch()`.
  - The body gets the result as `list`, typed in the editor, and stays through a refresh, including a failed one.
  - A plain `null`, `0` or `''` renders the body; `undefined` and `false` wait. They used to stay on `@loading`.
  - `maxMs` is a timeout to `@error` with an `AwaitTimeoutError`, exported from `@pdxui/core`; it used to render the body over a pending promise.
  - `minMs` is a delay, and both timers restart when the block starts waiting again.
  - A type assertion in the expression goes in its own parentheses: `@await ((x as T) as list)`.
  - `maxMs` not greater than `minMs` is `PDX_AWAIT_TIMING`.
  - `pdx migrate` parenthesises an alpha `@await (x as T)` and flags every `maxMs` and plain operand.
  - The compiler emits `awaitBlock()`, new in core; `awaitReady` and `awaitTimed` follow the same rules.

  (#145)
- Every async source speaks one vocabulary: `data()`, `error()`, `state()`, `pending()`, and
  `stale()` where it caches. That holds for a resource (`@fetch`, `resource()`, `httpResource()`),
  `useQuery` and a mutation.
  - `state()` is `'idle' | 'pending' | 'success' | 'error'`: `'pending'` is a first load, and a refresh keeps `'success'` with `pending()` true.
  - `error()` is `null` when there is none, and only a new success clears it.
  - A failed refresh keeps the data, with `state()` `'error'` and `stale()` true; it used to look like a refresh in progress.
  - `resourceWhen` renders its success branch for `null`, `0`, `false`, and `undefined` too, with a warning in development.
  - Removed: `loading()`, `isPending()`, `status()`, `useQuery`'s `isLoading()`, `hasData()` and `isStale()`, the `state()` values `'loading'`, `'reloading'`, `'stale'` and `'local'`, the `ResourceStatus` type, and `resourceWhen`'s `stale` and `reloading` branches.
  - A route loader's state is `'idle' | 'pending' | 'success' | 'error'`; it was `'loading'` and `'done'`.
  - `pdx migrate` rewrites `isPending()` to `pending()` and the loader's words, and lists the rest.

  (#141)
- A component's events no longer bubble unless they are declared to, Angular's `output()` rule: an
  event named `change` or `close` was, on an ancestor, the native one of every input inside. In a
  `.pdx`, `@event saved: T;` stays on the host and `@event(bubbles) saved: T;` bubbles and crosses
  shadow roots; `pdx migrate` writes `(bubbles)` on every existing `@event`, and
  `PDX_EVENT_BUBBLES_UNUSED` lists the ones nothing hears above the component. `$emit` is removed
  (`PDX_REMOVED_FORM`): dispatch with the function `@event` declares, which `pdx migrate` writes for
  you. **The `@pdxui/ui` components' events stay on the component too**, `pdx-change` included: a
  listener on a `<form>`, a section or `document` that heard every field's `pdx-change` hears nothing
  — listen on the component. `emit()` and `ctx.emit()` take `{ bubbles: true }`, and a descriptor's
  `event({ bubbles: true })`, to opt in. (#138)
- `inlineBindings` is no longer in the type of `pdx()`'s options: a typed `vite.config.ts` that still
  sets it does not compile. An untyped config is still told, `PDX_INLINE_BINDINGS_IGNORED`. (#121)
- A `.pdx` renders through one path, in dev as in a build: the dev server compiles a template to the
  same DOM code a production build ships, so nothing it shows can be missing from the built app.
  `pdx({ inlineBindings })` no longer selects a render path; a value given is reported as
  `PDX_INLINE_BINDINGS_IGNORED` — remove it. The tagged template, `html`, stays in `@pdxui/core` for
  components written by hand. Two consequences in dev, already true in a build: an HTML comment in a
  template is not put in the DOM, and `${…}` in an attribute inside a `@for` is text, as it is
  everywhere else. A component's `::name` two-way binding now reaches the prop it declares, as `:name`
  does (`::withborder` is `withBorder`). (#107)
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

- `pdx-otp-input` follows a change after it is first drawn: a new `length`, `separator`, `error`,
  `disabled` or `mask`, and a value set from outside, reach the cells. The first build wrote over the
  class it found its container by, and every later build found none and did nothing. (#659)
- `form-fields-member` no longer reads a translation key that starts with a form's name,
  `$t('intake.fields.requester')`, as a read of `intake.fields`: a file with a form named like its
  strings was told its keys were a removed form. (#613)
- `pdx-select`'s `item` slot receives each option's position in the list as `index`; it was always
  `0`. (#491)
- A `pdx-mention` whose `value` a parent sets submits that text in a native form; before, it kept
  submitting the markup of the text it replaced. (#135)
- A `@prop`, `@model` or typed `@slot` named after one of the `HTMLElement` members whose replacement
  breaks the element — `style`, `children`, `dataset`, `classList`, `className`, `innerHTML`,
  `textContent`, `shadowRoot` and the `on*` event handlers — is `PDX_NAME_RESERVED`, and a TypeScript
  descriptor is warned in development. A prop `onclick` was never called on a click, and code outside
  the component that used the element's member broke. `id`, `title`, `prefix` and `offsetTop` stay
  allowed. (#545)
- An `@action` whose parameter type has a comma in its type arguments — `dto: Omit<Person, 'id'>`,
  `Record<string, number>` — compiles. The parameter list was split at that comma, the declaration
  was dropped as not a form of `@action`, and its body was left in the script. (#578)
- A `@defer` whose trigger has parentheses of its own — `when (…)`, `idle(ms)`, `timer(ms)` — keeps
  the components it renders out of the route's chunk. The compiler did not recognise the block, gave
  them a static import too, and the bundler put them back where the page loads. (#245)
- A page that stays mounted while its route loader runs again — the same route, another id — no
  longer renders its `@await` body with the alias undefined, which threw in a binding and logged an
  unhandled effect error. The router wrote a level's data, state and error one by one, and a reader
  saw the level with its data gone and its state still `'success'`; it writes them as one now. (#569)
- An `export` of a value in a component's script is `PDX_SCRIPT_EXPORT`, and the declaration is
  compiled without it. It landed inside `setup()`, where it is a syntax error, and the module failed
  to load with no word from the compiler. A type export, a `@store` module and a `.pdx.ts` module
  are unchanged. (#551)
- A `$` rune as the value of `@provide` (`@provide Theme = $signal('dark');`) is
  `PDX_RUNE_POSITION`. It was emitted as written, and `$signal` was not defined when the setup ran.
  (#550)
- A `@prop`, `@model` or typed `@slot` named after a member of the element (`body`, `track`, `emit`,
  `frame`, `attr`, the lifecycle callbacks, the form-associated API) is `PDX_NAME_RESERVED`. It
  replaced that member: a slot named `body` replaced the render method, and the component rendered
  nothing. A TypeScript descriptor is warned in development. `form` stays allowed for form
  components. (#542)
- A component whose only declaration is a `@part` mounts: its part's ref is a signal, which the module
  called without importing, so the setup threw. (#153)
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
