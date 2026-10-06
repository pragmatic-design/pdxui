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

## For agents: `__PDX_DEVTOOLS__` v1

An agent driving a browser asks the running app what it is showing through the global itself — a
versioned API whose every answer is JSON. It is there from page load in development, with no level
to set, and absent from a production build.

```js
__PDX_DEVTOOLS__.v                 // 1 — check it before relying on a shape
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
agent-browser eval "JSON.stringify(__PDX_DEVTOOLS__.inspect('pdx-login'))"
agent-browser eval "JSON.stringify(__PDX_DEVTOOLS__.errors())"
```

`@pdxui/router` reports the route by itself. A router of your own reports through
`setDevtoolsRouteSource(() => ({ path, params, query, matched }))` and
`recordDevtoolsNavigation({ from, to, matched, error })`, both from `@pdxui/core`.

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
