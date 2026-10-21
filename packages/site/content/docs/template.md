---
title: Template & directives
description: "How you write reactive markup: bindings, conditions, lists, lazy, errors."
order: 6
---

# Template & directives

> **Formal reference:** [docs/language/template.md](https://github.com/pragmatic-design/pdxui/blob/main/docs/language/template.md) defines the grammar of what this page teaches: what each construct accepts, what it generates, which diagnostic it raises.

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

A value that is already markup is put in as markup: an element (`{{ icon }}`, where `icon` is a
`Node`), a fragment, or an array of them, one after the other. Both builds do it through
`bindInterpolation`, which also follows the value when it changes.

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
:class="{ active: isActive }"     <!-- adds the 'active' class when true -->
:class="variantClass"             <!-- a string of classes, for a fully dynamic class -->
:style="{ color, '--gap': gap }"  <!-- sets CSS properties; a custom property is a quoted key -->
:ref="boxRef"                     <!-- puts the element into a signal, to access it after mount -->
::value="text"               <!-- two-way: reads AND writes the signal (controlled inputs) -->
```

`::value` is the shorthand for controlled fields: it binds the value *and* updates the signal as the
user types, without writing the `@input` handler. Two-way binding is a contract: `::x` is valid on
the value properties of native form elements (`value`, `checked`, `files`) and on a component's
`@model x` ([Components](/docs/components)). It listens where the value changes: `input` on a text
field, `change` on a `<select>` and on `::checked`, and on a component its `<name>-change` event
(`value-change` for `::value`), reading `detail.value` — so `<pdx-select ::value="country">` works as
`<input ::value="name">` does. On the library component that declares no model yet, `pdx-pin-input`, it
listens to `pdx-input` and `pdx-change`, as before. `::x` on a component prop that is not a model is an error,
`PDX_TWO_WAY_NOT_MODEL`.

Modifiers shape the value on its way back — the list is closed, and anything else is the error
`PDX_BINDING_MODIFIER`:

```pdx
<input ::value.lazy="name" />            <!-- commit on change, not on each keystroke -->
<pdx-input ::value.lazy="name" />        <!-- the same on a text field: its inner input's change, on blur or Enter -->
<input ::value.trim="name" />            <!-- trim before writing -->
<input ::value.debounce(300)="query" />  <!-- write 300 ms after the last input; at once on blur and on submit -->
<input ::value.number="age" />           <!-- a number; empty writes null; "1,5" writes nothing and marks the field invalid -->
<p :title.once="label">…</p>             <!-- a plain binding assigned once, never updated -->
```

A group of checkboxes binds to an array, and a group of radios to one value, with `::group` — each
input says its own `value`:

```pdx
<input type="checkbox" value="cheese" ::group="toppings" />  <!-- checked while toppings holds 'cheese' -->
<input type="checkbox" value="ham" ::group="toppings" />
<input type="radio" value="small" ::group="size" />          <!-- checked while size is 'small' -->
<input type="radio" value="large" ::group="size" />
```

When the value needs converting both ways — money shown as `12.50` and kept in cents — write the
general form, of which every modifier is a shorthand:

```pdx
<input ::value="{ get: () => (cents / 100).toFixed(2), set: (s) => cents = Math.round(Number(s) * 100) }" />
```

The wiring is core's `bindTwoWay(el, 'value', signal)`, the call a compiled template makes in dev
and in a build alike. A hand-written TypeScript component can call it the same way.

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

The editor and `pdx check --types` know what `$event` is. On a DOM event it is that event — a
`KeyboardEvent` for `@keydown` — and its `target` is the element you wrote the handler on, so
`$event.target.value` on an `<input>` is a string, and `$event.target.vlaue` is an error. On a
component's event it is the `CustomEvent` that component declares with `@event`: `$event.detail` has
the payload's type, or `unknown` when the `@event` gives none. A library component's events are not
typed yet: their `$event.detail` is not checked. In `@input="e => …"`, `e` is that same event.

Template expressions are checked under TypeScript's `strict` mode, the script is not: `{{ user.name }}`
on a `$signal<User | null>(null)` is an error until you write `user?.name` or guard it with `@if`.
A `$signal(null)` or a `$signal([])` keeps the loose type it has in the script.

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

## Behaviour on an element: `attach:`

Focus on mount, a tooltip, a click outside, a textarea that grows: behaviour that belongs to one
element. Instead of a ref, an `onMount` and a cleanup written by hand, **attach** it:

```pdx
<input attach:autofocus attach:tooltip="'Search by name'" />
<div class="menu" attach:clickOutside="close">…</div>
```

An attachment is a plain function of the element and a getter for its value, which may return a
cleanup:

```ts
export function tooltip(el: Element, text: () => string) {
  const tip = showTooltip(el, text());
  return () => tip.remove();   // when the text changes, and when the element goes
}
```

It runs when the element is rendered; when its value changes, the cleanup runs and it runs again;
when the element goes — an `@if` closing, a `@for` row removed, the component destroyed — the cleanup
runs once more. On a component it attaches to the host. `autofocus`, `trapFocus` and `clickOutside`
are core's and need no import; any other name is a function of the script or an import, and a name
that is neither is `PDX_ATTACH_UNKNOWN`. The editor checks the value against the attachment's type.

## Conditions: `@if` / `@else`

```pdx
@if (user) {
  <p>Welcome, {{ user.name }}</p>
} @else {
  <pdx-button @click="login">Sign in</pdx-button>
}
```

Unlike `@show (cond) { … }` (which hides with CSS but keeps the elements in the DOM), `@if` actually
**adds and removes** elements — and disposes their effects when it removes them. Use `@show` for
frequent, lightweight toggles, `@if` when the element may not exist at all.

Each of these forms has one spelling. The older ones — `:class.active="c"`, `:style.color="c"`,
`ref="el"` and a `:show="c"` attribute — are errors (`PDX_REMOVED_FORM`), and `pdx migrate` rewrites
them: the `:class.x` and `:style.x` of an element merged into one object, `ref=` into `:ref=`, and the
element of a `:show` wrapped in `@show (c) { … }`.

## Lists: `@for`

```pdx
@for (todos as todo; track todo.id) {
  <li :class="{ done: todo.completed }">{{ todo.text }}</li>
}
```

The `track` matters: it tells PDX how to **identify** each item, so when the list changes it moves
the right nodes instead of rebuilding them (minimal reconciliation). Use a stable key (`todo.id`),
not the index, if items can reorder.

A row that compares its key with a signal — `row.id === selected`, with `track row.id` — reads a
keyed selector (core's `selector`): when `selected` changes, the two rows it concerns update, not
every row. The comparison has to be exactly the `track` expression against the signal, either way
round; anything else is read as written.

An event written in a row — `@click`, `@dblclick`, `@input`, `@change`, `@keydown`, `@keyup`,
`@pointerdown`, `@pointerup`, `@contextmenu` — does not add a listener per row: the compiler stores
the handler on the row's element, and the component listens once per event type (core's `delegate`).
The handler itself is built once for the whole `@for`, not once per row: each row stores only what it
names — its item, its index, an outer row's item — and the shared handler reads them from there.
Nothing changes in how you write it: handlers run inner first, `.stop` still stops, and
`$event.currentTarget` is still the element the handler is on. A handler with `.capture`, `.once`,
`.passive` or `.self`, one on a component or inside one, and one in a `@portal` keep a listener of
their own.

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

### Many rows at once

A `@for` that receives more than 1 000 new rows at once draws the first 250 in the same task and,
once they are painted, the rest in slices of about 40 ms, so a click that appended 10 000 rows is answered in the next frame
and the page keeps answering while the rest arrive. This holds when rows are appended (the first
render included) and when the list is replaced by one with no row in common. Until the slices settle
the rows still to come are not in the DOM. Writing a newer list replaces the slices still pending.
A destructured `@for (pairs as { key, value }; …)` does the same: it compiles to `eachDestructured`,
which slices where a hand-written `each()` keeps the single pass, since its caller may read the DOM
right after the write.

Some lists keep the single pass:
- a list with `@transition`, whose timing is the transition's;
- a change that keeps some rows and adds many between them.

### A long list: `@virtual`

A `@for` over 10 000 items creates 10 000 rows, in slices or not. With `@virtual`, it creates the
ones in view:

```pdx
<ul class="feed">
  @for (posts as post; track post.id) @virtual(64) {
    <li>{{ post.title }}</li>
  } @empty {
    <li>No posts yet.</li>
  }
</ul>

<style scoped>
.feed { height: 400px; overflow: auto; }
</style>
```

The element around the `@for` is what scrolls, and the rows stay its own children: `<li>` of the
`<ul>`, `<tr>` of a `<tbody>`, `<div>` of a `<div>`. Two spacers of the same tag stand in for the
rows above and below the window; they are empty and `aria-hidden`, so the list keeps its real height
and the scrollbar its real length. `@virtual(64)` is the estimated row height in px. Without a
number the first row is measured, and every row is measured as it renders and again when its size
changes, so rows of different heights land where they are.

The collection can also be a `DataSource`: the list renders its `data()`, and when its last row
scrolls into view, it calls `loadMore()` once while `hasMore()` is true. `@empty` shows for an empty
list, and for a source that has no data and is not loading.

The shape is checked. The `@for` must be the only content of a native element (a component's
children are projected elsewhere), and each row must be one element. Anything else is
[`PDX_VIRTUAL_SHAPE`](/docs/diagnostics). A row scrolling out of view is not leaving the list, so
`@transition`, `@stagger`, `@mode` and `@move` are refused: [`PDX_VIRTUAL_TRANSITION`](/docs/diagnostics).

**Accessible by the container's role.** What is not rendered is not in the accessibility tree, so
the list says it itself. Which role the container has decides what it says: its `role` attribute,
or a `ul`/`ol` (a list) or a table.

- **`list`, `listbox`, `tree`**: each rendered item carries `aria-setsize` (the total) and
  `aria-posinset` (its place). A screen reader says «3 of 10 000», not «3 of 23».
- **`table`, `grid`, `treegrid`**: each rendered row carries `aria-rowindex`, and the table
  `aria-rowcount`, both counting a header row.
- **The total of a `DataSource`** is its `total()` when the server reports one, and `-1` (unknown)
  while it has more.
- **Composite roles (`listbox`, `tree`, `grid`, `treegrid`)**: the list owns a roving tabindex and
  the keys. ArrowUp and ArrowDown, Home and End, PageUp and PageDown move focus; an item not yet
  rendered is scrolled to, rendered, then focused. A `listbox` still needs `aria-selected` on its
  options from your template, as any listbox does.
- **`list` and `table`** get no keys: Tab moves through what the rows contain.
- **A focused item that scrolls out of view stays in the DOM, in its place**, until focus leaves it.
- **A container whose rows hold nothing focusable**, under a role without keys, takes `tabindex="0"`
  itself while it scrolls, so the keyboard can reach it.

Three limits come with it:

- **The container needs a bounded height.** One that grows with its rows renders all of them, and
  in development a warning names it.
- **Find-in-page sees only the rows in view.**
- **Printing gets only the rows in view.**

## Animating a value yourself

`@transition` covers a subtree appearing and disappearing, and CSS does the work. When the thing that
has to animate is a **number your code owns** — a progress arc, a chart's scale, a panel's width —
`tween` gives you a signal that moves there smoothly, and everything downstream follows because it is
a signal like any other:

```pdx
<template><div class="bar" :ref="bar"></div></template>

<script>
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
  <app-heavy-chart :data="series" />
} @placeholder {
  <div class="skeleton" />
}
```

The trigger (`viewport`, `idle`, `interaction`, `timer(ms)`, `immediate`…) decides *when*. The compiler
generates the dynamic import and the boundary: you don't write `import()`, `Suspense` or error
boundaries by hand. It's the right way to keep a chart you only see on scroll out of the home bundle.

Loading the code and showing it can happen at different moments. The triggers after `; prefetch` only
fetch the code, so it is already there when the block is shown; `when (…)` waits for a condition of
the app, the first time it is true; and `@error` hands its branch the error and a `retry` that loads
the code again:

```pdx
@defer (when (tab === 'sales'); prefetch idle) {
  <app-sales-chart />
} @error (err, retry) {
  <button @click="retry()">Load the chart again</button>
}
```

The chart's code arrives while the browser is idle, and the chart mounts when the Sales tab is
opened — without a wait. A failed prefetch shows nothing; opening the tab simply loads again.

## Waiting for data: `@await`

`@defer` waits for code; `@await` waits for data. It takes an `@fetch`, a resource, `useQuery` or a
promise, and `as` names the result for the body:

```pdx
@await (users as list) { minMs: 200, maxMs: 8000 } {
  @for (list as u; track u.id) { <li>{{ u.name }}</li> }
} @loading {
  <pdx-skeleton />
} @error (err, retry) {
  <p role="alert">{{ err instanceof Error ? err.message : String(err) }}</p>
  <button @click="retry()">Retry</button>
}
```

- **What it decides on is the state, not the value.** `@loading` while there is no data yet, `@error`
  when the first load fails, the body otherwise — through a refresh, and through a refresh that
  failed, which keeps the data on screen (read `users.error()` in the body to say so). A plain value
  is data too: `null`, `0` and `''` render the body; only `undefined` and `false` wait.
- **`retry`** calls the source's `refetch()`; for a promise, put a new one in the signal.
- **`minMs`** holds `@loading` back, so a fast answer never flashes a spinner. **`maxMs`** gives up:
  with no result by then, `@error` shows an `AwaitTimeoutError`, and the body replaces it if the
  result arrives later. A `maxMs` not greater than `minMs` is `PDX_AWAIT_TIMING`.
- **A type assertion** in the expression goes in its own parentheses — `@await ((x as Resource<User[]>) as list)` —
  because the last `as` is the binding.

The block compiles to core's `awaitBlock()`, which a hand-written `html` template can call too.

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
<script>
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

The component it becomes takes no children: write the tag self-closed, and pass what the view needs
as props (`<component :is="view" :title="t" />`). Content between `<component :is>` and
`</component>` is not rendered, and the compiler says so (`PDX_DYNAMIC_CONTENT`).

## Handle errors: `@try` / `@catch`

A subtree can fail (a component that throws, malformed data). `@try` isolates it:

```pdx
@try {
  <app-risky :data="data" />
} @catch (e) {
  <p class="error">Something went wrong: {{ e instanceof Error ? e.message : String(e) }}</p>
}
```

The error doesn't propagate and crash the whole page: it stays confined to the boundary, which shows
the fallback.

What is thrown is not always an `Error`, so the editor types `e` as `unknown`, as TypeScript types a
`catch`: say what you expect before reading a member, as above. The error of `@await … @error (e)` is
the same.

## In short

| You want… | Use |
| --- | --- |
| show a value | `{{ expr }}` |
| bind an attribute | `:attr="expr"` |
| a controlled field | `::value="signal"` |
| react to an event | `@click="fn"` |
| show/hide with CSS | `@show (cond) { … }` |
| add/remove from the DOM | `@if` |
| repeat | `@for (… as … ; track …)` |
| load later | `@defer` |
| wait for data | `@await (x as name)` |
| swappable view | `<component :is>` |
| isolate an error | `@try` / `@catch` |
