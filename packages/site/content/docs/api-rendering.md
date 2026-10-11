---
title: Rendering API
description: "Templates, lists, conditional and deferred blocks, error boundaries, portals, transitions, keyframes, springs, tweens and the virtualizer."
order: 24
parent: api
---

# Rendering API

Templates, lists, conditional and deferred blocks, error boundaries, portals, transitions, keyframes, springs, tweens and the virtualizer. 45 exports, from `@pdxui/core`.

Part of the [API reference](/docs/api), generated from the source by `packages/site/scripts/gen-api.mjs`.

## `__staticHTML`

```ts
import { __staticHTML } from '@pdxui/core';

function __staticHTML(content: string): DocumentFragment
```

Pre-compile static HTML into a cached template. Faster than html`` for fully static content.
 Used by the compiler in production mode for components with no reactive bindings.

## `animateSharedElement`

```ts
import { animateSharedElement } from '@pdxui/core';

function animateSharedElement(el: HTMLElement, fromRect: DOMRect, options?: SharedElementOptions): Promise<void>
```

FLIP-animate an element from where it WAS to where it is now.

Capture the rect with {@link captureRect} before the DOM changes, then call this after: it applies
the inverse transform and animates it away, so the element appears to travel between the two
positions. That is how a thumbnail becomes a header image across a route change.

Transform and opacity only — the properties the compositor can animate without layout — which is
why it stays smooth where animating `top`/`left` would not.

## `assignBoundProperty`

```ts
import { assignBoundProperty } from '@pdxui/core';

function assignBoundProperty(el: Element, prop: string, value: unknown): void
```

Assign a bound value to a property.

A component installs its prop accessors when it connects, and a template binds while it builds the
fragment, before that. Most names are then simply absent, and assigning leaves an own data
property that the component takes over as a pre-upgrade value. A name the DOM also has as a bare
getter — `offsetTop` on pdx-affix, `prefix` on pdx-input — is not absent: assigning reaches the
native getter and throws "which has only a getter". On a custom element that value is defined as
the element's own data property instead, the same thing the plain assignment leaves for any other
name.

The prototype walk runs only while the element has no own property of that name, which after the
component's setup it always has. The inline build calls this too, for a component's props.

## `awaitReady`

```ts
import { awaitReady } from '@pdxui/core';

function awaitReady(value: unknown): boolean
```

The condition `@await` switches on — for a promise, whether it has settled.

A plain truthiness switch (`when(() => x, …)`) cannot serve `@await (x)`: a Promise object is
always truthy, and the body would render at once and forever, pending or rejected. So:
  - a thenable → `false` while pending, `true` once fulfilled, and when it REJECTS this throws the
    reason (as an Error) — which the error boundary the compiler emits for `@error` catches;
  - anything else → its truthiness, so `@await (appReady)` is a plain condition.

⚠️ The expression must yield the SAME promise each time it is evaluated. A call that makes a new
promise per evaluation (`@await (fetchUser())`) starts over on every re-run and never settles —
store the promise, or use a resource.

## `awaitTimed`

```ts
import { awaitTimed } from '@pdxui/core';

function awaitTimed(condition: () => boolean, thenFn: () => Node | DocumentFragment, loadingFn: (() => Node | DocumentFragment | null) | null, options: { minMs?: number; maxMs?: number }): DocumentFragment
```

Timed conditional rendering for @await { minMs, maxMs }.
- minMs: don't show loading until this delay (avoid flash for fast loads)
- maxMs: force timeout error after this duration

Usage:
  ${awaitTimed(() => ready(), () => html`<main/>`, () => html`<loading/>`, { minMs: 200 })}

## `bindGesture`

```ts
import { bindGesture } from '@pdxui/core';

function bindGesture(el: Element, name: string, value: unknown): boolean
```

Wire a gesture directive the compiler emits — `@__swipe` with `[direction, handler]`, `@__longpress`
and `@__pinch` with a handler — to the pointer gesture it names. `name` is the attribute without
its `@`. False for any other name, which is an ordinary event. Both render paths call it: the
template path's `bindAttribute` before its generic event branch, the inline path directly (#99).

## `bindInterpolation`

```ts
import { bindInterpolation } from '@pdxui/core';

function bindInterpolation(anchor: Text, value: () => unknown): void
```

