<!-- Copied from packages/site/content/docs/devtools.md by gen-topics.mjs: edit it there. -->

# DevTools

PDX has no virtual DOM and no hidden magic, so debugging is mostly "read the signal, read the
generated code". For the rest there's an in-browser overlay and a console namespace that let you see
the live component tree, every signal's value and subscriber count, and a trace of what changed.

## The overlay

In dev, the compiler injects DevTools automatically (a small **PDX** badge, bottom-right). Open it
with the badge or **Ctrl + Shift + D**. Three tabs:

- **Components** — the live tree of mounted PDX components with their props.
- **Signals** — every named signal: name, current value, and how many subscribers it has
  (a signal with 0 subscribers is dead weight; a surprising count hints at an over-wide dependency).
- **Trace** — enable it to record each signal write and the effect it ran, in order — the timeline
  of a reactivity bug.

The inspector only records at **telemetry level 2**, and a signal is recorded when it is created.
So the devtools raise the level to 2 as the page loads, before your app runs, and the panel says so;
the dev server puts their script first in the page for that reason. It only ships in `pdx dev`;
`pdx build` strips it, so there's zero cost in production.

## The console namespace: `__PDX_DEVTOOLS__.debug`

The overlay reads the object core installs in development, and you can use it in the console:

```js
const d = __PDX_DEVTOOLS__.debug;
d.signals()        // [{ name, value, subscriberCount }, …]
d.effects()        // [{ name, deps, active }, …] — every live effect and what it read
d.stores()         // [{ id, snapshot }, …] — each @store and its state now
d.componentTree()  // [{ tag, el, props, children }, …] — live elements; tree() below is the JSON one
d.trace(true)      // start recording; trace(false) to stop
d.traceLog()       // [{ trigger, oldValue, newValue, effect, timestamp }, …]
```

Handy when you want to script a check or grab state at a breakpoint. The same object is the
`__pdx_debug` export of `@pdxui/core`, for code that imports it.

## For agents: `__PDX_DEVTOOLS__` v2

An agent driving a browser asks the running app what it is showing through the global itself — a
versioned API whose every answer is JSON. It is there from page load in development, with no level
to set, and absent from a production build.

Start with the members made for an agent's budget. The map and the shell are what every page shares,
read once per session; the card and the outline are read on each page:

```js
__PDX_DEVTOOLS__.map()             // the routes: pattern, params and their types, title, guard, access
__PDX_DEVTOOLS__.shell()           // the outline of everything outside the route: the navigation, the bar
__PDX_DEVTOOLS__.page()            // the page card, JSON, a couple of hundred tokens
__PDX_DEVTOOLS__.outline()         // the outline of the route's content, a fraction of a full snapshot
__PDX_DEVTOOLS__.outline({ maxItems: 10 })   // show more rows before summarising them
```

**`map()`** is the route graph the router was started with — on an app with `@page`, the build's
route table:

```js
[
  { path: '/customers', title: 'Customers' },
  { path: '/tickets/:id', params: [{ name: 'id', type: 'string' }] },
  { path: '/tickets/:id/billing', params: [{ name: 'id', type: 'string' }], guard: 'tickets.billing', access: false },
]
```

A param's `type` is its constraint — `number`, `uuid`, or the pattern written — and `string` without
one. The `title` is the route's crumb: its `label`, or its dictionary key translated; a label that is a
function of the record, or a key whose strings have not loaded yet, gives none. A route with no crumb
is named by its page's `@title` when the compiler can read it without the page: a string, or
`$t('key')` with nothing but the key. A title that needs the params or a record —
`$t('ticket.title', { id })`, `record?.name` — gives none. `access` is on a route
that declares a guard, or renders inside one that does: whether the current user would be let in,
asked of the same guard checker a navigation asks. A route without it is open.

**`shell()`** is `outline()` applied to everything outside the routed element, with the same rules
and selectors. It leaves out an open overlay, which belongs to the outline. It is empty when no
router marks a route.

**`page()`** is the page card: the route and its params, the title, the lists shown (how many rows,
with the total, the sort and the filter where the page says them), the forms (their fields, the
`required` and the `invalid` ones), live messages, errors, the actions available now (the buttons,
and apart the row actions), and the routes the page links to. Everything is read from the routed
element and its ARIA — what the user is shown — and an empty member is left out.

**`outline()`** is the accessibility tree of the route's content — the router's boundary, never the
shell around it — compressed for an agent. An overlay open over the page is part of it even when it
is mounted outside the route: a filter's popover, a select's list, a menu. The user is looking at
it now. The rules:

- what a reader cannot perceive (`hidden`, `aria-hidden`, `display: none`) is left out;
- a wrapper with no role or name gives way to its children, and text that repeats its parent's name,
  or the name of the control it labels, is dropped;
