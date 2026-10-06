---
title: Device & Responsive
description: "React to viewport, breakpoint and device in JavaScript — not just in media queries."
order: 20
---

# Device & Responsive

CSS media queries handle *styling* at different sizes. But sometimes you need responsiveness in
**logic** — render a different component on mobile, change a value per breakpoint, lazy-load only on
desktop. PDX exposes the viewport as **signals**, so your templates and effects react to it like any
other state.

## `device` — reactive viewport facts

```ts
import { device } from '@pdxui/core';

device.isMobile()     // boolean signal
device.isTablet()
device.isDesktop()
device.type()         // 'mobile' | 'tablet' | 'desktop'
device.isPortrait()   // / isLandscape()
device.breakpoint()   // 'sm' | 'md' | 'lg' | 'xl' | '2xl'
```

Each is a signal — read it and the surrounding template/effect re-runs when it changes (e.g. the user
rotates the device or resizes the window):

```pdx
@if (device.isMobile()) {
  <pdx-bottom-nav :items="nav" />
} @else {
  <pdx-sidebar :items="nav" />
}
```

## `responsive(map, base?)` — a value per breakpoint

When you want one value that changes with the breakpoint, `responsive` returns a signal that picks the
right entry:

```ts
import { responsive } from '@pdxui/core';

const columns = responsive({ sm: 1, md: 2, lg: 3, xl: 4 }, 1);
// columns() → 3 on a large screen, 1 on small
```

```pdx
<div :style.grid-template-columns="`repeat(${columns()}, 1fr)`">…</div>
```

## `useAdaptive()` — container-aware

`device` tracks the **viewport**. When a component should adapt to *its own* width instead (a card
that's narrow in a sidebar but wide in the main column), `useAdaptive()` gives you the same
`isMobile`/`isDesktop` signals measured against the component's container.

## Touch gestures

Four primitives, each taking an element and returning the way to detach:

```ts
import { onSwipe, onLongpress, onPinch } from '@pdxui/core';

const stopSwipe = onSwipe(card, 'left', () => archive(), { threshold: 50, timeout: 300 });
const stopHold  = onLongpress(row, (e) => openContextMenu(e), { duration: 500, tolerance: 10 });
const stopPinch = onPinch(image, ({ scale, center }) => zoom(scale, center));
```

The two defaults on `onSwipe` are what make it a *swipe* rather than a drag: **50 px** of travel and
**300 ms** to do it in. A slow drag across the same distance is not a swipe and does not fire.
`onLongpress` has the mirror pair — hold for 500 ms, and move more than 10 px and it cancels, so a
scroll that begins on the element does not open a menu.

`onPinch` reports a `scale` relative to the start of the gesture (`1` is unchanged) and the `center`
between the two touches, which is the point to zoom around.

## The notch and the home indicator

`useSafeArea()` ([Composables](/docs/composables)) gives you the insets as signals. Two helpers apply
them instead:

```ts
import { applySafeArea, injectSafeAreaCSS } from '@pdxui/core';

applySafeArea(panel);     // padding on one element, from env(safe-area-inset-*)
injectSafeAreaCSS();      // --pdx-safe-top/-right/-bottom/-left on :root, once
```

`applySafeArea` writes the four paddings onto the element — the right thing for an overlay that goes
edge to edge. `injectSafeAreaCSS` publishes the insets as custom properties so a stylesheet can use
them anywhere; it is idempotent, so calling it from several places is safe.

And the gesture that goes with them, for a sheet: `swipeDownDismiss(el, onDismiss, threshold?)` moves
the element with the finger and dismisses past the threshold — what `<pdx-bottom-sheet>` uses.

## Gotchas

- **They're signals — call them.** `device.isMobile` is the signal; `device.isMobile()` is the
  current value. In a template `@if (device.isMobile())` is reactive; assigning `const m =
  device.isMobile()` to a plain variable snapshots it and won't update.
- **Render-level, not just style-level.** Using `@if (device.isMobile())` actually *adds and removes*
  the component (and disposes its effects), unlike a media query that only hides with CSS. That's the
  point — but it means the hidden branch isn't running. Prefer CSS for pure styling differences,
  `device` when the components themselves differ.
- The breakpoints align with the design-system scale (`sm/md/lg/xl/2xl`) so JS and CSS agree.
