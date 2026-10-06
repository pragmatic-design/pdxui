---
title: Reactivity
description: PDX's mental model — signals, derived, effects, and why.
order: 2
---

# Reactivity: the mental model

The hard part of a UI isn't drawing it once: it's **keeping it in sync** with the data as it
changes. When the user clicks, a response comes back from the server, a timer fires — something in
the state changes, and the DOM has to update to match. Without a system, you do it by hand: you
update the variable *and* remember to update every spot in the DOM that shows it. Miss one → bug.

PDX solves this with **signals**. The idea in one sentence:

> A signal is a value that **knows who's reading it**. When it changes, it notifies exactly those
> readers — and only those.

No Virtual DOM, no "re-render everything and diff". You change a signal, and only the piece of DOM
that actually depends on it updates.

## A counter, step by step

Let's start minimal. You declare state with `$signal`:

```pdx
let count = $signal(0);
```

`count` is now not a normal variable: it's a signal holding `0`. In the template you read it like
any value:

```pdx
<p>You clicked {{ count }} times</p>
<pdx-button @click="inc">+1</pdx-button>
```

And you update it like any variable:

```pdx
function inc() { count++; }
```

Here's the compiler's magic. You write `count++`; the compiler rewrites it to
`__count.set(v => v + 1)`. And that `{{ count }}` in the template becomes a *subscription*: when you
call `set`, the signal notifies that very text node, which rewrites itself.

**Why it matters:** you declared no dependencies and called no "render". You wrote code that looks
normal, and the compiler generated the wiring. This is the principle behind all of PDX: *you declare
the intent, the compiler writes the connection.*

## $derived — values that depend on other values

Often a value isn't "first-hand" but **derives** from others. The classic mistake is recomputing it
by hand and keeping it in sync. With `$derived` you declare it once:

```pdx
let count = $signal(0);
const doubled = $derived(count * 2);
```

`doubled` **recomputes itself** whenever `count` changes — and *only* when needed. You never update
it: it's always, by definition, `count * 2`. You read it in the template like a signal:
`{{ doubled }}`.

Two guarantees that take worries off your plate:
- It's **lazy**: if nobody reads it, it doesn't compute.
- It's **glitch-free**: within a single update it's never computed twice, and you never see an
  inconsistent intermediate state.

Rule of thumb: **if a value can be expressed in terms of others, it's a `$derived`** — not a second
`$signal` you try to keep aligned.

## effect — when you need to "leave" the UI

`$signal` and `$derived` describe *data*. But sometimes you must perform an **action** when data
changes: write to `localStorage`, log, kick off a request, touch the DOM by hand. That's the job of
`effect`:

```pdx
import { effect } from '@pdxui/core';

effect(() => {
  console.log('count changed:', count);
});
```

The effect runs once immediately, and **re-runs whenever a signal it read changes**. You don't
declare dependencies — reading `count` inside the effect *is* the subscription.

If the effect creates something to clean up (a timer, a listener), return a cleanup function: it
runs before every re-run and on teardown.

```pdx
effect(() => {
  const id = setInterval(() => count++, 1000);
  return () => clearInterval(id);   // automatic cleanup
});
```

### Derived or effect? The rule

People mix them up. The distinction is sharp:

- Want **a value** to use in the UI? → `$derived`. (e.g. the cart total)
- Want **an action** on the outside world? → `effect`. (e.g. save the cart to `localStorage`)

A symptom of getting it wrong: if you find yourself writing a signal *inside* an effect to "compute"
a value, you almost certainly wanted a `$derived`.

## How an update flows

It's worth keeping the flow in your head, because it explains *why* there's no Virtual DOM:

```text
  count.set(1)
      │  (the signal notifies its readers)
      ├──────────────► {{ count }}        → rewrites that text node
      ├──────────────► doubled ($derived) → recomputes (once, lazily)
      │                     └──────────► {{ doubled }} → rewrites its node
      └──────────────► effect(...)        → re-runs (cleanup → body)
```

You change *one* value; only the spots that read it are touched. No tree diffing, no re-render of
components that have nothing to do with it.

## Let's build it together: live search

Let's put the three building blocks into something real: a list filtered as you type, that logs
searches. Three responsibilities, three different tools.

```pdx
@prop products: Product[] = [];

let query = $signal('');                 // 1. state the user changes

const results = $derived(                // 2. a value DERIVED from query + products
  products.filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
);

effect(() => {                           // 3. ACTION: track what the user searches
  if (query.length > 2) analytics.track('search', { query });
});

function onInput(e) { query = e.target.value; }
```

```pdx
<input :value="query" @input="onInput" placeholder="Search…" />
<p class="pdx-ink-muted">{{ results.length }} results</p>
@for (results as p; track p.id) {
  <li>{{ p.name }}</li>
}
```

Notice what we *didn't* write: no "when query changes, recompute results and rewrite the list and
update the counter". We only **declared the relationships** — `results` *is* the filter, the effect
*is* the tracking — and the compiler wired the rest. Add a product to `products`? The list and the
counter update on their own, because `results` also depends on `products`.

Compared to the manual approach: without signals you'd have an `onInput` that updates `query`, *then*
recomputes the array, *then* rewrites the list, *then* updates the counter, *then* (maybe) logs — and
every new spot that shows `results` is one more place to remember to update. Here the relationship is
declared once and holds forever.

## Common mistakes

- **Recomputing by hand instead of deriving.** `let total = a + b` won't update; `const total =
  $derived(a + b)` will.
- **Putting value logic in an effect.** Leads to duplicate, out-of-sync state: use `$derived`.
- **Forgetting cleanup.** Timers and listeners created in an effect must be closed in the return,
  otherwise they stay alive after teardown.

## In practice

| You want… | Use |
| --- | --- |
| state you change | `$signal` |
| a value computed from others | `$derived` |
| an action when something changes | `effect` |
| it to happen *less often*, or in a particular order | an [operator](/docs/signal-operators) |
| to follow something that is not a signal | a [bridge](/docs/signal-operators) |

With these three building blocks — and the compiler generating the wiring — you describe *what* must
be true, not *how* to update it. The rest of reactivity (watch, batch, ownership) is in
[Reactivity (API)](/docs/reactivity), but 90% of daily work lives here.

The last two rows are the tenth: when the problem is about **time** — the search that fires on every
keystroke, the value you need the previous of, the request that must cancel the one before it — a
derived value cannot express it, and [Signal operators](/docs/signal-operators) is the page for that.
