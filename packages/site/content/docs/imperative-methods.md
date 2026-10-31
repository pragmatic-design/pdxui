---
title: Refs & Methods
description: "Drive a component imperatively from a ref — set props reactively, or call the methods it exposes."
order: 23
---

# Refs & Methods

Most of the time you drive a component **declaratively** — bind a prop and let the signal do the work.
When a **button** triggers an action, an **invoker command** does it with no script (below). For the
rest — focus an input, scroll a list, upload the queued files from code — you reach the element through
a **ref**.

## A button that runs a method: invoker commands

Every method a component exposes is also a command the platform's
[Invoker Commands](https://developer.mozilla.org/docs/Web/API/Invoker_Commands_API) can send. Point the
button at the component with `commandfor`, and name the method with `--`:

```pdx
<template>
  <button commandfor="shift" command="--show">Start shift</button>
  <pdx-dialog id="shift" title="Start of shift">
    …
    <button commandfor="shift" command="--close">Done</button>
  </pdx-dialog>
</template>
```

The button calls `show()` on the dialog, with no handler and no ref. The compiler checks the pair: a
`commandfor` with no element of that `id` in the template is `PDX_COMMAND_TARGET_MISSING`, and a
`--name` the target does not expose (`--open` on `pdx-dialog`) is `PDX_COMMAND_UNKNOWN`, as is a
built-in command (`show-modal`, `toggle-popover`) pointed at an element that does not have it.

## Getting a ref

A ref is a **signal you declare**, and `:ref` fills it with the element when that element mounts:

```pdx
<template>
  <pdx-dialog :ref="dlg">…</pdx-dialog>
  <pdx-button @click="dlg.open = true">Open</pdx-button>
</template>

<script>
let dlg = $signal(null);
</script>
```

The declaration is not optional: `:ref="dlg"` hands the element to `dlg.set(el)`, so a `dlg` that is
not a signal is never filled, and a `dlg` you never declared is a `ReferenceError` the first time you
touch it. Start it at `null` — the element does not exist when setup runs.

From then on `dlg` is the actual custom element: anything you can do to a DOM node, you can do to it.
You write `dlg`, not `dlg()` — the compiler reads the signal for you, in the template and in the script
alike.

In the editor the ref is **typed from what the component exposes**: on a `pdx-dialog`, `dlg.show()` and
`dlg.focus()` are fine, and `dlg.nope()` is an error. A library component's methods come from its
manifest; your own component's from its `@expose`.

## 1. Set props reactively

Every prop is a real property on the element. Setting it updates the component's signal and re-renders
— no method needed:

```pdx
dlg.open = true;          // open the dialog
input.value = 'hello';    // set a value
grid.data = rows;         // feed data
```

From script, this is how to set state on an element you hold a ref to. In a template, prefer the
declarative binding — `<pdx-dialog :open="showDialog">` — which keeps the state in one signal; a ref
is for what a prop cannot express, such as `focus()` or `scrollTo()`.

## 2. Call exposed methods

Some components expose **imperative methods** for actions that aren't a piece of state — opening a
floating list, uploading a queue, clearing entries. A component declares them with `ctx.expose(...)`:

```ts
// inside the component
ctx.expose({ show, close, clear });
```

…and you call them straight off the ref:

```pdx
<template>
  <pdx-autocomplete :ref="ac" />
  <pdx-button @click="ac.show()">Suggest</pdx-button>
  <pdx-button @click="ac.clear()">Clear</pdx-button>
</template>

<script>
let ac = $signal(null);
</script>
```

The component's page lists its methods in the **Methods** table of the API reference. Every method is
**flattened directly on the element** — you call `grid.getSelectedIds()`, never a private handle. What
ships today:

| Component | Methods |
|-----------|---------|
| `pdx-autocomplete` | `show()`, `close()`, `toggle()`, `clear()` |
| `pdx-file-upload`  | `addFiles()`, `removeFile()`, `uploadAll()`, `clear()` |
| `pdx-tag-input`    | `addTag()`, `removeTag()`, `clear()`, `getTags()` |
| `pdx-dialog` | `show()`, `close()`, `toggle()` — or the `open` prop |
| `pdx-drawer` | controlled via the `open` prop (set `dlg.open = true`) |
| `pdx-fab` | `show()`, `close()`, `toggle()` — its speed dial |
| `pdx-dropdown-menu` | `show()`, `close()`, `toggle()` |
| `pdx-split-button` | `show()`, `close()`, `toggle()` — its menu |
| `pdx-context-menu` | `show(x?, y?)` (at a point, or over its area), `close()`, `toggle()` |
| `pdx-menu` | `show()`, `close()`, `toggle()`, `closeSubmenu()` — or the `open` prop |
| `pdx-menubar` | `openMenu(key)`, `closeMenu()` |
| `pdx-nav-menu` | `toggleGroup(key)`, `expandAll()`, `collapseAll()` |
| `pdx-navbar` | `toggleMobile()` |
| `pdx-app-layout` | `toggleNavbar()`, `openNavbar()`, `closeNavbar()` |
| `pdx-carousel` | `next()`, `prev()`, `goTo(i)`, `play()`, `pause()` |
| `pdx-wizard` | `next()`, `prev()`, `goTo(i)`, `complete()` |
| `pdx-splitter` | `getSizes()`, `setSizes([…])`, `resetSizes()`, `isDragging()` |
| `pdx-scroll-spy` | `getActiveSection()` |
| `pdx-list` | `refresh()` |
| `pdx-auto-form` | `form` (getter), `getValues()`, `reset(values?)`, `validate()` |
| `pdx-data-grid` | `getSelectedIds()`, `clearSelection()`, `addRow()`, `deleteRow(id)`, `startEdit(rowId, field?)`, `cancelEdit()`, `commitBatch()`, `revertBatch()`, `clearAllFilters()`, `toggleRowDetail(id)`, `openColumnMenu(el)`, … |
| `pdx-scroll-area` | namespaced: `el.scrollArea.scrollTo(opts)`, `.scrollBy(opts)`, `.scrollIntoView(node)`, `.getViewport()`, `.recalculate()` — because `scrollTo`/`scrollBy`/`scrollIntoView` are native `Element` methods and must not be shadowed |

## Exposing methods from your own component

In a `.pdx` SFC, declare them with `@expose`:

```pdx
<script>
let open = $signal(false);   // the component's own state: a @prop belongs to the parent

function showModal() { open = true; }
function close() { open = false; }

@expose showModal, close;
</script>
```

The compiler wires `ctx.expose({ showModal, close })` for you — the methods appear on the element and
in the generated `.d.ts`, a `:ref` on your component is typed with them, and each is a command:
`<button commandfor="d" command="--showModal">`.

## Gotchas

- **Prefer props for state.** If a thing can be expressed as a prop (`open`, `value`, `disabled`),
  bind it — don't add a method. Methods are for *actions*, not state.
- **A ref is `null` until the element mounts.** The signal fires once, when `:ref` assigns the element —
  it does not fire again when something inside that element changes. So read it in an event handler,
  in `onMount`, or inside an `effect`/`$watch` that can re-run; reading it at the top of setup gives you
  the `null` you started with.
- **A ref goes back to `null` when its element leaves.** An `@if` that turns false, an `@for` row that
  is removed, the component destroyed: the ref is set to `null`, so `if (field) field.focus()` never
  acts on a detached element. Two branches of an `@if`/`@else` can bind the same ref — it holds the
  element of the branch on screen. An `onDestroy` still sees the element: refs are reset after it runs.
  Both the dev and the build output bind a ref through core's `bindRef(el, signal)`, which a
  hand-written `html` template can call too.
- **Methods exist after mount.** Call them in response to user actions or after `onMount`, once the
  element has upgraded.
