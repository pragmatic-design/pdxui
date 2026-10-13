---
title: Components API
description: "Defining components, lifecycle hooks, provide and inject, slots, themes and schemes, permissions, icons, overlays and positioning, dialog and toast queues, selection, drag, sorting and gestures."
order: 24
parent: api
---

# Components API

Defining components, lifecycle hooks, provide and inject, slots, themes and schemes, permissions, icons, overlays and positioning, dialog and toast queues, selection, drag, sorting and gestures. 109 exports, from `@pdxui/core`.

Part of the [API reference](/docs/api), generated from the source by `packages/site/scripts/gen-api.mjs`.

## `__adoptStyles`

```ts
import { __adoptStyles } from '@pdxui/core';

function __adoptStyles(root: ShadowRoot | null | undefined, css: string, id: string): void
```

Put a component's CSS inside a shadow root.

Emitted by the compiler for a `<template shadow>` component, and the reason it has to exist: the
light-DOM path appends a `<style>` to `document.head`, and a document stylesheet does not cross a
shadow boundary. A shadow component whose styles went to the head would render unstyled, with
every piece individually correct.

One constructed stylesheet per component, adopted by every instance — so a hundred rows share one
sheet, and an HMR update to it reaches all of them at once. Where constructable stylesheets are
not available the fallback is a `<style>` element per root, which is correct and merely heavier.

## `__pdx_hmr_rerender`

```ts
import { __pdx_hmr_rerender } from '@pdxui/core';

function __pdx_hmr_rerender(tag: string): void
```

INTERNAL. Re-render every live instance of a tag after a hot update.

The Vite plugin emits a call to this; a custom element cannot be redefined, so HMR re-runs the
body of the instances already in the page instead. The `__pdx_` prefix marks it as machinery — it
is exported because generated code has to reach it, not because an application should call it.

## `__pdx_hmr_restore`

```ts
import { __pdx_hmr_restore } from '@pdxui/core';

function __pdx_hmr_restore(tag: string): void
```

Restore HMR state for newly created instances of a given tag.

## `__pdx_hmr_save`

```ts
import { __pdx_hmr_save } from '@pdxui/core';

function __pdx_hmr_save(tag: string): void
```

Save HMR state for all instances of a given tag.

## `__pdx_hmr_swap`

```ts
import { __pdx_hmr_swap } from '@pdxui/core';

function __pdx_hmr_swap(tag: string): void
```

HMR: swap prototypes of all live instances to the latest class version.
Then re-render each instance by clearing DOM and calling body() again.

## `adaptive`

```ts
import { adaptive } from '@pdxui/core';

function adaptive(flags: Record<string, () => boolean>): Record<string, ReadonlySignal<boolean>>
```

Define adaptive feature flags based on viewport/screen conditions.
Each flag is a computed signal. The system also writes active flags
as a `pdx-adaptive` attribute on `<html>` for CSS targeting.

@param flags - Record of flag name → condition function
@returns Record of flag name → ReadonlySignal<boolean>

Usage:
  const features = adaptive({
    compactNav: () => viewport.width() < 768,
    touchOptimized: () => screen.isTouch(),
  });
  // <html pdx-adaptive="compactNav touchOptimized">

## `adaptiveValue`

```ts
import { adaptiveValue } from '@pdxui/core';

function adaptiveValue(adaptive: AdaptiveReturn, values: { desktop: T; mobile: T }): ReadonlySignal<T>
```

Map a value based on adaptive mode.
Returns a computed signal that switches between desktop/mobile values.

@example
const placement = adaptiveValue(adaptive, {
    desktop: 'bottom-start',
    mobile: 'bottom',
});
// placement() → 'bottom-start' or 'bottom' based on mode

## `applySafeArea`

```ts
import { applySafeArea } from '@pdxui/core';

function applySafeArea(el: HTMLElement): void
```

Apply safe area insets to an overlay element (for notch, home indicator).
Sets CSS environment variables as padding.

## `applyTheme`

```ts
import { applyTheme } from '@pdxui/core';

function applyTheme(theme: Record<string, string>, target?: Element): void
```

Apply a theme by setting all its CSS variables on target (default: :root).

## `arrow`

```ts
import { arrow } from '@pdxui/core';

function arrow(options: ArrowOptions): Middleware
```

Compute the arrow position relative to the floating element.

## `autoUpdate`

```ts
import { autoUpdate } from '@pdxui/core';

function autoUpdate(reference: HTMLElement | VirtualElement, floating: HTMLElement, update: () => void): Dispose
```

Listen for scroll/resize events and call `update` whenever the position
may have changed. Returns a Dispose function to remove listeners.

