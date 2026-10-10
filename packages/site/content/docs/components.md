---
title: Components
description: "Props, events, slots and the imperative API: the anatomy of a .pdx component."
order: 5
---

# Components

A component is the brick you build with. In PDX a component is a `.pdx` file, and it becomes a
**standard Web Component** (a `<pdx-name>` custom element). That means once defined you use it
anywhere — in another `.pdx`, in plain HTML, inside React or Vue — with no adapters.

A file has three blocks:

```pdx
<template>  <!-- what you see -->        </template>
<script setup>  <!-- state and logic --> </script>
<style scoped>  <!-- isolated styles --> </style>
```

The file name determines the tag: `user-card.pdx` → `<pdx-user-card>`. To force a different tag use
`@tag 'pdx-other-name'`.

Each block is optional — a `.pdx` with just a `<template>` is a valid component — and one
`<template>` and one `<script>` is the limit. **`<style>` you may write more than once**, which is how
a component ships its own scoped CSS *and* the page-level CSS it owns. The next section says what the
two words after the block names actually do; if you want to start writing,
[skip to `@prop`](#prop-the-data-a-component-receives) and come back.

## The three blocks, precisely

### `<template>` — the markup

Everything inside is [template syntax](/docs/template): bindings, `@if`, `@for`, slots. The component
renders into **light DOM** by default: its elements are ordinary children of `<pdx-user-card>` in the
page, visible to `querySelector`, stylable by the page, inspectable in devtools.

`<template shadow>` opts into Shadow DOM instead — the markup goes into a shadow root and the page's
CSS can no longer reach it. That isolation is the point, and it changes what the file's own styles
mean: the component's CSS is put **inside the root**, as one stylesheet shared by every instance, and
the selectors are not rewritten. Under `shadow` the root *is* the scope, so `scoped` makes no
difference there — nothing can reach in from outside either way.

The trade is the one Shadow DOM always asks for, and it is worth saying out loud: the design system's
stylesheet does not reach in either. A shadow component styles itself, or imports what it needs inside
its own block. Light DOM is the default because most components want the theme.

### `<script setup>` — the logic

`setup` is not a switch. What the compiler reads are the **runes** — `@prop`, `@event`, `$signal`,
`$derived`, `@expose` — line by line, and a plain `<script>` containing them compiles to byte-identical
output:

```pdx
<script>
@prop start: number = 0;
let count = $signal(start);
</script>
```

So `setup` is a statement of intent, and writing it is the convention here. There is one case where the
word matters, and it is the opposite of what you'd guess: the old pre-rune syntax — `defineProps`,
`defineEmits`, or a top-level `return { … }` — is still supported, and **one of those markers inside
`<script setup>` changes what the file compiles to**. Which way depends on what else is in it, and
both ways are surprising:

- with **no rune**, the legacy mode wins: the file has no new-mode setup at all, so a rune added to it
  later is inert;
- with **a rune**, the new mode wins and the `defineProps` you wrote does nothing — the props come
  from `@prop` only.

The compiler says so, as `PDX_LEGACY_IN_SETUP`, naming the marker and which side won. If props you
declared with `@prop` don't arrive, that warning is the first place to look — after a stray `return`
at the top level of the script, which is the marker nobody recognises as one.

The other side of «not a switch»: a plain `<script>` **with no rune** is the legacy mode too, and the
legacy mode hands the template only what `defineProps` declares and what the top-level `return { … }`
returns. `const title = 'Hi'` there, read as `{{ title }}`, is undefined — and the compiler reports it
as `PDX_TEMPLATE_NAME_NOT_PROVIDED`. `<script setup>` returns what it declares, which is why writing
it is the convention.

The script is **TypeScript**: annotations, `as`, generics (`$signal<User | null>(null)`), `import type`,
`interface` and `type` are checked by the editor and erased by the compiler, which replaces them with
spaces so every line and column of the module stays where you wrote it. TypeScript that does something
at runtime — an `enum`, a `namespace`, a constructor parameter property, `import x = require()` — has
nothing to erase it to and stops the compile (`PDX_TS_UNSUPPORTED`): write it as JavaScript.
`<script setup lang="js">` opts out, and the script is compiled as written.

A script can also live in its own file, which is useful when the logic outgrows the markup:

```pdx
<script setup src="./user-card.logic.ts" />
```

The other two blocks take one too: `<template src="./user-card.html" />` and
`<style scoped src="./user-card.css" />`. The compiler reads the file as if its contents were inline,
so bindings, form wiring and scoping work unchanged. That is how a component that is genuinely one
component, but long, becomes three files instead of three components ([Component
Design](/docs/component-design)).

### `<style scoped>` — the styles

Without `scoped`, the CSS is injected into `document.head` **verbatim**: it is global, exactly as if you
had written a stylesheet. That is a real option — a component that deliberately sets page-level CSS — not
an oversight. And the two go together in one file, which is the reason more than one `<style>` block is
allowed:

```pdx
<style scoped>
  .row { display: flex; gap: 8px; }        /* this component's own chrome */
</style>

<style>
  .v-item { position: absolute; left: 0; }  /* rows this component creates imperatively,
                                               which carry no scope attribute */
</style>
```

Each block becomes its own `<style>` element, so one does not overwrite the other on a hot reload.

> **In a build, the CSS leaves the JavaScript.** What is written above is the **dev** path: the block
> is a string inside the module and lands in `document.head` when the module is evaluated, which is
> what makes editing a style block feel instant. `pdx build` emits an *import* of the block instead,
> and the bundler extracts it into a stylesheet like any other — so a route's CSS is a `.css` file
> the browser fetches in parallel, not a string its JavaScript chunk has to parse first. You write
> the same block either way; only where it travels changes.

With `scoped`, the compiler puts an attribute on the host element and rewrites every selector to sit
under it:

```css
/* you write */          .title { font-weight: 600; }
/* the browser gets */   [data-pdx-a1b2c3] .title { font-weight: 600; }
```

Read that selector literally, because it decides everything else. The scope is an **ancestor**: the rule
applies to anything inside this component's subtree, not to the elements this file happened to write.
Four consequences follow, and all four are what people get wrong:

- A rule reaches **into child components** you render. `.title` here styles the `.title` inside a
  `<pdx-badge>` you placed. `scoped` does not mean "only my own elements".
- A rule reaches **content the parent slotted in**, for the same reason: projected content is rendered
  inside your subtree.
- It also reaches content that was never in your template — `@raw` blocks, and HTML you set with
  `el.innerHTML` — because those end up in the subtree too.
- **`@keyframes` names are not scoped**, and cannot be: a keyframe name is not a selector. Two components
  that both define `@keyframes fade` will collide, so prefix them.

`scoped` is also not protection *from* the outside: the page's CSS, and an enclosing component's scoped
CSS, both reach your elements. If you need real isolation, that is what `<template shadow>` is for.

Two extras live in this block, both resolved at compile time with no runtime cost:

```pdx
<template><div class="bar"></div></template>
<script setup>
let pct = $signal(42);
</script>
<style scoped>
.bar {
  width: bind(pct);                    /* → var(--pdx-a1b2c3-pct), updated when pct changes */
  font-size: responsive(16px, 64px);   /* → clamp(16px, calc(…), 64px) */
}
</style>
```

`bind(name)` is the bridge from a signal to CSS: the compiler emits a custom property and keeps it in
sync, so the stylesheet stays static and the browser does the work. `responsive(min, max)` becomes a
`clamp()` — see [Responsive](/docs/device).

And like the script, the styles can live in their own file:

```pdx
<style scoped src="./user-card.css" />
```

Let's build a `user-card` layer by layer, introducing one feature at a time.

## @prop — the data a component receives

A component almost always needs data from the outside. You declare it with `@prop`:

```pdx
@prop name: string = 'Anonymous';
@prop role: string = '';
@prop verified: boolean = false;
```

What the compiler generates from each: a signal for the prop, **sync with the HTML attribute**, and
the type. You read them in the template as normal values:

```pdx
<template>
  <div class="card">
    <strong>{{ name }}</strong>
    @if (verified) { <span class="badge">✓</span> }
    <span class="role">{{ role }}</span>
  </div>
</template>
```

From the outside: `<pdx-user-card name="Ada" role="Engineer" verified>`.

**Gotcha about types.** `string`/`number`/`boolean` props reflect as HTML **attributes** (so you set
them with `name="..."`). `Object`/`Array`/`Function` props can't live in an attribute: they're passed
as **properties**, i.e. with the `:items="list"` binding from another PDX template. A
`<pdx-list items="[...]">` as a string **won't** work; you need `:items`.

## @event — what a component communicates

A component shouldn't know *what* the parent does when something happens: it just **emits an event**.
You declare it with `@event`:

```pdx
@event selected: { id: string };

function pick() { selected({ id: currentId }); }
```

The compiler generates the `selected(payload)` function and the dispatch of a typed `CustomEvent`.
The consumer listens like any DOM event:

```pdx
<pdx-user-card @selected="onSelect" />
```

Convention: library-component events use the `pdx-` prefix (e.g. `pdx-change`). For your own app
components, pick meaningful names.

## Slots — content decided by the parent

Sometimes it isn't the component that knows what to show inside it, but whoever uses it. **Slots**
are "holes" the parent fills:

```pdx
<template>
  <div class="card">
    <header><slot name="header"></slot></header>
    <slot></slot>                <!-- default slot -->
    <footer><slot name="footer"></slot></footer>
  </div>
</template>
```

Usage:

```pdx
<pdx-user-card>
  <h3 slot="header">Ada Lovelace</h3>
  <p>First programmer.</p>
  <button slot="footer">Contact</button>
</pdx-user-card>
```

### Scoped slots (data from the component to the content)

When the component has the data but the parent decides *how* to show it (think of a list that lets
you customize the row), you use a **scoped slot**, passing data to the slot:

```pdx
<slot :row="item" :index="i" let:row let:index>{{ row.name }}</slot>
```

> Compiler rule: a `<slot>` is treated as a parent template **only if it has at least one `let:`**.
> Without `let:` it's a normal projection slot. If you need a named slot with no data, add a dummy
> `let:_` so it gets recognized.

## @expose — an imperative API, when you need it

90% of the time props and events are enough. But some components have actions that aren't "data":
opening a dialog, focusing. For those you expose methods on the element with `@expose`:

```pdx
@expose open, close;

function open() { isOpen = true; }
function close() { isOpen = false; }
```

From the parent, with a reference to the element: `dialogRef.open()`. Use it sparingly: if you can
get the same result with a prop (`:open="..."`), prefer the prop — it's more declarative.

## Putting it all together

```pdx
<template>
  <article class="card" :class.verified="verified">
    <header>
      <strong>{{ name }}</strong>
      @if (verified) { <span class="badge">✓</span> }
    </header>
    <slot></slot>
    <footer>
      <button @click="pick">Select</button>
    </footer>
  </article>
</template>

<script setup>
@prop name: string = 'Anonymous';
@prop verified: boolean = false;
@prop id: string = '';
@event selected: { id: string };

function pick() { selected({ id }); }
</script>
```

Props coming in, an event going out, slots for free content: that's the vocabulary you'll compose the
whole app from. For *what* you can write in the `<template>` (conditions, lists, lazy loading),
continue with [Template & directives](/docs/template).
