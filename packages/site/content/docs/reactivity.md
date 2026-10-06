---
title: Reactivity (API)
description: "The full reference: signal, derived, effect, watch, batch, ref, ownership."
order: 13
---

# Reactivity — the full reference

This page is the detailed reference. If you're after the *mental model* (why signals exist, when to
use derived vs effect), start from [Reactivity](/docs/concepts). Here you'll find the details and edge
cases.

The **runes** (`$signal`, `$derived`) are compiler sugar inside `.pdx` files. The **runtime
functions** (`effect`, `watch`, `batch`, `ref`, `collectDisposers`) are imported from
`@pdxui/core` and used both in `.pdx` files and in plain TypeScript.

## $signal

```pdx
let count = $signal(0);
count++;        // → __count.set(v => v + 1)
count = 5;      // → __count.set(5)
```

`set` has a behavior worth knowing: if you pass a **function**, it treats it as an *updater*
(`s.set(prev => prev + 1)`). So if the value you want to store *is itself* a function (a handler, a
template, a component to keep), don't use `set` — you'd accidentally use the updater — but **`setRaw(fn)`**,
which stores the function as-is.

```pdx
const onClick = $signal();
onClick.setRaw(() => doThing());   // stores the function, doesn't invoke it as an updater
```

`peek()` reads the value **without** creating a subscription (useful inside an effect when you want to
read but not depend on that signal).

## $derived

```pdx
const doubled = $derived(count * 2);
```

- **Lazy**: doesn't compute until someone reads it.
- **Glitch-free**: within a single update it's never computed twice and never exposes inconsistent
  intermediate state.
- **Pure**: the body should only *compute and return*, with no side effects. If you need a side
  effect, it's an `effect`, not a derived.

## effect

```pdx
const dispose = effect(() => {
  console.log(count);             // reading here = subscribing
  return () => {/* cleanup */};   // runs before every re-run and on dispose
});
dispose();                         // stop the effect manually
```

Two equivalent ways to clean up, pick for readability:
- **return** a function from the effect (teardown tied to that effect).
- **`onCleanup(fn)`** called from nested/composable code, same timing as the return.

## batch

Synchronous mutations are already **auto-batched**: several `set`s in a row produce a single flush.
`batch` is for when you want to explicitly group a block so subscribers run only once at the end:

```pdx
batch(() => {
  x = 1; y = 2; z = 3;   // readers of x/y/z react once, not three times
});
```

## watch

When you want to react to a source's change with access to old and new values:

```pdx
$watch(query, (next, prev) => {
  console.log('from', prev, 'to', next);
});
```

`watch` is more explicit than `effect` when you care about *that* specific change and the two values,
not "everything I read".

## ref

To access a DOM element after mount: declare a signal and bind it with `:ref`.

```pdx
let boxRef = $signal(null);
```
```pdx
<div :ref="boxRef"></div>
```

`boxRef` will hold the element once mounted. Read it inside `onMount`/`effect` (not right away in
setup: on the first pass it's still `null`).

## Ownership scope (advanced)

This is the mechanism that prevents memory leaks. `collectDisposers(fn)` runs `fn` and captures all
`effect`s created inside it, returning `[result, dispose]`. `onDispose(fn)` registers a cleanup in the
current scope. That's how the structural constructs (`when`, `match`, `repeat`, the component body)
**dispose their own effects** when their DOM subtree is removed — you don't have to think about it, but
knowing it exists explains why you don't accumulate orphan effects when a list empties or an `@if`
turns false.

## In short

| API | For |
| --- | --- |
| `$signal` / `set` / `setRaw` / `peek` | mutable state |
| `$derived` | computed value (pure, lazy) |
| `effect` / `onCleanup` | reactive side effect + cleanup |
| `batch` | group mutations |
| `$watch` | react to a change with prev/next |
| `:ref` + `$signal(null)` | access to the mounted DOM |
| `collectDisposers` / `onDispose` | cleanup scope (under the hood) |
