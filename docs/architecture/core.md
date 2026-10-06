# The runtime (@pdxui/core)

## What it is

`@pdxui/core` is the runtime that runs in the browser. It holds everything the compiler's output needs in order to work: the reactivity system (signals), the template engine (`html\`\``), the Web Component base class, and the utilities for forms, data, HTTP and accessibility.

It is written entirely in TypeScript, has no npm dependencies, and weighs about 25KB gzip in a typical app thanks to tree-shaking.

## Reactivity: the signal engine

The heart of the framework is the signal system, which holds reactive state. A signal is a container for a value that notifies its readers automatically when the value changes.

### signal — reactive state

```typescript
import { signal } from '@pdxui/core';

const count = signal(0);     // Creates a signal with the initial value 0
console.log(count());        // Reads the value: 0
count.set(5);                // Sets a new value
count.set(v => v + 1);       // Updates it from the current value
```

Inside `.pdx` files the compiler offers a more natural syntax: `let count = $signal(0)`, and then `count++` is turned into `count.set(v => v + 1)`. Internally the mechanism is the same.

### computed — derived values

A computed is a value that recomputes itself when its dependencies change:

```typescript
const count = signal(0);
const doubled = computed(() => count() * 2);  // Recomputes when count changes

console.log(doubled());  // 0
count.set(3);
console.log(doubled());  // 6 — recomputed automatically
```

Computeds are lazy: they do not recompute until somebody reads them. That avoids pointless work.

### effect — reactive side effects

An effect is a function that re-runs when the signals it reads change:

```typescript
const name = signal('Alice');

effect(() => {
    document.title = `Hello ${name()}`;  // Re-runs when name changes
});
// → document.title = "Hello Alice"

name.set('Bob');
// → document.title = "Hello Bob" (automatically)
```

**Critical behaviour**: `effect(fn)` runs `fn()` **immediately and synchronously** when it is created. The dependencies are registered during that first run: every signal read becomes a dependency. If the function returns before reading a signal (through an early `return`, say), that signal never becomes a dependency and the effect will not react to it.

This behaviour is what `ctx.track()` in components rests on (see the Lifecycle section below).

### store — complex state

For objects with a rich structure, where `signal()` would mean recreating the whole object on every change, `store()` offers a Proxy that allows direct mutation:

```typescript
const state = store({
    items: ['a', 'b', 'c'],
    filter: '',
});

state.items.push('d');     // A direct mutation — the consumers are notified
state.filter = 'search';  // The properties are reactive too
```

### The other reactive primitives

| Primitive | Use |
|-----------|-----|
| `watch(source, callback)` | Like an effect, but it hands the callback the old and the new value |
| `batch(fn)` | Groups several updates into one flush (avoiding intermediate renders) |
| `resource(fetcher)` | Async data loading with 7 states (idle, loading, success, error, refreshing, stale, aborted), a built-in cache and automatic retry |
| `mutation(fn)` | Running a mutation with an optimistic update and cache invalidation |
| `linkedSignal(source, fn)` | A derived signal you can also write to by hand — useful for a value with a computed default and a user override |
| `createCache()` | A global reactive cache with garbage collection and wildcard invalidation |
| `pipe(signal, ...operators)` | A chain of operators (debounce, throttle, map, filter) over a signal — like RxJS, but over single values |
| `fromEvent(element, 'click')` | Turns a DOM event into a signal, with automatic cleanup |

## The template engine

The template engine turns a tagged template literal (`html\`...\``) into reactive DOM. Every `${...}` expression in the template becomes an update point that reacts to signals.

### Binding syntax

```html
<!-- Property binding (reactive) — sets a JS property on the element -->
<div :class="${rootClass}">

<!-- Event listener -->
<button @click="${handler}">

<!-- Two-way binding (for inputs) -->
<input ::value="${name}">

<!-- Style binding (an object or a string) -->
<div :style="${styleString}">

<!-- Ref callback (it receives the DOM element) -->
<div :ref="${el => container = el}">
```

### Reactive expressions

Inside `html\`\``, an expression can be:

- **A function** `${() => count() * 2}` → reactive, re-runs when the signals change
- **A signal directly** `${count}` → reactive, updates itself
- **A static value** `${"hello"}` → inserted once, never changes

### Declarative helpers

