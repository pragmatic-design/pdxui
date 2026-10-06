---
title: Signal operators
description: "Too many updates, the previous value, an async source: the operators and bridges that sit between a signal and the thing it has to follow."
order: 13.6
---

# Signal operators

[Reactivity](/docs/concepts) gives you three things — a signal, a derived value, an effect — and they
cover most of a UI. This page is for the cases where they do not: an effect that fires on every
keystroke, a value you need the *previous* of, a source that is a DOM event or a promise rather than
a signal.

**Read the rule before the list.** A `$derived` is the answer far more often than anything here. Reach
for an operator when the problem is about *time* — how often, in what order, starting when — because
that is the one thing a derived value cannot express.

## The two shapes, and the naming that follows from it

Every transform exists in one or both of two forms, and the names tell you which:

```ts
import { debounced, pipe, debounce, map } from '@pdxui/core';

const typed = debounced(() => query(), 300);              // standalone: wraps a getter
const clean = pipe(() => query(), debounce(300), map(s => s.trim()));   // pipe operator
```

| | |
| --- | --- |
| **standalone** — `debounced` `throttled` `distinct` `previous` `pairwise` `scan` `sample` `skipUntil` `takeUntil` `merged` | takes the source as its first argument, returns a signal with a `dispose()` |
| **pipe operator** — `debounce` `throttle` `map` `filter` `distinctOp` `skip` `take` `tap` `catchError` | takes only its options, and goes inside `pipe(source, …)` |

The past participle is the standalone one: `debounced` is a value, `debounce(300)` is an instruction.
`distinctOp` is the odd name in the set — it is `distinct` as a pipe operator, with a name of its own
because the standalone holds `distinct`.

Everything here returns a signal that owns a subscription, so everything has a **`dispose()`**. Inside
a `.pdx` component you rarely call it: what setup creates is disposed with the component. Call it when
you build one outside a component's lifetime.

## Too many updates

The commonest problem on the page, and the one the live-search example in [Reactivity](/docs/concepts)
solves by hand:

```pdx
<script setup>
import { pipe, debounce, distinctOp, map } from '@pdxui/core';

let query = $signal('');

const term = pipe(
  () => query,
  debounce(300),              // wait for a pause in typing
  map(s => s.trim()),
  distinctOp(),               // and ignore a change that changed nothing
);
</script>
```

| | |
| --- | --- |
| `debounce(ms)` / `debounced(src, ms)` | emit after `ms` of quiet. For anything driven by typing |
| `throttle(ms)` / `throttled(src, ms)` | emit at most once per `ms`. For anything driven by scrolling or resizing, where the *last* value is not the only one that matters |
| `distinctOp(equals?)` / `distinct(src, equals?)` | drop a value equal to the last one. `equals` for objects, which are never `===` |
| `filter(fn)` · `map(fn)` · `skip(n)` · `take(n)` | the ordinary four |
| `tap(fn)` | a side effect in the middle of a pipe, for logging. It changes nothing |
| `catchError(handler)` | the handler's return value is used instead of the throw |

## The value before this one

```ts
import { previous, pairwise, scan } from '@pdxui/core';

const wasOpen = previous(() => isOpen());        // undefined on the first read
const bothEnds = pairwise(() => page());         // [previous, current]
const total = scan(() => amount(), (sum, x) => sum + x, 0);
```

`previous` is what you need to animate *from* somewhere, and what an effect needs to tell a change
from a first run. `scan` is a reduce over time: a running total, a history, a counter of events.

## Starting and stopping

```ts
import { sample, skipUntil, takeUntil } from '@pdxui/core';

const onSubmit = sample(() => form.values(), () => submitCount());  // read A when B fires
const afterReady = skipUntil(() => data(), () => isReady());
const untilDone = takeUntil(() => progress(), () => finished());
```

`sample` is the one worth knowing: it reads the first signal *without subscribing to it* and emits
only when the second changes. That is how you capture "the value at the moment the button was
pressed" without the whole chain re-running while the user types.

## A source that is not a signal

The bridges turn the browser into signals. They take **the element or a getter for it** —
`() => box()` — so they attach when a `:ref` fills at mount, the same convention as
[the composables](/docs/composables):

```pdx
<template><div class="card" :ref="card">…</div></template>

<script setup>
import { fromResize, fromIntersection } from '@pdxui/core';

let card = $signal(null);

const size = fromResize(() => card);            // { width, height, … }
const seen = fromIntersection(() => card);      // { isIntersecting, ratio, … }
</script>
```

| | |
| --- | --- |
| `fromEvent(target, name, opts?)` · `fromEvents(target, names[], opts?)` | a DOM event as a signal of its last value |
| `fromResize(el)` · `fromIntersection(el)` · `fromMutation(node)` | the three observers, without the observer bookkeeping |
| `fromPromise(p, initial?)` | a promise as a signal, with `loading` and `error` |
| `fromCallback(setup, initial?)` | anything that hands you values through a callback — a WebSocket, an SDK subscription. `setup` returns its own teardown |
| `toPromise(src, predicate?)` | the other direction: wait for a signal to satisfy a condition |
| `toAsync(src)` | a signal as an `for await` iterable |

## One async call at a time

Four operators for the same shape — a value changes, a request follows — differing only in what
happens when the value changes *again* while a request is in flight. Choosing wrong is a race
condition, so the difference is the whole point:

| | when a new value arrives mid-flight |
| --- | --- |
| `switchSignal(src, fetcher)` | **cancel** the old request and start the new one. The default for a search box: only the latest answer is wanted |
| `exhaustSignal(src, fetcher)` | **ignore** the new value until the current request finishes. For a submit button: the second click must not start a second save |
| `concatSignal(src, fetcher)` | **queue** it, and run them in order |
| `retrySignal(fetcher, opts?)` | not about mid-flight: retries a failing request, and hands you a `retry()` to do it by hand |

Each receives an `AbortSignal` and returns `data`, `status`, `loading`, `error` and `dispose` — so
`switchSignal` really does abort, not merely discard.

```ts
const results = switchSignal(() => term(), (q, signal) => fetch(`/api/s?q=${q}`, { signal }).then(r => r.json()));
```

For a request against your own API, [`@fetch`](/docs/data) is the declaration to reach for first;
these are for when the request is not an HTTP call, or the concurrency rule is the point.

## Two odd ones out

**`untracked(fn)`** reads signals without subscribing to them. Inside an effect that must react to A
while merely *reading* B, it is the difference between a correct dependency and a loop.

**`linkedSignal({ source, computation })`** is a writable signal that resets when its source changes —
a selected row that clears when the list reloads, a draft that resets when the record changes. The
computation receives the previous source and value, so it can keep the selection if it is still valid:

```ts
const selected = linkedSignal({
  source: () => rows(),
  computation: (rows, prev) => rows.find(r => r.id === prev?.value?.id) ?? rows[0],
});
```

## Interop with TC39 signals

If a library you use is built on the [TC39 signals proposal](https://github.com/tc39/proposal-signals),
the four bridges are the way across, in both directions:

```ts
import { fromTC39Computed, fromTC39State, toTC39Computed, toTC39State } from '@pdxui/core';
```

They wrap rather than copy, so a value written on one side is read on the other.