- a table row is one line, cells separated by `|`;
- a run of controls sharing a role — a toolbar, a pager — is one line that keeps every name;
- only **data** repetition is summarised: the rows of an `@for` or of a data grid, which the runtime
  marks in development. Above `maxItems` (5) they show two samples, then `… N more`, with the
  selectors of the next ones;
- every control carries a **selector** in brackets: its `data-test` or id when unique, else the
  shortest path that stays unique from the nearest component or `data-test` — the same DOM gives the
  same selector, call after call. The outline never uses an id that a component made with
  `generatedId(prefix)`, or an id built from one. Such an id comes from a counter, so the same field
  can be `pdx-ff-1` on one visit and `pdx-ff-20` on the next. A component you write that makes up
  ids for `aria-controls` or `for` should make them with `generatedId` too.

On the showcase the card is 40–130 tokens and the outline 16–29% of agent-browser's full snapshot of
the page. A session over four pages — the shell once, then a card and an outline per page — costs a
quarter of their four full snapshots. Both are measured in `packages/showcase/tests/devtools-v2.spec.ts`.

The members of version 1 are unchanged:

```js
__PDX_DEVTOOLS__.v                 // 2 — check it before relying on a shape
__PDX_DEVTOOLS__.tree()            // [{ id, tag, file, children }] — the PDX components, nested
__PDX_DEVTOOLS__.inspect('pdx-login')
// { id, tag, file, props: { … }, state: { … }, deriveds: { … } } — by id, element or CSS selector
__PDX_DEVTOOLS__.errors()          // the last 50: [{ time, tag, file, source, message, stack }]
__PDX_DEVTOOLS__.route()           // { path, params, query, matched }
__PDX_DEVTOOLS__.navigations()     // the last 20: [{ time, from, to, matched, error }]
__PDX_DEVTOOLS__.stores()          // [{ id, snapshot }]
__PDX_DEVTOOLS__.connect({ emit(event, payload) { … } })   // returns the disconnect
```

`state` is what the component's setup declared with `$signal`, by variable name, and `deriveds` its
`$derived`s; `file` is the `.pdx` it was compiled from. An error's `source` is `setup`, `render`,
`handler`, `effect` or `global` (nothing caught it). Values that are not JSON are described within
bounds: four levels deep, fifty items with a `…n more` marker, a function as `[function name]`, a DOM
node as `<tag#id>`.

With `agent-browser`:

```bash
agent-browser eval "JSON.stringify(__PDX_DEVTOOLS__.map())"
agent-browser eval "__PDX_DEVTOOLS__.shell()"
agent-browser eval "JSON.stringify(__PDX_DEVTOOLS__.page())"
agent-browser eval "__PDX_DEVTOOLS__.outline()"
agent-browser eval "JSON.stringify(__PDX_DEVTOOLS__.inspect('pdx-login'))"
agent-browser eval "JSON.stringify(__PDX_DEVTOOLS__.errors())"
```

`@pdxui/router` reports the route and the route graph by itself. A router of your own reports through
`setDevtoolsRouteSource(() => ({ path, params, query, matched }))`,
`recordDevtoolsNavigation({ from, to, matched, error })` and
`setDevtoolsMapSource(() => [{ path, params, title, guard, access }])`, all from `@pdxui/core`.

## Naming things for readability

Signals declared with `$signal` carry a debug name derived from the variable, so they show up as
`count`, `user`, … in the inspector — not `anon`. A `$effect` or `$watch` is named after where you
wrote it, `cart.pdx:12`, so `effects()`, the trace and a signal's subscribers say which one ran. That
naming is automatic in dev, and a production build carries none of it. An effect you create by hand
takes the same name as an option: `effect(fn, { name: 'sync-cart' })`.

## Manual init (rare)

If you embed PDX without the compiler (the CDN path) and still want the overlay:

```js
import { initDevTools } from '@pdxui/core/devtools';
initDevTools();   // the badge, the Ctrl+Shift+D shortcut, and telemetry level 2
```

Call it before your app creates its signals, or the Signals tab has nothing to list.

## Gotchas

- **Dev only.** Don't call `initDevTools()` in production builds — and the Vite plugin won't inject it
  there either. The overlay escapes app-controlled values when rendering them, but it's still a
  debugging surface, not a shippable feature.
- **Trace is opt-in** because recording every write has a cost. Turn it on around the interaction
  you're debugging, then off. Only **named** signals are recorded — a `$signal` is named after its
  variable automatically.
- A signal with a **0 subscriber count** that you expected to drive UI usually means you snapshotted
  it (`const v = sig()`) instead of reading it reactively in the template.
