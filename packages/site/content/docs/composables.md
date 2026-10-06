---
title: Composables
description: "The use* functions: browser state, data, gestures, accessibility — what each one solves and when to reach for it."
order: 13.5
---

# Composables

A composable is a plain function that returns **signals**. It has no template, no tag and no
lifecycle of its own: you call it in setup, keep what it returns, and read it like any other signal.
That is the whole idea — the reactive parts of a feature, packaged without a component around them.

PDX ships about thirty. This page covers the ones an application author reaches for, grouped by the
problem they solve. When to write one of your own, and how, is on
[Component Design](/docs/component-design) (CD-L1). The [API reference](/docs/api) lists every export with its exact signature; this
is the page that says *which one and when*.

## The two shapes

Almost all of them take one of two forms, and telling them apart saves reading the signature:

```ts
const isDark = useMediaQuery('(prefers-color-scheme: dark)');   // a signal
const drag = useDrag(() => boxRef(), { axis: 'x' });            // an element + options → an object
```

The ones that watch an **element** take a **getter**, not the element: `() => boxRef()`. That is
deliberate. The getter is read inside an effect, so when your `:ref` signal fills at mount the
composable attaches itself — no `onMount` dance, and it re-attaches if the element is replaced.

> [`useScroll`](/docs/head-scroll) also accepts the element itself, and the window when you pass
> nothing. The getter is the form to reach for: it is the only one that attaches at mount.

Anything that installs listeners returns a `dispose()`. Inside a `.pdx` component you rarely call it:
the effects created during setup are disposed with the component. Call it when you create one outside
a component, or when you tear a feature down while the page stays.

## Browser and environment

```pdx
<script setup>
import { useMediaQuery, useOnline, useStorage, useClipboard } from '@pdxui/core';

const isWide = useMediaQuery('(min-width: 1200px)');
const online = useOnline();
let theme = useStorage('app.theme', 'light');       // a WRITABLE signal
const clip = useClipboard();
</script>
```

| | |
| --- | --- |
| `useMediaQuery(query)` | a `boolean` signal following `matchMedia`. For breakpoints prefer [`responsive()`](/docs/device) — this is for the queries a breakpoint scale does not have: `(prefers-color-scheme: dark)`, `(prefers-reduced-motion)`, `(pointer: coarse)` |
| `useOnline()` | a `boolean` signal on `navigator.onLine`, shared across the page |
| `useStorage(key, default, 'local' \| 'session')` | a read/write signal persisted to storage **and synced across tabs**: `theme = 'dark'` writes it, another tab sees it |
| `useClipboard(options?)` | `copy(text)`, `paste()`, `cut(text, onClear)`, plus `copiedText` and `isPending` signals — the state a "Copied!" affordance needs |
| `useSafeArea()` | `insets` and `hasInsets` for the notch and the home indicator, re-read on rotation |
| `useContainerSize(() => el, breakpoints?)` | `width`, `height` and `isCompact`/`isMedium`/`isWide` for **the element**, not the viewport — the primitive behind container queries |
| `useIdle({ after, warnBefore })` | `isIdle` and `msRemaining` signals, `reset()`, and `onIdle`/`onWarn` — how long since the USER was here, which is not when the token expires |

`useStorage` is the one worth stressing: it is a `Signal`, not a getter. Write to it and storage and
every other tab follow.

### Inactivity: `useIdle`

`createAuthStore` knows when the **token** expires. `useIdle` knows when the **user** stopped being
there, and they are different questions — a token that lives eight hours does not protect a screen
left open on a shared desk. Any application handling personal, financial or clinical data is asked
for an inactivity timeout in its first review.

```pdx
<script setup>
import { useIdle, createAuthStore } from '@pdxui/core';

const auth = createAuthStore();
const idle = useIdle({
  after: 15 * 60_000,
  warnBefore: 60_000,
  onWarn: () => (showStayLoggedIn = true),
  onIdle: () => auth.clear(),
});
</script>

<template>
  <pdx-dialog :open="showStayLoggedIn">
    Still there? Logging out in {{ Math.ceil(idle.msRemaining() / 1000) }}s.
    <pdx-button @click="idle.reset(); showStayLoggedIn = false">Stay</pdx-button>
  </pdx-dialog>
</template>
```

