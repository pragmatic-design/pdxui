---
title: Reactivity API
description: "Signals, computed values, effects, stores, watchers, signal operators, events and observers as signals, resources, queries, mutations and the cache."
order: 24
parent: api
---

# Reactivity API

Signals, computed values, effects, stores, watchers, signal operators, events and observers as signals, resources, queries, mutations and the cache. 70 exports, from `@pdxui/core`.

Part of the [API reference](/docs/api), generated from the source by `packages/site/scripts/gen-api.mjs`.

## `batch`

```ts
import { batch } from '@pdxui/core';

function batch(fn: () => void): void
```

Group writes so subscribers run once, after all of them.

Outside it each write flushes at once, so two writes in a row run their subscribers twice, and the
first run sees the second value not yet written. Use it when several writes are one change.
A compiled template's event handlers already run inside it (`batchHandler`); code anywhere
else — a hand-written listener, a timer, a promise callback — flushes per write.

Nested calls flush once, at the outermost exit.

## `batchHandler`

```ts
import { batchHandler } from '@pdxui/core';

function batchHandler(handler: (...args: A) => R): (...args: A) => R
```

`handler`, run inside `batch()` on every call: what a compiled template does with each of its
`@event` handlers (#114), so a handler writing three signals runs an effect reading them once,
on the finished state. The call keeps its `this` and returns what the handler returns — the
promise of an async handler, which is batched up to its first `await`.

## `catchError`

```ts
import { catchError } from '@pdxui/core';

function catchError(handler: (error: unknown) => T): SignalOperator<T, T>
```

Catch errors in the pipeline and recover with a fallback value.

## `clearStores`

```ts
import { clearStores } from '@pdxui/core';

function clearStores(): void
```

Clear all registered stores (for testing).

## `collectDisposers`

```ts
import { collectDisposers } from '@pdxui/core';

function collectDisposers(fn: () => T): [T, Dispose]
```

Run `fn` while collecting every effect/disposer created within it; return the
result together with a single idempotent Dispose that tears them all down.
Nested scopes compose: disposing an outer scope disposes the effects it owns,
whose own cleanups dispose their inner scopes recursively.

## `computed`

```ts
import { computed } from '@pdxui/core';

function computed(fn: () => T, options?: ComputedOptions<T>): ReadonlySignal<T>
```

Derived signal — lazy recomputation with dirty flag + optional equality.

A source change makes it dirty and tells its readers «maybe»: an effect that read it is checked
before it runs, and runs only if this computed — recomputed then — gives another value
(`Object.is`). With `equals` it recomputes at once and tells its readers only of a change.

## `concatSignal`

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

## `createBus`

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

## `createCache`

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

## `createGlobalStore`

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

## `debounce`

```ts
import { debounce } from '@pdxui/core';

function debounce(ms: number): SignalOperator<T, T>
```

Debounce operator for pipe().

## `debounced`

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

## `distinct`

```ts
import { distinct } from '@pdxui/core';

function distinct(source: () => T, equals?: (a: T, b: T) => boolean): DisposableSignal<T>
```

Skip emissions when value hasn't changed.
Like RxJS distinctUntilChanged but as a signal.

Usage:
  const rounded = distinct(() => Math.round(value()), (a, b) => a === b);

## `distinctOp`

```ts
import { distinctOp } from '@pdxui/core';

function distinct(equals?: (a: T, b: T) => boolean): SignalOperator<T, T>
```

Skip duplicate values using equality check.

## `effect`

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

## `enableDevMode`

```ts
import { enableDevMode } from '@pdxui/core';

function enableDevMode(on = true): void
```

Enable dev mode guardrails (signal read outside tracking, write in computed).

## `exhaustSignal`

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

## `filter`

```ts
import { filter } from '@pdxui/core';

function filter(predicate: (value: T) => boolean): SignalOperator<T, T>
```

Filter operator for pipe(). Keeps last valid value when predicate fails.

## `fromCallback`

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

## `fromEvent`

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

## `fromEvents`

```ts
import { fromEvents } from '@pdxui/core';

function fromEvents(target: EventTarget, eventNames: string[], options?: FromEventOptions<T>): DisposableSignal<T>
```

Listen to multiple events on the same target, merged into one signal.

Usage:
  const interaction = fromEvents(el, ['mousedown', 'touchstart', 'pointerdown']);

## `fromIntersection`

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

## `fromMutation`

```ts
import { fromMutation } from '@pdxui/core';

function fromMutation(target: Node | (() => Node | null), options?: MutationObserverInit): DisposableSignal<MutationState>
```

Observe DOM mutations as a reactive signal.

Usage:
  const changes = fromMutation(listRef, { childList: true });
  effect(() => console.log(`${changes().count} mutations`));

## `fromPromise`

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

## `fromResize`

```ts
import { fromResize } from '@pdxui/core';

function fromResize(target: Element | (() => Element | null), options?: ResizeObserverOptions): DisposableSignal<ResizeState>
```

Observe element size as a reactive signal.

Usage:
  const size = fromResize(containerRef);
  effect(() => console.log(`${size().width}x${size().height}`));

## `fromTC39Computed`

```ts
import { fromTC39Computed } from '@pdxui/core';

function fromTC39Computed(tc39: TC39Computed<T>): ReadonlySignal<T>
```

Create a Pragmatic computed from a TC39-compatible Computed signal.

## `fromTC39State`

```ts
import { fromTC39State } from '@pdxui/core';

function fromTC39State(tc39: TC39State<T>): Signal<T>
```

Create a Pragmatic signal from a TC39-compatible State signal.
Useful for consuming signals from other frameworks.

## `getDefaultCache`

```ts
import { getDefaultCache } from '@pdxui/core';

function getDefaultCache(): Cache
```

The process-wide cache every {@link resource} uses unless given its own, created on first use.

Being a singleton is the point: two components asking for the same key share one request and one
value. It is also why a test that leaves entries behind can change the next test's behaviour —
see {@link setDefaultCache}.

## `getStore`

```ts
import { getStore } from '@pdxui/core';

function getStore(id: string): T | undefined
```

Get a registered store by ID (for DevTools/testing).

## `httpResource`

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

## `invalidate`

```ts
import { invalidate } from '@pdxui/core';

function invalidate(matcher: InvalidationMatcher): number
```

Drop matching entries from the default cache and return how many went, so the next read refetches.

Matches on an exact key, a prefix pattern, or tags — tags being the useful one: a mutation that
created an order invalidates `['orders']` without knowing which keys are in play. The count is
worth checking in a test: zero means the matcher matched nothing, which looks identical to
"worked" from the outside.

## `invalidateAll`

```ts
import { invalidateAll } from '@pdxui/core';

function invalidateAll(): void
```

Drop everything in the default cache.

The blunt instrument: right after a logout, where anything cached belongs to the previous user.
Anywhere else, {@link invalidate} with tags refetches what changed instead of everything.

## `linkedSignal`

```ts
import { linkedSignal } from '@pdxui/core';

function linkedSignal(optionsOrFn: LinkedSignalOptions<S, T> | (() => T)): Signal<T>
```

Create a writable derived signal.
 Shorthand: computation IS the source. Value recomputes on any dependency change.

## `map`

```ts
import { map } from '@pdxui/core';

function map(fn: (value: In) => Out): SignalOperator<In, Out>
```

Map operator for pipe(). Transforms each value.

## `merged`

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

## `mutation`

```ts
import { mutation } from '@pdxui/core';

function mutation(options: MutationOptions<TData, TInput>): Mutation<TData, TInput>
```

A write as reactive state: `execute(input)` plus the `pending`, `data` and `error` a form needs to
disable its submit button and show what happened.

Calls are queued, not run at once: `execute` while one is in flight waits for it, so two writes
of the same record never race, and an autosave and a save both land, in order. A user
double-clicking Save must still not create two records — that guard is the button's:
`<pdx-button :action="save">` is busy and refuses clicks while `pending()`.

`invalidate` names the cache tags to drop on success, which is how a list refreshes itself after
an item is created without the caller wiring the two together.

## `onCleanup`

```ts
import { onCleanup } from '@pdxui/core';

function onCleanup(fn: () => void): void
```

Register a cleanup function for the current effect.

## `onDispose`

```ts
import { onDispose } from '@pdxui/core';

function onDispose(fn: Dispose): void
```

Register a disposer with the current ownership scope (if any).
For constructs that manage their own teardown (e.g. repeat() items) and need a
disposer to fire only on scope teardown, never on effect re-run. No-op outside
a collectDisposers() scope.

## `pairwise`

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

## `pipe`

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

## `popErrorHandler`

```ts
import { popErrorHandler } from '@pdxui/core';

function popErrorHandler(): void
```

Pop the top error handler.

## `previous`

```ts
import { previous } from '@pdxui/core';

function previous(source: () => T): DisposableSignal<T | undefined>
```

Track the previous value of a signal.

Usage:
  const prev = previous(count);
  effect(() => console.log(`${prev()} → ${count()}`));

## `pushErrorHandler`

```ts
import { pushErrorHandler } from '@pdxui/core';

function pushErrorHandler(handler: (err: unknown) => void): void
```

Push an error handler onto the stack. Effects that throw propagate to this handler.

## `ref`

```ts
import { ref } from '@pdxui/core';

function ref(): Signal<T | null>
```

A signal for a DOM element, starting as `null`.

The target of `:ref="el"` in a template: the element is assigned when it mounts, so reading it
before that gives `null` rather than a stale node. Use it instead of `document.getElementById` —
PDX renders into the light DOM, so ids are neither unique nor available when `onMount` runs.

## `resource`

```ts
import { resource } from '@pdxui/core';

function resource(fetcher: ResourceFetcher<T>, options?: ResourceOptions<T>): Resource<T>
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

In a `.pdx` file `@fetch users: 'GET /api/users'` compiles to this.

## `resourceWhen`

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

## `responsiveCSS`

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

## `responsiveValue`

```ts
import { responsiveValue } from '@pdxui/core';

function responsiveValue(min: number, max: number, options?: ResponsiveValueOptions): ReadonlySignal<number>
```

Create a responsive value that changes with viewport width.
Returns a read-only signal that updates on resize.

For Tier 1/2 (no easing), use responsiveCSS() instead (zero JS cost).
This function is for Tier 3 cases requiring custom easing curves.

## `retrySignal`

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

## `sample`

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

## `scan`

```ts
import { scan } from '@pdxui/core';

function scan(source: () => T, reducer: (acc: R, value: T) => R, initialValue: R): DisposableSignal<R>
```

Accumulate values over time (like Array.reduce but reactive).

Usage:
  const total = scan(() => clicks(), (acc, v) => acc + v, 0);
  // Every click adds to total

## `setDefaultCache`

```ts
import { setDefaultCache } from '@pdxui/core';

function setDefaultCache(cache: Cache): void
```

Replace the process-wide cache.

For tests and for setup code that wants different staleness or size limits. Anything already
holding the previous cache keeps it, so call this before creating resources, not after.

## `shallowStore`

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

## `signal`

```ts
import { signal } from '@pdxui/core';

function signal(initial: T, options?: SignalOptions<T>): Signal<T> | HistorySignal<T>
```

A value that tells its readers when it changes. The unit everything reactive in PDX is built from.

Reading is calling it: `count()`. Writing is `count.set(next)` or `count.set(v => v + 1)`. Any
{@link effect} or `computed` that read it during its last run re-runs when it changes; nothing
else does, so there is no diffing and no dependency array to keep correct.

Each write outside {@link batch} flushes at once: its subscribers run before `set` returns. Writes
that must be seen together — two fields of one state — go inside `batch()`, so a subscriber never
observes the state half-updated.

In a `.pdx` file you rarely call this — `let count = $signal(0)` compiles to it, and `count++`
compiles to the `.set`.

`{ history: true }` returns a {@link HistorySignal} that remembers previous values for undo/redo;
`{ equals }` replaces the identity check that decides whether a write is a change at all — and
it decides the WRITE, not just the notification: a value it calls equal is never stored, so a
reader holding the old one by identity keeps pointing at it. For a value rebuilt on every write
(a parsed query, a DTO, an array mapped from a store) `Object.is` says «changed» every time, and
on a page where such a value round-trips that is a loop with nothing to stop it.

## `skip`

```ts
import { skip } from '@pdxui/core';

function skip(count: number): SignalOperator<T, T>
```

Skip the first N changes after initial value.

## `skipUntil`

```ts
import { skipUntil } from '@pdxui/core';

function skipUntil(source: () => T, gate: () => unknown): DisposableSignal<T>
```

Ignore source emissions until the gate signal becomes truthy.

Usage:
  const gated = skipUntil(() => data(), () => isReady());

## `store`

```ts
import { store } from '@pdxui/core';

function store(initial: T): T
```

Create a deep reactive proxy around an object.
Direct property mutations trigger fine-grained signal updates.

@param initial - The initial state object
@returns A proxy that looks identical but tracks all reads/writes reactively

## `switchSignal`

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

## `take`

```ts
import { take } from '@pdxui/core';

function take(count: number): SignalOperator<T, T>
```

Take only the first N emissions (changes), then freeze. Initial value doesn't count.

## `takeUntil`

```ts
import { takeUntil } from '@pdxui/core';

function takeUntil(source: () => T, stopper: () => unknown): DisposableSignal<T>
```

Pass source emissions until the stopper becomes truthy, then freeze.

Usage:
  const limited = takeUntil(() => data(), () => isDestroyed());

## `tap`

```ts
import { tap } from '@pdxui/core';

function tap(fn: (value: T) => void): SignalOperator<T, T>
```

Debug: observe values flowing through the pipe without modifying them.

## `throttle`

```ts
import { throttle } from '@pdxui/core';

function throttle(ms: number): SignalOperator<T, T>
```

Throttle operator for pipe().

## `throttled`

```ts
import { throttled } from '@pdxui/core';

function throttled(source: () => T, ms: number): ReadonlySignal<T> & { dispose: Dispose }
```

Create a throttled signal — value updates at most every `ms` milliseconds.
Useful for scroll handlers, mouse move, etc.

Usage:
  const scrollY = signal(0);
  const throttledY = throttled(() => scrollY(), 100);

## `toAsync`

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

## `toPromise`

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

## `toTC39Computed`

```ts
import { toTC39Computed } from '@pdxui/core';

function toTC39Computed(comp: ReadonlySignal<T>): TC39Computed<T>
```

Wrap a Pragmatic computed as a TC39-compatible Computed signal.

## `toTC39State`

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

## `untracked`

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

## `useQuery`

```ts
import { useQuery } from '@pdxui/core';

function useQuery(queryFn: ResourceFetcher<T>, options?: UseQueryOptions<T>): QueryResult<T>
```

Declarative data fetching with caching, retry, and auto-refetch.

The query function comes FIRST, as an argument of its own — the options object does not carry it.
(A single object with `queryFn` inside it is not the signature and cannot work: the object would
be called as the fetcher.)

Usage:
  const users = useQuery(
    ({ signal }) => fetch(`/api/users?page=${page()}`, { signal }).then(r => r.json()),
    { key: () => `users:${page()}`, staleTime: 60_000, refetchOnFocus: true },
  );
  users.data();      // the value, or undefined
  users.isLoading(); // reactive

A wrapper over {@link resource}: same cache, same `key`, same `tags`. What it adds is the
refetching a screen left open needs — on focus, on reconnect, on an interval — and `mutate()` for
an optimistic write. `@fetch` is the declarative form of the same job over the framework's HTTP
client; reach for `useQuery` when the fetcher is your own promise.

## `watch`

```ts
import { watch } from '@pdxui/core';

function watch(source: WatchSource<unknown> | WatchSource<unknown>[], callback: (newValue: unknown, oldValue: unknown) => void, options?: WatchOptions): Dispose
```

Watch a single reactive source and call back on changes.

Usage:
  watch(count, (newVal, oldVal) => console.log('changed'));
  watch(() => state.filter, (val) => refetch(val), { immediate: true });
