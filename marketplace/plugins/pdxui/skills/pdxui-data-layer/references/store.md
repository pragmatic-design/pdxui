<!-- Copied from packages/site/content/docs/store.md by gen-topics.mjs: edit it there. -->

# Store

> **Formal reference:** [docs/language/data.md](https://github.com/pragmatic-design/pdxui/blob/main/docs/language/data.md) defines the grammar of what this page teaches: what each construct accepts, what it generates, which diagnostic it raises.

Signals live inside a component. But some state belongs to the **app**, not a single component: the
cart, the logged-in user, preferences. Passing them down prop by prop through half the app (prop
drilling) is painful. A **store** is a global, singleton state that any component accesses directly —
while staying reactive like a signal.

## Declaring a store

A file with `@store` becomes a store module. Inside, `$store({...})` creates the state:

```pdx
<!-- cart.pdx -->
<script setup>
@store cart;

let items = $store({ products: [], total: 0 });

function add(p) {
  items.products = [...items.products, p];
  items.total += p.price;
}

function clear() {
  items.products = [];
  items.total = 0;
}
</script>
```

The actions are plain functions **inside** the store, not exports: the module compiles to a single
hook, `useCart()`, that returns the store's state and functions. An `export` that reads the store's
names would sit outside it, where they do not exist — the compiler reports it as `PDX_STORE_EXPORT`.

`$store({...})` returns a **reactive Proxy**: you mutate its properties like a normal object
(`items.total += p.price`) and every component reading that property updates. It's the same
reactivity as signals, applied to a shared object. (The compiler knows a store's keys aren't local
signals, so it doesn't rewrite them.)

## Using it from a component

You import the store's hook and read/write through what it returns: updates propagate to **all**
consumers, wherever they are in the tree.

```pdx
<template>
  <span>Cart: {{ cart.items.products.length }} ({{ cart.items.total }}€)</span>
  <pdx-button @click="cart.clear()">Empty</pdx-button>
</template>

<script setup>
import { useCart } from './cart.pdx';

const cart = useCart();   // the same instance in every component
</script>
```

No provider to wire up, no prop drilling: two components far apart in the tree share the same state by
reading the store.

## Persistence

Often you want state to survive a refresh. `persist` on the declaration keeps the store's
**top-level `$signal`s**:

```pdx
<!-- cart.pdx -->
<script setup>
@store cart { persist: 'local' };

let count = $signal(0);   // persisted
let lines = $signal([]);  // persisted
let view = $store({ open: false });   // NOT persisted: a $store object is not saved

function add(line) {
  lines = [...lines, line];
  count++;
}
</script>
```

`persist: 'local'` keeps them in `localStorage`, any other value in `sessionStorage` (`'session'` is
the one to write; another value is not checked). They are restored when the store is first created
and written about 100 ms after they change, a changed signal at a time, under `__pdx_store_cart`. A
`$store` object and a `$derived` are not persisted: state meant to survive a refresh goes in a
`$signal`. The rules are in the [reference](https://github.com/pragmatic-design/pdxui/blob/main/docs/language/data.md#store).

## Store or signal? The rule

- State that lives and dies **with a component** (an input value, a local toggle) → `$signal`.
- State that **multiple components** must share, or that must survive navigation/refresh → `@store`.

Don't promote everything to a store "just in case": global state that could have been local makes it
harder to reason about who changes it. Global only when it's truly shared.