Four things it does that a `setTimeout` does not:

- **pointer, key, scroll, touch and wheel** count as activity, listened passively on the document
  and **throttled** — a reset per `pointermove` is a signal write, and a signal write is a render;
- **the wall clock, not the timer.** A background tab's timers are throttled to once a minute or
  stopped altogether, so a `setTimeout` comes back from an hour asleep still logged in. Every read
  compares `Date.now()` with the last activity, and `visibilitychange` forces that comparison the
  moment the tab returns;
- **`warnBefore`**, because a session that dies without warning takes the form the user was filling
  in with it. `msRemaining` is a signal so the dialog can count down;
- **other tabs**: work in a second tab of the same app is work. Each tab writes its activity to
  `localStorage` and the others hear it — the cheap answer, and the only one needing no service
  worker. `crossTab: false` turns it off.

It does not know what logging out means: `onIdle` is where the application decides. `dispose()`
removes every listener.

## Data

`useQuery` is a wrapper over [`resource()`](/docs/data) — the same cache, the same `key`, the same
`tags` — that adds what a screen left open needs: refetch on focus, on reconnect, on an interval, and
`mutate()` for an optimistic write.

```pdx
<script setup>
import { useQuery } from '@pdxui/core';

let page = $signal(1);

const users = useQuery(
  () => fetch(`/api/users?page=${page}`).then(r => r.json()),
  { key: () => `users:${page}`, staleTime: 60_000, tags: ['users'] },
);
</script>
```

The query function is the **first argument**; the options object does not carry it. Then
`users.data()`, `users.isLoading()`, `users.error()`, `users.refetch()`.

**`useQuery` or `@fetch`?** They are not rivals, and neither is going away:

- **`@fetch users: 'GET /api/users';`** — the declarative form, over the framework's HTTP client, with
  the middleware, the retry policy and the typing that come with it. This is the default for a request
  to your own API. See [Data](/docs/data).
- **`useQuery(fn, opts)`** — when the fetcher is *your* promise: a third-party SDK, a GraphQL client,
  an IndexedDB read, anything that is not an HTTP call through `configureClient`. Or when you want the
  refetch triggers, which the rune does not expose.

Both end up in `resource()`, so a `key` set by one is a cache entry the other can invalidate by tag.

## The document head

`@title` and `@meta` ([Head & Scroll](/docs/head-scroll)) are the declarative form, and they are what
you want in a page component. The composables are for the cases a declaration cannot reach — a title
computed by a helper, or head tags set from a library:

```ts
import { useHead, useTitle } from '@pdxui/core';

useTitle(() => `${unread()} unread — Inbox`);     // reactive, re-runs with the signal
const remove = useHead({                          // returns a dispose that removes the tags
  meta: [{ name: 'robots', content: 'noindex' }],
  link: [{ rel: 'canonical', href: '/inbox' }],
});
```

`useTitle` takes a **function** and keeps the title in sync; `useHead` takes a static config once and
hands back the way to undo it.

## Pointer, drag and drop

### Which one, first

There is more than one way to drag something in PDX, and picking wrong costs you a rewrite rather
than a tweak. Start here.

| You want | Use | |
| --- | --- | --- |
| a list the user reorders | **`<pdx-sortable-list>`** | a component: handle, keyboard, announcements, all of it. Emits `pdx-reorder` with `{ from, to, id }` |
| a gesture no component covers — a board, a canvas, dragging between two regions | **`useDrag` + `useDropZone`** | the primitives below. You draw everything |
| a grid's rows reordered | `<pdx-data-grid row-reorder>` | the grid's own, built on the browser's HTML5 drag API. Emits `pdx-row-reorder` |

The first two are **pointer events**. The third is the browser's **HTML5 drag-and-drop**, and they
are two different worlds that share no code.

**They do not meet.** A row dragged out of a data grid never reaches a `useDropZone`, because a drop
zone is hit-tested from `useDrag`'s own `pointermove` and listens for no `drag` event at all. If you
need a grid row to land on a sidebar, that is a feature to build, not a wiring problem to solve.