## `clearGlobalErrorHandlers`

```ts
import { clearGlobalErrorHandlers } from '@pdxui/core';

function clearGlobalErrorHandlers(): void
```

Clear all handlers (for testing).

## `clearIconSets`

```ts
import { clearIconSets } from '@pdxui/core';

function clearIconSets(): void
```

Remove all registered icon sets. Useful for testing.

## `clearProviders`

```ts
import { clearProviders } from '@pdxui/core';

function clearProviders(): void
```

Clear all global providers (for testing).

## `component`

```ts
import { component } from '@pdxui/core';

function component(tag: string, options: ComponentOptions<P, E>): void
```

Define a function-based Web Component.

Usage:
  component('pdx-counter', {
    props: {
      initial: { type: Number, default: 0 },
    },
    setup(ctx) {
      const count = signal((ctx.initial as Signal<number>)());
      return { count, increment: () => count.set(v => v + 1) };
    },
    render: (ctx) => html`
      <span>${ctx.count}</span>
      <button @click=${ctx.increment}>+</button>
    `,
  });

## `computeFloatingPosition`

```ts
import { computeFloatingPosition } from '@pdxui/core';

function computePosition(reference: HTMLElement | VirtualElement, floating: HTMLElement, options?: PositionOptions): PositionResult
```

Compute the position for a floating element relative to a reference.
Pure math — does NOT apply styles. Consumer applies x/y to the floating element.

## `createBackdrop`

```ts
import { createBackdrop } from '@pdxui/core';

function createBackdrop(options?: BackdropOptions): BackdropResult
```

Create a backdrop overlay element with optional blur and click handler.

## `createBottomSheet`

```ts
import { createBottomSheet } from '@pdxui/core';

function createBottomSheet(content: Node, options?: BottomSheetOptions): BottomSheetResult
```

Create a bottom sheet (mobile-optimized overlay).
Fixed to bottom, draggable between detent points, swipe-down to dismiss.

## `createChannel`

```ts
import { createChannel } from '@pdxui/core';

function createChannel(): Channel<T>
```

Create a typed bidirectional channel.
Messages are validated by TypeScript at compile time.
At runtime, listeners are stored per-event, frozen for security.

CONSTRAINT: send (down) and emit (up) share one listener map, keyed by event
NAME — give `down` and `up` distinct names in the contract ('refresh' vs 'refreshed', say), or
the listeners receive the messages of both directions.

## `createCommands`

```ts
import { createCommands } from '@pdxui/core';

function createCommands(): Commands<T>
```

Create a typed command dispatcher (parent→child direction only).
Simpler than a full channel when bidirectional is not needed.

## `createCompoundParent`

```ts
import { createCompoundParent } from '@pdxui/core';

function createCompoundParent(options?: CompoundOptions<TChild>): CompoundParentContext<TChild>
```

Create a compound parent context.
The parent creates this and provides it to children via provide/inject.

@example
// In parent component (e.g. pdx-tabs):
const compound = createCompoundParent<TabChild>({
    onChildAdded: (child, i) => { ... },
    onNotify: (event, payload) => { ... },
});
provide('pdx-tabs', compound);

// In child component (e.g. pdx-tab):
const parent = inject<CompoundParentContext<TabChild>>('pdx-tabs');
const dispose = parent.register({ label: 'Tab 1', panel: panelEl });
onDestroy(() => dispose());

## `createDialogQueue`

```ts
import { createDialogQueue } from '@pdxui/core';

function createDialogQueue(): DialogQueue
```

A stack of dialogs where opening one returns a promise that resolves with its result.

That is the useful part: `const ok = await queue.push({ ... })` reads like the question it asks,
instead of a callback plus a signal plus a cleanup. Dialogs stack, and each takes a z-index from
the shared overlay stack so a confirm opened from a dialog lands ABOVE it rather than behind.

Closing resolves; dismissing resolves too, with the dismissal value — an unresolved promise on
Escape is a leaked await.

## `createPortal`

```ts
import { createPortal } from '@pdxui/core';

function createPortal(content: Node, target?: string | HTMLElement): PortalResult
```

Create a portal: mount content into a target container (default: document.body).
Returns the wrapper element and a dispose function.

## `createSelection`

```ts
import { createSelection } from '@pdxui/core';

function createSelection(options?: SelectionOptions<K>): Selection<K>
```

Create a key-based selection model.

@example
```ts
const sel = createSelection<string>({ mode: 'multiple', behavior: 'toggle' });
sel.select('item-1');
sel.toggle('item-2');
console.log(sel.selected()); // Set { 'item-1', 'item-2' }
sel.extendTo('item-5', allItemKeys); // Shift+Click range
```