```typescript
// Conditional
when(isLogged, () => html`<p>Welcome!</p>`, () => html`<p>Please login</p>`)

// Keyed iteration (for efficient updates)
each(items, item => item.id, item => html`<li>${item.name}</li>`)

// Pattern matching
match(status, {
    loading: () => html`<pdx-spinner></pdx-spinner>`,
    error: () => html`<p>Error occurred</p>`,
    success: (data) => html`<p>${data.message}</p>`,
})

// Portal (render somewhere else in the DOM)
portal('#overlay-container', () => html`<div class="modal">...</div>`)
```

## Components: the lifecycle

### The component() function

Every Pragmatic Web Component is created through `component()`:

```typescript
component('pdx-counter', {
    props: { /* property declarations */ },
    setup(ctx) { /* the component's logic */ },
    render: (ctx) => html`...`,
});
```

That call registers a Custom Element in the browser through `customElements.define()`. From then on, every `<pdx-counter>` in the DOM is handled by the framework.

### The context (ctx)

The `ctx` parameter given to `setup()` and `render()` is the component's main interface:

```typescript
setup(ctx) {
    ctx.el           // The host DOM element (<pdx-counter>)
    ctx.myProp()     // Reads the value of the "myProp" prop (it is a signal)
    ctx.emit('change', { value: 42 })   // Emits a CustomEvent
    ctx.track(fn)    // Registers an effect with automatic cleanup
    ctx.expose(api)  // Exposes methods for imperative access from outside
    ctx.slot('name') // Reaches a named slot
}
```

### The lifecycle timeline

When a `<pdx-counter>` appears in the DOM, this is the exact sequence:

```
1. customElements.define('pdx-counter', ...)    — registration (once only)

2. <pdx-counter value="5"> in the DOM           — the browser creates the instance

3. constructor()
   └── The signals for the attributes are created

4. connectedCallback()                          — the element is in the DOM
   │
   └── body() runs                              — the heart of the lifecycle
       │
       ├── Prop signals created                 — signal(coerce("5", Number)) → signal(5)
       │   Every HTML attribute is read, converted to its declared type,
       │   and put in a signal. ctx.value() is usable from here on.
       │
       ├── setup(ctx) called                    — THE DEVELOPER'S CODE
       │   │
       │   ├── ctx.track(fn) runs               — fn() runs AT ONCE (synchronously)
       │   │   The template's DOM does NOT exist yet!
       │   │   ctx.el is empty (no children from the template).
       │   │
       │   └── return { ... }                   — the values exposed to the render
       │
       ├── render(ctx) called                   — produces a DocumentFragment
       │
       ├── appendChild(fragment)                — THE DOM APPEARS in ctx.el
       │
       ├── Slot projection                      — children projected into the slots
       │
       └── onMount() callbacks                  — NOW the DOM is available
```

### The golden rule

**`setup()` runs BEFORE `render()`**. During setup, the template's DOM does not exist in `ctx.el` yet.

That means `ctx.el.querySelector('.my-class')` during setup returns `null`. The prop signals (`ctx.myProp()`), on the other hand, are already initialised — the HTML attributes are read before setup is called.

### The pattern for touching the DOM

When a reactive effect needs DOM access, the correct pattern is:

```typescript
setup(ctx) {
    ctx.track(() => {
        // FIRST: read the signals (this creates the subscriptions)
        const value = ctx.myProp();
        const isDisabled = ctx.disabled();

        // THEN: touch the DOM inside requestAnimationFrame
        // (the template will have rendered by the next frame)
        requestAnimationFrame(() => {
            const el = ctx.el.querySelector('.target');
            if (el) el.textContent = value;
        });
    });
}
```

**Why can it not be done directly?** If the function inside `ctx.track()` returns before reading a signal — because `querySelector` returned `null` and there is an early `return` — those signals never become dependencies of the effect. The effect will never re-run, no matter how the signals change. The track is dead.

### The lifecycle APIs

| Hook | When it runs | DOM available | Reactive |
|------|---------------|-----------------|----------|
| `ctx.track(fn)` in setup | Immediately, during setup | No | Yes (if signals are read) |
| `onMount(fn)` | After render + append | Yes | No (one-shot) |
| `onDestroy(fn)` | When the element is removed | — | No |
| `onUpdated(fn)` | After every batch of updates | Yes | No |
| `onVisible(fn)` | When it enters or leaves the viewport | Yes | No |
| `onResize(fn)` | When the element changes size | Yes | No |
| `onShow(fn)` / `onHide(fn)` | Page visibility (the Page Visibility API) | Yes | No |
| `onError(fn)` | When an error happens inside the component | Yes | No |
| `onBeforeLeave(fn)` | Before a navigation (it can block one) | Yes | No |