And the part that surprises people: **`draggable="true"` takes the pointer stream away from you.**
Press and move on such an element and the browser promotes the gesture to a native drag — `dragstart`
fires, `pointermove` stops being yours. So the choice is not about how the user moves their hand; it
is made by the element, and the two cannot share one.

What each gives you, when it is a real choice:

- **the HTML5 API** survives a drag that leaves the window, and it is the only one that talks to
  other applications and to file drops;
- **pointer events** work on touch without the HTML5 API's mobile problems, and hand you the
  *intermediate* state — `overIndex` and `edge` while the drag is moving, not only at the drop.

### The composables

Four composables that compose into a drag-and-drop feature, each usable alone:

```pdx
<template>
  <ul :ref="list">
    @for (items as item; track item.id) { <li>{{ item.label }}</li> }
  </ul>
</template>

<script setup>
import { useSortable } from '@pdxui/core';

let items = $signal([{ id: 1, label: 'One' }, { id: 2, label: 'Two' }]);
let list = $signal(null);

useSortable(() => list, {
  items: () => items,
  onReorder: (from, to) => {
    const next = items.slice();
    next.splice(to, 0, next.splice(from, 1)[0]);
    items = next;
  },
});
</script>
```

| | |
| --- | --- |
| `useDrag(() => el, options?)` | makes one element draggable: `isDragging`, `position`, `delta`, `velocity`, with `axis`, a long-press delay and an optional ghost |
| `useDropZone(() => el, options?)` | the receiving half: `isOver` and `edge` (which side the pointer is on, for insert-before/after) |
| `useSortable(() => el, { items, onReorder })` | a reorderable list built from the two. It **does not mutate your array** — `onReorder(from, to)` hands you the indices and you write the new value, so the list stays the single source of truth. `group` makes two lists one destination: see below |
| `usePullToRefresh(() => el, { onRefresh })` | the mobile gesture, with threshold, resistance and max pull. `onRefresh` must return a promise — the indicator follows it |
| `useBottomSheet(() => el, options?)` | the iOS-style sheet: snap detents, backdrop, drag to dismiss |

#### What the destination shows

A drag that shows you the thing under your pointer and nothing at the far end is a leap of faith.
`useDropZone` marks the zone itself, and the design system paints it — so the feedback follows the
theme instead of being re-invented per application:

| the zone writes | when |
| --- | --- |
| `data-pdx-drop="over"` | a droppable item is over it and it will land here |
| `data-pdx-drop="rejected"` | it is over it and `accept()` said no |
| `data-pdx-drop-edge="top\|bottom\|left\|right"` | where it would insert — only if the zone asked |

```ts
useDropZone(() => columnRef(), {
  accept: (data) => data?.kind === 'card',
  feedback: {
    highlight: true,   // default — the area marks itself
    line: false,       // default — see below
    reject: true,      // default — a zone that refuses says so
  },
  onDrop: …,
});

useDropZone(() => el, { feedback: false });   // paint nothing; I will do it myself
```

**The line is off by default and that is not timidity.** It is the one normative rule anybody in
this space has written down, and it is Atlassian's: a line communicates *relative placement* —
before or after something — and must not be shown where no relative placement exists. An ordered
list wants the line; a kanban column where the order does not matter wants the highlight. They
answer different questions, so the caller says which question it is.