## `createSlotManager`

```ts
import { createSlotManager } from '@pdxui/core';

function createSlotManager(host: HTMLElement): SlotManager
```

Create a slot manager for a compound component.
Scans the host element for [slot="name"] children.

@example
const slots = createSlotManager(hostEl);

// Check if header slot is filled
if (slots.hasSlot('header')) { ... }

// Render with fallback
const content = slots.renderSlot('footer', undefined, () => {
    const el = document.createElement('div');
    el.textContent = 'Default footer';
    return el;
});

## `createTheme`

```ts
import { createTheme } from '@pdxui/core';

function createTheme(vars: Record<string, string>): Record<string, string>
```

Create a theme as a record of CSS variable values.

## `createToastQueue`

```ts
import { createToastQueue } from '@pdxui/core';

function createToastQueue(options?: ToastQueueOptions): ToastQueue
```

The state behind a toast stack: a capped list, per-toast auto-dismiss timers, and pause/resume.

`maxVisible` (5) is a cap, not a limit on what you may push — the overflow waits its turn, because
twenty stacked toasts communicate less than five.

`pause`/`resume` exist for hover: a message that disappears while it is being read is a message
that was not delivered. A component using this should pause on pointer-enter and on focus.

## `createTokenBridge`

```ts
import { createTokenBridge } from '@pdxui/core';

function createTokenBridge(prefix = '--pdx-', target?: Element): TokenBridge
```

Create a token bridge that auto-discovers --pdx-* CSS custom properties.
Tokens become reactive signals that update when the theme changes.

@param prefix - CSS variable prefix to discover (default: '--pdx-')
@param target - Element to read from (default: document.documentElement)

## `cssVar`

```ts
import { cssVar } from '@pdxui/core';

function cssVar(name: string, initial: string | (() => string), target?: Element): Signal<string>
```

Create a reactive CSS custom property backed by a signal.
Changes to the signal automatically update the CSS variable on the target element.

@param name - CSS variable name (e.g. '--primary-color')
@param initial - Initial value (string) or reactive getter
@param target - Element to set the variable on (default: document.documentElement)

## `currentScheme`

```ts
import { currentScheme } from '@pdxui/core';

const currentScheme: ReadonlySignal<string>
```

Current color scheme ('light' or 'dark').

## `currentTheme`

```ts
import { currentTheme } from '@pdxui/core';

const currentTheme: ReadonlySignal<string>
```

Current brand theme name (e.g. 'neutral', 'material', 'fluent').

## `define`

```ts
import { define } from '@pdxui/core';

function define(tag: string, ctor: PdxElementConstructor): void
```

Register a Custom Element. If already defined, swaps prototype for HMR.

Where there is no custom element registry (Node: a build tool, a test, static generation) it
registers nothing. Every compiled `.pdx` and every `@pdxui/ui` module calls `component()` when it is
imported, so throwing here would make the whole module graph unimportable.

## `device`

```ts
import { device } from '@pdxui/core';

const device
```

Reactive device detection signals.
Lazy: matchMedia listeners are created only on first access, not at import.
SSR-safe: defaults to desktop/landscape.

## `discoverChildren`

```ts
import { discoverChildren } from '@pdxui/core';

function discoverChildren(parent: () => HTMLElement | null, options: ChildDiscoveryOptions): { items: ReadonlySignal<HTMLElement[]>; dispose: Dispose }
```

Discover child elements via DOM query.
Alternative to provide/inject for simpler compound patterns
where children are known by selector (e.g. slot-based composition).

@example
const children = discoverChildren(() => containerEl, {
    selector: 'pdx-tab',
});
// children.items() — reactive list of matching elements

## `dispatchGlobalError`

```ts
import { dispatchGlobalError } from '@pdxui/core';

function dispatchGlobalError(error: unknown, context: ErrorContext): void
```

Dispatch an error to all registered global handlers.
If no handler suppresses it, logs to console.error.

Called internally by the framework — not typically used by app code.

## `event`

```ts
import { event } from '@pdxui/core';

function event(options?: { bubbles?: boolean }): EventSpec<D>
```

Declare an event: `event<number>()`, `event<void>({ bubbles: false })`.

## `exposeOnElement`

```ts
import { exposeOnElement } from '@pdxui/core';

function exposeOnElement(element: HTMLElement, api: Record<string, unknown>): void
```

