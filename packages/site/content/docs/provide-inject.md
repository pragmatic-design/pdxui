---
title: Component Communication
description: "How two components reach each other: provide/inject, writable context, commands, channels, an event bus, and compound parents."
order: 18
---

# Component Communication

Props go down and events go up — until the two components that need each other are eight levels
apart, or siblings, or not related at all. PDX ships six mechanisms for those cases. They are
genuinely different, and picking the wrong one is the kind of mistake you only notice much later.
Who should own a piece of state in the first place is on [Component Design](/docs/component-design)
(CD-S1). Start here:

| what you have | reach for |
| --- | --- |
| an ancestor and a descendant, one value | `provide` / `inject` |
| the same, but the descendant must **write** it too | `provideWritable` / `useWritable` |
| a parent that must **order** a child to do something | `createCommands` |
| both directions, typed, between two known components | `createChannel` |
| components with no relationship at all | `createBus` |
| a parent that must **discover** its children (`<pdx-tabs>` and its `<pdx-tab>`s) | `createCompoundParent` |

Everything below except the bus resolves through the **DOM tree**: a consumer finds the nearest
provider *above it*, so two branches can carry different values under the same key.

## provide / inject

An ancestor publishes a value under a key; any descendant pulls it out, no matter how deep.

```ts
import { provide } from '@pdxui/core';

provide('cart', cartStore);          // key, value
```

Or declaratively in a `.pdx` component — note the `=`, the rune always takes a value:

```pdx
<script setup>
let cartStore = $store({ items: [] });

@provide cart = cartStore;
@provide theme = 'invoice';
</script>
```

On the other side:

```ts
import { inject, tryInject } from '@pdxui/core';

const cart = inject('cart');         // throws if no provider above
const theme = tryInject('theme');    // returns undefined if absent
```

```pdx
<script setup>
@inject cart;
@inject theme;
</script>
```

Now `cart` and `theme` are available in the component as if they were local.

| | Missing provider |
| --- | --- |
| `inject(key)` | **throws** — use when the value is required |
| `tryInject(key)` | returns **`undefined`** — use for optional context (provide a default) |

Outside a `.pdx` setup — in a composable of your own — the same lookup is `useProvided(key)` and
`tryUseProvided(key)`: they read the component scope that is current, so you don't have to pass an
element around.

## A value the descendant can write back

`provide` hands down a value. When the child has to change it, hand down the **signal** instead:

```ts
import { provideWritable, useWritable } from '@pdxui/core';

// ancestor
const density = signal<'compact' | 'comfortable'>('comfortable');
provideWritable('density', density);

// descendant
const density = useWritable<'compact' | 'comfortable'>('density');
density();                    // read
density.set('compact');       // write — the ancestor sees it
```

`useWritable` throws if the provider gave a plain value rather than a signal, which is the mistake
this pair exists to catch. `tryUseWritable` is the non-throwing version.

## A parent that gives orders: `createCommands`

One direction, parent → child, typed by a contract:

```ts
import { createCommands } from '@pdxui/core';

const cmd = createCommands<{ refresh: void; scrollToRow: { row: number } }>();

// parent
cmd.send('scrollToRow', { row: 42 });

// child — gets the dispatcher through a prop or an inject
const off = cmd.on('refresh', () => reload());
```

Reach for it when the thing is an **action**, not a piece of state: "reload now", "clear the
selection". If it can be expressed as a prop the child reacts to, use the prop — see
[Refs & Methods](/docs/imperative-methods) for the same distinction on the imperative side.

## Both directions: `createChannel`

A channel is two command streams in one object, `send` going down and `emit` coming up:

```ts
import { createChannel } from '@pdxui/core';

interface GridChannel {
  down: { refresh: void; scrollTo: { row: number } };
  up:   { rowSelected: { id: string }; sorted: { col: string } };
}

const ch = createChannel<GridChannel>();

// parent
ch.send('refresh');
ch.on('rowSelected', ({ id }) => open(id));

// child
ch.on('refresh', () => reload());
ch.emit('rowSelected', { id: '123' });
```

> **Give the two directions different names.** `send` and `emit` share one listener map, keyed by the
> event name — so a `refresh` in `down` and a `refresh` in `up` deliver to the same listeners, in both
> directions. `refresh` / `refreshed` is the convention; TypeScript will not catch this one for you.

