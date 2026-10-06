---
title: Portal
description: "Render content somewhere else in the DOM while keeping it in your component's logic."
order: 19
---

# Portal

Sometimes a piece of UI lives in your component logically, but needs to render *elsewhere* in the
DOM — a modal that must escape an `overflow:hidden` parent, a toast pinned to `document.body`, a
tooltip that mustn't be clipped. `portal` does exactly that: the content stays owned by your
component (reactivity, cleanup) but its DOM nodes are mounted into a target you choose.

## Usage

```ts
import { portal, html } from '@pdxui/core';

portal(
  () => html`<div class="overlay">${content}</div>`,  // what to render
  document.body,                                       // where to mount it (Element or selector)
);
```

The first argument is a **function** returning the nodes (so it stays reactive); the second is the
target — an element or a CSS selector like `'#overlays'`. When the owning component is destroyed, the
portaled nodes are removed too — no orphaned DOM.

## Why not just `document.body.append(...)`?

Because you'd lose the two things that make it safe:

1. **Reactivity** — content built with `html`` updates when its signals change, even though it lives
   in another part of the tree.
2. **Cleanup** — the nodes are tied to your component's lifecycle and removed automatically on
   destroy. A manual `append` leaks unless you remember to remove it on every code path.

## You usually don't call it directly

The overlay components (`pdx-dialog`, `pdx-drawer`, `pdx-tooltip`, `pdx-popover`, toasts) already
portal themselves and manage stacking via the overlay stack. Reach for `portal` when you're building
your *own* floating UI and need the same escape hatch.

## Gotchas

- **Provide a stable target.** A selector that doesn't exist yet (e.g. a container rendered later)
  means nowhere to mount. Mount targets like `document.body` or a fixed `#overlays` root are safest.
- **Positioning is yours.** `portal` moves the DOM; it doesn't position it. For anchored floating UI
  (next to a trigger) compose it with the positioning engine — `computeFloatingPosition` and
  `autoUpdate`, which [Building an overlay](/docs/overlays) walks through along with the stack and the
  dismiss rules — or just use the built-in overlay components, which already do all of it.
- Portaled content is outside your component's DOM subtree, so descendant-scoped
  [provide/inject](/docs/provide-inject) from *inside* the portal resolves against the **target's**
  ancestors, not the component's. Pass what you need in explicitly.