### Cleanup

Every `ctx.track()` may return a cleanup function:

```typescript
ctx.track(() => {
    const handler = () => { /* ... */ };
    document.addEventListener('resize', handler);
    return () => document.removeEventListener('resize', handler);  // cleanup
});
```

The cleanup runs:
- Before every re-run of the effect (when a dependency changes)
- When the component is removed from the DOM (`disconnectedCallback`)

Every `ctx.track()` registered during `setup()` is disposed automatically when the component is destroyed.

## Accessibility (a11y)

The core provides primitives for the standard ARIA patterns:

| Primitive | ARIA pattern | Use |
|-----------|-------------|-----|
| `focusTrap(container)` | Dialog, Drawer | Tab cycling inside a container, siblings hidden with aria-hidden |
| `createFocusGroup(options)` | Menu, Listbox, Tree, Toolbar | Arrow-key navigation, type-ahead, one element with tabindex=0 |
| `createActiveDescendant()` | Combobox, Menu with an input | The input keeps focus while the arrows move aria-activedescendant |
| `createSelection(mode)` | Multi-select listbox, DataGrid | Single/multiple/range selection with its ARIA state |
| `createLiveRegion()` | Screen reader notifications | polite/assertive announcements with no visual element |
| `createOverlayStack()` | A stack of modals | z-index management, Escape closes the topmost, a coordinated focus trap |
| `createPopover(options)` | Dropdown, Tooltip | Floating placement, flipping automatically when it leaves the viewport |

## The form engine

```typescript
const form = createForm({
    initialValues: { name: '', email: '' },
    validate: {
        name: required('The name is required'),
        email: [required(), email('Invalid email')],
    },
    onSubmit: async (values) => {
        await api.createUser(values);
    },
});

// form.values.name   → a signal (the current value)
// form.errors.name   → a signal (the error string, or null)
// form.dirty         → a signal (true once it has been edited)
// form.submitting    → a signal (true while submitting)
// form.handleSubmit(event) → prevents a double submit, validates, calls onSubmit
```

It supports dynamic field arrays (`createFieldArray`), async validation, and integration with Standard Schema (Zod, Valibot).

## The data layer

The DataSource offers one interface for working with a collection of data — from a local array to a REST endpoint:

```typescript
const ds = createDataSource({
    transport: arrayTransport(products),  // or restTransport('/api/products')
    pageSize: 20,
});

ds.filter({ category: 'electronics' });
ds.sort('price', 'asc');
ds.page(2);

// ds.data   → a signal holding the current page's items
// ds.total  → a signal holding the total count (for pagination)
```

The transports are pluggable: `arrayTransport` for local data, `restTransport` for a REST API, or a custom adapter implementing the `IDataTransport` interface.

## The HTTP client

```typescript
const client = createHttpClient({
    baseUrl: '/api',
    middleware: [
        authMiddleware(() => getToken()),
        retryMiddleware({ maxRetries: 3, backoff: 'exponential' }),
        timeoutMiddleware(10000),
    ],
});

const response = await client.get('/users', { params: { page: 1 } });
```

The middleware is tree-shakeable: you include only what you use. Available: `authMiddleware`, `retryMiddleware`, `timeoutMiddleware`, `logMiddleware`, `csrfMiddleware`, `offlineMiddleware`.

## The file map

```
packages/core/src/
├── reactivity/          Signal, computed, effect, store, resource, cache, mutation,
│                        watch, pipe, operators, fromEvent, fromPromise, linkedSignal
├── renderer/            html``, dom ops, list (the LIS algorithm), transitions (FLIP),
│                        defer, dynamic (keep-alive), error boundary, virtualizer
├── component/           PdxElement (the base class), the component() factory, define(),
│                        lifecycle hooks, context (provide/inject), the overlay stack,
│                        popover positioning, focus trap/group, selection, drag/sort
├── form/                createForm, fieldArray, validators (tree-shakeable)
├── data/                DataSource, transport adapters (array, fake, delay)
├── http/                HttpClient, middleware (auth, retry, timeout, offline), upload
├── a11y/                Re-exports of the focus and live-region primitives from component/
├── i18n/                Internationalization
├── testing/             mount(), tick(), fireEvent(), waitFor(), cleanup()
├── debug/               The signal inspector, the effect tracer, the devtools bridge
└── index.ts             The public API (everything a developer may import)
```
