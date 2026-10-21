---
title: Component Communication
description: "How two components reach each other: one mechanism per direction — props and events, exposed methods, provide/inject by context token, and a store."
order: 18
---

# Component Communication

> **Formal reference:** [docs/language/script.md](https://github.com/pragmatic-design/pdxui/blob/main/docs/language/script.md) defines the grammar of what this page teaches: what each construct accepts, what it generates, which diagnostic it raises.

There is one mechanism per direction, and each is a declaration a reader can see in the file — in
the template, or at the top of the script. Who should own a piece of state in the first place is on
[Component Design](/docs/component-design) (CD-S1).

| direction | the mechanism |
| --- | --- |
| parent → child, data | `@prop`; `@model` when the child writes it back ([Components](/docs/components)) |
| child → parent | `@event`, dispatched on the component and not bubbling |
| parent → child, an order ("reload now") | `@expose` + a typed `:ref`, or `commandfor` / `command` ([Refs & Methods](/docs/imperative-methods)) |
| ancestor → descendants, however deep | `@provide` / `@inject`, by a `context<T>()` token — below |
| the descendant must **write** it too | `@provide` a signal; `@inject` gets the signal |
| the whole app | a [`@store`](/docs/store) |

The untyped bus, channel and command dispatcher (`createBus`, `createChannel`, `createCommands`) and
`createCompoundParent` are gone: two components talking through them had no visible link in either
file. An import of one is `PDX_REMOVED_FORM`, naming what to write instead.

provide / inject resolves through the **DOM tree**: a consumer finds the nearest provider *above
it*, so two branches can carry different values under the same token.

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
    @value-change="e => form.fields.price.onChange(e.detail.value)" />
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
- **A token, not a name.** Two `context('cart')` calls are two tokens that never meet, so declare
  each token once, in a module, and import it on both sides. The name is for messages and devtools.
- The library's own contexts are tokens too: `DataSourceContext` (`@pdxui/ui/data-source`; a
  `<pdx-data-source :token="Orders">` provides under yours as well), `ErrorContext`
  (`@pdxui/ui/error-boundary`), `RouteParams` (`@pdxui/router`), and `<pdx-provide :token :value>`.