Render what `value()` returns where `anchor`, an empty text node already in place, stands, and follow
it: a primitive is the anchor's text (`interpolationText`), a Node, a fragment or an array is put in
as nodes. Both render paths interpolate through it — the inline path wrote only text, so an array
read `a,b` in a production build and `ab` in dev (#100).

## `bindTwoWay`

```ts
import { bindTwoWay } from '@pdxui/core';

function bindTwoWay(el: Element, descriptor: string, value: TemplateValue): void
```

Two-way binding with optional modifiers (.trim, .number, .lazy): `::value`, `::checked`.

The inline build calls this too, so the two builds listen the same way: a component through its
`pdx-input`/`pdx-change` and their `detail`, a `<select>` and a checkbox through `change`. The
inline path had its own copy that listened to `input` on everything, and `::value` was one-way
on a component in a production build (#97).

## `captureRect`

```ts
import { captureRect } from '@pdxui/core';

function captureRect(el: HTMLElement): DOMRect
```

Animate an element from one position/size to another (FLIP technique).
Used for: list reorder, modal open from card, page transitions.

@example
const first = captureRect(sourceEl);
// ... DOM changes (move element, change route) ...
animateSharedElement(targetEl, first, { duration: 400 });

## `clearBoundProperty`

```ts
import { clearBoundProperty } from '@pdxui/core';

function clearBoundProperty(el: Element, attr: string, prop: string): void
```

A bound value went to null or undefined on a PLAIN element's property `prop`, bound as `attr`.
What "no value" means follows the type the property holds, as Vue's `patchDOMProp` does:

- boolean (`checked`, `disabled`) → false;
- string (`value`, `textContent`, `title`) → '' and the attribute goes. Removing the attribute
  alone leaves live state on screen: a field's `value` and a node's text are not their attribute;
- anything else — a number (`maxLength`, `tabIndex`), an object (`style`) → the attribute goes, and
  nothing is assigned: `maxLength = null` coerces to 0, a field that takes no characters, and
  `style = null` does not clear the inline style everywhere (happy-dom keeps it).

The inline build calls this too, so both builds clear a property the same way.

## `createVirtualizer`

```ts
import { createVirtualizer } from '@pdxui/core';

function createVirtualizer(options: VirtualizerOptions): VirtualizerReturn
```

Render only the rows that are on screen: given a count and a size estimate, it returns the window
to draw and the total height to reserve.

`estimateSize` may be wrong — `measureElement` corrects it from the DOM as rows render, which is
what makes variable-height content work without measuring everything up front.

`overscan` (3) is how many rows to draw beyond the viewport: too few and fast scrolling shows
blank space, too many and the saving disappears.

## `defer`

```ts
import { defer } from '@pdxui/core';

function defer(options: DeferOptions, loadFn: (() => Promise<unknown>) | null, renderFn: (module?: unknown) => Node | DocumentFragment): DocumentFragment
```

Lazy-load content when trigger conditions are met.

Usage:
  ${defer({
    trigger: 'viewport | idle(2000)',
    placeholder: () => html`<div class="skeleton">...</div>`,
    loading: () => html`<spinner/>`,
  }, () => import('./heavy-chart.js'), (mod) => html`<heavy-chart/>`)}

Simple usage (no dynamic import):
  ${defer({ trigger: 'viewport' },
    null,
    () => html`<div class="heavy">Loaded!</div>`)}

## `dynamic`

```ts
import { dynamic } from '@pdxui/core';

function dynamic(tagFn: () => string, propsFn?: (() => Record<string, unknown>) | null, options?: DynamicOptions): DocumentFragment
```

Dynamically render a component by tag name with enhanced features.
Reactively creates/destroys/caches elements when the tag changes.

@param tagFn - Reactive function returning component tag name
@param propsFn - Optional reactive function returning props to pass
@param options - Keep-alive, transitions, lazy loading options

## `each`

```ts
import { each } from '@pdxui/core';

function each(items: () => T[], key: string | ((item: T, index: number) => unknown), renderFn: (item: T, index: number) => Node, options?: TransitionOptions): DocumentFragment
```

Keyed list rendering with string key support.
Thin wrapper over repeat() with friendlier API.

Usage:
  ${each(() => items(), 'id', (item) => html`<div>${item.name}</div>`)}
  ${each(() => items(), (item) => item.id, (item) => html`<div>${item.name}</div>`)}

## `eachRow`

```ts
import { eachRow } from '@pdxui/core';

function eachRow(items: () => T[], key: string | ((item: T, index: number) => unknown), renderFn: (item: () => T, index: () => number) => Node, options?: TransitionOptions): DocumentFragment
```

Keyed list whose rows see their CURRENT item — what `@for` compiles to.

Like {@link each}, but `renderFn` receives getters: `item()` and `index()`. A row reused for the
same key keeps its DOM node, and its getters move to the new object and position, so an immutable
update (`rows.map(r => r.id === id ? { ...r, done: true } : r)`) reaches the row's bindings. With
`each()` the row's closures keep the object it was created with. Read the getters
inside a binding (`${() => item().name}`) — a read while the row is built is a snapshot.

## `easings`

```ts
import { easings } from '@pdxui/core';

const easings
```

The easing curves `tween()` accepts, as plain `(t: number) => number` on 0..1.

Prefer an `easeOut*` for anything the user triggered: it moves fastest at the start, so the
interface feels like it responded immediately. `easeInOut*` suits something moving on its own,
`linear` suits a progress bar and almost nothing else.

Any function of the same shape works — this is a convenience set, not a closed list.

## `enter`

```ts
import { enter } from '@pdxui/core';

function enter(node: Node, animation?: string): Promise<void>
```

Apply enter transition to a node. Adds CSS classes, waits for transition, removes classes.
Returns a Promise that resolves when the transition completes.

## `errorBoundary`

```ts
import { errorBoundary } from '@pdxui/core';

function errorBoundary(contentFn: () => Node | DocumentFragment, fallbackFn: (error: Error, retry: () => void) => Node | DocumentFragment, options?: ErrorBoundaryOptions): DocumentFragment
```

Wrap content in an error boundary. If the content function or any of its
reactive effects throw, the fallback is rendered instead.

@param contentFn — function that renders the content
@param fallbackFn — function that renders the fallback (receives error + retry fn)
@param options — optional: maxRetries, autoRetry, retryDelay, onError callback

## `exit`

```ts
import { exit } from '@pdxui/core';

function exit(node: Node, animation?: string): Promise<void>
```

Apply exit transition to a node. Adds CSS classes, waits for transition, then removes the node.
Returns a Promise that resolves when the node is removed.

## `flipAnimate`

```ts
import { flipAnimate } from '@pdxui/core';

function flipAnimate(oldPositions: Map<Element, Rect>, nodes: Node[], duration = 300): void
```

FLIP animate elements that changed position after a DOM mutation.
Compares old positions to new positions and animates the delta.

@param oldPositions - Map from recordPositions() before mutation
@param nodes - Current nodes after mutation
@param duration - Animation duration in ms (default 300)

## `html`

```ts
import { html } from '@pdxui/core';

function html(strings: TemplateStringsArray, ...values: TemplateValue[]): DocumentFragment
```

Tagged template literal that produces reactive DOM. It needs a DOM: where there is none it throws,
naming the call, instead of returning something that is not a fragment. Module evaluation never
calls it, so a module that uses it still imports.

## `injectTransitionCSS`

```ts
import { injectTransitionCSS } from '@pdxui/core';

function injectTransitionCSS(): void
```

Inject the stylesheet the built-in transitions need (fade, slide, scale, collapse), once.

Idempotent and SSR-safe: repeated calls do nothing and it is a no-op without a `document`. Call it
only if you use the transition class names WITHOUT `@pdxui/design`, which already ships them —
otherwise you get the same rules twice.

## `insert`

```ts
import { insert } from '@pdxui/core';

function insert(parent: Node, node: Node, before?: Node | null): void
```

Insert a node before a marker, or append to parent.

## `interpolationText`

```ts
import { interpolationText } from '@pdxui/core';

function interpolationText(value: unknown): string
```

The text a value renders as when it is interpolated: `null`, `undefined` and `false` are empty text,
so `{{ user?.name }}` and `{{ busy && 'Saving…' }}` print nothing rather than a word; anything else
is `String(value)`, `0` included.

The inline build writes its text nodes through this too, so a page reads the same in dev and in a
production build: a plain `String(value)` would show `null` and `false`.

## `keyframes`

```ts
import { keyframes } from '@pdxui/core';

function keyframes(name: string, frames: Keyframe[], options?: KeyframeAnimationOptions): AnimationConfig
```

Define a reusable keyframe animation.

Usage:
  const bounce = keyframes('bounce', [
    { offset: 0, transform: 'translateY(0)' },
    { offset: 0.5, transform: 'translateY(-20px)' },
    { offset: 1, transform: 'translateY(0)' },
  ], { duration: 500, easing: 'ease-out' });

## `marker`

```ts
import { marker } from '@pdxui/core';

function marker(label?: string): Comment
```

Create a comment marker for conditional/list boundaries.

## `match`

```ts
import { match } from '@pdxui/core';

function match(value: () => T, cases: Record<string, () => Node | DocumentFragment> & { _?: () => Node | DocumentFragment }): DocumentFragment
```

Switch/case rendering. Reactively renders the matching case.
Use `_` key as default/fallback case.

Usage:
  ${match(() => status(), {
      active: () => html`<span class="green">Active</span>`,
      inactive: () => html`<span class="red">Inactive</span>`,
      _: () => html`<span>Unknown</span>`,
  })}

## `pages`

```ts
import { pages } from '@pdxui/core';

function pages(activePage: () => K, pageMap: Record<K, () => Node | DocumentFragment>): DocumentFragment
```

Render one page at a time, caching previous pages (keep-alive).
Pages are created lazily on first visit and hidden (not destroyed) when inactive.

@param activePage - Reactive function returning the current page key.
@param pageMap - Map of page key → render function.
@returns DocumentFragment with all cached pages (only active one is visible).

## `playKeyframes`

```ts
import { playKeyframes } from '@pdxui/core';

function playKeyframes(el: HTMLElement, config: AnimationConfig): Promise<void>
```

Play a keyframe animation on an element. Returns a Promise.
Used by enter()/exit() when they receive an AnimationConfig instead of a string.

## `portal`

```ts
import { portal } from '@pdxui/core';

function portal(contentFn: () => Node | DocumentFragment, target: string | Element, options?: PortalOptions): DocumentFragment
```

Render content into a different part of the document, while it stays owned by the component that
declared it.

For anything that must escape an ancestor's `overflow: hidden`, `transform` or stacking context —
a dropdown inside a scrolling panel, a modal inside a card. The content is created here, so its
effects are disposed with this subtree even though the nodes live elsewhere; that ownership is the
reason to use this rather than `document.body.appendChild`.

`enter`/`exit` name CSS classes for the transitions.

## `recordPositions`

```ts
import { recordPositions } from '@pdxui/core';

function recordPositions(nodes: Node[]): Map<Element, Rect>
```

Record positions of elements before a DOM mutation.
Returns a map of element → bounding rect.

## `remove`

```ts
import { remove } from '@pdxui/core';

function remove(node: Node): void
```

Remove a node from its parent.

## `renderSlot`

```ts
import { renderSlot } from '@pdxui/core';

function renderSlot(slots: Record<string, SlotFunction> | undefined, name: string, scopeFn: (() => Record<string, unknown>) | null, defaultFn: () => Node | DocumentFragment): DocumentFragment
```

Render a scoped slot. If the parent provided a slot function, call it with scope data.
Otherwise, render the default content.

## `repeat`

```ts
import { repeat } from '@pdxui/core';

function repeat(items: (() => T[]), keyFn: (item: T, index: number) => unknown, renderFn: (item: T, index: number) => Node, options?: RepeatOptions): DocumentFragment
```

Renders a reactive list with keyed reconciliation.

@param items - Signal or function returning the array
@param keyFn - Extracts a unique key from each item
@param renderFn - Creates DOM for a single item
@param options - Transition options (enter, exit, move)
@returns A DocumentFragment with a start/end marker; updates automatically

## `repeatWithSlot`

```ts
import { repeatWithSlot } from '@pdxui/core';

function repeatWithSlot(items: () => T[], keyFn: (item: T, index: number) => unknown, slotFn: SlotFunction | undefined | null, renderFn: ((item: T, index: number) => Node) | null, defaultFn: (item: T, index: number) => Node, scopeMapper?: (item: T, index: number) => Record<string, unknown>, options?: RepeatOptions): DocumentFragment
```

Renders a reactive keyed list using the best available renderer.

Priority: slot template (declarative) > render callback (imperative) > default.
The slot function is called once per item inside repeat()'s reconciliation —
it does NOT create a separate effect per item.

@param items - Signal or getter returning the array
@param keyFn - Unique key extractor per item
@param slotFn - Parent-provided scoped slot (from ctx.__slots)
@param renderFn - Imperative render callback prop (backward compat)
@param defaultFn - Built-in default renderer
@param scopeMapper - Converts (item, index) to the slot scope object
@param options - Transition options for enter/exit/move animations

## `setProp`

```ts
import { setProp } from '@pdxui/core';

function setProp(el: Element, key: string, value: unknown): void
```

Set a property or attribute on an element. Handles special cases (events, boolean attrs, style, class).

## `show`

```ts
import { show } from '@pdxui/core';

function show(condition: () => boolean, content: Node | DocumentFragment): DocumentFragment
```

Show/hide without removing from DOM. Toggles display:none.
Unlike when(), preserves element state (scroll, canvas, form values).

Usage:
  ${show(() => isVisible(), html`<div class="panel">...</div>`)}

## `slotCarrier`

```ts
import { slotCarrier } from '@pdxui/core';

function slotCarrier(name: string, fn: SlotFunction): HTMLElement
```

Create a carrier element that transports a slot function from parent to child.
The child's _projectSlots() extracts this during mount.
Generated by the compiler for @slot(name, { vars }) { body } directives.

## `spring`

```ts
import { spring } from '@pdxui/core';

function spring(config?: SpringConfig): string
```

Generate a CSS `linear()` easing string that approximates spring physics.
Uses CSS `linear()` (Baseline 2024) with sampled spring simulation.

Usage:
  const ease = spring({ stiffness: 300, damping: 20 });
  element.style.transitionTimingFunction = ease;
  // → "linear(0, 0.042, 0.158, 0.336, ...)"

@returns CSS easing string for use in transition-timing-function

## `templatePipe`

```ts
import { templatePipe } from '@pdxui/core';

function pipe(value: T, ...transforms: ((v: any) => any)[]): unknown
```

Value transformation chain. Applies transforms left-to-right.

Usage:
  ${pipe(item.price, currency, compact)}
  :text=${() => pipe(name(), uppercase, truncate(20))}

## `text`

```ts
import { text } from '@pdxui/core';

function text(value: string): Text
```

Create a text node. SSR returns null-safe stub.

## `tween`

```ts
import { tween } from '@pdxui/core';

function tween(target: () => number, config?: TweenConfig): TweenSignal
```

Animate a numeric signal smoothly between values.
When the target signal changes, the tween interpolates over duration.

Usage:
  const target = signal(0);
  const smooth = tween(() => target());
  target.set(100); // smooth animates 0→100 over 300ms

  effect(() => {
    element.style.transform = `translateX(${smooth()}px)`;
  });

## `tweenMulti`

```ts
import { tweenMulti } from '@pdxui/core';

function tweenMulti(targets: Record<K, () => number>, config?: TweenConfig): TweenMultiSignal<K>
```

Animate multiple numeric values simultaneously.

Usage:
  const pos = tweenMulti({ x: () => targetX(), y: () => targetY() }, { duration: 500 });
  effect(() => {
    const { x, y } = pos();
    el.style.transform = `translate(${x}px, ${y}px)`;
  });

## `useScrollAnimation`

```ts
import { useScrollAnimation } from '@pdxui/core';

function useScrollAnimation(el: () => HTMLElement | null, options?: ScrollAnimationOptions): ScrollAnimationReturn
```

Reveal-on-scroll: toggles a class when an element enters the viewport, and reports the
intersection ratio.

Uses IntersectionObserver, so it costs nothing per frame — unlike a scroll listener, which is the
usual way this gets written. `once: true` stops observing after the first entry, which is what a
one-shot reveal wants; leaving it false re-triggers on the way back.

Respect `prefers-reduced-motion` in the CSS the class drives: this only adds the class.

## `when`

```ts
import { when } from '@pdxui/core';

function when(condition: () => boolean, thenFn: () => Node | DocumentFragment, elseFn?: (() => Node | DocumentFragment | null) | null, options?: TransitionOptions): DocumentFragment
```

Conditional rendering. Reactively shows thenFn or elseFn based on condition.
Supports enter/exit transitions when TransitionOptions are provided.

Usage:
  ${when(() => isOpen(), () => html`<span>Open!</span>`)}
  ${when(() => isOpen(), () => html`<span>Yes</span>`, () => html`<span>No</span>`,
         { enter: 'fade-in', exit: 'fade-out' })}
