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

They're imported from `@pdxui/core` and registered in `<script setup>`.

## onMount + onDestroy: the fundamental pair

`onMount` runs **once**, when the component enters the DOM. It's the place to start things. And
almost always, what you start needs stopping: `onDestroy` (or the cleanup return) does it on teardown.

```pdx
import { onMount, onDestroy } from '@pdxui/core';

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

**Pause when frozen** — with `keepAlive` pages, `onHide`/`onShow` let you stop a poll while the page
is frozen and resume on return, instead of keeping it running for nothing.

## The rule

If you can get the result by **declaring** (a `$derived`, a `:show`, an `@if`), prefer it: it's
simpler and won't get cleanup wrong. Hooks are for what is **inherently imperative**: talking to the
bare DOM, to external libraries, to timers and global listeners. And for everything you start in a
hook, remember where you stop it.