**The refusal is on by default, and that is a departure.** The usual treatment is to say nothing:
Atlassian's guidance is "only colour when a drop is possible", and react-beautiful-dnd never even
*tells* a disabled droppable that something is over it (its issue #1712). Leaving the user to infer
a rule from the absence of a colour is worse than saying no, so `isRejected()` is a state of its
own — `isOver()` stays false, because it is not a target — and the zone marks itself.

⚠️ The mark is an **outline and an inset shadow, never a background**, and that was measured: the
showcase's own kanban column sets `background` in its `<style scoped>`, which is *unlayered* and
therefore beats every layer the design system paints in. A highlight painted with `background` is
one any application silently cancels.

**The gap belongs to the list, not the zone.** A drop zone hit-tests one rectangle — its own — so
it knows it is being dragged over and not *between which two children*. Opening the space is
[`useSortable`](#reordering-and-the-space-that-opens)'s job, below.

#### Reordering, and the space that opens

`useSortable` opens the space where the item will land: the rows after the insertion point shift
by the dragged row's own size, so a gap of exactly that size appears. On by default.

```ts
useSortable(() => listRef(), {
  items: () => rows,
  onReorder,
  feedback: {
    gap: true,        // the default — the space opens, the row stays put at 0.3
    highlight: false, // the default WITHOUT a group; with one it is on
  },
});

useSortable(() => listRef(), { …, feedback: { gap: 'preview' } });  // the row moves INTO the space
useSortable(() => listRef(), { …, feedback: false });                  // paint nothing
```

`gap: 'preview'` is the strongest of the destination feedbacks: the list reads as the arrangement
the drop will produce, before the release. It makes an insertion line unnecessary — the item is
already where the line would have pointed — so do not ask for both.

`highlight` writes the **same attribute and reads the same stylesheet** as `useDropZone`, on
purpose: a list that receives a drop should not look different from every other drop target
because it happens to sort. It is here because `useSortable` runs its own pointer gesture rather
than going through `useDrag`, so no zone ever sees the drag — swapping `useDrag` + `useDropZone`
for this composable would otherwise lose the highlight silently.

It follows the same rule as the insertion line: **on with a `group`, off without one.** A
highlight answers "which list will take this", and a lone list is not being asked.

**Two lists, one destination.** Give two sortables the same `group` and an item dragged out of one
and into the other opens the space **there**, not where it came from:

```ts
const column = (key) => useSortable(() => refs[key], {
  items: () => model[key],
  group: 'cards',
  onReorder: (from, to) => …,              // moved within this list
  onRemove:  (item, from) => …,            // it left this list
  onReceive: (item, from, to) => …,        // it arrived in this one, at `to`
});
```

`onReceive` fires on the destination **before** `onRemove` on the source, and that order is not
incidental: the other way round asks the receiver to insert an item the caller has already
deleted. Releasing over neither list calls neither.

A group also changes **when the drag begins**. Without one the threshold is measured on the drag
axis, so a vertical list ignores horizontal movement and leaves a horizontal scroll alone. With
one it is measured on the distance, because two columns of a board sit side by side: dragging the
first card of one onto the first card of the next is ~400px of x and almost no y, and on the axis
alone that gesture never starts.

If the container holds anything besides its rows — a heading, a counter — give it `itemSelector`.
The receiving list reads it too, so the space opens between its rows instead of pushing its title
down.

⚠️ What a group does **not** change is what happens inside one list: a pointer released past the
last row still reorders to the end, because the insertion index clamps on one axis. That predates
groups and is asserted rather than intended, so changing it would be a decision.

#### Reordering with the keyboard

A list a mouse can reorder that a keyboard cannot is half a list, so `useSortable` has its own
keyboard path: **Space or Enter** lifts the row the focus is in, the **arrow keys** carry it,
**Space or Enter** drops it and **Escape** puts it back. What is announced is the **position** —
"Position 3 of 5" — because an index is not something a person can act on.

```ts
useSortable(() => listRef(), {
  items: () => rows,
  onReorder,
  a11y: {
    label: (index) => rows[index].title,   // default: the row's own text
    messages: { lifted: '{label} sollevata. Posizione {position} di {total}.' },
    preview: 'reorder',                    // default 'transform'
    liftedClass: 'is-lifted',
  },
  disabled: () => readOnly(),
});
```

Two of those decide what the lift LOOKS like, and the choice is real:

- **`preview: 'transform'`** (the default) shifts the rows the lifted one passes with CSS and
  leaves the DOM alone — the same thing the pointer drag does, and the one that animates;
- **`preview: 'reorder'`** moves the node, so the list reads in its new order at every step. For a
  row that carries focus or state, and for anything that reads the list rather than looking at it:
  a row displaced by a transform is still, structurally, where it was, and that is the order a
  screen reader walks. `<pdx-sortable-list>` uses this one.

`liftedClass` is carried by the lifted row for as long as it is lifted, and follows it.

`disabled` is a **getter**, because it is usually a prop: it is asked on every gesture, pointer and
keyboard alike, so a list that becomes read-only stops reordering rather than reordering into a
refusal at the end.

⚠️ While a row is lifted, the arrows are taken with `stopImmediatePropagation` — they belong to the
row, not to the cursor. A roving tabindex on the same container keeps working the rest of the
time, as long as it is registered **after** the sortable: same element, and immediate propagation
only reaches the listeners added after it.

#### A drag done with the keyboard

`useDrag` is operable without a pointer, and says so: **Space** lifts, the **arrow keys** move by
10px, **Space or Enter** drops and **Escape** cancels. What matters is that somebody who cannot see
the element knows that, and hears what is happening, so `useDrag` also:

- sets `aria-roledescription="draggable"`, which is what a screen reader reads in place of a
  nameless `<div>`;
- points `aria-describedby` at one off-screen element holding those instructions — appended to any
  description you already set, not in place of it;
- **announces** each step through the live region: the lift, the drop target as it **changes**, the
  drop and the cancel. Not every arrow press: a step is 10px, and "moved right" forty times is
  noise.

There is deliberately **no `aria-grabbed`**. WAI-ARIA 1.1 deprecated it; the native
accessibility-API drag and drop that was supposed to replace it never arrived, and the guidance
settled on exposing the operation through what assistive technology still reads. An attribute
nothing is expected to act on is not an accessible drag, it is the appearance of one.

The words are yours to change, because `@pdxui/core` has no dictionary to look them up in:

```ts
useDrag(() => cardRef(), {
  a11y: {
    label: () => card.reference,                  // default: its aria-label, then its text
    roleDescription: 'trascinabile',
    instructions: 'Premi Spazio per sollevare…',
    messages: { lifted: '{label} sollevata.', droppedOn: '{label} spostata su {zone}.' },
  },
});

useDrag(() => handleRef(), { a11y: false });      // a component that speaks for itself
```

`a11y: false` is for exactly that case — a component that speaks for itself, like the showcase's
board, which announces a card's column and cannot get that from a free-positioning drag.

⚠️ The drop target named in those announcements is found by **hit-testing the draggable's bounding
rect**, and `useDrag` does not move anything — it reports the gesture. If you do not paint
`position()` onto the element, its rect never moves, so a keyboard drag never reaches a zone and
there is nothing to announce. Four lines, and the same four that make the drag visible at all:

```ts
effect(() => {
  const p = drag.position();
  el.style.transform = drag.isDragging() ? `translate(${p.x}px, ${p.y}px)` : '';
});
```

## Scroll

[`useScroll`](/docs/head-scroll) is the position and direction of a scroller. Its neighbour animates
on visibility:

```ts
import { useScrollAnimation } from '@pdxui/core';

const reveal = useScrollAnimation(() => cardRef(), { once: true, threshold: 0.25 });
// reveal.isInView() · reveal.ratio() · reveal.hasTriggered()
```

It adds `pdx-in-view` / `pdx-out-view` classes so the animation itself stays in CSS, and with
`once: true` it stops observing after the first entry.

## Accessibility

`useRovingTabindex` is the keyboard pattern every group of controls needs: exactly one child is
tabbable, the arrows move between them, Tab leaves the group. The built-in tabs, toolbar, menubar,
radio group and button group all use it — reach for it when you build a group of your own:

```ts
import { useRovingTabindex } from '@pdxui/core';

const roving = useRovingTabindex(() => toolbarRef(), {
  orientation: 'horizontal',
  itemSelector: 'button',
  skipDisabled: true,          // default: an aria-disabled item is skipped, not focused
});
// roving.activeIndex() · roving.focusNext() · roving.focusItem(0)
```

It is one of a family: trapping focus, giving it back, and announcing to a screen reader are on
[Accessibility](/docs/accessibility), which also says when to reach for `focusGroup` — the imperative
form of this one — instead.

## What is not here, and why

Six composables are exported and **not** on this page, because they exist for the built-in components
rather than for an application:

`useDataGrid` · `usePopover` · `useActiveDescendant` · `useResizeHandle` · `useScrollbar` ·
`useFormAssociated`

They are public because the package barrel is flat, not because they are an API to build on: the
component *is* the API. If you find yourself needing one, the component you are rebuilding probably
already does it.

The form family — `useForm`, `tryUseForm`, `useFieldGroupPath`, `useFormCoordinator` — lives with
[Forms](/docs/forms) and [Component Communication](/docs/provide-inject), beside the rest of the form
context rather than in a list of composables.
