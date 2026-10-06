---
title: API reference
description: "Every value export of @pdxui/core and @pdxui/router, with the import specifier that works. Generated from the source."
order: 24
---

# API reference

Generated from the source by `packages/site/scripts/gen-api.mjs` — every value export of
the packages below, with the specifier that actually imports it. The prose pages are the
place to start; this is the index they link into.

A symbol reachable only from a sub-path shows that sub-path. `mount` is in
`@pdxui/core/testing`, not in the barrel, and that distinction is what this page exists
to make visible.

## @pdxui/core

434 value exports.

### `__adoptStyles`

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

### `__pdx_debug`

```ts
import { __pdx_debug } from '@pdxui/core';

const __pdx_debug
```

The debug namespace: an export of `@pdxui/core`, and in development the same object as
`window.__PDX_DEVTOOLS__.debug`, which the devtools overlay and the console read.

### `__pdx_hmr_rerender`

```ts
import { __pdx_hmr_rerender } from '@pdxui/core';

function __pdx_hmr_rerender(tag: string): void
```

INTERNAL. Re-render every live instance of a tag after a hot update.

The Vite plugin emits a call to this; a custom element cannot be redefined, so HMR re-runs the
body of the instances already in the page instead. The `__pdx_` prefix marks it as machinery — it
is exported because generated code has to reach it, not because an application should call it.

### `__pdx_hmr_restore`

```ts
import { __pdx_hmr_restore } from '@pdxui/core';

function __pdx_hmr_restore(tag: string): void
```

Restore HMR state for newly created instances of a given tag.

### `__pdx_hmr_save`

```ts
import { __pdx_hmr_save } from '@pdxui/core';

function __pdx_hmr_save(tag: string): void
```

Save HMR state for all instances of a given tag.

### `__pdx_hmr_swap`

```ts
import { __pdx_hmr_swap } from '@pdxui/core';

function __pdx_hmr_swap(tag: string): void
```

HMR: swap prototypes of all live instances to the latest class version.
Then re-render each instance by clearing DOM and calling body() again.

### `__staticHTML`

```ts
import { __staticHTML } from '@pdxui/core';

function __staticHTML(content: string): DocumentFragment
```

Pre-compile static HTML into a cached template. Faster than html`` for fully static content.
 Used by the compiler in production mode for components with no reactive bindings.

### `$d`

```ts
import { $d } from '@pdxui/core';

function $d(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string
```

Format a date according to the current locale.
Reactive: re-formats when locale changes.

@example
$d(new Date())                      // "3/29/2026" (en) / "29/03/2026" (it)
$d('2026-03-29', { dateStyle: 'long' })  // "March 29, 2026" (en)

### `$n`

```ts
import { $n } from '@pdxui/core';

function $n(value: number, options?: Intl.NumberFormatOptions): string
```

Format a number according to the current locale.
Reactive: re-formats when locale changes.

@example
$n(1234.5)                          // "1,234.5" (en) / "1.234,5" (it)
$n(0.75, { style: 'percent' })      // "75%"
$n(9.99, { style: 'currency', currency: 'EUR' }) // "9,99 EUR" (it)

### `$r`

```ts
import { $r } from '@pdxui/core';

function $r(value: number, unit: RelativeTimeUnit): string
```

Format a relative time value according to the current locale.
Reactive: re-formats when locale changes.

@example
$r(-1, 'day')   // "1 day ago" (en) / "1 giorno fa" (it)
$r(3, 'hour')   // "in 3 hours" (en) / "tra 3 ore" (it)

### `$t`

```ts
import { $t } from '@pdxui/core';

function $t(key: PdxMessageKey, params?: Record<string, unknown>): string
```

Translate a key with optional parameter interpolation and ICU plurals.
Reads the reactive locale signal — any computed/$effect calling $t() re-runs on locale change.

@example
$t('welcome')                       // simple
$t('hello', { name: 'Alice' })      // interpolation
$t('items', { count: 5 })           // ICU plural

### `AbortError`

```ts
import { AbortError } from '@pdxui/core';

class AbortError
```

Error thrown when a request is aborted (timeout or manual).

### `actions`

```ts
import { actions } from '@pdxui/core';

function actions(list: CellAction[]): CellActionsSpec
```

Render a row of buttons in the cell — edit, delete, whatever the row affords.

Each action carries its own label, icon and handler, and receives the row when clicked. Buttons,
not links: these do something to the row rather than navigate, and the distinction is what a
keyboard and a screen reader go by.

### `adaptive`

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

### `adaptiveValue`

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

### `addDays`

```ts
import { addDays } from '@pdxui/core';

function addDays(iso: string, days: number): string
```

Shift an ISO date (`YYYY-MM-DD`) by whole days. Negative goes backwards.

Goes through the Julian day number rather than `Date`, so it has no time component, no timezone
and no DST: adding 1 to a date the day before a clock change still gives the next calendar day.

### `addMonths`

```ts
import { addMonths } from '@pdxui/core';

function addMonths(iso: string, months: number): string
```

Shift an ISO date by whole months, clamping the day to the target month's length.

2026-01-31 plus one month is 2026-02-28, not 2026-03-03. That clamping is the reason this exists
rather than adding 30 days: month arithmetic is what a date picker's next/previous does, and users
expect the day of the month to stay put where it can.

### `addYears`

```ts
import { addYears } from '@pdxui/core';

function addYears(iso: string, years: number): string
```

Shift an ISO date by whole years, clamping the day the same way {@link addMonths} does.

2024-02-29 plus one year is 2025-02-28: the only date where this is visible, and the only reason
this is not `addMonths(iso, years * 12)`.

### `aggregateColumn`

```ts
import { aggregateColumn } from '@pdxui/core';

function aggregateColumn(values: unknown[], spec: AggregateSpec): unknown
```

Compute a single aggregate over a column's raw values. Single source of truth used by both
per-group aggregates and the footer summary row. Handles the enum forms AND the function form,
normalizing the `'avg'` ↔ `'average'` alias (AggregateType uses `avg`, AggregateDescriptor uses
`average`). `count` counts all values (including null); numeric aggregates ignore null/NaN.

### `animateSharedElement`

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

### `announce`

```ts
import { announce } from '@pdxui/core';

function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void
```

Announce a message to screen readers via ARIA live region.

Usage:
  announce('Item added to cart');
  announce('Error: invalid email', 'assertive');

### `applySafeArea`

```ts
import { applySafeArea } from '@pdxui/core';

function applySafeArea(el: HTMLElement): void
```

Apply safe area insets to an overlay element (for notch, home indicator).
Sets CSS environment variables as padding.

### `applyTheme`

```ts
import { applyTheme } from '@pdxui/core';

function applyTheme(theme: Record<string, string>, target?: Element): void
```

Apply a theme by setting all its CSS variables on target (default: :root).

### `arrayTransport`

```ts
import { arrayTransport } from '@pdxui/core';

function arrayTransport(options: ArrayTransportOptions<T>): IDataTransport<T>
```

A {@link createDataSource} backend over an in-memory array: sorting, filtering, paging, grouping
and CRUD, all client-side.

It works on a COPY of the array it is given, so the caller's data is never mutated behind its
back. Use it when the whole dataset is already in the browser — a picker's options, a settings
table — and note the ceiling: everything is O(n) per operation, so a few thousand rows is the
point where a server-side transport earns its keep.

### `arrow`

```ts
import { arrow } from '@pdxui/core';

function arrow(options: ArrowOptions): Middleware
```

Compute the arrow position relative to the floating element.

### `assignBoundProperty`

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

### `authMiddleware`

```ts
import { authMiddleware } from '@pdxui/core';

function authMiddleware(options: AuthMiddlewareOptions): HttpMiddleware
```

Attaches a credential header to every request, asking for the token per request rather than
holding one.

`getToken` is called on each request and may be async, which is what lets a token refresh happen
transparently: return the fresh token and the request carries it. Returning `null` sends the
request unauthenticated rather than failing it. Requests marked `meta.skipAuth` are skipped, so a
login or token-refresh call does not send the credential it is trying to obtain.

The token is never cached here and never appears in an error or a log — {@link logMiddleware}
redacts the header by name.

### `autoUpdate`

```ts
import { autoUpdate } from '@pdxui/core';

function autoUpdate(reference: HTMLElement | VirtualElement, floating: HTMLElement, update: () => void): Dispose
```

Listen for scroll/resize events and call `update` whenever the position
may have changed. Returns a Dispose function to remove listeners.

### `awaitReady`

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

### `awaitTimed`

```ts
import { awaitTimed } from '@pdxui/core';

function awaitTimed(condition: () => boolean, thenFn: () => Node | DocumentFragment, loadingFn: (() => Node | DocumentFragment | null) | null, options: { minMs?: number; maxMs?: number }): DocumentFragment
```

Timed conditional rendering for @await { minMs, maxMs }.
- minMs: don't show loading until this delay (avoid flash for fast loads)
- maxMs: force timeout error after this duration

Usage:
  ${awaitTimed(() => ready(), () => html`<main/>`, () => html`<loading/>`, { minMs: 200 })}

### `badge`

```ts
import { badge } from '@pdxui/core';

function badge(opts?: { tones?: Record<string, string>; tone?: string }): CellBadgeSpec
```

Render the cell as a badge, with a tone chosen per value.

`tones` maps the value to a tone name (`{ Active: 'success', Suspended: 'danger' }`); `tone` sets
one for every row. A value with no entry renders in the default tone rather than failing.

### `batch`

```ts
import { batch } from '@pdxui/core';

function batch(fn: () => void): void
```

Group writes so subscribers run once, after all of them.

Mostly unnecessary: synchronous writes are batched automatically, so this is for the cases the
automatic batching cannot see — writes spread across an `await`, or inside a callback the runtime
did not schedule. Wrapping ordinary code in it changes nothing.

Nested calls flush once, at the outermost exit.

### `booleanIcon`

```ts
import { booleanIcon } from '@pdxui/core';

function booleanIcon(opts?: { trueLabel?: string; falseLabel?: string }): CellBooleanIconSpec
```

Render a boolean as a check or a cross, with an accessible label for each.

The labels are not decoration: an icon alone tells a screen reader nothing, so `trueLabel` /
`falseLabel` are what the cell actually announces.

### `captureRect`

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

### `catchError`

```ts
import { catchError } from '@pdxui/core';

function catchError(handler: (error: unknown) => T): SignalOperator<T, T>
```

Catch errors in the pipeline and recover with a fallback value.

### `clampDate`

```ts
import { clampDate } from '@pdxui/core';

function clampDate(iso: string, min?: string, max?: string): string
```

Pull an ISO date inside `[min, max]`, returning the nearest bound when it falls outside. Either
bound may be omitted.

What a date input does with typed input before accepting it, so the value it emits is always
inside the range the component advertises.

### `cleanup`

```ts
import { cleanup } from '@pdxui/core/testing';

function cleanup(): void
```

Remove all mounted containers from the DOM.

### `clear`

```ts
import { clear } from '@pdxui/core/testing';

function clear(element: HTMLElement): Promise<void>
```

Clear an input's value.

### `clearBoundProperty`

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

### `clearComponentStrings`

```ts
import { clearComponentStrings } from '@pdxui/core';

function clearComponentStrings(): void
```

Clear all string overrides (reset to defaults). The defaults stay: they were registered by the
component modules, which will not run again.

### `clearFormatCache`

```ts
import { clearFormatCache } from '@pdxui/core/i18n';

function clearFormatCache(): void
```

Clear all formatter caches (for testing).

### `clearGlobalErrorHandlers`

```ts
import { clearGlobalErrorHandlers } from '@pdxui/core';

function clearGlobalErrorHandlers(): void
```

Clear all handlers (for testing).

### `clearIconSets`

```ts
import { clearIconSets } from '@pdxui/core';

function clearIconSets(): void
```

Remove all registered icon sets. Useful for testing.

### `clearLoadedLocales`

```ts
import { clearLoadedLocales } from '@pdxui/core/i18n';

function clearLoadedLocales(): void
```

Clear loaded tracking (for testing).

### `clearProviders`

```ts
import { clearProviders } from '@pdxui/core';

function clearProviders(): void
```

Clear all global providers (for testing).

### `clearRouteTrail`

```ts
import { clearRouteTrail } from '@pdxui/core';

function clearRouteTrail(): void
```

Back to empty — for a test, and for an app that tears its router down.

### `clearStores`

```ts
import { clearStores } from '@pdxui/core';

function clearStores(): void
```

Clear all registered stores (for testing).

### `clearTranslations`

```ts
import { clearTranslations } from '@pdxui/core/i18n';

function clearTranslations(): void
```

Clear all loaded translations (for testing).

### `clearValidationLocale`

```ts
import { clearValidationLocale } from '@pdxui/core';

function clearValidationLocale(): void
```

Clear the locale resolver (for testing).

### `click`

```ts
import { click } from '@pdxui/core/testing';

function click(element: HTMLElement): Promise<void>
```

Simulate a click.

### `clientGroup`

```ts
import { clientGroup } from '@pdxui/core';

function clientGroup(items: T[], groups: GroupDescriptor[]): GroupResult<T>[]
```

Group items by descriptors (recursive for multi-level).

### `clientSort`

```ts
import { clientSort } from '@pdxui/core';

function clientSort(items: T[], sort: SortDescriptor[]): T[]
```

Sort items by multiple fields (stable sort).

### `collectDisposers`

```ts
import { collectDisposers } from '@pdxui/core';

function collectDisposers(fn: () => T): [T, Dispose]
```

Run `fn` while collecting every effect/disposer created within it; return the
result together with a single idempotent Dispose that tears them all down.
Nested scopes compose: disposing an outer scope disposes the effects it owns,
whose own cleanups dispose their inner scopes recursively.

### `columnsToFormFields`

```ts
import { columnsToFormFields } from '@pdxui/core';

function columnsToFormFields(columns: ResolvedColumn[]): FormFieldSchema[]
```

Convert editable columns to form field schemas.

### `columnTypeToFormType`

```ts
import { columnTypeToFormType } from '@pdxui/core';

function columnTypeToFormType(colType: ColumnType | undefined): FormFieldType
```

Map column type to form field type.

### `compareDates`

```ts
import { compareDates } from '@pdxui/core';

function compareDates(a: string, b: string): number
```

Order two ISO dates: negative if `a` is earlier, 0 if equal, positive if later — the shape
`Array.prototype.sort` wants.

A plain string comparison, which is correct because `YYYY-MM-DD` is fixed-width and zero-padded:
lexicographic order IS chronological order. Reach for this rather than `new Date(a) - new Date(b)`,
which parses, allocates and drags a timezone in.

### `component`

```ts
import { component } from '@pdxui/core';

function component(tag: string, options: ComponentOptions<P>): void
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

### `componentStringsChanged`

```ts
import { componentStringsChanged } from '@pdxui/core';

const componentStringsChanged: ReadonlySignal<unknown>
```

A dependency that changes whenever ANY registered string changes.

`getComponentString()` is reactive per key, which serves a template that reads it. What it does
not serve is a component that writes a string into an ATTRIBUTE — `aria-label`, where a library
string usually lands — because that write happens once, imperatively, and nothing re-runs it.
`uiAttr()` in `@pdxui/ui` re-applies those writes, and this is what tells it when.

The VALUE is not meant to be read; the subscription is the point. A fresh array each time, so a
reader is notified whether a key changed, was added, or a whole locale was installed.

### `computed`

```ts
import { computed } from '@pdxui/core';

function computed(fn: () => T, options?: ComputedOptions<T>): ReadonlySignal<T>
```

Derived signal — lazy recomputation with dirty flag + optional equality.

### `computeDiff`

```ts
import { computeDiff } from '@pdxui/core';

function computeDiff(original: T, updated: T): Partial<T> | null
```

Compute the diff between original and updated. Returns null if identical.

### `computeFloatingPosition`

```ts
import { computeFloatingPosition } from '@pdxui/core';

function computePosition(reference: HTMLElement | VirtualElement, floating: HTMLElement, options?: PositionOptions): PositionResult
```

Compute the position for a floating element relative to a reference.
Pure math — does NOT apply styles. Consumer applies x/y to the floating element.

### `concatSignal`

```ts
import { concatSignal } from '@pdxui/core';

function concatSignal(source: () => S, fetcher: (value: S, signal: AbortSignal) => Promise<T>): AsyncSignal<T>
```

Queue async operations — each waits for the previous to complete.
The RxJS concatMap equivalent.

Usage:
  const saveResult = concatSignal(
    () => saveTriggered(),
    (data) => fetch('/api/save', { method: 'POST', body: JSON.stringify(data) })
  );

### `configureClient`

```ts
import { configureClient } from '@pdxui/core';

function configureClient(config: HttpClientConfig): HttpClient
```

Configure and set the default HTTP client from config.

### `createAuthStore`

```ts
import { createAuthStore } from '@pdxui/core';

