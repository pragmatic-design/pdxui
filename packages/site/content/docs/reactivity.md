---
title: Reactivity (API)
description: "The full reference: signal, derived, effect, watch, batch, ref, ownership."
order: 13
---

# Reactivity — the full reference

> **Formal reference:** [docs/language/script.md](https://github.com/pragmatic-design/pdxui/blob/main/docs/language/script.md) defines the grammar of what this page teaches: what each construct accepts, what it generates, which diagnostic it raises.

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
count = 5;      // → __count.setRaw(5)
```

A signal notifies when it is **set**. Changing the array or object it holds in place sets nothing, so
nothing that reads it updates: `items.push(x)` leaves the list on screen as it was. Assign a new value
instead — `items = [...items, x]`, `user = { ...user, name: v }`. The compiler reports the in-place
form as `PDX_SIGNAL_MUTATED_IN_PLACE`, with that fix for a push and a field. A value meant to be
changed in place is a [`$store`](/docs/store); a `:ref` target, which holds an element, is not reported.

An **assignment stores the value as it is**, a function too; an **update** (`++`, `--`, `+=` and the
other compound operators) computes the new value from the old one. So a `$signal` can hold a handler,
and calling it calls the function it holds:

```pdx
<template>
  <button @click="onSave()">Save</button>
</template>

<script setup>
let saved = $signal(0);
let onSave = $signal(null);

function arm() {
  onSave = () => saved++;   // stores the arrow; it does not run it
}
arm();
</script>
```

`x ??= v`, `x ||= v` and `x &&= v` are assignments too: they keep their short circuit and store `v`
as it is.

In TypeScript, with the `signal()` of `@pdxui/core`, the two are spelled out: `set` takes a function as
an *updater* (`s.set(prev => prev + 1)`), and **`setRaw(fn)`** stores the function itself.

`peek()` reads the value **without** creating a subscription (useful inside an effect when you want to
read but not depend on that signal).

## $derived

```pdx
let count = $signal(0);
const doubled = $derived(count * 2);
```

- **Lazy**: doesn't compute until someone reads it.
- **Glitch-free**: within a single update it's never computed twice and never exposes inconsistent
  intermediate state.
- **Only a new value moves its readers**: when a source changes and the derived recomputes to the
  same value (`Object.is`), an effect reading it does not run. `$derived(n % 2)` and three writes of
  `n` that keep it at 1 run nothing.
- **Pure**: the body should only *compute and return*, with no side effects. If you need a side
  effect, it's an `effect`, not a derived.

## effect

```pdx
let count = $signal(0);
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

**A template event handler is already batched.** `@click="a = 1; b = 1; c = 1"` — or a function it
calls — runs inside `batch`: the compiler wraps every handler in `batchHandler`, so an effect reading
all three runs once, on the finished state. An `async` handler is batched up to its first `await`.

Everywhere else — a listener you add by hand, a timer, a promise callback, the code after an
`await` — each write flushes at once: three `set`s in a row run their readers three times, and the
first run sees the other two values not yet written. `batch` groups a block so subscribers run only
once, at the end:

```pdx
batch(() => {
  x = 1; y = 2; z = 3;   // readers of x/y/z react once, not three times
});
```

## watch

When you want to react to a source's change with access to old and new values:

```pdx
let query = $signal('');
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
