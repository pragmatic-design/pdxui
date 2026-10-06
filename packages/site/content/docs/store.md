---
title: Store
description: "State shared across components: @store, reactive Proxy, persistence."
order: 7
---

# Store

Signals live inside a component. But some state belongs to the **app**, not a single component: the
cart, the logged-in user, preferences. Passing them down prop by prop through half the app (prop
drilling) is painful. A **store** is a global, singleton state that any component accesses directly —
while staying reactive like a signal.

## Declaring a store

A file with `@store` becomes a store module. Inside, `$store({...})` creates the state:

```pdx
<!-- cart.pdx -->
@store cart;

let items = $store({ products: [], total: 0 });

export function add(p) {
  items.products = [...items.products, p];
  items.total += p.price;
}

export function clear() {
  items.products = [];
  items.total = 0;
}
```

`$store({...})` returns a **reactive Proxy**: you mutate its properties like a normal object
(`items.total += p.price`) and every component reading that property updates. It's the same
reactivity as signals, applied to a shared object. (The compiler knows a store's keys aren't local
signals, so it doesn't rewrite them.)

## Using it from a component

You import the store and read/write its properties: updates propagate to **all** consumers, wherever
they are in the tree.

```pdx
<template>
  <span>Cart: {{ cart.products.length }} ({{ cart.total }}€)</span>
  <pdx-button @click="checkout">Pay</pdx-button>
</template>

<script setup>
import { add, clear } from './cart';   // actions
// reactive reads of cart.* happen through the imported store
</script>
```

No provider to wire up, no prop drilling: two components far apart in the tree share the same state by
reading the store.

## Persistence

Often you want state to survive a refresh. One declaration does it:

```pdx
@store cart { persist: 'local' };     <!-- localStorage -->
@store ui   { persist: 'session' };   <!-- sessionStorage -->
```

The store is serialized on every change and restored on startup. The user finds their cart after
closing and reopening the tab, without you writing a line of serialization.

## Store or signal? The rule

- State that lives and dies **with a component** (an input value, a local toggle) → `$signal`.
- State that **multiple components** must share, or that must survive navigation/refresh → `@store`.

Don't promote everything to a store "just in case": global state that could have been local makes it
harder to reason about who changes it. Global only when it's truly shared.