function createAuthStore(options?: AuthStoreOptions<TUser>): AuthStore<TUser>
```

Session state: the access and refresh tokens, the decoded user, and reactive `isAuthenticated`.

Tokens are attached only to trusted origins — same-origin, plus whatever `allowedOrigins` names.
That check is the point of the store: a bearer token appended to a URL that came from data is how
a credential leaves for someone else's server, and a store that attaches it to anything is one
redirect away from doing that.

`storageKey` persists across reloads, which trades the XSS exposure of anything in localStorage
for not asking the user to log in on every refresh; omit it to keep the session in memory only.
`decodeUser` turns claims into your own user type.

### `createBackdrop`

```ts
import { createBackdrop } from '@pdxui/core';

function createBackdrop(options?: BackdropOptions): BackdropResult
```

Create a backdrop overlay element with optional blur and click handler.

### `createBottomSheet`

```ts
import { createBottomSheet } from '@pdxui/core';

function createBottomSheet(content: Node, options?: BottomSheetOptions): BottomSheetResult
```

Create a bottom sheet (mobile-optimized overlay).
Fixed to bottom, draggable between detent points, swipe-down to dismiss.

### `createBus`

```ts
import { createBus } from '@pdxui/core';

function createBus(options?: BusOptions): EventBus<T>
```

Creates a typed event bus for inter-component communication.

Usage:
  interface AppEvents {
      'cart:add': { productId: number; qty: number };
      'cart:remove': { productId: number };
      'auth:logout': void;
  }
  const bus = createBus<AppEvents>();
  bus.emit('cart:add', { productId: 123, qty: 1 });
  const unsub = bus.on('cart:add', (item) => console.log(item));

With store (for debugging/replay):
  const bus = createBus<AppEvents>({ store: true });
  bus.history();   // → all emitted events
  bus.replay();    // → re-emits to current handlers

### `createCache`

```ts
import { createCache } from '@pdxui/core';

function createCache(config: CacheConfig = {}): Cache
```

A cache for resource results: keyed entries with a staleness clock, tag-based invalidation, an
LRU cap and a garbage collector.

Two clocks, and confusing them is the usual mistake: `staleTime` (30s) is how long a value is
served WITHOUT refetching, `gcTime` (5min) is how long it is kept at all. Between the two, a
cached value is still returned immediately and refreshed in the background.

Most apps never call this — {@link getDefaultCache} is created on first use. Make your own to
isolate a subsystem, or in a test that must not share state with another.

### `createChannel`

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

### `createCommands`

```ts
import { createCommands } from '@pdxui/core';

function createCommands(): Commands<T>
```

Create a typed command dispatcher (parent→child direction only).
Simpler than a full channel when bidirectional is not needed.

### `createCompoundParent`

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

### `createDataSource`

```ts
import { createDataSource } from '@pdxui/core';

function createDataSource(arg: T[] | DataSourceOptions<T>): DataSource<T>
```

The reactive state behind a list: paging, sorting, filtering and grouping, over any transport.

Pass an array and it uses {@link arrayTransport} — everything client-side; pass a `transport` and
the same API sends the descriptors to a server instead. That symmetry is the point: a grid built
against an array does not change when the data outgrows the browser.

`data()`, `total()`, `loading()` and `error()` are signals, so a template re-renders on a page or
sort change without being told to.

### `createDialogQueue`

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

### `createEditForm`

```ts
import { createEditForm } from '@pdxui/core';

function createEditForm(columns: ResolvedColumn[], row: Record<string, unknown>): Form<Record<string, unknown>>
```

Create a Form instance from grid columns + row data for editing.

### `createFieldArray`

```ts
import { createFieldArray } from '@pdxui/core';

function createFieldArray(initialValues: T[]): FieldArray<T>
```

A repeating group of fields — the "add another line" pattern.

Add a row with `append()`, `prepend()` or `insert()`; take one away with `remove()`; reorder with
`move()` or `swap()`; write one row with `update()`; read the plain values with `getValues()`, and
start over with `reset()`. There is no `add`.

**An item is a wrapper, not your object.** `items()` gives `{ __id, value }`, so a row's field is
`item.value.name` — `item.name` is undefined, and a template that writes it renders empty fields
and reports nothing.

```ts
const rooms = createFieldArray([{ type: 'kitchen', area: 0 }]);
rooms.append({ type: 'bath', area: 0 });
// one field of one row: rebuild that row's value and update it by index
rooms.update(0, { ...rooms.getValues()[0], area: 12 });
// @for (rooms.items() as room; track room.__id) { room.value.type, room.value.area }
```

The `__id` is a stable internal key that survives reorder, removal and `update()`. That is the
whole point: keyed by index, removing the second of three rows makes the third inherit the
second's DOM, its focus and its validation error. Render with `track item.__id`.

`replace()` takes the WHOLE array — `replace(values: T[])`, not an index and a value — and re-keys
every item, which is why writing a single field through `getValues()` + `replace()` costs every
other row its identity. Use `update()` for that.

Inside a form the same object is reached as `form.array('items')`, and its values are merged back
into `form.getValues()` and into submit.

This is the primitive, which draws nothing. `<pdx-field-list name="items" :form>` is the other
way to build repeating rows: a component that draws them, keeping each row as dotted paths in
the form (`items.0.name`) rather than as wrappers. **They do not compose** — the merge above
happens last, so calling `form.array(name)` on a name a field list manages discards what the
list has written. Pick one per name; the comparison is in the recipe "Rows that repeat".

### `createForm`

```ts
import { createForm } from '@pdxui/core';

function createForm(config: FormConfig<T>): Form<T>
```

A form as reactive state: values, errors, touched flags, validity and submission, from an initial
object and a set of validators.

Nested initial values are FLATTENED into dotted paths — `{ customer: { name } }` becomes
`'customer.name'` — so a field addresses itself the same way however deep it sits, and validators
are declared against one flat key space.

`validateOn` decides when errors appear: `onBlur` by default, because validating while someone is
still typing shows them an error for a value they have not finished writing. Async validators are
debounced (300ms) for the same reason.

In a `.pdx` file `@form UserDto` compiles to this, and `<pdx-form :form>` shares it with the
fields below it — which is what `provideForm`/`useForm` are for.

### `createFormCoordinator`

```ts
import { createFormCoordinator } from '@pdxui/core';

function createFormCoordinator(): FormCoordinator
```

Aggregates several independent forms into one: validate all, submit all, and one dirty/valid/
submitting flag over the lot.

For a screen made of sections that each own a form — a wizard step, a master-detail page — where
the Save button must reflect all of them and submitting must not start unless every one is valid.
`submitAll` validates FIRST and stops on failure, so a half-saved screen is not reachable through
it.

A parent provides the coordinator, children register themselves; unregistering on unmount is the
child's job, or a removed section keeps the button disabled forever.

### `createFormEngine`

```ts
import { createFormEngine } from '@pdxui/core';

function createFormEngine(): FormEngine
```

A form built from fields that register THEMSELVES, rather than from a schema declared up front.

The difference from {@link createForm}: there the field set is known when the form is created;
here each control registers on mount and unregisters on unmount, so the form's shape follows the
DOM. That is what a dynamic or generated form needs — `<pdx-auto-form>` builds on this.

Per-field state (value, errors, touched, validating) lives with the field; the engine aggregates.

### `createFormFromSchema`

```ts
import { createFormFromSchema } from '@pdxui/core';

function createFormFromSchema(schema: FormSchema): Form<Record<string, unknown>>
```

Create a Form instance from a FormSchema.
Automatically generates initialValues, validators, and fieldConfig.

### `createGlobalStore`

```ts
import { createGlobalStore } from '@pdxui/core';

function createGlobalStore(id: string, setupFn: () => T, options?: GlobalStoreOptions): T
```

Create or retrieve a singleton global store.
The setup function runs only once per store ID.
If persist is set, the store's signals are synced to storage.

@param id - Unique store identifier (compiler uses the @store name)
@param setupFn - Factory function that returns the store's public API
@param options - Optional persistence config
@returns The store instance (same reference for same ID)

### `createGridFromConfig`

```ts
import { createGridFromConfig } from '@pdxui/core';

function createGridFromConfig(config: DataGridConfig): GridFromConfig
```

Create a DataSource + ColumnDef[] + component props from a JSON config.

### `createHttpClient`

```ts
import { createHttpClient } from '@pdxui/core';

function createHttpClient(config: HttpClientConfig = {}): HttpClient
```

Build an HTTP client: a base URL, headers, a middleware chain and the request methods.

Two defaults are ON, because their absence is not a feature: a **30s timeout** (a request with no
deadline never settles — `loading` stays true forever and no error is produced) and **retry** for
idempotent methods. Both are overridable: `timeout: 0` disables the deadline, `retry: false` the
replay.

The chain order is deliberate and is the part worth knowing: retry sits OUTSIDE the caller's
middleware, so a retried attempt re-runs the whole chain (a refreshed token is picked up), and
INSIDE the timeout, which is applied per attempt — so a dead endpoint fails once at the deadline
instead of three times.

For one client shared across an app, see {@link configureClient} / {@link getDefaultClient}.

### `createI18nLoader`

```ts
import { createI18nLoader } from '@pdxui/core';

function createI18nLoader(config: LoaderConfig): I18nLoader
```

Create an i18n loader that auto-loads translations when locale changes.
Returns a loader with manual load() and dispose() methods.

@example
const loader = createI18nLoader({ mode: 'fetch', basePath: '/api/i18n' });
// Auto-loads when locale changes via effect()
// Manual: await loader.load('it');

### `createLiveRegion`

```ts
import { createLiveRegion } from '@pdxui/core';

function createLiveRegion(): LiveRegion
```

Create or get the global live region for screen reader announcements.

@example
const live = createLiveRegion();
live.announce('Item deleted'); // polite (default)
live.announce('Error: connection lost', 'assertive');

### `createOptionsSource`

```ts
import { createOptionsSource } from '@pdxui/core';

function createOptionsSource(loader: () => Promise<SelectOption[]>, options?: { cache?: boolean }): OptionsSource
```

Load a select's options once, cache them, and expose a `loading` signal while it happens.

The pattern every foreign-key or enum dropdown re-implements: fetch on first open, do not fetch
again, and do not fire a second request when the user opens the menu twice before the first
answers — concurrent calls share the in-flight promise rather than racing.

`reload()` forces a refetch, `peek()` reads the cache without triggering one, and `cache: false`
turns the whole thing into a plain loader for options that change per open.

### `createPortal`

```ts
import { createPortal } from '@pdxui/core';

function createPortal(content: Node, target?: string | HTMLElement): PortalResult
```

Create a portal: mount content into a target container (default: document.body).
Returns the wrapper element and a dispose function.

### `createSelection`

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

### `createSlotManager`

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

### `createTheme`

```ts
import { createTheme } from '@pdxui/core';

function createTheme(vars: Record<string, string>): Record<string, string>
```

Create a theme as a record of CSS variable values.

### `createToastQueue`

```ts
import { createToastQueue } from '@pdxui/core';

function createToastQueue(options?: ToastQueueOptions): ToastQueue
```

The state behind a toast stack: a capped list, per-toast auto-dismiss timers, and pause/resume.

`maxVisible` (5) is a cap, not a limit on what you may push — the overflow waits its turn, because
twenty stacked toasts communicate less than five.

`pause`/`resume` exist for hover: a message that disappears while it is being read is a message
that was not delivered. A component using this should pause on pointer-enter and on focus.

### `createTokenBridge`

```ts
import { createTokenBridge } from '@pdxui/core';

function createTokenBridge(prefix = '--pdx-', target?: Element): TokenBridge
```

Create a token bridge that auto-discovers --pdx-* CSS custom properties.
Tokens become reactive signals that update when the theme changes.

@param prefix - CSS variable prefix to discover (default: '--pdx-')
@param target - Element to read from (default: document.documentElement)

### `createVirtualizer`

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

### `csrfMiddleware`

```ts
import { csrfMiddleware } from '@pdxui/core';

function csrfMiddleware(options: CsrfMiddlewareOptions = {}): HttpMiddleware
```

Copies the CSRF token from its cookie into a request header, for state-changing requests only.

The cookie/header pair defaults to `XSRF-TOKEN` / `X-XSRF-TOKEN`, which is what most server
frameworks emit. GET, HEAD and OPTIONS are skipped because they are not supposed to change state;
a missing cookie sends the request unchanged rather than failing it, so a page loaded before the
session existed still works.

This is the browser half of double-submit CSRF protection — it is worth nothing unless the server
actually compares the two.

### `cssVar`

```ts
import { cssVar } from '@pdxui/core';

function cssVar(name: string, initial: string | (() => string), target?: Element): Signal<string>
```

Create a reactive CSS custom property backed by a signal.
Changes to the signal automatically update the CSS variable on the target element.

@param name - CSS variable name (e.g. '--primary-color')
@param initial - Initial value (string) or reactive getter
@param target - Element to set the variable on (default: document.documentElement)

### `csvCell`

```ts
import { csvCell } from '@pdxui/core';

function csvCell(value: unknown): string
```

One value, escaped for a CSV cell.

The four rules, and why each is not optional:

  - a **comma** inside a value would start a new column, so the value is quoted. The first
    ticket titled "Printer, jammed" is the bug report;
  - a **quote** inside a quoted value ends it early: RFC 4180 escapes it by doubling it;
  - a **newline** would start a new row. Quoted, a line break is part of the value — which is
    what a note field contains;
  - a leading **`=`, `+`, `-` or `@`** is a FORMULA to a spreadsheet, and `=HYPERLINK(...)` or
    `=cmd|...` is how a CSV export becomes an attack on whoever opens it. The value is KEPT and
    prefixed with an apostrophe, which is how a spreadsheet is told "this is text" — dropping
    or rewriting the data would be a worse answer than showing it as what it is.

A `Date` becomes an ISO day: a CSV is read by a machine as often as by a person, and `9/20/2026`
is ambiguous in half the world. A column that wants it formatted passes a `format`.

### `currency`

```ts
import { currency } from '@pdxui/core';

function currency(opts?: { currency?: string; locale?: string }): CellCurrencySpec
```

Render the cell as a formatted amount, via `Intl.NumberFormat`.

Defaults to the document's locale and the currency you pass; omitting `currency` formats the
number without a symbol, which is what you want for a column whose unit is in the header.

### `currentScheme`

```ts
import { currentScheme } from '@pdxui/core';

const currentScheme: ReadonlySignal<string>
```

Current color scheme ('light' or 'dark').

### `currentTheme`

```ts
import { currentTheme } from '@pdxui/core';

const currentTheme: ReadonlySignal<string>
```

Current brand theme name (e.g. 'neutral', 'material', 'fluent').

### `dateCell`

```ts
import { dateCell } from '@pdxui/core';

function dateCell(opts?: { options?: Intl.DateTimeFormatOptions; locale?: string }): CellDateSpec
```

Render the cell as a formatted date, via `Intl.DateTimeFormat`.

Named `dateCell` rather than `date` because `date` is a word a consumer is likely to have already;
the other builders keep their obvious names.

### `dayOfWeek`

```ts
import { dayOfWeek } from '@pdxui/core';

function dayOfWeek(year: number, month: number, day: number): number
```

0=Sun, 1=Mon ... 6=Sat

### `debounce`

```ts
import { debounce } from '@pdxui/core';

function debounce(ms: number): SignalOperator<T, T>
```

Debounce operator for pipe().

### `debounced`

```ts
import { debounced } from '@pdxui/core';

function debounced(source: () => T, ms: number): ReadonlySignal<T> & { dispose: Dispose }
```

Create a debounced signal — value updates only after `ms` milliseconds of silence.
Useful for search inputs, resize handlers, etc.

Usage:
  const search = signal('');
  const debouncedSearch = debounced(() => search(), 300);
  effect(() => fetchResults(debouncedSearch()));

### `defer`

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

### `define`

```ts
import { define } from '@pdxui/core';

function define(tag: string, ctor: PdxElementConstructor): void
```

Register a Custom Element. If already defined, swaps prototype for HMR.

### `delayTransport`

```ts
import { delayTransport } from '@pdxui/core';

function delayTransport(options: DelayTransportOptions<T>): IDataTransport<T>
```

Wrap any transport with artificial delay for loading state demos/testing.

### `destroyAnnouncer`

```ts
import { destroyAnnouncer } from '@pdxui/core';

function destroyAnnouncer(): void
```

Remove the live region from DOM (cleanup).

### `DEV`

```ts
import { DEV } from '@pdxui/core';

const DEV
```

True in a development build, false in a production one — a constant, folded by the bundler.

Guard a message that teaches the author something with it, and the branch leaves the production
bundle with its string: `if (DEV) console.warn('…')`. Never guard BEHAVIOUR with it — behaviour
that only happens in dev is a difference between what you tested and what you shipped.

### `device`

```ts
import { device } from '@pdxui/core';

const device
```

Reactive device detection signals.
Lazy: matchMedia listeners are created only on first access, not at import.
SSR-safe: defaults to desktop/landscape.

### `direction`

```ts
import { direction } from '@pdxui/core';

