---
title: Browser and device API
description: "Storage, online and idle state, the title and head, media queries, scroll, the splash screen, bottom sheets, pull-to-refresh, safe areas and the route trail."
order: 24
parent: api
---

# Browser and device API

Storage, online and idle state, the title and head, media queries, scroll, the splash screen, bottom sheets, pull-to-refresh, safe areas and the route trail. 20 exports, from `@pdxui/core`.

Part of the [API reference](/docs/api), generated from the source by `packages/site/scripts/gen-api.mjs`.

## `clearRouteTrail`

```ts
import { clearRouteTrail } from '@pdxui/core';

function clearRouteTrail(): void
```

Back to empty — for a test, and for an app that tears its router down.

## `injectSafeAreaCSS`

```ts
import { injectSafeAreaCSS } from '@pdxui/core';

function injectSafeAreaCSS(): void
```

Inject a <style> with CSS custom properties for safe area insets.
Usage in CSS: `padding-bottom: var(--pdx-safe-bottom, 0px);`

## `isSplashUp`

```ts
import { isSplashUp } from '@pdxui/core';

function isSplashUp(): boolean
```

Whether the start-up splash is on screen and not yet leaving: the app's first frames are its.

## `restoreScrollPosition`

```ts
import { restoreScrollPosition } from '@pdxui/core';

function restoreScrollPosition(path: string, isBack: boolean, content?: Element | null, behavior?: ScrollRestoration): void
```

Restore scroll position for a route path, or scroll to top.
Called by router after navigation, with the same `content` element as {@link saveScrollPosition}.

## `routeTrail`

```ts
import { routeTrail } from '@pdxui/core';

function routeTrail(): RouteCrumb[]
```

The matched chain as crumbs, outermost first. Reactive: a reader re-runs on every navigation.

## `saveScrollPosition`

```ts
import { saveScrollPosition } from '@pdxui/core';

function saveScrollPosition(path: string, content?: Element | null): void
```

Save current scroll position for a route path.
Called by router before navigation. `content` is the element the page renders in (the router
outlet): when an ancestor of it scrolls, that container's offset is saved with the window's.

## `scrollTo`

```ts
import { scrollTo } from '@pdxui/core';

function scrollTo(target: string | number | Element, options?: { behavior?: ScrollBehavior }): void
```

Scroll to a target: CSS selector, element, or Y position.

## `setRouteTrail`

```ts
import { setRouteTrail } from '@pdxui/core';

function setRouteTrail(crumbs: RouteCrumb[]): void
```

Called by the router on every navigation. An application does not call this.

## `SPLASH_ID`

```ts
import { SPLASH_ID } from '@pdxui/core';

const SPLASH_ID
```

The id the compiler gives the splash element.

## `splashReady`

```ts
import { splashReady } from '@pdxui/core';

function splashReady(condition: PromiseLike<unknown>): void
```

Hold the splash until `condition` settles.

Settled either way: a condition that fails is the app's to report, on its own screen — a splash
that never leaves reports nothing. A condition handed over once the splash has gone is ignored.

## `useBottomSheet`

```ts
import { useBottomSheet } from '@pdxui/core';

function useBottomSheet(el: () => HTMLElement | null, options?: BottomSheetOptions): BottomSheetReturn
```

A drag-to-dismiss bottom sheet with snap points.

`detents` are fractions of the viewport height (`[0.5, 1]` = half and full) and the sheet settles
on the nearest one. The release is decided by VELOCITY as well as position: a quick flick past
`velocityThreshold` moves a detent even if the finger did not travel far, which is what makes the
gesture feel native rather than sticky.

## `useHead`

```ts
import { useHead } from '@pdxui/core';

function useHead(config: HeadConfig): Dispose
```

Set document head tags (title, meta, link).
Returns a dispose function that removes the created tags.

For reactive titles, use useTitle() from browser/title.ts instead.

## `useIdle`

```ts
import { useIdle } from '@pdxui/core';

function useIdle(options: IdleOptions): IdleHandle
```

Watch for inactivity.