Expose methods/signals on the host element for parent access via ref.
Each entry becomes a read-only, non-configurable own property (external code can't reassign).

Copies property DESCRIPTORS (not a spread), so a live `get x()` accessor stays live instead of
being snapshotted to its value at expose time — e.g. a component whose `get form()` is filled in
after mount keeps returning the current value.

Called from component setup: ctx.expose({ showModal, close, isOpen })

## `flip`

```ts
import { flip } from '@pdxui/core';

function flip(options?: FlipOptions): Middleware
```

Flip to the opposite side if the floating element overflows the boundary (or viewport).

## `forwardSlots`

```ts
import { forwardSlots } from '@pdxui/core';

function forwardSlots(source: HTMLElement, target: HTMLElement, slotNames: string[]): void
```

Forward slots from outer host to inner component.
Used when a compound component wraps another compound component.

@example
// <pdx-fancy-dialog> wraps <pdx-dialog>
// Forward 'header' and 'footer' slots to inner dialog
forwardSlots(outerHost, innerHost, ['header', 'footer']);

## `getDefaultIconSet`

```ts
import { getDefaultIconSet } from '@pdxui/core';

function getDefaultIconSet(): string | null
```

Get the name of the default icon set.

## `getDialogQueue`

```ts
import { getDialogQueue } from '@pdxui/core';

function getDialogQueue(): DialogQueue
```

The page's one dialog queue: the one `<pdx-overlay-outlet>` draws, `dialog.confirm()` pushes to,
and a form's leave guard asks through. It lives here, not in @pdxui/ui, because core has to
ask a question too and cannot import the package that draws it.

## `getScheme`

```ts
import { getScheme } from '@pdxui/core';

function getScheme(): string
```

Get the current color scheme.

## `getTheme`

```ts
import { getTheme } from '@pdxui/core';

function getTheme(): string
```

Get the current theme name.

## `hasIconSet`

```ts
import { hasIconSet } from '@pdxui/core';

function hasIconSet(name: string): boolean
```

Check if an icon set is registered.

## `hasPermission`

```ts
import { hasPermission } from '@pdxui/core';

function hasPermission(permission: string): ReadonlySignal<boolean>
```

Check if a permission is granted. Returns a reactive ReadonlySignal.

Usage:
  const canDelete = hasPermission('booking.delete');
  effect(() => { if (canDelete()) enableButton(); });

## `hideMiddleware`

```ts
import { hideMiddleware } from '@pdxui/core';

function hide(options?: HideOptions): Middleware
```

Hide the floating element when the reference scrolls out of a boundary.
Sets data.hidden = true/false. Consumer applies display:none based on this.

## `hideSkeleton`

```ts
import { hideSkeleton } from '@pdxui/core';

function hideSkeleton(el: HTMLElement): void
```

Restore original content from skeleton.

## `inject`

```ts
import { inject } from '@pdxui/core';

function inject(key: string | symbol, from?: HTMLElement): T
```

Inject a value by walking up the DOM tree (nearest provider wins).
Falls back to global registry. Throws if not found.

## `installContextProtocol`

```ts
import { installContextProtocol } from '@pdxui/core';

function installContextProtocol(): void
```

Install global Context Protocol listener (for global providers).
Responds to context-request events with values from the global registry.

## `measure`

```ts
import { measure } from '@pdxui/core';

function measure(el: HTMLElement): MeasureResult
```

Measure an element's dimensions and position. Wrapper for getBoundingClientRect().

## `measureRelative`

```ts
import { measureRelative } from '@pdxui/core';

function measureRelative(el: HTMLElement, relativeTo: HTMLElement): RelativeMeasureResult
```

Measure the relative position between two elements.

## `model`

```ts
import { model } from '@pdxui/core';

function model(defaultValue: T): ModelSpec<T>
```

Declare a model: `model<string>('')`.

## `moveMounted`

```ts
import { moveMounted } from '@pdxui/core';

function moveMounted(root: Node, move: () => void): void
```

Run `move` — DOM operations that take `root` (or its subtree) out of the document and put it back,
such as wrapping a container or moving children into a viewport — without unmounting the
components in it.

A move is a disconnect and a connect, and a PdxElement treats a disconnect as its end: it disposes
its effects and its state, and the connect sets it up again from its light-DOM children. A plain
move renders once; this is the cheap path that skips the teardown and the second
setup, so what the user typed, scrolled or opened stays. The components under `root` ignore the
disconnect for the length of `move`, and stay as they were. `move` must put the
subtree back in the document before it returns.

## `offset`

```ts
import { offset } from '@pdxui/core';

function offset(value: OffsetValue): Middleware
```

Add distance between reference and floating element.

## `onBeforeLeave`

```ts
import { onBeforeLeave } from '@pdxui/core';

function onBeforeLeave(fn: () => boolean | 'destroy' | Promise<boolean>): void
```

Register a navigation guard. Called before the router navigates away from the page this
component is on — the routed page itself or any component inside it.
Return false to block navigation, 'destroy' to force destroy even if keepAlive,
or a Promise<boolean> for async confirmation (e.g. "unsaved changes" dialog).

## `onClickOutsideStack`

```ts
import { onClickOutsideStack } from '@pdxui/core';

function onClickOutsideStack(overlayId: string, element: HTMLElement, handler: () => void): Dispose
```

Stack-aware click-outside detection.
Only fires if the click is outside the element AND the overlay is still on top.

## `onDestroy`

```ts
import { onDestroy } from '@pdxui/core';

function onDestroy(fn: () => void): void
```

Register a callback to run before the component is destroyed.
Can be called from setup() or any composable function during setup.

## `onError`

```ts
import { onError } from '@pdxui/core';

function onError(fn: (err: unknown) => void): void
```

Register a component-level error handler.
Catches errors from effects and child components.

## `onGlobalError`

```ts
import { onGlobalError } from '@pdxui/core';

function onGlobalError(handler: GlobalErrorHandler): () => void
```

Register a global error handler. Called for any error not caught by
a local @try/@catch or <pdx-error-boundary>.

Return `true` from the handler to suppress the default console.error.
Multiple handlers are called in registration order; if any returns true,
the error is considered handled.

@returns Dispose function to unregister the handler.

## `onHide`

```ts
import { onHide } from '@pdxui/core';

function onHide(fn: () => void): void
```

Register a callback to run when a keep-alive page is hidden (navigated away but kept alive).
Symmetric with onShow. Use for pausing timers, animations, or subscriptions.

## `onLongpress`

```ts
import { onLongpress } from '@pdxui/core';

function onLongpress(el: HTMLElement, callback: (e: PointerEvent) => void, config?: LongpressConfig): Dispose
```

Listen for longpress (hold) gestures on an element.

@returns Dispose function to remove listeners.

## `onMount`

```ts
import { onMount } from '@pdxui/core';

function onMount(fn: () => void | (() => void) | Promise<unknown>): void
```

Register a callback to run after the component mounts (first render complete).
Can be called from setup() or any composable function during setup.

Inside the mount callback, onDestroy() is available — the component scope
is temporarily restored so lifecycle hooks can be registered from mount callbacks.

The callback may be async — `onMount(async () => { data = await load(); })`. Its promise is not
awaited and is not a cleanup: return a function from a synchronous callback for that, and register
an `onDestroy()` before the first `await`, since the scope is restored only while the callback runs
synchronously.

## `onPinch`

```ts
import { onPinch } from '@pdxui/core';

function onPinch(el: HTMLElement, callback: (event: PinchEvent) => void): Dispose
```

Listen for pinch (two-finger scale) gestures on an element.
Only fires on touch devices with multi-touch support.

@returns Dispose function to remove listeners.

## `onPropsChange`

```ts
import { onPropsChange } from '@pdxui/core';

function onPropsChange(fn: (changes: PropChange[]) => void): void
```

Register a callback to run when component props change from parent.
Receives an array of PropChange objects with name, oldValue, newValue.
Similar to Angular's ngOnChanges or Blazor's OnParametersSet.

## `onResize`

```ts
import { onResize } from '@pdxui/core';

function onResize(fn: (entry: ResizeObserverEntry) => void): void
```

Register a callback when the component element resizes.
Uses ResizeObserver (cleaned up on destroy).

@param fn - Called with ResizeObserverEntry on size change

## `onRouteChange`

```ts
import { onRouteChange } from '@pdxui/core';

function onRouteChange(fn: (params: Record<string, string>) => void): void
```

Register a callback when route params change but the component stays mounted.
E.g. navigating from /users/1 to /users/2 — same page component, different params.

## `onShow`

```ts
import { onShow } from '@pdxui/core';

function onShow(fn: () => void): void
```

Register a callback to run when a keep-alive page becomes visible again.
Triggered by the router outlet's 'pdx-page-show' event.
Useful for refreshing document.title or fetching fresh data on back-nav.

## `onSwipe`

```ts
import { onSwipe } from '@pdxui/core';

function onSwipe(el: HTMLElement, direction: SwipeDirection, callback: () => void, config?: SwipeConfig): Dispose
```

Listen for swipe gestures on an element.
Uses PointerEvents for unified touch/mouse/pen support.

@returns Dispose function to remove listeners.

## `onUpdated`

```ts
import { onUpdated } from '@pdxui/core';

function onUpdated(fn: () => void): void
```

Register a callback to run after reactive effects flush.
Useful for measuring DOM after updates.

## `onVisible`

```ts
import { onVisible } from '@pdxui/core';

function onVisible(fn: (entry: IntersectionObserverEntry) => void, options?: IntersectionObserverInit): void
```

Register a callback when the component enters the viewport.
Uses IntersectionObserver (one per component, cleaned up on destroy).

@param fn - Called with IntersectionObserverEntry when visibility changes
@param options - IntersectionObserver options (threshold, rootMargin)

## `overlayStack`

```ts
import { overlayStack } from '@pdxui/core';

const overlayStack: OverlayStack
```

Global overlay stack — manages z-index, Escape dismiss, body scroll lock.

## `PdxElement`

```ts
import { PdxElement } from '@pdxui/core';

class PdxElement
```

Base class for PDX UI Web Components.

## `prop`

```ts
import { prop } from '@pdxui/core';

const prop: typeof propBuilder & { required: typeof requiredProp }
```

Declare a prop: `prop<T>(default, { type? })`, or `prop.required<T>({ type? })`.

## `provide`

```ts
import { provide } from '@pdxui/core';

function provide(key: string | symbol, value: T, element?: HTMLElement): void
```

Provide a value on a specific element (DOM-scoped).
Descendants can inject it via context-request event.
If no element is specified, provides globally (app-wide).

It answers the Web Components context protocol's `context-request`, from any library: the
request's `context` is compared with `key` by identity. A request with `subscribe: true` is
answered with the current value of a provided signal, and again on each change until it calls
the `unsubscribe` it was given, or the host component is destroyed; a plain value is answered
once, which the protocol allows. A request without `subscribe` gets the value as provided.

## `provideWritable`

```ts
import { provideWritable } from '@pdxui/core';

function provideWritable(key: string | symbol, value: Signal<T>, element?: HTMLElement): void
```

Provide a writable signal for bidirectional context.
Children can read AND write the value via useWritable().
Semantic sugar over provide() — clarifies bidirectional intent.

## `registerContainerQueries`

```ts
import { registerContainerQueries } from '@pdxui/core';

function registerContainerQueries(el: HTMLElement, breakpoints?: Record<string, number>): Dispose
```

Register container queries on an element.
Sets `container-type: inline-size` and applies data-attributes for custom breakpoints.

## `registerIconSet`

```ts
import { registerIconSet } from '@pdxui/core';

function registerIconSet(name: string, resolver: IconResolver): void
```

Register an icon set with a resolver function.
The first registered set becomes the default.

@example
```ts
// Sync resolver (icons bundled)
registerIconSet('lucide', (name) => lucideIcons[name]);

// Async resolver (lazy loaded)
registerIconSet('heroicons', async (name) =>
  (await import(`@heroicons/24/outline/${name}.svg`)).default
);
```

## `requestContext`

```ts
import { requestContext } from '@pdxui/core';

function requestContext(element: HTMLElement, key: string | symbol): T | undefined
```

Request a context value via W3C Context Protocol.
Dispatches a context-request event and returns the value from the nearest provider.
Works with any Web Component (including non-Pragmatic ones like Lit).

## `requirePermission`

```ts
import { requirePermission } from '@pdxui/core';

function requirePermission(permission: string, thenFn: () => Node | DocumentFragment, elseFn?: (() => Node | DocumentFragment | null) | null): DocumentFragment
```

Permission-gated rendering. Shows thenFn only if permission is granted.

Usage:
  ${requirePermission('booking.delete', () => html`<button>Delete</button>`)}
  ${requirePermission('admin', () => html`<nav>Admin</nav>`, () => html`<span>No access</span>`)}

## `resolveIcon`

```ts
import { resolveIcon } from '@pdxui/core';

function resolveIcon(iconName: string, setName?: string): Promise<string | SVGElement | null>
```

Resolve an icon by name from a registered set.
Returns SVG markup string, SVGElement, or null if not found.

## `responsive`

```ts
import { responsive } from '@pdxui/core';

function responsive(map: BreakpointMap<T>, base?: T): ReadonlySignal<T>
```

Creates a responsive signal that updates when viewport breakpoints change.

Usage:
  const cols = responsive({ sm: 1, md: 2, lg: 3, xl: 4 });
  html`<pdx-grid :cols=${cols}>...</pdx-grid>`

@param map - Breakpoint → value mapping
@param base - Fallback value when no breakpoint matches (below smallest defined)
@returns ReadonlySignal that updates on viewport changes

## `safeHandler`

```ts
import { safeHandler } from '@pdxui/core';

function safeHandler(fn: (...args: any[]) => any, component?: string, event?: string): (...args: any[]) => any
```

Wrap an event handler function so errors are caught and routed.
Tries the local error boundary first, then falls back to global handler.
Used by the compiler to wrap @click, @input, etc.

## `screen`

```ts
import { screen } from '@pdxui/core';

const screen
```

Centralized screen/device signals. One matchMedia listener per query.

## `setDefaultIconSet`

```ts
import { setDefaultIconSet } from '@pdxui/core';

function setDefaultIconSet(name: string): void
```

Set the default icon set by name.

## `setPermissions`

```ts
import { setPermissions } from '@pdxui/core';

function setPermissions(newChecker: PermissionChecker | string[]): void
```

Set the global permission checker. Call at app initialization.
Accepts a checker function OR a string array of granted permissions.
Re-evaluates all permission-gated UI reactively.

Usage:
  setPermissions(['users.view', 'tasks.manage']);
  setPermissions((perm) => currentUser.permissions.includes(perm));

## `setScheme`

```ts
import { setScheme } from '@pdxui/core';

function setScheme(scheme: 'light' | 'dark'): void
```

Set the color scheme ('light' or 'dark').
Sets `pdx-scheme` attribute on <html> and persists to localStorage.

## `setTheme`

```ts
import { setTheme } from '@pdxui/core';

function setTheme(name: string): void
```

Set the brand theme (e.g. 'material', 'fluent', 'cupertino').
Sets `pdx-theme` attribute on <html>, persists to localStorage,
and syncs behavior attributes (input-style, tab-style, card-style)
from the theme's CSS custom properties.

## `shift`

```ts
import { shift } from '@pdxui/core';

function shift(options?: ShiftOptions): Middleware
```

Shift the floating element along the axis to keep it within the boundary (or viewport).

## `showSkeleton`

```ts
import { showSkeleton } from '@pdxui/core';

function showSkeleton(el: HTMLElement, options?: SkeletonOptions): Dispose
```

Replace element content with skeleton placeholders.
Scans children and creates matching skeleton shapes:
- Text nodes → gray rectangles matching line height
- Images → gray rectangles matching dimensions
- Buttons → rounded rectangles
- Inputs → input-shaped rectangles

@returns Dispose function to restore original content.

## `sizeMiddleware`

```ts
import { sizeMiddleware } from '@pdxui/core';

function size(options?: SizeOptions): Middleware
```

Constrain the floating element's max dimensions to available space.

## `slot`

```ts
import { slot } from '@pdxui/core';

function slot(): SlotSpec<F>
```

Declare a slot: `slot<(o: Option) => Node>()`.

## `swipeDownDismiss`

```ts
import { swipeDownDismiss } from '@pdxui/core';

function swipeDownDismiss(el: HTMLElement, onDismiss: () => void, threshold = 100): Dispose
```

Enable swipe-down gesture to dismiss an overlay.
The overlay moves down with the finger; if swiped past threshold, it's dismissed.
Returns a Dispose function to remove listeners.

## `toggleDarkMode`

```ts
import { toggleDarkMode } from '@pdxui/core';

function toggleDarkMode(): void
```

Toggle between 'light' and 'dark' color schemes.

## `tryInject`

```ts
import { tryInject } from '@pdxui/core';

function tryInject(key: string | symbol, from?: HTMLElement): T | undefined
```

Try to inject a value. Returns undefined if not found.

## `tryUseProvided`

```ts
import { tryUseProvided } from '@pdxui/core';

function tryUseProvided(key: string | symbol): T | undefined
```

Composable: try to inject a provided value. Returns undefined if not found.
Must be called during setup().

## `tryUseWritable`

```ts
import { tryUseWritable } from '@pdxui/core';

function tryUseWritable(key: string | symbol): Signal<T> | undefined
```

Composable: try to inject a writable signal. Returns undefined if not found.
Must be called during setup().

## `useAdaptive`

```ts
import { useAdaptive } from '@pdxui/core';

function useAdaptive(options?: AdaptiveOptions): AdaptiveReturn
```

Determine adaptive mode based on viewport or container width.

@example
const adaptive = useAdaptive({ breakpoint: 640 });

// In template:
@if (adaptive.isMobile()) {
  <pdx-bottom-sheet>...</pdx-bottom-sheet>
} @else {
  <pdx-popover>...</pdx-popover>
}

## `useClipboard`

```ts
import { useClipboard } from '@pdxui/core';

function useClipboard(options?: ClipboardOptions): ClipboardReturn
```

Copy, cut and paste through the async Clipboard API, with a `copied` signal for the "Copied!"
feedback.

Check `isSupported` before offering the affordance: the API needs a secure context, and `paste()`
additionally needs focus and the user's permission — a paste button that silently does nothing on
http:// is worse than no button.

## `useContainerSize`

```ts
import { useContainerSize } from '@pdxui/core';

function useContainerSize(el: () => HTMLElement | null, breakpoints?: ContainerBreakpoints): ContainerSizeReturn
```

Signal-based container size awareness.
Uses ResizeObserver to track the container's dimensions reactively.
Breakpoint thresholds are configurable.

## `useDrag`

```ts
import { useDrag } from '@pdxui/core';

function useDrag(el: () => HTMLElement | null, options?: DragOptions): DragReturn
```

Make an element draggable: it FOLLOWS the pointer, and the gesture is reported as signals.

The movement is the default (`move: false` opts out, and a `ghost` opts out for you). Reporting
only — `isDragging()`, `position()`, the drop-zone hit testing — would leave every caller writing
the same four lines to paint it, and a board whose cards do not move under the pointer.

Uses PointerEvent for unified touch/mouse/pen support.
Features: axis constraint, bounds, ghost, auto-scroll, velocity,
keyboard a11y (Alt+Arrow), long-press activation for touch.

## `useDropZone`

```ts
import { useDropZone } from '@pdxui/core';

function useDropZone(el: () => HTMLElement | null, options?: DropZoneOptions): DropZoneReturn
```

Make an element a drop zone for draggables.
Uses hit-testing via bounding rect (not pointer events) —
works even when the drag source captures the pointer.

## `useEffect`

```ts
import { useEffect } from '@pdxui/core';

function useEffect(fn: () => void | (() => void)): Dispose
```

Track a reactive effect with auto-disposal on component disconnect.
Like ctx.track() but works in composables without ctx reference.

## `usePopover`

```ts
import { usePopover } from '@pdxui/core';

function usePopover(options?: PopoverOptions): PopoverReturn
```

Headless popover composable.
Provides positioning, trigger handling, dismiss logic, and ARIA attributes.
Does NOT render any UI — the consumer provides trigger and content elements.

Usage:
  const pop = usePopover({ trigger: 'click', placement: 'bottom-start' });
  // In template:
  <button :ref="pop.setTrigger" :aria-expanded="pop.isOpen">Open</button>
  <div :ref="pop.setContent" :show="pop.isOpen" :style="popoverStyle(pop.position)">
    Content here
  </div>

## `useProvided`

```ts
import { useProvided } from '@pdxui/core';

function useProvided(key: string | symbol): T
```

Composable: inject a provided value using the current component's element.
Must be called during setup(). Throws if not found.

Usage in setup():
  const theme = useProvided<ThemeSignal>('theme');

## `useResizeHandle`

```ts
import { useResizeHandle } from '@pdxui/core';

function useResizeHandle(handle: () => HTMLElement | null, target: () => HTMLElement | null, options?: ResizeHandleOptions): ResizeHandleReturn
```

Attach resize behavior to a handle element.
The handle is the draggable grip; the target is the element being resized.

@param handle - Getter for the handle element (the grip bar).
@param target - Getter for the element being resized.

## `useScrollbar`

```ts
import { useScrollbar } from '@pdxui/core';

function useScrollbar(el: () => HTMLElement | null, options?: ScrollbarOptions): ScrollbarReturn
```

Attach custom scrollbar to a scrollable container.
Creates a wrapper around the container with overlay track+thumb elements
that stay fixed relative to the visible area (not the scroll content).

## `useSortable`

```ts
import { useSortable } from '@pdxui/core';

function useSortable(el: () => HTMLElement | null, options: SortableOptions<T>): SortableReturn
```

Drag-to-reorder within a list: pointer handling, the drop indicator, and the reordered result.

Works on pointer events, so touch and mouse take the same path. `handle` restricts the grab area
to a drag handle, which is what makes a list whose items also contain buttons usable.

`group` makes two lists one destination: an item dragged out of a list and into a sibling with
the same group name opens the space THERE, and on release the source is told `onRemove` and the
receiver `onReceive`.

## `useWritable`

```ts
import { useWritable } from '@pdxui/core';

function useWritable(key: string | symbol): Signal<T>
```

Composable: inject a writable signal from an ancestor.
Returns the full signal object (read + write), not just the value.
Must be called during setup().

Usage: const theme = useWritable<string>('theme');
       theme()      // read
       theme.set()  // write — propagates to provider

## `viewport`

```ts
import { viewport } from '@pdxui/core';

const viewport
```

Centralized viewport signals. One resize listener, many readers.
