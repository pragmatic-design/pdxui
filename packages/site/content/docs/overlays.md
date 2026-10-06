---
title: Building an overlay
description: "The positioning engine, the portal, the stack and the dismiss rules the built-in overlays are made of."
order: 19.5
---

# Building an overlay

`<pdx-dialog>`, `<pdx-popover>`, `<pdx-drawer>`, `<pdx-tooltip>`, `<pdx-dropdown-menu>` and
`<pdx-bottom-sheet>` cover most of what an application needs. **Start there.** This page is for the
case they do not cover — a bespoke picker, a canvas annotation, an inspector panel — and it documents
the parts those components are themselves made of.

Four problems, in the order you meet them: put it somewhere, keep it there, get it out of the
clipping context, and close it at the right moment.

## Putting it somewhere

The positioning engine is the floating-ui vocabulary, so if you already know that one you know this:

```ts
import { computeFloatingPosition, offset, flip, shift, arrow } from '@pdxui/core';

const { x, y, placement } = computeFloatingPosition(trigger, panel, {
  placement: 'bottom-start',
  strategy: 'absolute',              // or 'fixed'
  middleware: [offset(8), flip(), shift({ padding: 8 })],
});

panel.style.transform = `translate(${x}px, ${y}px)`;
```

The middleware run in order and each one may move the result:

| | |
| --- | --- |
| `offset(value)` | push the panel away from the trigger — a number, or `{ mainAxis, crossAxis }` |
| `flip(options?)` | not enough room below? put it above instead |
| `shift({ padding })` | slide it along its axis to stay in view, without changing side |
| `arrow({ element })` | compute where the little pointer goes; read it back from `middlewareData.arrow` |
| `sizeMiddleware(options?)` | hand you the available space, so a long list can cap its own height |
| `hideMiddleware(options?)` | tell you the reference has been scrolled out of sight, so you can hide rather than float over nothing |

`sizeMiddleware` and `hideMiddleware` carry those names on the package surface; inside they are
floating-ui's `size` and `hide`, renamed here to leave the shorter names free. A floating-ui example
that imports `size` needs that one line changed.

The reference can also be a **virtual element** — anything with a `getBoundingClientRect()` — which is
how you anchor to a text selection, a canvas coordinate or the mouse.

## Keeping it there

A position computed once is wrong as soon as anything scrolls:

```ts
const stop = autoUpdate(trigger, panel, () => {
  const { x, y } = computeFloatingPosition(trigger, panel, { /* … */ });
  panel.style.transform = `translate(${x}px, ${y}px)`;
});
```

`autoUpdate` watches scroll, resize and layout shifts and calls you back. It returns the way to stop,
and stopping it when the overlay closes is not optional.

## Getting out of the clipping context

An `overflow: hidden` ancestor clips the panel; a `transform` one becomes its containing block and
breaks `position: fixed`. Both are common in a real layout, and the answer is to render elsewhere:

```ts
import { createPortal } from '@pdxui/core';

const portal = createPortal(panelElement);        // into <body> by default
// portal.el is the container; portal.dispose() removes it
```

In a template the [`@portal` directive](/docs/template) is the declarative form of the same thing.
`createPortal` is for markup you build in code.

> Moving content changes what `provide`/`inject` resolves against — a portalled subtree looks up from
> where it **lands**, not from where it was written. See
> [Component Communication](/docs/provide-inject).

## The stack, and why it matters

Overlays stack, and everything about dismissing them depends on knowing which one is on top. That is
what `overlayStack` is for, and it is the piece that makes a hand-built overlay behave like a
built-in one instead of fighting it:

```ts
import { overlayStack, onClickOutsideStack } from '@pdxui/core';

const id = 'my-picker';
const z = overlayStack.push(id, { modal: false, element: panel });
panel.style.zIndex = String(z);                   // the stack assigns it, you do not guess

const stopOutside = onClickOutsideStack(id, panel, () => close());
const stopEscape = overlayStack.onDismissTop(() => { if (overlayStack.isTop(id)) close(); });

function close() {
  stopOutside(); stopEscape();
  overlayStack.pop(id);
}
```

Three things follow from being on the stack:

- **the z-index is assigned**, not invented. Two hand-rolled overlays that each pick `9999` are a
  bug you cannot reason about;
- **`onClickOutsideStack` only fires when your overlay is on top** — which is the whole difference
  from a plain document listener. Click inside a dialog that opened over your menu and the menu must
  not close;
- **Escape dismisses the top one**, through `onDismissTop`, so a dialog over a menu closes the dialog
  and leaves the menu.

`overlayStack.count` and `modalCount` are signals — the second is what a body-scroll lock binds to,
so it releases only when the last modal goes.

## Backdrop, and the two queues

```ts
import { createBackdrop } from '@pdxui/core';

const backdrop = createBackdrop({ blur: true, zIndex: z - 1, onClick: () => close() });
// backdrop.dispose() when the overlay closes
```

For overlays that must not appear at the same time there are two queues, and both are already wired
into their components:

- **`createDialogQueue()` / `getDialogQueue()`** — one dialog at a time, the rest wait their turn.
  `getDialogQueue()` returns the shared one, which is what `<pdx-dialog>` uses;
- **`createToastQueue(options?)`** — toasts, with a cap and a dismissal policy, behind
  `<pdx-toast>`.

## The checklist

A hand-built overlay is correct when it does all of this, which is the real argument for using a
built-in component when one fits:

1. positioned with `computeFloatingPosition`, kept with `autoUpdate`, both stopped on close;
2. portalled if any ancestor clips or transforms;
3. pushed onto `overlayStack`, and popped;
4. dismissed on outside click through `onClickOutsideStack`, and on Escape through `onDismissTop`;
5. focus trapped and restored — see [Accessibility](/docs/accessibility);
6. announced, if opening it is not otherwise visible to a screen reader.
