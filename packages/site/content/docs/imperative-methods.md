---
title: Refs & Methods
description: "Drive a component imperatively from a ref — set props reactively, or call the methods it exposes."
order: 23
---

# Refs & Methods

Most of the time you drive a component **declaratively** — bind a prop and let the signal do the work.
But sometimes you need to reach in and *do* something: focus an input, open a dialog, upload the queued
files. PDX gives you two imperative handles, both through an element **ref**.

## Getting a ref

A ref is a **signal you declare**, and `:ref` fills it with the element when that element mounts:

```pdx
<template>
  <pdx-dialog :ref="dlg">…</pdx-dialog>
  <pdx-button @click="dlg.open = true">Open</pdx-button>
</template>

<script setup>
let dlg = $signal(null);
</script>
```

The declaration is not optional: `:ref="dlg"` hands the element to `dlg.set(el)`, so a `dlg` that is
not a signal is never filled, and a `dlg` you never declared is a `ReferenceError` the first time you
touch it. Start it at `null` — the element does not exist when setup runs.

From then on `dlg` is the actual custom element: anything you can do to a DOM node, you can do to it.
You write `dlg`, not `dlg()` — the compiler reads the signal for you, in the template and in the script
alike.

## 1. Set props reactively

Every prop is a real property on the element. Setting it updates the component's signal and re-renders
— no method needed:

```pdx
dlg.open = true;          // open the dialog
input.value = 'hello';    // set a value
grid.data = rows;         // feed data
```

This is the preferred way to *control* a component (dialog/drawer `open`, inputs `value`, etc.) — it's
reactive and survives re-renders.

## 2. Call exposed methods

Some components expose **imperative methods** for actions that aren't a piece of state — opening a
floating list, uploading a queue, clearing entries. A component declares them with `ctx.expose(...)`:

```ts
// inside the component
ctx.expose({ open, close, clear });
```

…and you call them straight off the ref:

```pdx
<template>
  <pdx-autocomplete :ref="ac" />
  <pdx-button @click="ac.open()">Suggest</pdx-button>
  <pdx-button @click="ac.clear()">Clear</pdx-button>
</template>

<script setup>
let ac = $signal(null);
</script>
```

The component's page lists its methods in the **Methods** table of the API reference. Every method is
**flattened directly on the element** — you call `grid.getSelectedIds()`, never a private handle. What
ships today:

| Component | Methods |
|-----------|---------|
| `pdx-autocomplete` | `open()`, `close()`, `clear()` |
| `pdx-file-upload`  | `addFiles()`, `removeFile()`, `uploadAll()`, `clear()` |
| `pdx-tag-input`    | `addTag()`, `removeTag()`, `clear()`, `getTags()` |
| `pdx-dialog` / `pdx-drawer` | controlled via the `open` prop (set `dlg.open = true`) |
| `pdx-fab` / `pdx-dropdown-menu` | `open()`, `close()`, `toggle()` |
| `pdx-context-menu` | `open(anchorEl)`, `close()` |
| `pdx-menu` | `closeAll()`, `closeSubmenu()` |
| `pdx-menubar` | `openMenu(key)`, `closeMenu()` |
| `pdx-nav-menu` | `toggleGroup(key)`, `expandAll()`, `collapseAll()` |
| `pdx-navbar` | `toggleMobile()` |
| `pdx-app-layout` | `toggleNavbar()`, `openNavbar()`, `closeNavbar()` |
| `pdx-carousel` | `next()`, `prev()`, `goTo(i)`, `play()`, `pause()` |
| `pdx-wizard` | `goNext()`, `goPrev()`, `goTo(i)`, `complete()` |
| `pdx-splitter` | `getSizes()`, `setSizes([…])`, `resetSizes()`, `isDragging()` |
| `pdx-scroll-spy` | `getActiveSection()` |
| `pdx-list` | `refresh()` |
| `pdx-auto-form` | `form` (getter), `getValues()`, `reset(values?)`, `validate()` |
| `pdx-data-grid` | `getSelectedIds()`, `clearSelection()`, `addRow()`, `deleteRow(id)`, `startEdit(rowId, field?)`, `cancelEdit()`, `commitBatch()`, `revertBatch()`, `clearAllFilters()`, `toggleRowDetail(id)`, `openColumnMenu(el)`, … |
| `pdx-scroll-area` | namespaced: `el.scrollArea.scrollTo(opts)`, `.scrollBy(opts)`, `.scrollIntoView(node)`, `.getViewport()`, `.recalculate()` — because `scrollTo`/`scrollBy`/`scrollIntoView` are native `Element` methods and must not be shadowed |

## Exposing methods from your own component

In a `.pdx` SFC, declare them with `@expose`:

```pdx
<script setup>
@prop open: boolean = false;

function showModal() { open = true; }
function close() { open = false; }

@expose showModal, close;
</script>
```

The compiler wires `ctx.expose({ showModal, close })` for you — the methods appear on the element and
in the generated `.d.ts`.

## Gotchas

- **Prefer props for state.** If a thing can be expressed as a prop (`open`, `value`, `disabled`),
  bind it — don't add a method. Methods are for *actions*, not state.
- **A ref is `null` until the element mounts.** The signal fires once, when `:ref` assigns the element —
  it does not fire again when something inside that element changes. So read it in an event handler,
  in `onMount`, or inside an `effect`/`$watch` that can re-run; reading it at the top of setup gives you
  the `null` you started with.
- **Methods exist after mount.** Call them in response to user actions or after `onMount`, once the
  element has upgraded.
