---
title: Lifecycle
description: "Lifecycle hooks: when they run, when you need them, how not to get it wrong."
order: 11
---

# Lifecycle

Reactivity covers the *what* (when data changes, the UI updates). Lifecycle hooks cover the *when*:
precise moments in a component's life — it just entered the DOM, it's about to leave, a prop changed,
it entered the viewport. You use them to hook into those moments with imperative code (timers, global
listeners, integrations with external libraries).

They're imported from `@pdxui/core` and registered in `<script>`.

## onMount + onDestroy: the fundamental pair

`onMount` runs **once**, when the component enters the DOM. It's the place to start things. And
almost always, what you start needs stopping: `onDestroy` (or the cleanup return) does it on teardown.

```pdx
import { onMount, onDestroy } from '@pdxui/core';

let seconds = $signal(0);
function tick() { seconds++; }

onMount(() => {
  const id = setInterval(tick, 1000);
  onDestroy(() => clearInterval(id));   // stop what you started
});
```

> **Gotcha — onMount is one-shot, not reactive.** It runs once; it does not re-run when a signal
> changes. If you need to react to signals *after* mount (e.g. you need the element in the DOM *and*
> to react to data), put an `effect` inside `onMount` and dispose it:

```pdx
onMount(() => {
  const dispose = effect(() => { /* reads signals, runs on every change */ });
  onDestroy(dispose);
});
```

This pattern (mount → effect → dispose) is what you use when you combine "access to the mounted DOM"
with "reactivity".

## The available hooks

| Hook | Runs when | Typical use |
| --- | --- | --- |
| `onMount` | enters the DOM (one-shot) | startup, initial measurements |
| `onDestroy` | leaves the DOM | cleanup of timers/listeners |
| `onUpdated` | after a DOM update | interacting with the rendered layout |
| `onError` | an error bubbles from the subtree | logging, fallback |
| `onPropsChange` | a prop changes | react to external input |
| `onBeforeLeave` | about to leave the route | block leaving (unsaved changes) |
| `onRouteChange` | the route changes | reset, analytics |
| `onShow` / `onHide` | keep-alive: frozen/resumed | pause/resume work |
| `onVisible` | enters the viewport | lazy work, entrance animations |
| `onResize` | the element's size changes | imperative responsive layout |

## Examples that clarify the difference

**Block leaving with unsaved changes** — `onBeforeLeave` can prevent navigation:

```pdx
onBeforeLeave(() => {
  if (form.dirty) return confirm('Leave without saving?');
  return true;
});
```

**Work only when visible** — `onVisible` avoids starting an animation or fetch for an off-screen
component:

```pdx
onVisible(() => startCountUpAnimation());
```

**Pause when frozen** — a `keepAlive` page left by navigation, or a `<component :is @keepAlive>` view
switched away, is frozen, and the framework pauses what it can see by itself: you do not stop a
`useQuery` poll in `onHide`. `onHide`/`onShow` are for what it cannot see — a connection or a library
you drive by hand.

## The rule

If you can get the result by **declaring** (a `$derived`, an `@show`, an `@if`), prefer it: it's
simpler and won't get cleanup wrong. Hooks are for what is **inherently imperative**: talking to the
bare DOM, to external libraries, to timers and global listeners. And for everything you start in a
hook, remember where you stop it.

A frozen page costs no CPU. While it is frozen:

- its effects and template bindings are **paused**: a change marks them, and each marked one runs
  **once** when the page comes back;
- `useQuery` polling stops, and so do the refetch on focus and on reconnect; no request starts — an
  `@fetch` or a `useQuery` whose value went stale meanwhile is refreshed when the page comes back;
- the framework's timers — `@await`'s `minMs`/`maxMs`, `@defer`'s `idle` and `timer(n)` — are
  suspended, and go on with the time they had left;
- the head is not written: a dynamic `@title` is an effect, paused with the page.

A timer **you** start in `onMount` keeps running: the framework cannot see it. Start it in an
`$effect` and clear it in the effect's cleanup instead — the effect is paused with the page, and the
cleanup runs when the page is destroyed.