const direction: ReadonlySignal<'ltr' | 'rtl'>
```

Current document direction (reactive).

### `discoverChildren`

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

### `dispatchGlobalError`

```ts
import { dispatchGlobalError } from '@pdxui/core';

function dispatchGlobalError(error: unknown, context: ErrorContext): void
```

Dispatch an error to all registered global handlers.
If no handler suppresses it, logs to console.error.

Called internally by the framework — not typically used by app code.

### `distinct`

```ts
import { distinct } from '@pdxui/core';

function distinct(source: () => T, equals?: (a: T, b: T) => boolean): DisposableSignal<T>
```

Skip emissions when value hasn't changed.
Like RxJS distinctUntilChanged but as a signal.

Usage:
  const rounded = distinct(() => Math.round(value()), (a, b) => a === b);

### `distinctOp`

```ts
import { distinctOp } from '@pdxui/core';

function distinct(equals?: (a: T, b: T) => boolean): SignalOperator<T, T>
```

Skip duplicate values using equality check.

### `downloadFile`

```ts
import { downloadFile } from '@pdxui/core';

function downloadFile(url: string, options?: DownloadOptions): DownloadHandle
```

Download a file with reactive progress tracking.
Uses fetch + ReadableStream for download progress.
Requires server to send Content-Length header for percentage.

Usage:
  const handle = downloadFile('/api/export/report.pdf');
  effect(() => console.log(`${handle.progress()}%`));
  const blob = await handle.result;

### `dynamic`

```ts
import { dynamic } from '@pdxui/core';

function dynamic(tagFn: () => string, propsFn?: (() => Record<string, unknown>) | null, options?: DynamicOptions): DocumentFragment
```

Dynamically render a component by tag name with enhanced features.
Reactively creates/destroys/caches elements when the tag changes.

@param tagFn - Reactive function returning component tag name
@param propsFn - Optional reactive function returning props to pass
@param options - Keep-alive, transitions, lazy loading options

### `each`

```ts
import { each } from '@pdxui/core';

function each(items: () => T[], key: string | ((item: T, index: number) => unknown), renderFn: (item: T, index: number) => Node, options?: TransitionOptions): DocumentFragment
```

Keyed list rendering with string key support.
Thin wrapper over repeat() with friendlier API.

Usage:
  ${each(() => items(), 'id', (item) => html`<div>${item.name}</div>`)}
  ${each(() => items(), (item) => item.id, (item) => html`<div>${item.name}</div>`)}

### `eachRow`

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

### `easings`

```ts
import { easings } from '@pdxui/core';

const easings
```

The easing curves `tween()` accepts, as plain `(t: number) => number` on 0..1.

Prefer an `easeOut*` for anything the user triggered: it moves fastest at the start, so the
interface feels like it responded immediately. `easeInOut*` suits something moving on its own,
`linear` suits a progress bar and almost nothing else.

Any function of the same shape works — this is a convenience set, not a closed list.

### `effect`

```ts
import { effect } from '@pdxui/core';

function effect(fn: () => void | (() => void), options?: EffectOptions): Dispose
```

Run a function now, and again whenever a signal it read has changed.

Dependencies are collected by RUNNING it: whatever the function reads this time is what it is
subscribed to next time. A read behind an `if` that was false is not a dependency — which is what
makes conditional reactivity work without declaring anything.

Returning a function registers cleanup: it runs before each re-run AND on dispose, which is where
a listener or a timer belongs so it cannot outlive the effect that created it. The returned
`Dispose` stops it; inside a component the ownership scope disposes it with the subtree, so you
usually do not have to.

For a value derived from other values use `computed` — an effect that only assigns to a signal is
a computed written the long way round.

### `email`

```ts
import { email } from '@pdxui/core';

function email(msg?: string): Validator<string>
```

Rejects a string that is not shaped like an email address.

Deliberately permissive — something@something.something — because the only real validation of an
address is sending to it, and a stricter regex rejects valid addresses more often than it catches
invalid ones. An EMPTY value passes: combine with {@link required} when the field is mandatory.

### `enableDevMode`

```ts
import { enableDevMode } from '@pdxui/core';

function enableDevMode(on = true): void
```

Enable dev mode guardrails (signal read outside tracking, write in computed).

### `enter`

```ts
import { enter } from '@pdxui/core';

function enter(node: Node, animation?: string): Promise<void>
```

Apply enter transition to a node. Adds CSS classes, waits for transition, removes classes.
Returns a Promise that resolves when the transition completes.

### `errorBoundary`

```ts
import { errorBoundary } from '@pdxui/core';

function errorBoundary(contentFn: () => Node | DocumentFragment, fallbackFn: (error: Error, retry: () => void) => Node | DocumentFragment, options?: ErrorBoundaryOptions): DocumentFragment
```

Wrap content in an error boundary. If the content function or any of its
reactive effects throw, the fallback is rendered instead.

@param contentFn — function that renders the content
@param fallbackFn — function that renders the fallback (receives error + retry fn)
@param options — optional: maxRetries, autoRetry, retryDelay, onError callback

### `evaluateVisibility`

```ts
import { evaluateVisibility } from '@pdxui/core';

function evaluateVisibility(condition: VisibilityCondition, values: Record<string, unknown>): boolean
```

Evaluate a visibility condition against current form values.

### `exhaustSignal`

```ts
import { exhaustSignal } from '@pdxui/core';

function exhaustSignal(source: () => S, fetcher: (value: S, signal: AbortSignal) => Promise<T>): AsyncSignal<T>
```

Ignore new triggers while the current operation is still running.
The RxJS exhaustMap equivalent — perfect for form submit anti-double-click.

Usage:
  const submitResult = exhaustSignal(
    () => submitTrigger(),
    () => fetch('/api/submit', { method: 'POST', body })
  );

### `exit`

```ts
import { exit } from '@pdxui/core';

function exit(node: Node, animation?: string): Promise<void>
```

Apply exit transition to a node. Adds CSS classes, waits for transition, then removes the node.
Returns a Promise that resolves when the node is removed.

### `exposeOnElement`

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

### `fakeTransport`

```ts
import { fakeTransport } from '@pdxui/core';

function fakeTransport(options: FakeTransportOptions<T>): IDataTransport<T> & { /** Access the internal data for assertions. */ getData(): Promise<T[]> }
```

{@link arrayTransport} with a simulated network in front: latency, jitter and a configurable error
rate.

For demos and for tests of the states a real backend produces and an in-memory one never does — a
visible loading spinner, an error branch, a race between two requests. `errorRate: 0.1` fails one
call in ten, which is how you find out whether the error path was ever written.

`onOperation` and `getData()` are the test surface: what was asked, and what the store holds now.

### `filter`

```ts
import { filter } from '@pdxui/core';

function filter(predicate: (value: T) => boolean): SignalOperator<T, T>
```

Filter operator for pipe(). Keeps last valid value when predicate fails.

### `findByText`

```ts
import { findByText } from '@pdxui/core/testing';

function findByText(container: HTMLElement, text: string | RegExp, timeout?: number): Promise<HTMLElement>
```

Find element by text content, waiting until it appears.

### `fireEvent`

```ts
import { fireEvent } from '@pdxui/core/testing';

function fireEvent(el: Element, eventName: string, detail?: unknown): void
```

Dispatch a DOM event on an element with optional detail payload.
Supports standard events (click, input) and CustomEvents.

### `flattenValues`

```ts
import { flattenValues } from '@pdxui/core';

function flattenValues(obj: Record<string, unknown>, prefix = ''): Record<string, unknown>
```

Flatten a nested object into dotted-path keys.
`{ customer: { name: 'Jane' } }` → `{ 'customer.name': 'Jane' }`.
Arrays of objects flatten per-item: `items: [{ qty: 2 }]` → `{ 'items.0.qty': 2 }`.
Arrays of primitives stay as-is: `tags: ['a','b']` → `{ 'tags': ['a','b'] }`.

### `flip`

```ts
import { flip } from '@pdxui/core';

function flip(options?: FlipOptions): Middleware
```

Flip to the opposite side if the floating element overflows the boundary (or viewport).

### `flipAnimate`

```ts
import { flipAnimate } from '@pdxui/core';

function flipAnimate(oldPositions: Map<Element, Rect>, nodes: Node[], duration = 300): void
```

FLIP animate elements that changed position after a DOM mutation.
Compares old positions to new positions and animates the delta.

@param oldPositions - Map from recordPositions() before mutation
@param nodes - Current nodes after mutation
@param duration - Animation duration in ms (default 300)

### `flipPlacement`

```ts
import { flipPlacement } from '@pdxui/core';

function flipPlacement(placement: string): string
```

Flip a placement (start/end) based on direction.
'top-start' in RTL becomes 'top-end', etc.
Used by positioning engine for direction-aware placement.

### `focusFirst`

```ts
import { focusFirst } from '@pdxui/core';

function focusFirst(container: HTMLElement): HTMLElement | null
```

Focus the first focusable element inside a container.
Returns the focused element, or null if none found.

### `focusGroup`

```ts
import { focusGroup } from '@pdxui/core';

function focusGroup(container: HTMLElement, options?: FocusGroupOptions): Dispose
```

Enable focus group pattern on a container.
Arrow keys navigate between items. Only one item has tabindex="0".
Supports type-ahead, aria-activedescendant, and skip-disabled.

### `focusLast`

```ts
import { focusLast } from '@pdxui/core';

function focusLast(container: HTMLElement): HTMLElement | null
```

Focus the last focusable element inside a container.

### `focusRestore`

```ts
import { focusRestore } from '@pdxui/core';

function focusRestore(): FocusRestoreReturn
```

Create a save/restore focus pair with automatic fallback.
If the saved element is removed from the DOM before restore(),
focus is moved to the nearest focusable ancestor.

### `focusTrap`

```ts
import { focusTrap } from '@pdxui/core';

function focusTrap(container: HTMLElement, options?: FocusTrapOptions): Dispose
```

Activate a focus trap on the given container.
- Tab/Shift+Tab cycles within the container.
- Siblings are hidden from screen readers via aria-hidden. With several traps active, only the
  most recent one is exposed.
- Returns a Dispose function to deactivate.

### `FORM_INTERNALS`

```ts
import { FORM_INTERNALS } from '@pdxui/core';

const FORM_INTERNALS
```

Symbol-keyed internal API — not part of the public Form interface.

### `formatMessage`

```ts
import { formatMessage } from '@pdxui/core';

function formatMessage(message: string, params: Record<string, unknown>): string
```

Format a message already in hand with the rules of `$t()`: ICU plural blocks for the current locale,
then `{name}` interpolation; a placeholder with no value stays as written. The component strings of
@pdxui/ui go through here, so a locale can pluralise "{count} selected".

### `formatWithCalendar`

```ts
import { formatWithCalendar } from '@pdxui/core';