Four things make this more than a `setTimeout`, and each one is a test in `idle.test.ts`:

  - **which events count**, listened passively on the document and THROTTLED: a reset per
    `pointermove` is a signal write per `pointermove`, which is a render per `pointermove`;
  - **the wall clock, not the timer.** A background tab's timers are throttled to once a minute
    or stopped, so an implementation that trusts `setTimeout` comes back from an hour asleep
    still logged in. Every read compares `Date.now()` against the last activity, and
    `visibilitychange` forces that comparison the moment the tab returns;
  - **`warnBefore`**, because a session that dies without warning takes the form the user was
    filling in with it. It fires once, and a reset arms it again;
  - **other tabs.** Work in a second tab of the same app is work: each tab writes its activity
    to `localStorage`, and the others hear the `storage` event. It is the cheap answer and the
    only one that needs no service worker.

## `useMediaQuery`

```ts
import { useMediaQuery } from '@pdxui/core';

function useMediaQuery(query: string): ReadonlySignal<boolean>
```

Create a reactive signal from a CSS media query.
Updates automatically when the media query match state changes.

Usage:
  const isDark = useMediaQuery('(prefers-color-scheme: dark)');
  const isWide = useMediaQuery('(min-width: 1200px)');

## `useOnline`

```ts
import { useOnline } from '@pdxui/core';

function useOnline(): ReadonlySignal<boolean>
```

Reactive online/offline status signal.
Updates automatically when the browser goes online/offline.

## `usePullToRefresh`

```ts
import { usePullToRefresh } from '@pdxui/core';

function usePullToRefresh(el: () => HTMLElement | null, options: PullToRefreshOptions): PullToRefreshReturn
```

Pull-down-to-refresh, with the rubber-band resistance the gesture is recognised by.

`progress` (0..1) is what an indicator rotates or fills with, and it is the reason `resistance`
(0.4) exists: the content follows the finger at less than 1:1, so passing the threshold feels like
an effort rather than an accident. Only fires when the container is already scrolled to the top.

## `useSafeArea`

```ts
import { useSafeArea } from '@pdxui/core';

function useSafeArea(): SafeAreaReturn
```

Singleton safe area signal. Re-reads on orientation change and resize.

## `useScroll`

```ts
import { useScroll } from '@pdxui/core';

function useScroll(target?: HTMLElement | (() => HTMLElement | null) | null): ScrollState
```

Reactive scroll state: signals for x, y, direction and isScrolling.

With no argument it watches the **window**, as a page-level singleton — every caller gets the same
state. Pass an element to watch that element instead, and the state is one per element.

Which you need is decided by the layout, not by preference: in an app built on `pdx-app-layout` the
window never scrolls (the shell is `overflow: hidden` and `main.pdx-app-main` is `overflow-y: auto`),
so `useScroll()` there returns a `y` that never moves.

Pass a **getter** — `useScroll(() => box())` — and it attaches itself when the element arrives,
which is what a `:ref` signal does at mount, and follows the getter if it later yields a different
element. That is the shape the rest of the element-watching composables take (`useDrag`,
`useSortable`, `useContainerSize`…), and the reason to prefer it: nothing has to be called from a
place where the element already exists. The getter form owns its listener, so it is
the one whose `dispose()` does something.

`direction` returns to `'idle'` 150 ms after the last event, not when the direction changes.

## `useStorage`

```ts
import { useStorage } from '@pdxui/core';

function useStorage(key: string, defaultValue: T, storage: 'local' | 'session' = 'local'): Signal<T>
```

Reactive localStorage signal with automatic persistence and cross-tab sync.

@param key - Storage key
@param defaultValue - Default value if key doesn't exist
@param storage - 'local' (default) or 'session' for sessionStorage
@returns Signal that reads/writes to storage

## `useTitle`

```ts
import { useTitle } from '@pdxui/core';

function useTitle(titleFn: () => string): void
```

Reactively set document.title. Updates whenever signal dependencies change.

Usage:
  useTitle(() => `${count()} items — My App`);