## Components with no relationship: `createBus`

When the two ends are not ancestor and descendant — a toast from a background save, a filter panel
and a grid on opposite sides of a layout — a bus is the honest answer:

```ts
import { createBus } from '@pdxui/core';

const bus = createBus<{ 'invoice:saved': { id: string } }>();

const off = bus.on('invoice:saved', ({ id }) => toast(`Saved ${id}`));
bus.emit('invoice:saved', { id: 'INV-9' });
```

`createBus({ store: true })` records what went through it: `history()` returns the events and
`replay()` sends them to the handlers registered now — a real help when you are debugging an order
of operations, and the reason to prefix event names with the area they belong to.

A bus is the one mechanism with no structure to it, which is both why it always works and why it
should be the last one you reach for: nothing in the code says who listens.

## A parent that discovers its children: `createCompoundParent`

The `<pdx-tabs>` / `<pdx-tab>` shape — a parent that has to know which children exist, in order, and
be told when one of them does something:

```ts
import { createCompoundParent, provide, inject } from '@pdxui/core';

// parent
const compound = createCompoundParent<TabChild>({
    onChildAdded: (child, i) => { /* … */ },
    onNotify: (event, payload) => { /* … */ },
});
provide('pdx-tabs', compound);

// child
const parent = inject<CompoundParentContext<TabChild>>('pdx-tabs');
const dispose = parent.register({ label: 'Tab 1', panel: panelEl });
onDestroy(() => dispose());
```

`children` is a signal, so the parent's render follows registration. The child **must** unregister on
destroy — that `dispose()` is not optional, or a removed tab stays in the list.

## How the built-in forms actually do it

A `<pdx-form>` makes its `Form` available to everything inside it, and the controls find it
themselves — that is why you never wire a field to a form by hand. The mechanism is a dedicated pair,
not a string key:

```pdx
<script setup>
import { useForm } from '@pdxui/core';

const form = useForm();    // the nearest <pdx-form> ancestor; must run during setup()
</script>
```

and then the control reads and writes through the form's field:

```pdx
<template>
  <pdx-input
    :value="form.fields.price.value()"
    @pdx-input="e => form.fields.price.onChange(e.detail.value)" />
</template>
```

That is the mechanism, written out. In an app you rarely write it: a component that calls
`tryUseForm()` or `useForm()` is a section of the form, and the compiler wires every control with a
`name` in its template the same way ([Forms](/docs/forms), "One form, several components").

`tryUseForm()` is the version that answers `undefined` instead of throwing, for a section that can
also be rendered outside a form.

> **A child can set up before its form.** The DOM connects children before parents, and a browser does
> too when `pdx-form`'s module loads after its fields'. A one-time lookup then finds nothing, for
> ever. Call `tryUseForm(ctx.el)` **inside `ctx.track()`**: the lookup reads a signal that every
> `provideForm()` bumps, so it re-runs the moment the form appears. `pdx-form` itself does exactly
> this to find a parent coordinator.

Several forms that must be saved together — a wizard, a master-detail screen — go under a
`createFormCoordinator()`: give each `<pdx-form>` a `name`, and the coordinator aggregates their
`dirty`, `valid` and `submitting` and validates and submits the lot. See [Forms](/docs/forms).

## Gotchas

- **It's tree-scoped, not global.** A consumer finds the *nearest* provider above it in the DOM. For
  truly app-wide singletons (auth, a global cart), a [`@store`](/docs/store) is usually a better fit —
  reach for provide/inject when the value depends on *where* you are in the tree.
- **Provide during setup, not from a callback.** Providing happens in the ancestor's setup, which runs
  before its subtree renders. A `provide` from inside an async callback that resolves after the
  children mounted is a provide nobody sees — unless the consumer looks it up somewhere that can
  re-run, which is what the form context does with its version signal.
- **A portal breaks the line.** Content moved by [`@portal`](/docs/portal) resolves provide/inject
  against where it *lands*, not where it was written.
- Keys are plain strings or symbols. Namespace them (`'cart'`, `'form:ctx'`) — a collision resolves
  silently to whichever provider is nearer.
