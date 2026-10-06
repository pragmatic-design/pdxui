<!-- Copied from packages/site/content/docs/getting-started.md by gen-topics.mjs: edit it there. -->

# Getting Started

## What PDX is (and why a compiler)

PDX is a framework for building UIs with **Web Components**, but with one substantial difference
from a runtime library: at its heart PDX is a **compiler**. You write `.pdx` files where you
*declare* what you want — a piece of state, a prop, an event — and the compiler generates the wiring
(signals, attribute sync, event dispatch, custom-element registration). You never write
"boilerplate": if you notice you're writing it, that's a framework bug.

Why this matters:
- In **dev**, everything is interpreted → no build, instant feedback.
- In **production**, the compiler knows the whole project and generates code optimized to measure
  (inlined bindings, pre-compiled templates, dead code removed).
- The output is **standard Web Components**: they run anywhere, even outside PDX.

If you've never seen signals, read [Reactivity](https://pdxui.com/docs/concepts) first: it's the mental model
everything else builds on. Here we focus on getting something working.

## The 30-second version

```pdx
@page '/';
let count = $signal(0);
```

This file is already a page (`@page '/'`) with reactive state (`count`). No imports, no `return`, no
manual registration. The rest of this guide simply expands on it.

## Installation

```bash
pnpm add @pdxui/core @pdxui/compiler
```

The compiler is a Vite plugin. Add it to your config:

```ts
import { pdx } from '@pdxui/compiler';

export default {
  plugins: [pdx()],   // auto-discovers @pdxui/* and auto-imports the <pdx-*> you use
};
```

## Your first component, layer by layer

A `.pdx` file has three blocks: `<template>` (what you see), `<script setup>` (state and logic),
`<style scoped>` (styles that apply inside this component). The file name becomes the tag:
`counter.pdx` → `<pdx-counter>`. All three are optional, and the two extra words are worth knowing
exactly: `setup` is intent — the *runes* are what the compiler reads — and `scoped` decides whether the
CSS is confined to the component or lands in the page globally.
[The three blocks, precisely](https://pdxui.com/docs/components#the-three-blocks-precisely) spells both out.

**Layer 1 — reactive state.** Start with a counter:

```pdx
<template>
  <p>You clicked {{ count }} times</p>
  <button @click="inc">+1</button>
</template>

<script setup>
let count = $signal(0);
function inc() { count++; }
</script>
```

`{{ count }}` is a subscription: when `inc` runs `count++` (which the compiler rewrites to
`__count.set(v => v + 1)`), that text node rewrites itself. There's no "render" to call.

**Layer 2 — a prop coming in.** Make it configurable from the outside:

```pdx
<script setup>
@prop start: number = 0;
let count = $signal(start);
function inc() { count++; }
</script>
```

Now `<pdx-counter start="10">` starts at 10. Primitive props sync with the HTML attribute
automatically.

**Layer 3 — an event going out.** Let the parent know when it changes:

```pdx
<script setup>
@prop start: number = 0;
@event changed: number;

let count = $signal(start);
function inc() { count++; changed(count); }
</script>
```

From the consumer: `<pdx-counter @changed="onChanged">`. `@event changed: number` generates the emit
function and the typed `CustomEvent`.

You've just seen PDX's central pattern: every feature is a **declaration** (`@prop`, `@event`,
`$signal`) that the compiler turns into wiring.

## Dev and production

```bash
pnpm add -D @pdxui/cli   # the pdx CLI, a dev dependency
npx pdx dev      # interpreted, HMR — for development
npx pdx build    # compiled and optimized — for production
```

There's no build to wait for while you develop: `pdx dev` interprets `.pdx` on the fly.

## Where to go next

- [Reactivity](https://pdxui.com/docs/concepts) — the mental model (signal/derived/effect).
- [Components](https://pdxui.com/docs/components) — props, events, slots, imperative API.
- [Template & directives](https://pdxui.com/docs/template) — bindings, `@if`/`@for`, lazy loading.
- [Router](../../pdxui-routing/references/router.md) — turn a component into a page with `@page`.
