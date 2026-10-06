<!-- Copied from packages/site/content/docs/head-scroll.md by gen-topics.mjs: edit it there. -->

# Head & Scroll

Two things SPAs often neglect and that make the difference between an app "that works" and a polished
one: the `<head>` (title and meta that change with the page, for users and for SEO/social) and
**scroll** (position preserved as you navigate back and forth). PDX makes both declarative.

## Head — @title and @meta

When you navigate between pages in an SPA, the tab title should change: it's what the user sees in
bookmarks and history, and what engines and social cards read. `@title` declares it:

```pdx
<script setup>
@title 'Dashboard';
</script>
```

For a title that follows your state, give `@title` an **expression** — a bare one, or a template
literal in backticks:

```pdx
<script setup>
@prop userId: string = '';
let user = $signal({ name: '' });

@title `Profile of ${user.name}`;
</script>
```

The distinction matters and it is easy to miss: a value in **quotes is taken literally**. `@title
'Profile of ${user.name}'` puts those sixteen characters in the tab, `${…}` included — single quotes
are not template literals in JavaScript either. Backticks give you the interpolation, and the compiler
turns the whole thing into a tracked effect, so the tab re-titles itself when the signal changes.

`@meta` handles meta tags, including the Open Graph ones for social previews. The shape is
`name: 'content'`, with `property` in front for the OG family:

```pdx
<script setup>
@meta description: 'Control panel for your account.';
@meta property og:title: 'PDX Dashboard';
@meta property og:image: '/covers/dashboard.png';
</script>
```

> **`@meta` with braces is a different rune.** `@meta { requiresAuth: true }` attaches arbitrary data
> to the *route* — read back from the router, not written to the document. The `<head>` form is the one
> with a `key: 'value'` pair and no braces. If a meta tag you declared never appears in the DOM, check
> which of the two you wrote.

When several tags belong together, `@head` groups them:

```pdx
<script setup>
@head {
  title: 'Products',
  meta: [{ name: 'description', content: 'Everything we sell' }]
}
</script>
```

When the page changes, PDX updates `document.title` and the matching meta. You don't hand-manage the
`<head>` DOM.

> For *full* SEO (content indexable without JS) you need static/server rendering (SSG), on the
> framework roadmap. `@title`/`@meta` cover per-route title and meta in the SPA.

## Scroll — useScroll

Sometimes you want to react to scroll: a header that hides on the way down, a "back to top" that
appears after a while. `useScroll()` exposes the **window's** scroll as signals — four of them, and
those four are all there is:

```pdx
<script setup>
import { useScroll, scrollTo } from '@pdxui/core';

const { x, y, direction, isScrolling } = useScroll();

const atTop = $derived(y < 8);
</script>
```

| signal | value |
|---|---|
| `x`, `y` | the current offset, in pixels |
| `direction` | `'up'`, `'down'`, or `'idle'` |
| `isScrolling` | `true` while events are arriving |

Anything else you build yourself, as `atTop` does above — one `$derived` over `y`, which is the whole
point of exposing signals rather than a fixed set of booleans.

Then read them like any other signal. In a template you write the name, not a call: the compiler adds
the parentheses.

```pdx
<template>
  <header class="bar" :class.hidden="direction === 'down' && !atTop">…</header>
  @if (y > 600) {
    <button class="to-top" @click="scrollTo(0)">↑</button>
  }
</template>
```

`scrollTo` is the companion export: give it a Y position, a CSS selector, or an element, and it scrolls
there smoothly (`scrollTo(0)`, `scrollTo('#pricing')`, `scrollTo(el, { behavior: 'auto' })`).

Two behaviours worth knowing before you build on them:

- **`direction` returns to `'idle'`** 150 ms after the last scroll event, not when you change
  direction. A header bound to `direction === 'down'` therefore reappears shortly after the user stops,
  which is usually what you want — and is not what the expression says, so it surprises people.
- **With no argument it watches `window`** — and the window is the one thing that does *not* scroll in
  an app built on `pdx-app-layout`, where the shell is `overflow: hidden` and the page scrolls inside
  `main.pdx-app-main`. There, the two examples above would report a `y` that never moves. Point it at
  the region instead:

  ```pdx
  <template>
    <main class="page" :ref="region">…</main>
  </template>

  <script setup>
  import { useScroll } from '@pdxui/core';

  let region = $signal(null);
  const { y, direction } = useScroll(() => region);
  </script>
  ```

  Pass a **getter**, not the element. The getter is read inside an effect, so it attaches itself the
  moment the `:ref` fills at mount — and follows you if the element is later replaced. Handing it the
  element means finding a place where that element already exists, which is a step none of the other
  element-watching composables asks for.

  The state is one per element (and one, shared, for the window), so two components watching the same
  region share a listener. `dispose()` lets go, and only the getter form has anything to let go of. A
  `null` *element* falls back to the window **and says so in the console** — in this layout that
  fallback is never what you wanted; a getter that answers `null` says nothing, because before mount
  that is simply where things stand.

## Scroll restoration

The detail that makes an app feel "native": you go back and find the page **exactly where you left
it**, not at the top. This one is automatic — the router does it on every navigation, and you declare
nothing:

- **Back or forward** → the offsets saved for that path are put back. Both offsets: the window's *and*
  the scroll container's, so a page that scrolls inside `pdx-app-layout` is restored too.
- **A new navigation** → to the `#anchor` in the URL if there is one, otherwise to the top.

Restoring is not a single assignment, because the page is usually still short when it happens: the
route resolves, then the outlet mounts the page, then its components load their data. The router keeps
re-applying the saved offset as the content grows — driven by the content itself, not by a timer — and
stops at the offset, on the user's first scroll input, or after two seconds. Without that, a list left
at 600 px comes back at 495.

So: a long list, a detail page, and back — you resume from the same spot, with nothing declared.

## Per page: `@scroll`

Two pages want something other than the default, and they declare it:

```pdx
<script setup>
@page '/checkout';
@scroll 'top';        <!-- always enter at the top, even on Back -->
</script>
```

| | |
| --- | --- |
| `@scroll 'top'` | this page never resumes: it enters at the top, on Back as well. For a page whose content changes underneath you — a checkout step, a fresh search — where landing mid-list is confusing rather than helpful. An `#anchor` in the URL still wins: an explicit fragment is more specific than a page default. |
| `@scroll 'preserve'` | this page resumes **even on a forward navigation**. You leave a long list, and come back to it through a nav link rather than the Back button — with `preserve` you are where you were. On Back that is already what happens, so this is the case the declaration exists for. |

Neither changes what the router does when there is nothing saved for that path: a first visit goes to
the anchor, or to the top.