function formatWithCalendar(iso: string, locale: string = 'en', calendar: CalendarSystem = 'gregory', options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string
```

Format a date using a specific calendar system.

### `forwardSlots`

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

### `fromCallback`

```ts
import { fromCallback } from '@pdxui/core';

function fromCallback(setup: (setter: (value: T) => void) => Dispose | void, initialValue?: T): ReadonlySignal<T | undefined> & { dispose: Dispose }
```

Convert a callback-based API into a signal.
Useful for third-party APIs that use callbacks.

Usage:
  const position = fromCallback<GeolocationPosition>((set) => {
    const id = navigator.geolocation.watchPosition(set);
    return () => navigator.geolocation.clearWatch(id);
  });

### `fromEvent`

```ts
import { fromEvent } from '@pdxui/core';

function fromEvent(target: EventTarget | (() => EventTarget | null), eventName: string, options?: FromEventOptions<T> | ((event: Event) => T)): DisposableSignal<T>
```

Create a signal that updates on every DOM event.

Usage:
  const clicks = fromEvent(buttonRef, 'click');
  effect(() => console.log('Clicked!', clicks()));

  const value = fromEvent(inputRef, 'input', { transform: e => (e.target as HTMLInputElement).value });
  const deb = debounced(() => value(), 300); // compose with other operators

### `fromEvents`

```ts
import { fromEvents } from '@pdxui/core';

function fromEvents(target: EventTarget, eventNames: string[], options?: FromEventOptions<T>): DisposableSignal<T>
```

Listen to multiple events on the same target, merged into one signal.

Usage:
  const interaction = fromEvents(el, ['mousedown', 'touchstart', 'pointerdown']);

### `fromIntersection`

```ts
import { fromIntersection } from '@pdxui/core';

function fromIntersection(target: Element | (() => Element | null), options?: IntersectionObserverInit): DisposableSignal<IntersectionState>
```

Observe element intersection as a reactive signal.

Usage:
  const visibility = fromIntersection(ref, { threshold: 0.5 });
  effect(() => {
    if (visibility().isIntersecting) loadContent();
  });

### `fromMutation`

```ts
import { fromMutation } from '@pdxui/core';

function fromMutation(target: Node | (() => Node | null), options?: MutationObserverInit): DisposableSignal<MutationState>
```

Observe DOM mutations as a reactive signal.

Usage:
  const changes = fromMutation(listRef, { childList: true });
  effect(() => console.log(`${changes().count} mutations`));

### `fromPromise`

```ts
import { fromPromise } from '@pdxui/core';

function fromPromise(promise: Promise<T>, initialValue?: T): PromiseSignal<T>
```

Convert a Promise into a reactive signal with loading/error states.

Usage:
  const user = fromPromise(fetchUser(42));
  effect(() => {
    if (user.loading()) showSpinner();
    else if (user.error()) showError(user.error());
    else renderUser(user());
  });

### `fromResize`

```ts
import { fromResize } from '@pdxui/core';

function fromResize(target: Element | (() => Element | null), options?: ResizeObserverOptions): DisposableSignal<ResizeState>
```

Observe element size as a reactive signal.

Usage:
  const size = fromResize(containerRef);
  effect(() => console.log(`${size().width}x${size().height}`));

### `fromTC39Computed`

```ts
import { fromTC39Computed } from '@pdxui/core';

function fromTC39Computed(tc39: TC39Computed<T>): ReadonlySignal<T>
```

Create a Pragmatic computed from a TC39-compatible Computed signal.

### `fromTC39State`

```ts
import { fromTC39State } from '@pdxui/core';

function fromTC39State(tc39: TC39State<T>): Signal<T>
```

Create a Pragmatic signal from a TC39-compatible State signal.
Useful for consuming signals from other frameworks.

### `generateMonthGrid`

```ts
import { generateMonthGrid } from '@pdxui/core';

function generateMonthGrid(year: number, month: number, options: MonthGridOptions = {}): CalendarGrid
```

Build the grid a month view renders: the weeks of one month, padded with the neighbouring days
that fill the first and last rows.

This is the calendar's whole layout decision in one pure function — which day the week starts on,
which cells are outside the month, which are disabled or selected — so a component can render it
without doing date arithmetic of its own.

### `getByRole`

```ts
import { getByRole } from '@pdxui/core/testing';

function getByRole(container: HTMLElement, role: string, options?: { name?: string | RegExp }): HTMLElement
```

Find element by ARIA role. Throws if not found.

### `getByTestId`

```ts
import { getByTestId } from '@pdxui/core/testing';

function getByTestId(container: HTMLElement, id: string): HTMLElement
```

Find element by data-testid attribute. Throws if not found.

### `getByText`

```ts
import { getByText } from '@pdxui/core/testing';

function getByText(container: HTMLElement, text: string | RegExp): HTMLElement
```

Find element by text content. Throws if not found.

### `getComponentString`

```ts
import { getComponentString } from '@pdxui/core';

function getComponentString(component: string, key: string, fallback?: string): ReadonlySignal<string>
```

Get a reactive string for a component.
Returns the override if set, otherwise the default.

@example
const placeholder = getComponentString('select', 'placeholder');
// In template: {{ placeholder() }}

### `getComponentStrings`

```ts
import { getComponentStrings } from '@pdxui/core';

function getComponentStrings(component: string): ReadonlySignal<ComponentStrings>
```

Get all strings for a component (reactive): the defaults, with the overrides over them.

### `getDateFormatOrder`

```ts
import { getDateFormatOrder } from '@pdxui/core';

function getDateFormatOrder(locale: string = 'en'): Array<'day' | 'month' | 'year' | 'literal'>
```

Get the date format order for a locale (e.g. ['day', 'month', 'year']).

### `getDayNames`

```ts
import { getDayNames } from '@pdxui/core';

function getDayNames(locale: string = 'en', format: 'narrow' | 'short' | 'long' = 'short', firstDay: number = 0): string[]
```

Get localized day-of-week names starting from firstDay.

### `getDaysInMonth`

```ts
import { getDaysInMonth } from '@pdxui/core';

function getDaysInMonth(year: number, month: number): number
```

How many days a month has, leap years included. `month` is 1-12, not 0-11.

Used to clamp a day-of-month when arithmetic lands it past the end: adding a month to 31 January
gives 28 or 29 February, never 3 March.

### `getDefaultCache`

```ts
import { getDefaultCache } from '@pdxui/core';

function getDefaultCache(): Cache
```

The process-wide cache every {@link resource} uses unless given its own, created on first use.

Being a singleton is the point: two components asking for the same key share one request and one
value. It is also why a test that leaves entries behind can change the next test's behaviour —
see {@link setDefaultCache}.

### `getDefaultClient`

```ts
import { getDefaultClient } from '@pdxui/core';

function getDefaultClient(): HttpClient
```

Get the default HTTP client. Creates one with empty config if not set.

### `getDefaultIconSet`

```ts
import { getDefaultIconSet } from '@pdxui/core';

function getDefaultIconSet(): string | null
```

Get the name of the default icon set.

### `getDialogQueue`

```ts
import { getDialogQueue } from '@pdxui/core';

function getDialogQueue(): DialogQueue
```

The page's one dialog queue: the one `<pdx-overlay-outlet>` draws, `dialog.confirm()` pushes to,
and a form's leave guard asks through. It lives here, not in @pdxui/ui, because core has to
ask a question too and cannot import the package that draws it.

### `getFieldsByPrefix`

```ts
import { getFieldsByPrefix } from '@pdxui/core';

function getFieldsByPrefix(fields: Record<string, unknown>, prefix: string): string[]
```

Get all dotted-path keys that start with a given prefix.
Used by field-list to find all fields belonging to an array item.

### `getFieldTypeTag`

```ts
import { getFieldTypeTag } from '@pdxui/core';

function getFieldTypeTag(typeName: string): string | undefined
```

Get tag name for a schema field type (custom types).

### `getFieldValue`

```ts
import { getFieldValue } from '@pdxui/core';

function getFieldValue(row: unknown, field: string): unknown
```

Get a nested property value via dotted path.

### `getFirstDayOfWeek`

```ts
import { getFirstDayOfWeek } from '@pdxui/core';

function getFirstDayOfWeek(locale: string): number
```

Get the first day of week for a locale. 0=Sun, 1=Mon ... 6=Sat.

### `getFiscalQuarter`

```ts
import { getFiscalQuarter } from '@pdxui/core';

function getFiscalQuarter(month: number, fiscalStartMonth: number): number
```

Get fiscal quarter (1-4). fiscalStartMonth: 1-12.

### `getFiscalYear`

```ts
import { getFiscalYear } from '@pdxui/core';

function getFiscalYear(year: number, month: number, fiscalStartMonth: number): number
```

Get fiscal year for a given date. fiscalStartMonth: 1-12 (e.g. 4 for April).

### `getFocusableElements`

```ts
import { getFocusableElements } from '@pdxui/core';

function getFocusableElements(container: HTMLElement): HTMLElement[]
```

Get all focusable elements inside a container.

### `getFormControlConfig`

```ts
import { getFormControlConfig } from '@pdxui/core';

function getFormControlConfig(tagName: string): FormControlConfig | undefined
```

Get config for a registered form control.

### `getLocale`

```ts
import { getLocale } from '@pdxui/core';

function getLocale(): ReadonlySignal<string>
```

Get the current locale as a reactive signal.

### `getMonthNames`

```ts
import { getMonthNames } from '@pdxui/core';

function getMonthNames(locale: string = 'en', calendar: CalendarSystem = 'gregory', format: 'long' | 'short' | 'narrow' = 'long'): string[]
```

Get localized month names.

### `getMonthRange`

```ts
import { getMonthRange } from '@pdxui/core';

function getMonthRange(year: number, month: number): DateRange
```

The `[first, last]` ISO dates of a month. `month` is 1-12.

### `getNestedValue`

```ts
import { getNestedValue } from '@pdxui/core';

function getNestedValue(obj: unknown, path: string): unknown
```

Get a value from a nested object by dotted path.

### `getQuarterRange`

```ts
import { getQuarterRange } from '@pdxui/core';

function getQuarterRange(year: number, quarter: number, fiscalStartMonth: number = 1): DateRange
```

The `[first, last]` ISO dates of a quarter (1-4), optionally on a FISCAL year that starts in
`fiscalStartMonth` (1-12, default January = the calendar year).

The fiscal offset is why this takes a start month: reporting periods rarely begin in January, and
a quarter filter that assumes they do is wrong for most of the year.

### `getRegisteredFormControls`

```ts
import { getRegisteredFormControls } from '@pdxui/core';

function getRegisteredFormControls(): string[]
```

Get all registered control tag names (for compiler).

### `getScheme`

```ts
import { getScheme } from '@pdxui/core';

function getScheme(): string
```

Get the current color scheme.

### `getStore`

```ts
import { getStore } from '@pdxui/core';

function getStore(id: string): T | undefined
```

Get a registered store by ID (for DevTools/testing).

### `getSupportedLocales`

```ts
import { getSupportedLocales } from '@pdxui/core';

function getSupportedLocales(): string[]
```

Get supported locale codes.

### `getTelemetryLevel`

```ts
import { getTelemetryLevel } from '@pdxui/core';

function getTelemetryLevel(): TelemetryLevel
```

The current telemetry level: 0 off, 1 errors only (safe in production), 2 full trace (development).

Read it before building an expensive diagnostic payload — at level 0 the tracing calls are no-ops,
but the argument you computed to pass them is not.

### `getTheme`

```ts
import { getTheme } from '@pdxui/core';

function getTheme(): string
```

Get the current theme name.

### `getTranslation`

```ts
import { getTranslation } from '@pdxui/core/i18n';

function getTranslation(key: string, loc?: string): string | undefined
```

Get a raw translation string (no interpolation). Reactive: see {@link loadTranslations}.

### `getWeekRange`

```ts
import { getWeekRange } from '@pdxui/core';

function getWeekRange(iso: string, firstDay: number = 1): DateRange
```

The `[start, end]` ISO dates of the week containing a date. `firstDay` is 0=Sunday, 1=Monday
(the default, matching ISO 8601).

One of the range helpers a "this week / this month / this quarter" filter is built from.

### `getYearRange`

```ts
import { getYearRange } from '@pdxui/core';

function getYearRange(year: number): DateRange
```

The `[first, last]` ISO dates of a calendar year.

### `gregorianToJD`

```ts
import { gregorianToJD } from '@pdxui/core';

function gregorianToJD(y: number, m: number, d: number): number
```

Convert Gregorian date to Julian Day Number.

### `hasIconSet`

```ts
import { hasIconSet } from '@pdxui/core';

function hasIconSet(name: string): boolean
```

Check if an icon set is registered.

### `hasPermission`

```ts
import { hasPermission } from '@pdxui/core';

function hasPermission(permission: string): ReadonlySignal<boolean>
```

Check if a permission is granted. Returns a reactive ReadonlySignal.

Usage:
  const canDelete = hasPermission('booking.delete');
  effect(() => { if (canDelete()) enableButton(); });

### `hideMiddleware`

```ts
import { hideMiddleware } from '@pdxui/core';

function hide(options?: HideOptions): Middleware
```

Hide the floating element when the reference scrolls out of a boundary.
Sets data.hidden = true/false. Consumer applies display:none based on this.

### `hideSkeleton`

```ts
import { hideSkeleton } from '@pdxui/core';

function hideSkeleton(el: HTMLElement): void
```

Restore original content from skeleton.

### `html`

```ts
import { html } from '@pdxui/core';

function html(strings: TemplateStringsArray, ...values: TemplateValue[]): DocumentFragment
```

Tagged template literal that produces reactive DOM. SSR-safe: returns empty fragment.

### `HttpError`

```ts
import { HttpError } from '@pdxui/core';

class HttpError
```

The error every non-2xx response becomes.

It carries the status, so calling code branches on `err.status === 404` rather than parsing a
message, and the parsed body, so a validation error from the server is available without a second
read of a stream that has already been consumed.

Distinct from {@link AbortError} (the request never got an answer — timeout or cancellation) and
{@link OfflineError} (it was never sent). {@link retryMiddleware} tells them apart for exactly
this reason: a 503 is worth repeating, an abort is not.

### `httpResource`

```ts
import { httpResource } from '@pdxui/core';

function httpResource(url: string | (() => string), options?: HttpResourceOptions<T>): Resource<T>
```

Reactive HTTP data resource — fetches data from a URL with auto-refetch on param changes.
Wraps HttpClient + resource() into a single call.

Usage:
  const users = httpResource<User[]>('/api/users');
  const user = httpResource<User>(() => `/api/users/${id()}`, { staleTime: 60_000 });
  const results = httpResource<SearchResult[]>('/api/search', {
      method: 'POST',
      body: () => ({ query: searchQuery() }),
  });

### `humanizeField`

```ts
import { humanizeField } from '@pdxui/core';

function humanizeField(field: string): string
```

Humanize a field name: 'firstName' → 'First Name', 'address.city' → 'City'.

### `initDevTools`

```ts
import { initDevTools } from '@pdxui/core/devtools';

function initDevTools(): void
```

Install the DevTools overlay: the Ctrl+Shift+D shortcut and the global handle.

Call it from a development entry point only. It is behind `@pdxui/core/devtools` rather than
the barrel precisely so a production bundle that never imports it never carries the panel, its
polling or its DOM.

### `initI18n`

```ts
import { initI18n } from '@pdxui/core';

function initI18n(config: I18nConfig): void
```

Initialize i18n with configuration. Called once (typically from app root).

### `inject`

```ts
import { inject } from '@pdxui/core';

function inject(key: string | symbol, from?: HTMLElement): T
```

Inject a value by walking up the DOM tree (nearest provider wins).
Falls back to global registry. Throws if not found.

### `injectSafeAreaCSS`

```ts
import { injectSafeAreaCSS } from '@pdxui/core';

function injectSafeAreaCSS(): void
```

Inject a <style> with CSS custom properties for safe area insets.
Usage in CSS: `padding-bottom: var(--pdx-safe-bottom, 0px);`

### `injectTransitionCSS`

```ts
import { injectTransitionCSS } from '@pdxui/core';

function injectTransitionCSS(): void
```

Inject the stylesheet the built-in transitions need (fade, slide, scale, collapse), once.

Idempotent and SSR-safe: repeated calls do nothing and it is a no-op without a `document`. Call it
only if you use the transition class names WITHOUT `@pdxui/design`, which already ships them —
otherwise you get the same rules twice.

### `inlineEnd`

```ts
import { inlineEnd } from '@pdxui/core';

function inlineEnd(): 'left' | 'right'
```

Returns 'right' or 'left' based on current direction. For inline-end.

### `inlineStart`

```ts
import { inlineStart } from '@pdxui/core';

function inlineStart(): 'left' | 'right'
```

Returns 'left' or 'right' based on current direction. For inline-start.

### `insert`

```ts
import { insert } from '@pdxui/core';

function insert(parent: Node, node: Node, before?: Node | null): void
```

Insert a node before a marker, or append to parent.

### `installContextProtocol`

```ts
import { installContextProtocol } from '@pdxui/core';

function installContextProtocol(): void
```

Install global Context Protocol listener (for global providers).
Responds to context-request events with values from the global registry.

### `integer`

```ts
import { integer } from '@pdxui/core';

function integer(msg?: string): Validator<number>
```

Rejects a number with a fractional part.

A non-number passes, so an input that has not been coerced yet is not reported here — the field's
own type conversion runs first.

### `interpolationText`

```ts
import { interpolationText } from '@pdxui/core';

function interpolationText(value: unknown): string
```

The text a value renders as when it is interpolated: `null`, `undefined` and `false` are empty text,
so `{{ user?.name }}` and `{{ busy && 'Saving…' }}` print nothing rather than a word; anything else
is `String(value)`, `0` included.

The inline build writes its text nodes through this too, so a page reads the same in dev and in a
production build: a plain `String(value)` would show `null` and `false`.

### `invalidate`

```ts
import { invalidate } from '@pdxui/core';

function invalidate(matcher: InvalidationMatcher): number
```

Drop matching entries from the default cache and return how many went, so the next read refetches.

Matches on an exact key, a prefix pattern, or tags — tags being the useful one: a mutation that
created an order invalidates `['orders']` without knowing which keys are in play. The count is
worth checking in a test: zero means the matcher matched nothing, which looks identical to
"worked" from the outside.

### `invalidateAll`

```ts
import { invalidateAll } from '@pdxui/core';

function invalidateAll(): void
```

Drop everything in the default cache.

The blunt instrument: right after a logout, where anything cached belongs to the previous user.
Anywhere else, {@link invalidate} with tags refetches what changed instead of everything.

### `is12HourClock`

```ts
import { is12HourClock } from '@pdxui/core';

function is12HourClock(locale: string): boolean
```

Detect if a locale uses 12-hour clock.

### `isDataSource`

```ts
import { isDataSource } from '@pdxui/core';

function isDataSource(value: unknown): value is DataSource<T & Record<string, unknown>>
```

Type guard: check if a value is a DataSource instance.

### `isFormControl`

```ts
import { isFormControl } from '@pdxui/core';

function isFormControl(tagName: string): boolean
```

Check if a tag is a registered form control (built-in or custom).

### `isInRange`

```ts
import { isInRange } from '@pdxui/core';

function isInRange(iso: string, start: string, end: string): boolean
```

Whether an ISO date falls within `[start, end]`, both ends INCLUSIVE.

Inclusive because that is what a date-range picker means by "from the 1st to the 5th"; a caller
wanting a half-open interval should pass the day before.

### `isLocaleLoaded`

```ts
import { isLocaleLoaded } from '@pdxui/core/i18n';

function isLocaleLoaded(loc: string): boolean
```

Check if a locale's translations have been loaded.

### `isoWeekNumber`

```ts
import { isoWeekNumber } from '@pdxui/core';

function isoWeekNumber(year: number, month: number, day: number): number
```

The ISO 8601 week number (1-53) for a date.

ISO weeks start on Monday and week 1 is the one containing the first Thursday of the year, so the
first days of January can belong to week 52 or 53 of the PREVIOUS year. That rule is why this is
not `Math.ceil(dayOfYear / 7)`.

### `isRTL`

```ts
import { isRTL } from '@pdxui/core';

const isRTL: ReadonlySignal<boolean>
```

Whether the document is RTL (reactive).

### `isSameDay`

```ts
import { isSameDay } from '@pdxui/core';

function isSameDay(a: string, b: string): boolean
```

Whether two ISO dates are the same day. String equality, for the reason above.

It exists so calling code reads as intent rather than as a string comparison that happens to work.

### `isSameMonth`

```ts
import { isSameMonth } from '@pdxui/core';

function isSameMonth(a: string, b: string): boolean
```

Whether two ISO dates fall in the same month of the same year.

What a calendar grid asks to decide whether a cell belongs to the month on display or is one of
the leading/trailing days from its neighbours.

### `isSplashUp`

```ts
import { isSplashUp } from '@pdxui/core';

function isSplashUp(): boolean
```

Whether the start-up splash is on screen and not yet leaving: the app's first frames are its.

### `isStandardSchema`

```ts
import { isStandardSchema } from '@pdxui/core';

function isStandardSchema(obj: unknown): obj is StandardSchema
```

Check if an object implements Standard Schema v1.

### `isWeekend`

```ts
import { isWeekend } from '@pdxui/core';

function isWeekend(iso: string): boolean
```

Whether an ISO date is a Saturday or Sunday.

Saturday/Sunday specifically, not "the locale's non-working days" — those differ by country and
this does not know the locale. A scheduler with its own working week should not use this.

### `jdToGregorian`

```ts
import { jdToGregorian } from '@pdxui/core';

function jdToGregorian(jd: number): CalendarDate
```

Convert Julian Day Number to Gregorian date.

### `keyframes`

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

### `link`

```ts
import { link } from '@pdxui/core';

function link(opts: { href: (value: unknown, row: CellRow) => string; text?: (value: unknown, row: CellRow) => string; target?: string }): CellLinkSpec
```

Render the cell as an anchor, with the href computed from the value and the whole row.

`href` gets the row too, because the target is usually built from an id the cell does not show.
The URL is sanitised before it reaches the DOM, so a `javascript:` value coming back from a server
does not become a link that runs it.

### `linkedSignal`

```ts
import { linkedSignal } from '@pdxui/core';

function linkedSignal(optionsOrFn: LinkedSignalOptions<S, T> | (() => T)): Signal<T>
```

Create a writable derived signal.
 Shorthand: computation IS the source. Value recomputes on any dependency change.

### `loadTranslations`

```ts
import { loadTranslations } from '@pdxui/core';

function loadTranslations(loc: string, messages: Record<string, unknown>): void
```

Load translations for a locale. Flattens nested objects to dot notation.
Can be called multiple times to merge translations.

### `logMiddleware`

```ts
import { logMiddleware } from '@pdxui/core';

function logMiddleware(options: LogMiddlewareOptions = {}): HttpMiddleware
```

Logs each request and its outcome with the elapsed time, for development.

Header VALUES whose name looks like a credential — authorization, cookie, api-key, token, secret —
are replaced with `[REDACTED]`, so turning logging on cannot leak a bearer token into a console
someone screenshots. Errors are logged and re-thrown, never swallowed.

Add it deliberately: it is not in the default chain, and a production build should not include it.

### `manageFocusOrder`

```ts
import { manageFocusOrder } from '@pdxui/core';

function manageFocusOrder(container: HTMLElement, options?: FocusOrderOptions): Dispose
```

Manage Tab order between composite child components within a container.
Each direct child is treated as a "tab stop" — Tab moves between them,
Arrow keys are handled internally by each component's own focus group.

### `map`

```ts
import { map } from '@pdxui/core';

function map(fn: (value: In) => Out): SignalOperator<In, Out>
```

Map operator for pipe(). Transforms each value.

### `mapOptions`

```ts
import { mapOptions } from '@pdxui/core';

function mapOptions(records: T[], labelField = 'label', valueField = 'value'): SelectOption[]
```

Map raw records to {label, value} options via field names (keeps the source row under `_raw`).

### `marker`

```ts
import { marker } from '@pdxui/core';

function marker(label?: string): Comment
```

Create a comment marker for conditional/list boundaries.

### `match`

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

### `matchesFilters`

```ts
import { matchesFilters } from '@pdxui/core';

function matchesFilters(item: T, filters: (FilterDescriptor | CompositeFilter)[]): boolean
```

Match an array of filters (all must pass = implicit AND).

### `max`

```ts
import { max } from '@pdxui/core';

function max(maxVal: number, msg?: string): Validator<number>
```

Rejects a number above `maxVal`. Inclusive: `maxVal` itself is valid.

### `maxLength`

```ts
import { maxLength } from '@pdxui/core';

function maxLength(max: number, msg?: string): Validator<string>
```

Rejects a string longer than `max` characters.

Pair it with the input's own `maxlength` for the typing experience: this is what stops a pasted or
programmatic value, which the attribute does not.

### `measure`

```ts
import { measure } from '@pdxui/core';

function measure(el: HTMLElement): MeasureResult
```

Measure an element's dimensions and position. Wrapper for getBoundingClientRect().

### `measureRelative`

```ts
import { measureRelative } from '@pdxui/core';

function measureRelative(el: HTMLElement, relativeTo: HTMLElement): RelativeMeasureResult
```

Measure the relative position between two elements.

### `merged`

```ts
import { merged } from '@pdxui/core';

function merged(...sources: T): ReadonlySignal<{ [K in keyof T]: ReturnType<T[K]> }>
```

Combine multiple signal sources into one — re-emits whenever ANY source changes.
Returns latest values as a tuple.

Usage:
  const [width, height] = [signal(0), signal(0)];
  const dimensions = merged(() => width(), () => height());
  effect(() => console.log(dimensions())); // [w, h]

### `min`

```ts
import { min } from '@pdxui/core';

function min(minVal: number, msg?: string): Validator<number>
```

Rejects a number below `minVal`. Inclusive: `minVal` itself is valid.

### `minLength`

```ts
import { minLength } from '@pdxui/core';

function minLength(min: number, msg?: string): Validator<string>
```

Rejects a string shorter than `min` characters.

Length in JavaScript code units, so an emoji or an accented character composed of two code points
counts as two. For a "must be filled in" rule use {@link required} — this one passes on a value
that is not a string at all.

### `mount`

```ts
import { mount } from '@pdxui/core/testing';

function mount(html: string): Promise<HTMLElement>
```

Mount HTML into a container, wait for custom elements to upgrade.
Returns the container element for querying.

### `moveMounted`

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

### `mutation`

```ts
import { mutation } from '@pdxui/core';

function mutation(options: MutationOptions<TData, TInput>): Mutation<TData, TInput>
```

A write as reactive state: `execute(input)` plus the `pending`, `data` and `error` a form needs to
disable its submit button and show what happened.

Concurrent executions are refused, not queued: calling `execute` while one is in flight rejects
with "Mutation already in progress". That is the double-submit guard — a user double-clicking
Save must not create two records — and it is why this is not just an async function.

`invalidates` names the cache tags to drop on success, which is how a list refreshes itself after
an item is created without the caller wiring the two together.

### `OfflineError`

```ts
import { OfflineError } from '@pdxui/core';

class OfflineError
```

Error thrown when the device is offline and the request cannot be queued.

### `offlineMiddleware`

```ts
import { offlineMiddleware } from '@pdxui/core';

function offlineMiddleware(options: OfflineMiddlewareOptions = {}): HttpMiddleware
```

Queues mutations made while offline and replays them, in order, on reconnect.

Only POST/PUT/PATCH/DELETE are queued: a GET fails fast so the cache can answer it instead of
being replayed later against a page that has moved on. Replay is sequential FIFO, because the
order of two writes to the same record is the difference between the right value and the wrong
one.

The queue is capped (50 by default) and drops the OLDEST when full — bounded memory beats a
complete history, and a request from an hour ago is the one most likely to conflict. Requests are
deep-cloned on the way in, so a caller mutating its own object afterwards cannot change what gets
replayed. `persist: true` survives a reload via IndexedDB.

Replayed requests carry their ORIGINAL headers, including a bearer token that may have expired by
the time they are sent. `onReplay` is where you find out.

### `offset`

```ts
import { offset } from '@pdxui/core';

function offset(value: OffsetValue): Middleware
```

Add distance between reference and floating element.

### `onBeforeLeave`

```ts
import { onBeforeLeave } from '@pdxui/core';

function onBeforeLeave(fn: () => boolean | 'destroy' | Promise<boolean>): void
```

Register a navigation guard. Called before the router navigates away from the page this
component is on — the routed page itself or any component inside it.
Return false to block navigation, 'destroy' to force destroy even if keepAlive,
or a Promise<boolean> for async confirmation (e.g. "unsaved changes" dialog).

### `onCleanup`

```ts
import { onCleanup } from '@pdxui/core';

function onCleanup(fn: () => void): void
```

Register a cleanup function for the current effect.

### `onClickOutsideStack`

```ts
import { onClickOutsideStack } from '@pdxui/core';

function onClickOutsideStack(overlayId: string, element: HTMLElement, handler: () => void): Dispose
```

Stack-aware click-outside detection.
Only fires if the click is outside the element AND the overlay is still on top.

### `onDestroy`

```ts
import { onDestroy } from '@pdxui/core';

function onDestroy(fn: () => void): void
```

Register a callback to run before the component is destroyed.
Can be called from setup() or any composable function during setup.

### `onDispose`

```ts
import { onDispose } from '@pdxui/core';

function onDispose(fn: Dispose): void
```

Register a disposer with the current ownership scope (if any).
For constructs that manage their own teardown (e.g. repeat() items) and need a
disposer to fire only on scope teardown, never on effect re-run. No-op outside
a collectDisposers() scope.

### `onError`

```ts
import { onError } from '@pdxui/core';

function onError(fn: (err: unknown) => void): void
```

Register a component-level error handler.
Catches errors from effects and child components.

### `onGlobalError`

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

### `onHide`

```ts
import { onHide } from '@pdxui/core';

function onHide(fn: () => void): void
```

Register a callback to run when a keep-alive page is hidden (navigated away but kept alive).
Symmetric with onShow. Use for pausing timers, animations, or subscriptions.

### `onLocaleChange`

```ts
import { onLocaleChange } from '@pdxui/core';

function onLocaleChange(cb: () => void): () => void
```

Register a callback to be notified when the validation locale changes. Returns unsubscribe.

### `onLongpress`

```ts
import { onLongpress } from '@pdxui/core';

function onLongpress(el: HTMLElement, callback: (e: PointerEvent) => void, config?: LongpressConfig): Dispose
```

Listen for longpress (hold) gestures on an element.

@returns Dispose function to remove listeners.

### `onMount`

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

### `onPinch`

```ts
import { onPinch } from '@pdxui/core';

function onPinch(el: HTMLElement, callback: (event: PinchEvent) => void): Dispose
```

Listen for pinch (two-finger scale) gestures on an element.
Only fires on touch devices with multi-touch support.

@returns Dispose function to remove listeners.

### `onPropsChange`

```ts
import { onPropsChange } from '@pdxui/core';

function onPropsChange(fn: (changes: PropChange[]) => void): void
```

Register a callback to run when component props change from parent.
Receives an array of PropChange objects with name, oldValue, newValue.
Similar to Angular's ngOnChanges or Blazor's OnParametersSet.

### `onResize`

```ts
import { onResize } from '@pdxui/core';

function onResize(fn: (entry: ResizeObserverEntry) => void): void
```

Register a callback when the component element resizes.
Uses ResizeObserver (cleaned up on destroy).

@param fn - Called with ResizeObserverEntry on size change

### `onRouteChange`

```ts
import { onRouteChange } from '@pdxui/core';

function onRouteChange(fn: (params: Record<string, string>) => void): void
```

Register a callback when route params change but the component stays mounted.
E.g. navigating from /users/1 to /users/2 — same page component, different params.

### `onShow`

```ts
import { onShow } from '@pdxui/core';

function onShow(fn: () => void): void
```

Register a callback to run when a keep-alive page becomes visible again.
Triggered by the router outlet's 'pdx-page-show' event.
Useful for refreshing document.title or fetching fresh data on back-nav.

### `onSwipe`

```ts
import { onSwipe } from '@pdxui/core';

function onSwipe(el: HTMLElement, direction: SwipeDirection, callback: () => void, config?: SwipeConfig): Dispose
```

Listen for swipe gestures on an element.
Uses PointerEvents for unified touch/mouse/pen support.

@returns Dispose function to remove listeners.

### `onUpdated`

```ts
import { onUpdated } from '@pdxui/core';

function onUpdated(fn: () => void): void
```

Register a callback to run after reactive effects flush.
Useful for measuring DOM after updates.

### `onVisible`

```ts
import { onVisible } from '@pdxui/core';

function onVisible(fn: (entry: IntersectionObserverEntry) => void, options?: IntersectionObserverInit): void
```

Register a callback when the component enters the viewport.
Uses IntersectionObserver (one per component, cleaned up on destroy).

@param fn - Called with IntersectionObserverEntry when visibility changes
@param options - IntersectionObserver options (threshold, rootMargin)

### `opsForType`

```ts
import { opsForType } from '@pdxui/core';

function opsForType(type: FieldType | undefined): FilterOperator[]
```

The filter operators that make sense for a field type — what a filter builder should offer.

The distinctions are deliberate: text gets `contains`/`startswith`, numbers and dates get the
comparisons plus `between`, dates ALSO get the relative presets (`today`, `last7days`) which carry
no value because they are a range against now, and enums get set membership (`in`/`notin`) rather
than text matching — an enum is chosen from a list, not typed.

An unknown type falls back to the text set, which is the widest and least wrong.

### `overlayStack`

```ts
import { overlayStack } from '@pdxui/core';

const overlayStack: OverlayStack
```

Global overlay stack — manages z-index, Escape dismiss, body scroll lock.

### `pages`

```ts
import { pages } from '@pdxui/core';

function pages(activePage: () => K, pageMap: Record<K, () => Node | DocumentFragment>): DocumentFragment
```

Render one page at a time, caching previous pages (keep-alive).
Pages are created lazily on first visit and hidden (not destroyed) when inactive.

@param activePage - Reactive function returning the current page key.
@param pageMap - Map of page key → render function.
@returns DocumentFragment with all cached pages (only active one is visible).

### `pairwise`

```ts
import { pairwise } from '@pdxui/core';

function pairwise(source: () => T): DisposableSignal<[T, T]>
```

Emit pairs of [previous, current] values.

Usage:
  const pair = pairwise(count);
  effect(() => {
    const [prev, curr] = pair();
    console.log(`Delta: ${curr - prev}`);
  });

### `parseISO`

```ts
import { parseISO } from '@pdxui/core';

function parseISO(iso: string): CalendarDate
```

Parse ISO date string (YYYY-MM-DD) to CalendarDate.

### `pattern`

```ts
import { pattern } from '@pdxui/core';

function pattern(regex: RegExp, msg?: string): Validator<string>
```

Rejects a string that does not match `regex`.

An empty value passes, as with the other string rules. Give it a `msg`: the default is
"Invalid format", which tells the user nothing about what the pattern wants.

### `PdxElement`

```ts
import { PdxElement } from '@pdxui/core';

class PdxElement
```

Base class for PDX UI Web Components.

### `pipe`

```ts
import { pipe } from '@pdxui/core';

function pipe(source: () => unknown, ...operators: SignalOperator<unknown, unknown>[]): DisposableSignal<unknown>
```

Compose signal operators into a pipeline.

Usage:
  const result = pipe(query,
    debounce(300),
    distinct(),
    map(q => q.trim().toLowerCase()),
    filter(q => q.length > 2)
  );

### `playKeyframes`

```ts
import { playKeyframes } from '@pdxui/core';

function playKeyframes(el: HTMLElement, config: AnimationConfig): Promise<void>
```

Play a keyframe animation on an element. Returns a Promise.
Used by enter()/exit() when they receive an AnimationConfig instead of a string.

### `popErrorHandler`

```ts
import { popErrorHandler } from '@pdxui/core';

function popErrorHandler(): void
```

Pop the top error handler.

### `portal`

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

### `previous`

```ts
import { previous } from '@pdxui/core';

function previous(source: () => T): DisposableSignal<T | undefined>
```

Track the previous value of a signal.

Usage:
  const prev = previous(count);
  effect(() => console.log(`${prev()} → ${count()}`));

### `provide`

```ts
import { provide } from '@pdxui/core';

function provide(key: string | symbol, value: T, element?: HTMLElement): void
```

Provide a value on a specific element (DOM-scoped).
Descendants can inject it via context-request event.
If no element is specified, provides globally (app-wide).

### `provideFieldGroupPath`

```ts
import { provideFieldGroupPath } from '@pdxui/core';

function provideFieldGroupPath(path: string, element?: HTMLElement): void
```

Provide a field group path prefix on a host element.
Children use useFieldGroupPath() to build their full dotted path.

### `provideForm`

```ts
import { provideForm } from '@pdxui/core';

function provideForm(form: Form<T>, element?: HTMLElement): void
```

Provide a Form instance on a host element.
Descendants can access it via useForm() / tryUseForm().

### `provideFormCoordinator`

```ts
import { provideFormCoordinator } from '@pdxui/core';

function provideFormCoordinator(coordinator: FormCoordinator, element?: HTMLElement): void
```

Provide a FormCoordinator for nested form orchestration.

### `provideWritable`

```ts
import { provideWritable } from '@pdxui/core';

function provideWritable(key: string | symbol, value: Signal<T>, element?: HTMLElement): void
```

Provide a writable signal for bidirectional context.
Children can read AND write the value via useWritable().
Semantic sugar over provide() — clarifies bidirectional intent.

### `pushErrorHandler`

```ts
import { pushErrorHandler } from '@pdxui/core';

function pushErrorHandler(handler: (err: unknown) => void): void
```

Push an error handler onto the stack. Effects that throw propagate to this handler.

### `queryByRole`

```ts
import { queryByRole } from '@pdxui/core/testing';

function queryByRole(container: HTMLElement, role: string, options?: { name?: string | RegExp }): HTMLElement | null
```

Find element by ARIA role. Returns null if not found.

### `queryByText`

```ts
import { queryByText } from '@pdxui/core/testing';

function queryByText(container: HTMLElement, text: string | RegExp): HTMLElement | null
```

Find element by text content. Returns null if not found.

### `recordDevtoolsNavigation`

```ts
import { recordDevtoolsNavigation } from '@pdxui/core';

function recordDevtoolsNavigation(entry: Omit<DevtoolsNavigation, 'time'>): void
```

The router records a navigation that finished — matched, refused, or not found.

### `recordPositions`

```ts
import { recordPositions } from '@pdxui/core';

function recordPositions(nodes: Node[]): Map<Element, Rect>
```

Record positions of elements before a DOM mutation.
Returns a map of element → bounding rect.

### `ref`

```ts
import { ref } from '@pdxui/core';

function ref(): Signal<T | null>
```

A signal for a DOM element, starting as `null`.

The target of `:ref="el"` in a template: the element is assigned when it mounts, so reading it
before that gives `null` rather than a stale node. Use it instead of `document.getElementById` —
PDX renders into the light DOM, so ids are neither unique nor available when `onMount` runs.

### `registerComponentStrings`

```ts
import { registerComponentStrings } from '@pdxui/core';

function registerComponentStrings(component: string, strings: ComponentStrings): void
```

Register default strings for a component.
Called by component authors to set English defaults.

@example
registerComponentStrings('select', {
    placeholder: 'Select...',
    noResults: 'No results found',
    clear: 'Clear selection',
    loading: 'Loading...',
});

### `registerContainerQueries`

```ts
import { registerContainerQueries } from '@pdxui/core';

function registerContainerQueries(el: HTMLElement, breakpoints?: Record<string, number>): Dispose
```

Register container queries on an element.
Sets `container-type: inline-size` and applies data-attributes for custom breakpoints.

### `registerFormControl`

```ts
import { registerFormControl } from '@pdxui/core';

function registerFormControl(tagName: string, config?: FormControlConfig): void
```

Register a custom element as a form control.
Once registered, the compiler auto-wires it inside <pdx-form>,
and pdx-form-template can render it via JSON schema.

### `registerFormFieldType`

```ts
import { registerFormFieldType } from '@pdxui/core';

function registerFormFieldType(typeName: string, tagName: string): void
```

Register a custom field type for JSON schema → component mapping.
Usage: `registerFormFieldType('datepicker', 'my-date-picker')`
Then in schema: `{ name: 'date', type: 'datepicker' }`

### `registerIconSet`

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

### `RELATIVE_DATE_OPS`

```ts
import { RELATIVE_DATE_OPS } from '@pdxui/core';

const RELATIVE_DATE_OPS: FilterOperator[]
```

Relative date presets — a range relative to "now", carrying no value of its own.

### `remove`

```ts
import { remove } from '@pdxui/core';

function remove(node: Node): void
```

Remove a node from its parent.

### `renderSlot`

```ts
import { renderSlot } from '@pdxui/core';

function renderSlot(slots: Record<string, SlotFunction> | undefined, name: string, scopeFn: (() => Record<string, unknown>) | null, defaultFn: () => Node | DocumentFragment): DocumentFragment
```

Render a scoped slot. If the parent provided a slot function, call it with scope data.
Otherwise, render the default content.

### `repeat`

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

### `repeatWithSlot`

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

### `requestContext`

```ts
import { requestContext } from '@pdxui/core';

function requestContext(element: HTMLElement, key: string | symbol): T | undefined
```

Request a context value via W3C Context Protocol.
Dispatches a context-request event and returns the value from the nearest provider.
Works with any Web Component (including non-Pragmatic ones like Lit).

### `required`

```ts
import { required } from '@pdxui/core';

function required(msg?: string): Validator
```

Rejects a value the user has not supplied: `null`, `undefined`, a string that is only whitespace,
or an empty array.

Note what it does NOT reject: `0` and `false` are values, and a required numeric or checkbox field
is satisfied by them. Pass `msg` to override the message; without it the text comes from the
active validation locale.

### `requirePermission`

```ts
import { requirePermission } from '@pdxui/core';

function requirePermission(permission: string, thenFn: () => Node | DocumentFragment, elseFn?: (() => Node | DocumentFragment | null) | null): DocumentFragment
```

Permission-gated rendering. Shows thenFn only if permission is granted.

Usage:
  ${requirePermission('booking.delete', () => html`<button>Delete</button>`)}
  ${requirePermission('admin', () => html`<nav>Admin</nav>`, () => html`<span>No access</span>`)}

### `resetI18n`

```ts
import { resetI18n } from '@pdxui/core/i18n';

function resetI18n(): void
```

Reset i18n state (for testing).

### `resolveIcon`

```ts
import { resolveIcon } from '@pdxui/core';

function resolveIcon(iconName: string, setName?: string): Promise<string | SVGElement | null>
```

Resolve an icon by name from a registered set.
Returns SVG markup string, SVGElement, or null if not found.

### `resolveValidationMessage`

```ts
import { resolveValidationMessage } from '@pdxui/core';

function resolveValidationMessage(result: ValidationResult): string | undefined
```

Resolve a ValidationResult to a display string.
Handles both plain strings and structured ValidationMessage objects.

### `resource`

```ts
import { resource } from '@pdxui/core';

function resource(fetcher: () => Promise<T>, options?: ResourceOptions<T>): Resource<T>
```

An async value as reactive state: `data`, `error` and `state` you read like signals, with the
fetch, the cache, the retries and the cancellation already handled.

The four states are `idle | loading | success | error`, and the point of having them is that a
template branches on `state()` instead of juggling a loading boolean against a possibly-stale
`data`. {@link resourceWhen} renders that branch for you.

A stale response can never overwrite a fresh one: each fetch takes a generation number and an
AbortController, so a slow request that returns after a newer one is discarded rather than
flickering the old value back in.

`key` puts the result in the cache and shares it with every other resource using that key;
`tags` are what {@link invalidate} matches on after a {@link mutation}. `staleTime` (30s by
default) is how long a cached value is served without a refetch.

In a `.pdx` file `@fetch users: '/api/users'` compiles to this.

### `resourceWhen`

```ts
import { resourceWhen } from '@pdxui/core';

function resourceWhen(res: Resource<T>, handlers: ResourceHandlers<T>): DocumentFragment
```

Render one branch per resource state, and swap it when the state changes.

Takes `{ loading, error, success, empty?, reloading? }` and returns a fragment that keeps itself
in step with the resource. The branches it renders are OWNED: the effects created by the previous
branch are disposed when the state changes, so a loading spinner's timer does not survive the
success it was replaced by.

`empty` is the branch that stops "loaded, and there is nothing" from looking like "still loading";
`reloading` lets a background refresh show the old data instead of blanking the screen.

### `responsive`

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

### `responsiveCSS`

```ts
import { responsiveCSS } from '@pdxui/core';

function responsiveCSS(min: number, max: number, options?: Pick<ResponsiveValueOptions, 'unit' | 'viewportMin' | 'viewportMax' | 'relative'>): string
```

Generate a CSS clamp() expression using the Utopia fluid type formula.

Formula:
  slope = (max - min) / (viewportMax - viewportMin)
  intercept = min - slope * viewportMin
  preferred = intercept + slope * 100vw
  result = clamp(min, preferred, max)

@returns CSS expression string: 'clamp(16px, calc(4.8px + 2.5vw), 64px)'

### `responsiveValue`

```ts
import { responsiveValue } from '@pdxui/core';

function responsiveValue(min: number, max: number, options?: ResponsiveValueOptions): ReadonlySignal<number>
```

Create a responsive value that changes with viewport width.
Returns a read-only signal that updates on resize.

For Tier 1/2 (no easing), use responsiveCSS() instead (zero JS cost).
This function is for Tier 3 cases requiring custom easing curves.

### `restoreScrollPosition`

```ts
import { restoreScrollPosition } from '@pdxui/core';

function restoreScrollPosition(path: string, isBack: boolean, content?: Element | null, behavior?: ScrollRestoration): void
```

Restore scroll position for a route path, or scroll to top.
Called by router after navigation, with the same `content` element as {@link saveScrollPosition}.

### `restTransport`

```ts
import { restTransport } from '@pdxui/core';

function restTransport(options: RestTransportOptions<T>): IDataTransport<T>
```

A {@link createDataSource} backend that talks to a REST API: paging, sorting, filtering and CRUD
over `fetch`.

The two hooks that matter are `parameterMap`, which turns the grid's descriptors into whatever
query string your server expects, and `parseResponse`, which reads its answer. Without them it
assumes the common convention — `{ data, total }`, or a bare array with `total: -1` meaning
unknown — and that convention is the only thing to change when a server disagrees.

`total: -1` is not an error: it means the server did not say how many rows exist, and the grid
shows a next-page control instead of a page count.

### `retryMiddleware`

```ts
import { retryMiddleware } from '@pdxui/core';

function retryMiddleware(options: RetryMiddlewareOptions = {}): HttpMiddleware
```

Retries a failed request with exponential backoff and jitter.

Retries only what retrying can fix: 5xx, 408 and 429, plus network errors. A 4xx is the server
saying the request itself is wrong, and repeating it changes nothing.

By default it also retries only IDEMPOTENT methods (GET, HEAD, OPTIONS, PUT, DELETE), because a
POST that timed out may well have succeeded — replaying it can charge a card twice. Set
`idempotentOnly: false` only when the endpoint is idempotent by its own design (an idempotency
key, say).

The jitter is not decoration: without it every client that failed together retries together, and
the recovering server is hit by the same spike that took it down.

On by default in {@link createHttpClient}; pass `retry: false` there to turn it off.

### `retrySignal`

```ts
import { retrySignal } from '@pdxui/core';

function retrySignal(fetcher: (signal: AbortSignal) => Promise<T>, options?: RetryOptions): AsyncSignal<T> & { retry: () => void }
```

Retry a failing async operation with configurable backoff.

Usage:
  const data = retrySignal(
    () => fetch('/api/data').then(r => r.json()),
    { maxRetries: 3, backoff: 'exponential', delayMs: 1000 }
  );

### `routeTrail`

```ts
import { routeTrail } from '@pdxui/core';

function routeTrail(): RouteCrumb[]
```

The matched chain as crumbs, outermost first. Reactive: a reader re-runs on every navigation.

### `roving`

```ts
import { roving } from '@pdxui/core';

function roving(container: HTMLElement, options?: RovingOptions): Dispose
```

Enable roving tabindex pattern on a container.
Only ONE item inside the container has tabindex="0" (the active one).
All others have tabindex="-1". Arrow keys move focus between items.

This is a convenience wrapper around focusGroup() — backward compatible API.

Usage:
  const dispose = roving(tablistElement, {
    orientation: 'horizontal',
    onSelect: (el, i) => activateTab(i),
  });

### `rowMenu`

```ts
import { rowMenu } from '@pdxui/core';

function rowMenu(opts: { items: RowMenuItem[]; label?: string | ((row: CellRow) => string); icon?: string }): CellRowMenuSpec
```

Render the cell as ONE control that opens the row's menu.

The other shape of {@link actions}, and the one to reach for past two entries: a row of four icon
buttons is the whole width of a 390px phone, and the actions a single record has and a selection
does not — duplicate, print, open in a new tab — have nowhere else to live. The trigger says
`aria-haspopup="menu"`, the menu is the grid's own (arrows, type-ahead, Escape back to the
trigger), and a click on either never reaches the row underneath.

### `rtlTransformX`

```ts
import { rtlTransformX } from '@pdxui/core';

function rtlTransformX(value: number): number
```

Transform a value for RTL context.
Useful for: margin-left → margin-right, translateX(10) → translateX(-10).

### `safeHandler`

```ts
import { safeHandler } from '@pdxui/core';

function safeHandler(fn: (...args: any[]) => any, component?: string, event?: string): (...args: any[]) => any
```

Wrap an event handler function so errors are caught and routed.
Tries the local error boundary first, then falls back to global handler.
Used by the compiler to wrap @click, @input, etc.

### `sample`

```ts
import { sample } from '@pdxui/core';

function sample(source: () => T, notifier: () => unknown): DisposableSignal<T>
```

Sample the source signal only when the notifier changes.
Like RxJS sample — useful for "get value on button click".

Usage:
  const sampled = sample(() => formData(), () => submitClicked());

The source is read through {@link untracked}, and that is the operator: read tracked, it becomes a
second dependency and the sampled signal follows the source, which is a mirror and not a sample.
The usage above is the case it breaks — form data changes on every keystroke.

### `sanitizeBoundUrl`

```ts
import { sanitizeBoundUrl } from '@pdxui/core';

function sanitizeBoundUrl(el: Element, attr: string, raw: unknown): string | null
```

Sanitise a URL bound to `attr` on `el` with the policy of what the URL is used for: media for
`poster`, and for `src` on img/source/video/audio or on a custom element; the link policy for
everything else, a custom element's `href` included. In dev a dropped value is reported once per
element and attribute, with its scheme: an empty `src` and nothing in the console would leave a
dropped URL unnoticed.

### `sanitizeMediaUrl`

```ts
import { sanitizeMediaUrl } from '@pdxui/core';

function sanitizeMediaUrl(raw: unknown): string | null
```

The policy for a URL an element LOADS as media (`<img src>`, `<video poster>`), not one it
navigates to. It accepts what {@link sanitizeUrl} accepts, plus a local object URL (`blob:`,
from `URL.createObjectURL(file)`: the preview of a file the user just picked) and a raster
`data:image/*`. Links keep `sanitizeUrl`, which still rejects both.

### `sanitizeUrl`

```ts
import { sanitizeUrl } from '@pdxui/core';

function sanitizeUrl(raw: unknown): string | null
```

Return the URL if it is safe to use as a navigation/link target, or null if it must be rejected.
Safe = relative URLs, fragments and queries (no scheme), or an explicit scheme in the allow-list
(http/https/mailto/tel/ftp). Anything else — a dangerous/unknown scheme, or control chars used to
smuggle one (`java&#9;script:`) — returns null so the caller can drop it (`?? '#'`, skip nav, …).

### `saveBlob`

```ts
import { saveBlob } from '@pdxui/core';

function saveBlob(blob: Blob, filename: string): void
```

Save a Blob as a file the user has.

The browser has no API for this: it takes an object URL, an anchor that must be IN the document
to be clickable in Firefox, a click, the removal, and `revokeObjectURL` — which is the step that
gets forgotten, and forgetting it holds the blob for the life of the document.

Usage:
  const handle = downloadFile('/api/export/7');
  saveBlob(await handle.result, handle.filename() ?? 'export.csv');

### `saveFocus`

```ts
import { saveFocus } from '@pdxui/core';

function saveFocus(): () => void
```

Save and restore focus — useful for modals/drawers.

Usage:
  const restore = saveFocus();
  openModal();
  // ... later
  closeModal();
  restore(); // returns focus to original element

### `saveScrollPosition`

```ts
import { saveScrollPosition } from '@pdxui/core';

function saveScrollPosition(path: string, content?: Element | null): void
```

Save current scroll position for a route path.
Called by router before navigation. `content` is the element the page renders in (the router
outlet): when an ancestor of it scrolls, that container's offset is saved with the window's.

### `scan`

```ts
import { scan } from '@pdxui/core';

function scan(source: () => T, reducer: (acc: R, value: T) => R, initialValue: R): DisposableSignal<R>
```

Accumulate values over time (like Array.reduce but reactive).

Usage:
  const total = scan(() => clicks(), (acc, v) => acc + v, 0);
  // Every click adds to total

### `screen`

```ts
import { screen } from '@pdxui/core';

const screen
```

Centralized screen/device signals. One matchMedia listener per query.

### `scrollTo`

```ts
import { scrollTo } from '@pdxui/core';

function scrollTo(target: string | number | Element, options?: { behavior?: ScrollBehavior }): void
```

Scroll to a target: CSS selector, element, or Y position.

### `setComponentStrings`

```ts
import { setComponentStrings } from '@pdxui/core';

function setComponentStrings(component: string, strings: ComponentStrings): void
```

Override strings for a component (e.g. for i18n).
Merges with existing overrides — only overrides specified keys. An override wins over the
defaults whenever they are registered, before or after it.

@example
setComponentStrings('select', {
    placeholder: 'Seleziona...',
    noResults: 'Nessun risultato',
});

### `setDefaultCache`

```ts
import { setDefaultCache } from '@pdxui/core';

function setDefaultCache(cache: Cache): void
```

Replace the process-wide cache.

For tests and for setup code that wants different staleness or size limits. Anything already
holding the previous cache keeps it, so call this before creating resources, not after.

### `setDefaultClient`

```ts
import { setDefaultClient } from '@pdxui/core';

function setDefaultClient(client: HttpClient): void
```

Set the default HTTP client (called once during app init).

### `setDefaultIconSet`

```ts
import { setDefaultIconSet } from '@pdxui/core';

function setDefaultIconSet(name: string): void
```

Set the default icon set by name.

### `setDevtoolsRouteSource`

```ts
import { setDevtoolsRouteSource } from '@pdxui/core';

function setDevtoolsRouteSource(source: () => DevtoolsRoute | null): void
```

The router says where to read the current route from. One router at a time: the last one wins.

### `setDirection`

```ts
import { setDirection } from '@pdxui/core';

function setDirection(dir: 'ltr' | 'rtl'): void
```

Force set direction (e.g. for testing or user override).

### `setFallbackLocale`

```ts
import { setFallbackLocale } from '@pdxui/core/i18n';

function setFallbackLocale(loc: string): void
```

Set the fallback locale for missing keys.

### `setLocale`

```ts
import { setLocale } from '@pdxui/core';

function setLocale(loc: string): void
```

Change the active locale. Validates against supported list.

### `setLocaleStrings`

```ts
import { setLocaleStrings } from '@pdxui/core';

function setLocaleStrings(locale: Record<string, ComponentStrings>): void
```

Bulk set strings for multiple components at once (e.g. loading a locale file).

@example
setLocaleStrings({
    select: { placeholder: 'Seleziona...', noResults: 'Nessun risultato' },
    datepicker: { today: 'Oggi', clear: 'Cancella' },
    dialog: { close: 'Chiudi' },
});

### `setNestedValue`

```ts
import { setNestedValue } from '@pdxui/core';

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void
```

Set a value in a nested object by dotted path, creating intermediate objects/arrays as needed.

### `setPermissions`

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

### `setProp`

```ts
import { setProp } from '@pdxui/core';

function setProp(el: Element, key: string, value: unknown): void
```

Set a property or attribute on an element. Handles special cases (events, boolean attrs, style, class).

### `setRouteTrail`

```ts
import { setRouteTrail } from '@pdxui/core';

function setRouteTrail(crumbs: RouteCrumb[]): void
```

Called by the router on every navigation. An application does not call this.

### `setScheme`

```ts
import { setScheme } from '@pdxui/core';

function setScheme(scheme: 'light' | 'dark'): void
```

Set the color scheme ('light' or 'dark').
Sets `pdx-scheme` attribute on <html> and persists to localStorage.

### `setTelemetryLevel`

```ts
import { setTelemetryLevel } from '@pdxui/core';

function setTelemetryLevel(level: TelemetryLevel): void
```

Set telemetry level. 0=off, 1=errors only (prod-safe), 2=full trace (dev).

### `setTheme`

```ts
import { setTheme } from '@pdxui/core';

function setTheme(name: string): void
```

Set the brand theme (e.g. 'material', 'fluent', 'cupertino').
Sets `pdx-theme` attribute on <html>, persists to localStorage,
and syncs behavior attributes (input-style, tab-style, card-style)
from the theme's CSS custom properties.

### `setValidationLocale`

```ts
import { setValidationLocale } from '@pdxui/core';

function setValidationLocale(resolver: LocaleResolver): void
```

Set a global locale resolver for validation messages.
The resolver receives an i18n key and params, returns the translated string.
Return undefined to fall back to the message's fallback string.

### `shallowStore`

```ts
import { shallowStore } from '@pdxui/core';

function shallowStore(initial: T): T
```

Create a SHALLOW reactive proxy — only top-level property changes are tracked.
Nested objects are NOT proxied. Ideal for large immutable datasets (DataTable, API responses).
Triggers reactivity only on reassignment, NOT on deep mutation.

Usage:
  const data = store.raw({ items: hugeArray, meta: { total: 1000 } });
  data.items = newArray;     // reactive — triggers subscribers
  data.items.push(x);       // NOT reactive — no proxy on nested
  data.meta = { total: 5 }; // reactive
  data.meta.total = 5;      // NOT reactive

### `shift`

```ts
import { shift } from '@pdxui/core';

function shift(options?: ShiftOptions): Middleware
```

Shift the floating element along the axis to keep it within the boundary (or viewport).

### `show`

```ts
import { show } from '@pdxui/core';

function show(condition: () => boolean, content: Node | DocumentFragment): DocumentFragment
```

Show/hide without removing from DOM. Toggles display:none.
Unlike when(), preserves element state (scroll, canvas, form values).

Usage:
  ${show(() => isVisible(), html`<div class="panel">...</div>`)}

### `showSkeleton`

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

### `signal`

```ts
import { signal } from '@pdxui/core';

function signal(initial: T, options?: SignalOptions<T>): Signal<T> | HistorySignal<T>
```

A value that tells its readers when it changes. The unit everything reactive in PDX is built from.

Reading is calling it: `count()`. Writing is `count.set(next)` or `count.set(v => v + 1)`. Any
{@link effect} or `computed` that read it during its last run re-runs when it changes; nothing
else does, so there is no diffing and no dependency array to keep correct.

Writes are auto-batched: several mutations in the same synchronous turn produce ONE flush, so a
subscriber never observes a half-updated state. {@link batch} is for the cases where you need to
say so explicitly.

In a `.pdx` file you rarely call this — `let count = $signal(0)` compiles to it, and `count++`
compiles to the `.set`.

`{ history: true }` returns a {@link HistorySignal} that remembers previous values for undo/redo;
`{ equals }` replaces the identity check that decides whether a write is a change at all — and
it decides the WRITE, not just the notification: a value it calls equal is never stored, so a
reader holding the old one by identity keeps pointing at it. For a value rebuilt on every write
(a parsed query, a DTO, an array mapped from a store) `Object.is` says «changed» every time, and
on a page where such a value round-trips that is a loop with nothing to stop it.

### `sizeMiddleware`

```ts
import { sizeMiddleware } from '@pdxui/core';

function size(options?: SizeOptions): Middleware
```

Constrain the floating element's max dimensions to available space.

### `skip`

```ts
import { skip } from '@pdxui/core';

function skip(count: number): SignalOperator<T, T>
```

Skip the first N changes after initial value.

### `skipUntil`

```ts
import { skipUntil } from '@pdxui/core';

function skipUntil(source: () => T, gate: () => unknown): DisposableSignal<T>
```

Ignore source emissions until the gate signal becomes truthy.

Usage:
  const gated = skipUntil(() => data(), () => isReady());

### `slotCarrier`

```ts
import { slotCarrier } from '@pdxui/core';

function slotCarrier(name: string, fn: SlotFunction): HTMLElement
```

Create a carrier element that transports a slot function from parent to child.
The child's _projectSlots() extracts this during mount.
Generated by the compiler for @slot(name, { vars }) { body } directives.

### `SPLASH_ID`

```ts
import { SPLASH_ID } from '@pdxui/core';

const SPLASH_ID
```

The id the compiler gives the splash element.

### `splashReady`

```ts
import { splashReady } from '@pdxui/core';

function splashReady(condition: PromiseLike<unknown>): void
```

Hold the splash until `condition` settles.

Settled either way: a condition that fails is the app's to report, on its own screen — a splash
that never leaves reports nothing. A condition handed over once the splash has gone is ignored.

### `spring`

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

### `status`

```ts
import { status } from '@pdxui/core';

function status(opts?: { tones?: Record<string, string>; tone?: string }): CellStatusSpec
```

Render the cell as a status indicator — a dot and a label — with the same tone mapping as
{@link badge}.

Reach for this when the value IS the state of the row (active, failed, pending); {@link badge} is
for a label that happens to be coloured, like a category or a tier.

### `store`

```ts
import { store } from '@pdxui/core';

function store(initial: T): T
```

Create a deep reactive proxy around an object.
Direct property mutations trigger fine-grained signal updates.

@param initial - The initial state object
@returns A proxy that looks identical but tracks all reads/writes reactively

### `swipeDownDismiss`

```ts
import { swipeDownDismiss } from '@pdxui/core';

function swipeDownDismiss(el: HTMLElement, onDismiss: () => void, threshold = 100): Dispose
```

Enable swipe-down gesture to dismiss an overlay.
The overlay moves down with the finger; if swiped past threshold, it's dismissed.
Returns a Dispose function to remove listeners.

### `switchSignal`

```ts
import { switchSignal } from '@pdxui/core';

function switchSignal(source: () => S, fetcher: (value: S, signal: AbortSignal) => Promise<T>): AsyncSignal<T>
```

Cancel the previous async operation when the source changes.
The RxJS switchMap equivalent — the most useful async pattern.

Usage:
  const results = switchSignal(
    () => searchQuery(),
    (query) => fetch(`/api/search?q=${query}`).then(r => r.json())
  );
  effect(() => {
    if (results.loading()) showSpinner();
    else renderResults(results());
  });

### `take`

```ts
import { take } from '@pdxui/core';

function take(count: number): SignalOperator<T, T>
```

Take only the first N emissions (changes), then freeze. Initial value doesn't count.

### `takeUntil`

```ts
import { takeUntil } from '@pdxui/core';

function takeUntil(source: () => T, stopper: () => unknown): DisposableSignal<T>
```

Pass source emissions until the stopper becomes truthy, then freeze.

Usage:
  const limited = takeUntil(() => data(), () => isDestroyed());

### `tap`

```ts
import { tap } from '@pdxui/core';

function tap(fn: (value: T) => void): SignalOperator<T, T>
```

Debug: observe values flowing through the pipe without modifying them.

### `templatePipe`

```ts
import { templatePipe } from '@pdxui/core';

function pipe(value: T, ...transforms: ((v: any) => any)[]): unknown
```

Value transformation chain. Applies transforms left-to-right.

Usage:
  ${pipe(item.price, currency, compact)}
  :text=${() => pipe(name(), uppercase, truncate(20))}

### `text`

```ts
import { text } from '@pdxui/core';

function text(value: string): Text
```

Create a text node. SSR returns null-safe stub.

### `throttle`

```ts
import { throttle } from '@pdxui/core';

function throttle(ms: number): SignalOperator<T, T>
```

Throttle operator for pipe().

### `throttled`

```ts
import { throttled } from '@pdxui/core';

function throttled(source: () => T, ms: number): ReadonlySignal<T> & { dispose: Dispose }
```

Create a throttled signal — value updates at most every `ms` milliseconds.
Useful for scroll handlers, mouse move, etc.

Usage:
  const scrollY = signal(0);
  const throttledY = throttled(() => scrollY(), 100);

### `tick`

```ts
import { tick } from '@pdxui/core/testing';

function tick(): Promise<void>
```

Flush all pending signal effects and microtasks.
Useful after signal.set() to verify DOM updates.

### `timeoutMiddleware`

```ts
import { timeoutMiddleware } from '@pdxui/core';

function timeoutMiddleware(ms: number): HttpMiddleware
```

Gives requests a deadline by writing it into `meta._timeout`, which the client turns into an
AbortController.

Prefer `createHttpClient({ timeout })`, which is the same deadline expressed where the reader
looks for it — this exists for the case where different middleware layers need different
deadlines. It does NOT override a request that already carries one.

A request with no deadline never settles: `loading` stays true and no error is ever produced, so
the component shows its skeleton for as long as the tab is open. That is why the default client
sets 30s.

### `toAsync`

```ts
import { toAsync } from '@pdxui/core';

function toAsync(source: () => T): AsyncIterable<T> & { dispose: Dispose }
```

Convert a signal source into an async iterable.
Enables `for await` patterns with signals.

Usage:
  for await (const value of toAsync(count)) {
    console.log('Count changed to:', value);
    if (value >= 10) break;
  }

### `toColumnDefs`

```ts
import { toColumnDefs } from '@pdxui/core';

function toColumnDefs(fields: FieldDefinition[]): ColumnDef[]
```

Convert FieldDefinition[] → ColumnDef[] for pdx-data-grid.

### `toCsv`

```ts
import { toCsv } from '@pdxui/core';

function toCsv(rows: readonly Record<string, unknown>[], columns: readonly CsvColumn[]): string
```

The rows, as the bytes of a CSV file.

A BOM first, because without it Excel decodes UTF-8 as its local code page and the first
accented name arrives as mojibake — the complaint that follows every first CSV export. Lines end
with CRLF, which is what RFC 4180 says and what Excel expects.

What is NOT decided here: WHICH rows. That is the caller's, and it is the important half — a
user who filtered 8000 rows down to 40 wants those 40, and a selection wins over the filter.

### `today`

```ts
import { today } from '@pdxui/core';

function today(): string
```

Today, as `YYYY-MM-DD`, in the machine's LOCAL timezone.

Local rather than UTC on purpose: "today" in a date picker is the user's today. That also makes it
the one function here that is not pure, so a test that needs a fixed date should pass one in
rather than call this.

### `toFilterFields`

```ts
import { toFilterFields } from '@pdxui/core';

function toFilterFields(fields: FieldDefinition[]): FilterField[]
```

Convert FieldDefinition[] → FilterField[] for pdx-filter-builder.

### `toFormFields`

```ts
import { toFormFields } from '@pdxui/core';

function toFormFields(fields: FieldDefinition[]): FormFieldSchema[]
```

Convert FieldDefinition[] → FormFieldSchema[] for pdx-auto-form / pdx-form-template.

### `toggle`

```ts
import { toggle } from '@pdxui/core/devtools';

function toggle(): void
```

Show or hide the DevTools overlay, creating it on first use.

While visible it polls every 500ms; hiding it stops the interval, so a panel left open does not
quietly cost a re-read of the signal registry forever. Also bound to Ctrl+Shift+D by
{@link initDevTools}.

### `toggleDarkMode`

```ts
import { toggleDarkMode } from '@pdxui/core';

function toggleDarkMode(): void
```

Toggle between 'light' and 'dark' color schemes.

### `toISO`

```ts
import { toISO } from '@pdxui/core';

function toISO(d: CalendarDate): string
```

Convert CalendarDate to ISO string (YYYY-MM-DD).

### `toPromise`

```ts
import { toPromise } from '@pdxui/core';

function toPromise(source: () => T, predicate?: (value: T) => boolean): Promise<T>
```

Wait for a signal to match a condition, resolving as a Promise.
Bridge from reactive world back to async/await.

Usage:
  await toPromise(isReady);                     // wait until truthy
  await toPromise(count, v => v >= 10);         // wait until count >= 10
  const user = await toPromise(userData);       // wait until defined

### `toTC39Computed`

```ts
import { toTC39Computed } from '@pdxui/core';

function toTC39Computed(comp: ReadonlySignal<T>): TC39Computed<T>
```

Wrap a Pragmatic computed as a TC39-compatible Computed signal.

### `toTC39State`

```ts
import { toTC39State } from '@pdxui/core';

function toTC39State(sig: Signal<T>): TC39State<T>
```

Wrap a Pragmatic signal as a TC39-compatible State signal.

Usage:
  const pdxSig = signal(0);
  const tc39Sig = toTC39State(pdxSig);
  tc39Sig.get(); // 0
  tc39Sig.set(5);

### `toXlsx`

```ts
import { toXlsx } from '@pdxui/core';

function toXlsx(rows: readonly Record<string, unknown>[], columns: readonly XlsxColumn[]): Blob
```

The rows, as an Excel workbook: one sheet, the header in bold, numbers and dates typed, the rest
as the column's `format` shows it.

Which rows is the caller's, as for `toCsv`: the selection when there is one, otherwise what the
filter selects.

### `tryInject`

```ts
import { tryInject } from '@pdxui/core';

function tryInject(key: string | symbol, from?: HTMLElement): T | undefined
```

Try to inject a value. Returns undefined if not found.

### `tryUseForm`

```ts
import { tryUseForm } from '@pdxui/core';

function tryUseForm(from?: HTMLElement): Form<T> | undefined
```

Try to inject the nearest Form. Returns undefined if none found.

Without an argument it must be called during setup(), and answers for that moment.

With `from`, it looks up from that element whenever it is called, in setup or not. When it finds
nothing, an effect that called it runs again as soon as a form is provided — so a component that
may be set up before its form reads it through `tryUseForm(ctx.el)` inside the code that uses it,
and keeps it once found.

### `tryUseProvided`

```ts
import { tryUseProvided } from '@pdxui/core';

function tryUseProvided(key: string | symbol): T | undefined
```

Composable: try to inject a provided value. Returns undefined if not found.
Must be called during setup().

### `tryUseWritable`

```ts
import { tryUseWritable } from '@pdxui/core';

function tryUseWritable(key: string | symbol): Signal<T> | undefined
```

Composable: try to inject a writable signal. Returns undefined if not found.
Must be called during setup().

### `tween`

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

### `tweenMulti`

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

### `type`

```ts
import { type } from '@pdxui/core/testing';

function type(element: HTMLElement, text: string): Promise<void>
```

Simulate typing text into an input/textarea. Fires input + change events.

### `unflattenValues`

```ts
import { unflattenValues } from '@pdxui/core';

function unflattenValues(flat: Record<string, unknown>): Record<string, unknown>
```

Reconstruct a nested object from dotted-path keys.
`{ 'customer.name': 'Jane' }` → `{ customer: { name: 'Jane' } }`.
Numeric path segments create arrays: `{ 'items.0.qty': 2 }` → `{ items: [{ qty: 2 }] }`.

### `untracked`

```ts
import { untracked } from '@pdxui/core';

function untracked(fn: () => T): T
```

Read signals without tracking dependencies.
Inside an effect/computed, reads performed in the callback won't create subscriptions.

Usage:
  effect(() => {
    const tracked = count();          // subscribes
    const silent = untracked(() => other()); // does NOT subscribe
  });

### `uploadFile`

```ts
import { uploadFile } from '@pdxui/core';

function uploadFile(url: string, file: File | Blob, options?: UploadOptions): TransferHandle
```

Upload a file with reactive progress tracking.
Uses XMLHttpRequest for upload.onprogress events (fetch doesn't support this).

Usage:
  const handle = uploadFile('/api/upload', myFile, { fieldName: 'avatar' });
  effect(() => console.log(`${handle.progress()}%`));
  const response = await handle.result;

### `url`

```ts
import { url } from '@pdxui/core';

function url(msg?: string): Validator<string>
```

Rejects a string the URL parser cannot parse.

Uses the platform's own `new URL()`, so it requires a scheme: `example.com` fails,
`https://example.com` passes. Empty passes. If you want to accept a bare host, normalise before
validating rather than loosening this.

### `useActiveDescendant`

```ts
import { useActiveDescendant } from '@pdxui/core';

function useActiveDescendant(controller: () => HTMLElement | null, listbox: () => HTMLElement | null, options?: ActiveDescendantOptions): ActiveDescendantReturn
```

@param controller - Element that has focus and receives keyboard events (e.g. input).
@param listbox - Element containing the items (e.g. dropdown list).

### `useAdaptive`

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

### `useBottomSheet`

```ts
import { useBottomSheet } from '@pdxui/core';

function useBottomSheet(el: () => HTMLElement | null, options?: BottomSheetOptions): BottomSheetReturn
```

A drag-to-dismiss bottom sheet with snap points.

`detents` are fractions of the viewport height (`[0.5, 1]` = half and full) and the sheet settles
on the nearest one. The release is decided by VELOCITY as well as position: a quick flick past
`velocityThreshold` moves a detent even if the finger did not travel far, which is what makes the
gesture feel native rather than sticky.

### `useClipboard`

```ts
import { useClipboard } from '@pdxui/core';

function useClipboard(options?: ClipboardOptions): ClipboardReturn
```

Copy, cut and paste through the async Clipboard API, with a `copied` signal for the "Copied!"
feedback.

Check `isSupported` before offering the affordance: the API needs a secure context, and `paste()`
additionally needs focus and the user's permission — a paste button that silently does nothing on
http:// is worse than no button.

### `useContainerSize`

```ts
import { useContainerSize } from '@pdxui/core';

function useContainerSize(el: () => HTMLElement | null, breakpoints?: ContainerBreakpoints): ContainerSizeReturn
```

Signal-based container size awareness.
Uses ResizeObserver to track the container's dimensions reactively.
Breakpoint thresholds are configurable.

### `useDataGrid`

```ts
import { useDataGrid } from '@pdxui/core';

function useDataGrid(options: DataGridOptions<T>): DataGrid<T>
```

Everything a data grid needs that is not markup: column state (width, order, visibility), sorting,
selection, editing and the {@link createDataSource} underneath.

Headless on purpose — it owns the state and the rules, `<pdx-data-grid>` owns the DOM — so the
same behaviour is testable without rendering and reusable by a component that looks nothing like a
table.

Column GROUPS render as a multi-row header, but sorting, widths and order operate on the flat leaf
list; the grid flattens them for you and keeps the parent on each leaf. Two levels, no more.

### `useDrag`

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

### `useDropZone`

```ts
import { useDropZone } from '@pdxui/core';

function useDropZone(el: () => HTMLElement | null, options?: DropZoneOptions): DropZoneReturn
```

Make an element a drop zone for draggables.
Uses hit-testing via bounding rect (not pointer events) —
works even when the drag source captures the pointer.

### `useEffect`

```ts
import { useEffect } from '@pdxui/core';

function useEffect(fn: () => void | (() => void)): Dispose
```

Track a reactive effect with auto-disposal on component disconnect.
Like ctx.track() but works in composables without ctx reference.

### `useFieldGroupPath`

```ts
import { useFieldGroupPath } from '@pdxui/core';

function useFieldGroupPath(from?: HTMLElement): string | undefined
```

Get the current field group path prefix from the nearest ancestor.
Returns undefined if not inside a field-group.

Without an argument it must be called during setup(). With `from`, it looks up from that element
whenever it is called, and an effect that called it runs again whenever a group path is provided
— found or not, because a path can change after it is found: an inner group set up before the
outer one provides `inner` first and `outer.inner` once the outer path appears. So do not keep it:
read it where it is used.

### `useForm`

```ts
import { useForm } from '@pdxui/core';

function useForm(): Form<T>
```

Inject the nearest Form from an ancestor.
Must be called during setup(). Throws if no form found.

### `useFormAssociated`

```ts
import { useFormAssociated } from '@pdxui/core';

function useFormAssociated(ctx: ComponentContextBase, options: FormAssociatedOptions): void
```

Wire a component's value and validation to ElementInternals.
Call in setup() after signal initialization.

Usage:
  component('pdx-input', {
      formAssociated: true,
      setup(ctx) {
          // ... existing setup code ...
          useFormAssociated(ctx, {
              getFormValue: () => ctx.value() as string ?? null,
              getError: () => ctx.error() as string | undefined,
          });
      },
  });

### `useFormCoordinator`

```ts
import { useFormCoordinator } from '@pdxui/core';

function useFormCoordinator(from?: HTMLElement): FormCoordinator | undefined
```

Try to inject the nearest FormCoordinator. Returns undefined if none.

Without an argument it must be called during setup(). With `from`, it looks up from that element
whenever it is called, and an effect whose lookup found nothing runs again when a coordinator is
provided — the same contract as `tryUseForm(from)`.

### `useHead`

```ts
import { useHead } from '@pdxui/core';

function useHead(config: HeadConfig): Dispose
```

Set document head tags (title, meta, link).
Returns a dispose function that removes the created tags.

For reactive titles, use useTitle() from browser/title.ts instead.

### `useIdle`

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

### `useMediaQuery`

```ts
import { useMediaQuery } from '@pdxui/core';

function useMediaQuery(query: string): ReadonlySignal<boolean>
```

Create a reactive signal from a CSS media query.
Updates automatically when the media query match state changes.

Usage:
  const isDark = useMediaQuery('(prefers-color-scheme: dark)');
  const isWide = useMediaQuery('(min-width: 1200px)');

### `useOnline`

```ts
import { useOnline } from '@pdxui/core';

function useOnline(): ReadonlySignal<boolean>
```

Reactive online/offline status signal.
Updates automatically when the browser goes online/offline.

### `usePopover`

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

### `useProvided`

```ts
import { useProvided } from '@pdxui/core';

function useProvided(key: string | symbol): T
```

Composable: inject a provided value using the current component's element.
Must be called during setup(). Throws if not found.

Usage in setup():
  const theme = useProvided<ThemeSignal>('theme');

### `usePullToRefresh`

```ts
import { usePullToRefresh } from '@pdxui/core';

function usePullToRefresh(el: () => HTMLElement | null, options: PullToRefreshOptions): PullToRefreshReturn
```

Pull-down-to-refresh, with the rubber-band resistance the gesture is recognised by.

`progress` (0..1) is what an indicator rotates or fills with, and it is the reason `resistance`
(0.4) exists: the content follows the finger at less than 1:1, so passing the threshold feels like
an effort rather than an accident. Only fires when the container is already scrolled to the top.

### `useQuery`

```ts
import { useQuery } from '@pdxui/core';

function useQuery(queryFn: () => Promise<T>, options?: UseQueryOptions<T>): QueryResult<T>
```

Declarative data fetching with caching, retry, and auto-refetch.

The query function comes FIRST, as an argument of its own — the options object does not carry it.
(A single object with `queryFn` inside it is not the signature and cannot work: the object would
be called as the fetcher.)

Usage:
  const users = useQuery(
    () => fetch(`/api/users?page=${page()}`).then(r => r.json()),
    { key: () => `users:${page()}`, staleTime: 60_000, refetchOnFocus: true },
  );
  users.data();      // the value, or undefined
  users.isLoading(); // reactive

A wrapper over {@link resource}: same cache, same `key`, same `tags`. What it adds is the
refetching a screen left open needs — on focus, on reconnect, on an interval — and `mutate()` for
an optimistic write. `@fetch` is the declarative form of the same job over the framework's HTTP
client; reach for `useQuery` when the fetcher is your own promise.

### `useResizeHandle`

```ts
import { useResizeHandle } from '@pdxui/core';

function useResizeHandle(handle: () => HTMLElement | null, target: () => HTMLElement | null, options?: ResizeHandleOptions): ResizeHandleReturn
```

Attach resize behavior to a handle element.
The handle is the draggable grip; the target is the element being resized.

@param handle - Getter for the handle element (the grip bar).
@param target - Getter for the element being resized.

### `useRovingTabindex`

```ts
import { useRovingTabindex } from '@pdxui/core';

function useRovingTabindex(el: () => HTMLElement | null, options?: RovingTabindexOptions): RovingTabindexReturn
```

The roving tabindex pattern: a group of controls that Tab enters ONCE, and the arrow keys move
within.

Exactly one item is `tabindex=0` at a time and the rest are `-1`, so a toolbar of twelve buttons
costs one Tab stop instead of twelve. That is the WAI-ARIA rule for tabs, toolbars, menus and
radio groups, and getting it wrong is the most common keyboard defect in a component library.

`orientation` picks which arrows move (horizontal by default), `wrap` decides whether the last
item leads back to the first, and disabled items are skipped rather than focused.

### `useSafeArea`

```ts
import { useSafeArea } from '@pdxui/core';

function useSafeArea(): SafeAreaReturn
```

Singleton safe area signal. Re-reads on orientation change and resize.

### `useScroll`

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

### `useScrollAnimation`

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

### `useScrollbar`

```ts
import { useScrollbar } from '@pdxui/core';

function useScrollbar(el: () => HTMLElement | null, options?: ScrollbarOptions): ScrollbarReturn
```

Attach custom scrollbar to a scrollable container.
Creates a wrapper around the container with overlay track+thumb elements
that stay fixed relative to the visible area (not the scroll content).

### `useSortable`

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

### `useStorage`

```ts
import { useStorage } from '@pdxui/core';

function useStorage(key: string, defaultValue: T, storage: 'local' | 'session' = 'local'): Signal<T>
```

Reactive localStorage signal with automatic persistence and cross-tab sync.

@param key - Storage key
@param defaultValue - Default value if key doesn't exist
@param storage - 'local' (default) or 'session' for sessionStorage
@returns Signal that reads/writes to storage

### `useTitle`

```ts
import { useTitle } from '@pdxui/core';

function useTitle(titleFn: () => string): void
```

Reactively set document.title. Updates whenever signal dependencies change.

Usage:
  useTitle(() => `${count()} items — My App`);

### `useWritable`

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

### `validateIcu`

```ts
import { validateIcu } from '@pdxui/core';

function validateIcu(message: string): string | null
```

Validate an ICU message. Catches the common authoring mistakes:
 - unbalanced braces (the classic `{count, plural, one {# item}` — missing the outer `}`);
 - a plural/select block with no `other` arm (ICU requires it);
 - a malformed rule arm (a category not followed by a `{…}` body).

@returns a human-readable error, or null if the message is well-formed.

### `validateSchema`

```ts
import { validateSchema } from '@pdxui/core';

function validateSchema(schema: StandardSchema<T>, values: unknown): Record<string, string>
```

Run a Standard Schema and return field-keyed errors.

### `VALIDATION_KEYS`

```ts
import { VALIDATION_KEYS } from '@pdxui/core';

const VALIDATION_KEYS
```

The translation keys the built-in validators emit, so an app can supply its own wording.

A validator returns `{ key, params, fallback }` rather than a finished string: the key is looked
up in the active validation locale and the params fill it in (`minLength` passes `{ min }`), with
the English fallback used when no locale provides it. Register translations under these exact
names — they are the contract between a validator and a locale file.

### `validationMessage`

```ts
import { validationMessage } from '@pdxui/core';

function validationMessage(key: string, fallback: string, params?: Record<string, unknown>): ValidationMessage
```

Create a ValidationMessage with key, params, and fallback.
Use this in custom validators for i18n support.

### `viewport`

```ts
import { viewport } from '@pdxui/core';

const viewport
```

Centralized viewport signals. One resize listener, many readers.

### `waitFor`

```ts
import { waitFor } from '@pdxui/core/testing';

function waitFor(condition: () => boolean | Promise<boolean>, timeout = 3000): Promise<void>
```

Wait for a condition function to return true.
Polls every 50ms, throws after timeout (default 3000ms).

### `watch`

```ts
import { watch } from '@pdxui/core';

function watch(source: WatchSource<unknown> | WatchSource<unknown>[], callback: (newValue: unknown, oldValue: unknown) => void, options?: WatchOptions): Dispose
```

Watch a single reactive source and call back on changes.

Usage:
  watch(count, (newVal, oldVal) => console.log('changed'));
  watch(() => state.filter, (val) => refetch(val), { immediate: true });

### `when`

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

## @pdxui/router

24 value exports.

### `createRouter`

```ts
import { createRouter } from '@pdxui/router';

function createRouter(routes: RouteConfig[], options?: string | RouterOptions): void
```

Create a runtime router from route configs.
@param routes - Array of route configurations
@param options - Router options or basePath string (backward compat)

### `currentLoaderData`

```ts
import { currentLoaderData } from '@pdxui/router';

const currentLoaderData: ReadonlySignal<unknown>
```

Data returned by the MATCHED route's @loader function. For a parent's, see {@link loaderData}.

### `currentLoaderState`

```ts
import { currentLoaderState } from '@pdxui/router';

const currentLoaderState: ReadonlySignal<LoaderState>
```

Loader execution state of the matched route: idle → loading → done/error.

### `currentMeta`

```ts
import { currentMeta } from '@pdxui/router';

const currentMeta: ReadonlySignal<Record<string, unknown> | undefined>
```

### `currentNavError`

```ts
import { currentNavError } from '@pdxui/router';

const currentNavError: ReadonlySignal<'403' | '404' | null>
```

Last navigation error kind: '403' (guard denied, no redirect), '404' (no match),
or null (last navigation resolved a route). The outlet reads this to pick which
error page to render when currentRoute() is null.

### `currentParams`

```ts
import { currentParams } from '@pdxui/router';

const currentParams: ReadonlySignal<Record<string, string>>
```

### `currentPath`

```ts
import { currentPath } from '@pdxui/router';

const currentPath: ReadonlySignal<string>
```

### `currentQuery`

```ts
import { currentQuery } from '@pdxui/router';

const currentQuery: ReadonlySignal<Record<string, string>>
```

### `currentRoute`

```ts
import { currentRoute } from '@pdxui/router';

const currentRoute: ReadonlySignal<ResolvedRoute | null>
```

### `currentSearch`

```ts
import { currentSearch } from '@pdxui/router';

const currentSearch: ReadonlySignal<string>
```

Raw query string of the current route, including the leading '?' (or '' when none).

### `currentState`

```ts
import { currentState } from '@pdxui/router';

const currentState: ReadonlySignal<Record<string, unknown> | undefined>
```

Navigation state — ephemeral data passed via navigate(), not in the URL.

### `destroyRouter`

```ts
import { destroyRouter } from '@pdxui/router';

function destroyRouter(): void
```

### `loaderData`

```ts
import { loaderData } from '@pdxui/router';

function loaderData(routePath: string): unknown
```

What a specific level's @loader returned, by its route pattern — `loaderData('/tickets/:id')`.

This is how a child reads its parent's data: the parent loaded the ticket, the child loads one
intervention, and moving between interventions leaves the ticket alone. Reactive: read it in a
computed or a template and it updates when that level reloads.

`undefined` when the level declared no loader, has not loaded yet, failed, or is not in the
current chain at all — a page cannot read the data of a branch it has left.

### `loaderState`

```ts
import { loaderState } from '@pdxui/router';

function loaderState(routePath: string): LoaderState
```

The same, for the state. 'idle' for a level that is not loading and has nothing.

### `navigate`

```ts
import { navigate } from '@pdxui/router';

function navigate(path: string, params?: Record<string, string>, state?: Record<string, unknown>): void
```

Navigate programmatically.
@param path — route path (can include :param placeholders)
@param params — URL path params to replace :param segments
@param state — ephemeral navigation state (not in URL, accessible via currentState)

### `onAfterNavigate`

```ts
import { onAfterNavigate } from '@pdxui/router';

function onAfterNavigate(hook: AfterNavigateHook): () => void
```

### `onBeforeNavigate`

```ts
import { onBeforeNavigate } from '@pdxui/router';

function onBeforeNavigate(hook: BeforeNavigateHook): () => void
```

### `PdxLink`

```ts
import { PdxLink } from '@pdxui/router';

PdxLink
```

### `PdxRouterOutlet`

```ts
import { PdxRouterOutlet } from '@pdxui/router';

PdxRouterOutlet
```

### `prefetchRoute`

```ts
import { prefetchRoute } from '@pdxui/router';

function prefetchRoute(url: string | null | undefined): boolean
```

Fetch the chunk this URL will need, if there is one and it is wanted.

Returns whether a fetch was STARTED, which is what a test can assert on; a caller has nothing to
do with the answer. Failure is swallowed on purpose: a prefetch that cannot reach the network is
a click that will load normally, not an error the visitor should be shown — the outlet reports
the real one when the navigation happens.

### `registerGuardChecker`

```ts
import { registerGuardChecker } from '@pdxui/router';

function registerGuardChecker(checker: GuardChecker): void
```

Register a guard checker. Called with the guard name from @guard declarations.

### `routeParams`

```ts
import { routeParams } from '@pdxui/router';

const routeParams
```

Signal for current route params — provided to descendants via Context Protocol.

### `setQuery`

```ts
import { setQuery } from '@pdxui/router';

function setQuery(params: Record<string, string>): void
```

Set the entire query string reactively. Updates URL + signal.

### `setQueryParam`

```ts
import { setQueryParam } from '@pdxui/router';

function setQueryParam(key: string, value: string | null): void
```

Set or remove a single query param. Pass null to remove.
