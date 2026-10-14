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
count++;        // → __count.set(__v => __v + 1)
count = 5;      // → __count.setRaw(5)
```

A signal notifies when it is **set**. Changing the array or object it holds in place sets nothing, so
nothing that reads it updates: `items.push(x)` leaves the list on screen as it was. Assign a new value
instead — `items = [...items, x]`, `user = { ...user, name: v }`. The compiler reports the in-place
form as `PDX_SIGNAL_MUTATED_IN_PLACE`, in the script and in a template handler
(`@click="items.push(x)"`), with that fix for a push and a field. A value meant to be
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

## Heavy work

Signals are synchronous, and so is a loop over your data. A handler that filters, groups or formats
100 000 items does it in one task, and the page does not answer a click until the loop ends.
`processInSlices(items, work, { signal })` runs the same loop in slices of about 5 ms. Between two
slices the browser handles input and paints. It calls `work(item, index)` for every item, in order,
and returns a promise that resolves when the last one is done:

```pdx
import { processInSlices } from '@pdxui/core';

let rows = $signal([]);
let totals = $signal(new Map());
let running = null;

async function regroup() {
  running?.abort();                       // a newer request replaces the one in flight
  running = new AbortController();
  const next = new Map();
  try {
    await processInSlices(rows, (row) => {
      next.set(row.region, (next.get(row.region) ?? 0) + row.amount);
    }, { signal: running.signal });
    totals = next;                        // one write, once the work is done
  } catch (e) {
    if (e.name !== 'AbortError') throw e;
  }
}
```

- **Cancel** with an `AbortSignal`. The job stops before the next item, and the promise rejects with
  the signal's reason (an `AbortError` by default). A signal that is already aborted processes
  nothing.
- **The slice length** is 5 ms by default; `{ sliceMs: 40 }` takes longer slices. Each yield lets the
  browser paint, so work that grows the DOM paints less often, and finishes sooner, with longer
  slices; above 50 ms a slice is a long task. A `@for` that receives many rows uses 40 ms.
- **Signal writes are ordinary writes.** A `set` inside `work` flushes at once, like any write
  outside a handler (see [batch](#batch)). Collect into a plain value and write the signal once at
  the end, as above.
- **It splits your loop, not the reactive graph.** The effects and deriveds stay synchronous.
- **It yields through a macrotask**, a `MessageChannel` message, not `setTimeout`, whose 4 ms
  clamping adds up over thousands of slices. It does not use `scheduler.yield()`: its continuation
  runs ahead of rendering, and measured in Chromium it held a frame for about 100 ms while the page
  had something to paint.

Work that is pure computation over data the page does not need meanwhile can also move to a Worker.
That is your choice; the framework adds no Worker syntax.

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
| `processInSlices` | a long loop over data that does not block input |
| `collectDisposers` / `onDispose` | cleanup scope (under the hood) |
