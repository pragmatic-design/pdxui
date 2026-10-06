---
title: Template & directives
description: "How you write reactive markup: bindings, conditions, lists, lazy, errors."
order: 6
---

# Template & directives

The `<template>` is plain HTML with four superpowers: **interpolation** (show values), **binding**
(connect attributes and properties to signals), **events** (react to the user) and **directives**
(`@if`, `@for`, `@defer`…) for structure. Everything is reactive: when a signal read in the template
changes, only the piece that uses it updates.

## Show values: `{{ }}`

Text interpolation uses double braces:

```pdx
<p>Hi {{ name }}, you have {{ count }} messages</p>
```

Inside the braces goes an expression, not just a name: `{{ count * 2 }}`, `{{ ok ? 'yes' : 'no' }}`.

`null`, `undefined` and `false` print nothing, so `{{ user?.name }}` before the user has loaded and
`{{ saving && 'Saving…' }}` leave no stray word. Everything else is printed as text, `0` included. To
show the value itself, convert it: `{{ String(debug) }}` prints `false`. The rule is
`interpolationText` in `@pdxui/core`, and the dev server and a production build both apply it.

## Bind attributes: `:attr`

To bind an attribute or property to an expression, prefix it with `:`.

```pdx
<img :src="user.avatar" :alt="user.name" />
<pdx-button :disabled="loading">Save</pdx-button>
```

> **Golden rule:** in attribute values always use `:attr="expr"`, **never** `${...}`. Writing
> `src="${user.avatar}"` triggers the `PDX_RAW_INTERPOLATION` warning and is a mistake: the reactive
> binding is `:src="user.avatar"`. Braces `{{ }}` are for *text*, colons `:` for *attributes*.

Handy binding variants:

```pdx
:class.active="isActive"     <!-- adds the 'active' class when true -->
:style.color="color"         <!-- sets a single CSS property -->
:show="visible"              <!-- show/hide (display) without removing from the DOM -->
:ref="boxRef"                <!-- puts the element into a signal, to access it after mount -->
::value="text"               <!-- two-way: reads AND writes the signal (controlled inputs) -->
```

`::value` is the shorthand for controlled fields: it binds the value *and* updates the signal as the
user types, without writing the `@input` handler.

## React to the user: `@event`

`@event="…"` runs when the event fires. `event` is any DOM event (`click`, `input`, `keydown`) or a
custom component event (`pdx-close`). The value can be a reference, an expression, or a small block —
whatever reads best:

```pdx
<button @click="save">Save</button>              <!-- function reference (event is the 1st arg) -->
<button @click="count++">+1</button>             <!-- mutate a signal inline -->
<button @click="open = !open">Toggle</button>     <!-- assignment / negation -->
<button @click="save(item)">Save row</button>     <!-- call with arguments -->
<input @input="name = $event.target.value" />     <!-- $event = the raw event (Vue-style) -->
<input @keydown="e => onKey(e.key)" />             <!-- a lambda; the param stays local -->
<button @click="count++; touched = true">…</button>  <!-- several statements, run in order -->
<pdx-dialog @pdx-close="onClose" />                <!-- custom component event -->
```

You don't manage subscription/teardown — the compiler wires `addEventListener` and removes it when
the element is gone. Behind the scenes a bare name (`save`) is passed as a function; everything else
becomes a handler. Crucially, signal **writes** are rewritten for you: `count++` becomes
`count.set(v => v + 1)`, `name = x` becomes `name.set(x)`. Reads stay reactive too. So you write the
JS you'd expect, and reactivity just works.

> **Reference vs. call.** `@click="save"` passes the function (the event object arrives as its first
> argument). `@click="save()"` *calls* it (no event passed unless you write `save($event)`). Use the
> reference form when the handler just needs the event; the call form when you pass your own arguments.

### Event modifiers

Append modifiers with a dot — no boilerplate in the handler:

```pdx
<form @submit.prevent="onSubmit">…</form>   <!-- preventDefault() -->
<div @click.stop="select">…</div>           <!-- stopPropagation() -->
<div @click.self="close">…</div>            <!-- only if the target IS this element -->
<button @click.once="init">…</button>       <!-- fire at most once -->
<input @keydown.enter="submit" @keydown.escape="cancel" />  <!-- key filters -->
```

`.prevent`, `.stop`, `.self`, `.once`, `.capture`, `.passive` and key filters (`.enter`, `.escape`,
`.space`, `.tab`, arrows…) compose freely: `@keydown.enter.prevent="submit"`.

## Conditions: `@if` / `@else`

```pdx
@if (user) {
  <p>Welcome, {{ user.name }}</p>
} @else {
  <pdx-button @click="login">Sign in</pdx-button>
}
```

Unlike `:show` (which hides with CSS but keeps the element in the DOM), `@if` actually **adds and
removes** elements — and disposes their effects when it removes them. Use `:show` for frequent,
lightweight toggles, `@if` when the element may not exist at all.

## Lists: `@for`

```pdx
@for (todos as todo; track todo.id) {
  <li :class.done="todo.completed">{{ todo.text }}</li>
}
```

The `track` matters: it tells PDX how to **identify** each item, so when the list changes it moves
the right nodes instead of rebuilding them (minimal reconciliation). Use a stable key (`todo.id`),
not the index, if items can reorder.

For animated lists there are two modifiers, and both hang off `@transition(...)`: it names the
animation, `@stagger(50)` adds a progressive delay between items (a cascade effect), and
`@mode(...)` controls enter/leave sequencing. Without the `@transition` there is nothing for them
to modify, and the parser says so.

