<!-- Copied from packages/site/content/docs/provide-inject.md by gen-topics.mjs: edit it there. -->

# Component Communication

> **Formal reference:** [docs/language/script.md](https://github.com/pragmatic-design/pdxui/blob/main/docs/language/script.md) defines the grammar of what this page teaches: what each construct accepts, what it generates, which diagnostic it raises.

Props go down and events go up — until the two components that need each other are eight levels
apart, or siblings, or not related at all. PDX ships six mechanisms for those cases. They are
genuinely different, and picking the wrong one is the kind of mistake you only notice much later.
Who should own a piece of state in the first place is on [Component Design](https://pdxui.com/docs/component-design)
(CD-S1). Start here:

| what you have | reach for |
| --- | --- |
| an ancestor and a descendant, one value | `provide` / `inject`, by a `context<T>()` token |
| the same, but the descendant must **write** it too | `provide` a signal; `inject` returns it |
| a parent that must **order** a child to do something | `createCommands` |
| both directions, typed, between two known components | `createChannel` |
| components with no relationship at all | `createBus` |
| a parent that must **discover** its children (`<pdx-tabs>` and its `<pdx-tab>`s) | `createCompoundParent` |

Everything below except the bus resolves through the **DOM tree**: a consumer finds the nearest
provider *above it*, so two branches can carry different values under the same token.

## provide / inject

An ancestor publishes a value under a **token**; any descendant pulls it out, no matter how deep.
A token is declared once, in a module of its own, and carries the value's type:

```ts
// cart-context.ts
import { context } from '@pdxui/core';
import type { CartStore } from './cart';

export const Cart = context<CartStore>('cart');
```

```ts
import { provide } from '@pdxui/core';
import { Cart } from './cart-context';

provide(Cart, cartStore, ctx.el);    // token, value, the host element
```

The token **is** the key, compared by identity: two `context('cart')` calls are two tokens, and a
typo is a missing import instead of a value that silently never arrives. A provider of the Web
Components context protocol from another library (Lit) answers the same token.

In a `.pdx` component the `@provide` rune takes the same imported token — note the `=`, the rune
always takes a value:

```pdx
<script>
import { Cart, Theme } from './contexts';

let cartStore = $store({ items: [] });

@provide Cart = cartStore;
@provide Theme = 'invoice';
</script>
```

On the other side:

```ts
import { inject } from '@pdxui/core';
import { Cart, Theme } from './contexts';

const cart = inject(Cart, ctx.el);                // CartStore — throws if no provider above
const theme = inject(Theme, ctx.el, 'default');   // the fallback when nothing provides it
```

```pdx
<script>
import { Cart, Theme } from './contexts';

@inject cart from Cart;                   // CartStore — throws if no provider above
@inject theme from Theme = 'default';     // the fallback when nothing provides it
</script>
```

Now `cart` and `theme` are available in the component as if they were local, typed by their tokens
in the editor. The token must be imported: a string key (`@inject cart;`), or a token declared in
the component itself, is `PDX_UNKNOWN_DECLARATION`. The fallback is a literal or an imported name —
it is read before the rest of the script runs.

| | Missing provider |
| --- | --- |
| `inject(token, el)` | **throws**, naming the token and the component — use when the value is required |
| `inject(token, el, fallback)` | returns **`fallback`** (`undefined` included) — use for optional context |

A composable of your own takes the host element as an argument and injects from it —
`useCart(el)` calls `inject(Cart, el)` — and a `.pdx` uses `@inject cart from Cart;`.

## A value the descendant can write back

`provide` hands down a value. When the child has to change it, hand down the **signal** instead —
`inject` returns the signal, which the child reads and writes:

```ts
import { context, provide, inject, signal } from '@pdxui/core';
import type { Signal } from '@pdxui/core';

export const Density = context<Signal<'compact' | 'comfortable'>>('density');

// ancestor
const density = signal<'compact' | 'comfortable'>('comfortable');
provide(Density, density, ctx.el);

// descendant
const density = inject(Density, ctx.el);
density();                    // read
density.set('compact');       // write — the ancestor sees it
```

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
[Refs & Methods](https://pdxui.com/docs/imperative-methods) for the same distinction on the imperative side.

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
import { createCompoundParent, context, provide, inject } from '@pdxui/core';
import type { CompoundParentContext } from '@pdxui/core';

export const Tabs = context<CompoundParentContext<TabChild>>('tabs');

// parent
const compound = createCompoundParent<TabChild>({
    onChildAdded: (child, i) => { /* … */ },
    onNotify: (event, payload) => { /* … */ },
});
provide(Tabs, compound, ctx.el);

// child
const parent = inject(Tabs, ctx.el);
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
<script>
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
`name` in its template the same way ([Forms](../../pdxui-validation/references/forms.md), "One form, several components").

`tryUseForm()` is the version that answers `undefined` instead of throwing, for a section that can
also be rendered outside a form.

> **A child can set up before its form.** The DOM connects children before parents, and a browser does
> too when `pdx-form`'s module loads after its fields'. A one-time lookup then finds nothing, for
> ever. Call `tryUseForm(ctx.el)` **inside `ctx.track()`**: the lookup reads a signal that every
> `provideForm()` bumps, so it re-runs the moment the form appears. `pdx-form` itself does exactly
> this to find a parent coordinator.

Several forms that must be saved together — a wizard, a master-detail screen — go under a
`createFormCoordinator()`: give each `<pdx-form>` a `name`, and the coordinator aggregates their
`dirty`, `valid` and `submitting` and validates and submits the lot. See [Forms](../../pdxui-validation/references/forms.md).

## Gotchas

- **It's tree-scoped, not global.** A consumer finds the *nearest* provider above it in the DOM. For
  truly app-wide singletons (auth, a global cart), a [`@store`](store.md) is usually a better fit —
  reach for provide/inject when the value depends on *where* you are in the tree.
- **Provide during setup, not from a callback.** Providing happens in the ancestor's setup, which runs
  before its subtree renders. A `provide` from inside an async callback that resolves after the
  children mounted is a provide nobody sees — unless the consumer looks it up somewhere that can
  re-run, which is what the form context does with its version signal.
- **A portal breaks the line.** Content moved by [`@portal`](https://pdxui.com/docs/portal) resolves provide/inject
  against where it *lands*, not where it was written.
- **A token, not a name.** Two `context('cart')` calls are two tokens that never meet, so declare
  each token once, in a module, and import it on both sides. The name is for messages and devtools.
- The library's own contexts are tokens too: `DataSourceContext` (`@pdxui/ui/data-source`; a
  `<pdx-data-source :token="Orders">` provides under yours as well), `ErrorContext`
  (`@pdxui/ui/error-boundary`), `RouteParams` (`@pdxui/router`), and `<pdx-provide :token :value>`.