```pdx
@for (items as it; track it.id) @transition('fade') @stagger(40) {
  <li>{{ it.label }}</li>
}
```

A reorder is the third case, and it has its own modifier. `@transition` animates items **arriving and
leaving**; an item that merely moves to a new index would jump there without `@move`:

```pdx
@for (rows as r; track r.id) @move(200) {
  <li>{{ r.label }}</li>
}
```

`@move(ms)` animates the move with FLIP — the reconciler measures each item before the change and
transforms it from where it was, so the browser animates a transform rather than a layout. `@move()`
takes the default of 300 ms.

Unlike `@stagger` and `@mode`, **`@move` stands alone**: it needs no `@transition` before it. A list
that should animate its reordering and not animate arrivals is an ordinary thing to want, and the two
compose when you want both — `@transition('fade') @move(200)`.

This is what makes a drag-sorted list ([`useSortable`](/docs/composables)) or a re-sorting table look
like one movement instead of a repaint.

## Animating a value yourself

`@transition` covers a subtree appearing and disappearing, and CSS does the work. When the thing that
has to animate is a **number your code owns** — a progress arc, a chart's scale, a panel's width —
`tween` gives you a signal that moves there smoothly, and everything downstream follows because it is
a signal like any other:

```pdx
<template><div class="bar" :ref="bar"></div></template>

<script setup>
import { tween } from '@pdxui/core';

let bar = $signal(null);
let target = $signal(0);
const smooth = tween(() => target);          // animates whenever target changes

$effect(() => { if (bar) bar.style.width = `${smooth()}%`; });
</script>
```

`tweenMulti({ x: () => px(), y: () => py() })` does several at once, so two values that must arrive
together do. `easings` carries the named curves.

`spring(config?)` is the odd one and worth reading twice: it returns **a CSS easing string**, not a
signal — `linear(0, 0.042, 0.158, …)`, a sampled spring you hand to
`transitionTimingFunction`. Physics for CSS to run, with no JavaScript in the loop.

`playKeyframes(el, config)` runs a Web Animations keyframe set and resolves when it ends, and
`animateSharedElement(el, fromRect, options?)` plays the shared-element move between two layouts —
`captureRect(el)` before, the animation after.

Below `@move` sit the two primitives it drives, for a list you reconcile yourself rather than with
`@for`: `recordPositions(nodes)` measures them before the mutation, `flipAnimate(positions, nodes,
ms)` transforms each one from where it was and lets the browser animate back to zero.

The rule that keeps this short: **if CSS can do it, let CSS do it.** `@transition` and `spring()` both
end in the compositor. Reach for `tween` when the value has to be readable as a signal.

## Lazy loading: `@defer`

Not everything needs to load up front. `@defer` postpones a heavy part until it's needed, showing a
placeholder meanwhile:

```pdx
@defer (viewport) {
  <pdx-heavy-chart :data="series" />
} @placeholder {
  <div class="skeleton" />
}
```

The trigger (`viewport`, `idle`, `interaction`…) decides *when*. The compiler generates the dynamic
import and the boundary: you don't write `import()`, `Suspense` or error boundaries by hand. It's the
right way to keep a chart you only see on scroll out of the home bundle.

## Raw HTML: `@raw`

When you have HTML that should be inserted exactly as written, with nothing in it read as template
syntax:

```pdx
@raw { <svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg> }
```

What `@raw` bypasses is the **template**: braces, `${…}` and directives inside the block are left
alone, which is what makes it the right tool for showing code samples or pasting an inline SVG. It does
not bypass CSS — the content lands in the component's subtree like everything else, so your
`<style scoped>` rules apply to it.

`@raw` is for **literal** content, fixed at compile time. To inject an HTML **string** computed at
runtime — markdown you just rendered, say — use a ref and set `innerHTML` yourself:

```pdx
<template><div class="prose" :ref="host"></div></template>
<script setup>
@prop markup: string = '';
let host = $signal(null);
$watch(markup, (value) => { if (host) host.innerHTML = value; });
</script>
```

A `:ref` target is a **signal** — `let host = $signal(null)` — because the element does not exist yet
when setup runs; see [Refs & Methods](/docs/imperative-methods). That content is a descendant of the
host too, so `<style scoped>` reaches it as well, and for the same reason: the scope is an attribute on
the host, not a class on each element. See
[the three blocks](/docs/components#the-three-blocks-precisely).

## Dynamic component: `<component :is>`

When the component to show is decided at runtime (a tab router, swappable views):

```pdx
<component :is="currentView" @keepAlive />
```

With `@keepAlive` the compiler generates an LRU cache: visited views stay "frozen" instead of being
rebuilt every time you come back.

## Handle errors: `@try` / `@catch`

A subtree can fail (a component that throws, malformed data). `@try` isolates it:

```pdx
@try {
  <pdx-risky :data="data" />
} @catch (e) {
  <p class="error">Something went wrong: {{ e.message }}</p>
}
```

The error doesn't propagate and crash the whole page: it stays confined to the boundary, which shows
the fallback.

## In short

| You want… | Use |
| --- | --- |
| show a value | `{{ expr }}` |
| bind an attribute | `:attr="expr"` |
| a controlled field | `::value="signal"` |
| react to an event | `@click="fn"` |
| show/hide with CSS | `:show="cond"` |
| add/remove from the DOM | `@if` |
| repeat | `@for (… as … ; track …)` |
| load later | `@defer` |
| swappable view | `<component :is>` |
| isolate an error | `@try` / `@catch` |
