---
name: pdxui-language
description: "The .pdx language: the file format (template, script setup, style scoped), the runes ($signal, $derived, $effect), the declarations (@prop, @page, @event and more), the template syntax and how a project is wired. Use before writing or editing any .pdx file, or when starting a PDX app."
---

Read this before writing a `.pdx` file. Without it an agent writes `.pdx` from memory — the SFC shape,
`:prop`, `@event`, `{{ }}`, `@if` — **before verifying anything**, and anyone without Vue's SFC shape
already in their head cannot start at all.

Everything here is read off the compiler, not remembered: the runes from `compiler/src/runes.d.ts`,
the declarations and directives from the analyzer and the template parser.

## A file

```html
<template>
  <button class="pdx-btn pdx-primary" @click="count++">clicked {{ count }} times</button>
</template>

<script setup>
let count = $signal(0);
</script>

<style scoped>
button { margin-top: var(--pdx-space-md); }
</style>
```

Three optional blocks. `<script setup>` is where state and logic live; a plain `<script>` is the
legacy mode and should not be used for new files. `<style scoped>` is scoped by the compiler through a
`data-pdx-*` attribute — no Shadow DOM anywhere in this framework.

**The tag comes from the filename**: `src/job-list.pdx` → `<pdx-job-list>`. Override with `@tag`.
A `<script setup>` compiles the same way whatever it holds: one with no rune — only imports, consts,
functions and an `onMount` — still returns what it declares to the template, and an empty one still
registers the component.

### When the file gets long: split it

Every block takes a `src=`, so a screen does not have to live in one file:

```html
<template src="./work-list.html" />
<script setup lang="ts" src="./work-list.ts" />
<style scoped src="./work-list.css" />
```

Mix freely — an external template with an inline script is fine. The compiler treats the external
file exactly as if its contents were inline, so the runes, the declarations and the scoping all work
unchanged.

**When to reach for it**: past roughly 200 lines, when both the markup and the logic are substantial.
Below that a single file is easier to read, and splitting a small component costs you a jump.

⚠️ If a `.pdx` is getting hard to scroll, the answer is
usually [`references/structure.md`](../pdxui/references/structure.md) — extract a component —
and this is the other half: sometimes the screen genuinely is one component and just needs three
files.

The line count only tells you to look. Whether it is one component or several is decided by
[`references/component-design.md`](../pdxui/references/component-design.md): a piece with its
own state, its own markup and its own reason to change is a component (CD-B1), and logic two pages
repeat is a composable (CD-L1). Splitting a component that does five things into three files leaves
it doing five things.

## State: the runes

| rune | what it does |
|---|---|
| `$signal(v)` | reactive state. Write it like a plain variable: `count++`, `name = 'x'` — the compiler rewrites those into `.set(…)` |
| `$derived(expr)` | a computed value; recomputes when what it reads changes |
| `$effect(fn)` | runs when its dependencies change; return a function to clean up |
| `$emit(event, payload)` | dispatch a `CustomEvent` from this component — the untyped form; prefer an `@event` |
| `onMount(fn)` / `onDestroy(fn)` | lifecycle. `onMount` is **one-shot**, not reactive |

⚠️ **A trailing comma inside `$derived(…)` silently kills the reactivity.** `$derived(\n  expr,\n)` is
legal JavaScript and the rewriter bails out with `PDX_REWRITE_FALLBACK`, leaving a value that never
updates. Keep the expression on one line, with no trailing comma.

⚠️ **`error` is a forbidden name for a signal** — the compiler does not rewrite it. Use `errMsg`.

## Declarations

Written at the top of `<script setup>`, one per line, ending in `;`.

```js
@prop label: string = 'Hello';     // a prop: signal + attribute sync + generated type
@event changed: number;            // an emitter: changed(n) dispatches 'changed' with detail n
@page '/jobs/:id';                 // this component is a route
@tag 'pdx-something-else';         // override the tag derived from the filename
```

The emitter is callable from the script and the template alike, and the event bubbles: the parent
writes `<my-counter @changed="e => total = e.detail">` — the payload is `e.detail`. Keep event names
lowercase: the listener is an HTML attribute, lowercased when parsed, so `@event itemPicked` is
dispatched as `itemPicked` and listened for as `itempicked` — never heard. The compiler warns
`PDX_EVENT_NAME_CASE` on such a declaration. Not kebab-case either: the name is also the emitter's
identifier.

The full vocabulary the analyzer accepts:

`@prop` `@event` `@page` `@tag` `@guard` `@loader` `@store` `@form` `@fetch` `@slot` `@title` `@meta`
`@head` `@params` `@search` `@route` `@redirect` `@provide` `@inject` `@prefetch` `@expose` `@scroll`
`@i18n` `@raw`

**`@form f: Schema { … }`** builds a form (`createForm` underneath). Its options: `save` (when a field
saves), `source`, `parent`, `fields` (per-field save), and **`warnUnsaved`** — written bare,
`@form owner: OwnerSchema { warnUnsaved }` — which asks before leaving a page whose form has unsaved
changes. Every create and edit screen declares it; the recipe is «Do not leave with unsaved work» in
`pdxui/references/recipes.md`.

Types map to the runtime as: `T[]` → Array, the primitives → their counterparts, **everything else
(objects, functions, `any`) → Object**.

## Template

| syntax | meaning |
|---|---|
| `{{ expr }}` | text interpolation |
| `:prop="expr"` | bind a property (**never** `${…}` in an attribute — the compiler warns `PDX_RAW_INTERPOLATION`). Write the prop's name — `:withBorder` or `:with-border`, not the attribute form `:withborder`: on a `pdx-*` component the compiler maps it and warns `PDX_PROP_NAME_CASE`, a name it does not declare warns `PDX_UNKNOWN_PROP` |
| `@event="expr"` | a handler: a reference, an inline mutation (`count++`), a call, a lambda, or several statements |
| `::twoWay="sig"` | two-way binding |
| `:class.x` / `:style.x` | conditional class / style |
| `:ref="name"` | a DOM reference — the way to reach an element, never `getElementById` |

Modifiers on events: `.prevent .stop .self .once .capture .passive`, plus key filters. The raw event
is `$event`.

A component with no content may be written self-closing, `<pdx-autocomplete … />`: the compiler (and
core's `html` tag) expands it to `<pdx-autocomplete …></pdx-autocomplete>`. The browser alone would not — it
would open the element and swallow what follows. Void elements (`<input />`, `<br />`) stay as written.

**A component's popup events stay on it.** `pdx-open`, `pdx-close` and `pdx-toggle` do not bubble,
like the native `close` of `<dialog>`: a `@pdx-close` on a `pdx-dialog` hears the dialog, not the
select or date picker inside it. Listen on the component that opens and closes. Every other
component event bubbles — `pdx-change` does, like `change` — so a listener on a container that must
ignore its children's events still takes `.self`.

⚠️ **A signal appears in the template only inside an expression**, never as a bare identifier:
`@if (open())` and `{{ count }}` are fine; `@if (openBare)` is a ReferenceError. An import used
directly in a template is not on `ctx` and gives `ctx.X is not a function` — for a signal, at mount.
Bring it into the script: a function as `const goTo = go` (or a wrapper); a shared signal as
`const user = $derived(shared())`. Not `const user = shared()`: that is a snapshot, and it never updates.

### Block directives

```html
@if (ready()) { … } @else { … }
@for (jobs as job; track job.id) { … } @empty { … }
@switch (status()) { @case ('open') { … } @default { … } }
@await (promise) { … } @loading { … } @error (e) { … }
@defer (viewport) { … } @placeholder { … }
```

The complete set the parser knows: `if · else · for · empty · switch · case · default · await ·
loading · catch · try · error · defer · placeholder · show · require · portal · slot · let · raw`.

⚠️ **A block body must start with `{`.** `@if (x)` followed by markup is a parse error — the message
says so, with the line and column.

**`@for` rows follow their item.** With `track job.id`, a row whose object is replaced — an immutable
update, same id, new fields — keeps its DOM and shows the new values. The key is the identity, not
the content: do not put changing fields in it, that recreates the row on every update.

**`@await` waits for a promise** — `@loading` while it is pending, the body once it resolves, `@error`
if it rejects (a boolean works too: the body when true). Two things it needs:
- **the same promise on every evaluation.** `@await (loadUser())` makes a new promise each time the
  block re-runs and never settles. Keep the promise in a signal, or use a resource.
- **the value is not handed to the body.** Read it from the signal or resource that holds it.

With timing — `minMs` holds the `@loading` back so a fast answer does not flash it, `maxMs` turns a
slow one into an error:

```html
@await (job) { minMs: 200, maxMs: 5000 } { <p>{{ result }}</p> } @loading { <pdx-spinner></pdx-spinner> } @error (e) { <p>{{ e.message }}</p> }
```

**Retrying is putting a new promise in the signal.** `@error` leaves as soon as the awaited
expression changes, shows `@loading`, and awaits the new promise. `@error (e, retry)` also hands you
`retry`, which renders the block again with the same expression.

```html
<template>
  @await (job) { <p>{{ result }}</p> } @loading { <pdx-spinner></pdx-spinner> } @error (e, retry) {
    <p>{{ e.message }}</p>
    <pdx-button @click="reload()">Retry</pdx-button>
  }
</template>
<script setup>
let result = $signal('');
let job = $signal(load());
function load() { return fetch('/api/registry').then(r => r.json()).then(d => { result = d.name; }); }
function reload() { job = load(); }
</script>
```

## Putting a project together

The layout of a project and its wiring: without them an agent goes reading `node_modules` first.

```
my-app/
├── index.html
├── vite.config.js
├── package.json
└── src/
    ├── main.js            imports the design CSS and the routes
    ├── app-shell.pdx      the chrome + <pdx-router-outlet>
    └── routes/*.pdx       one @page each
```

```js
// vite.config.js
import { pdx } from '@pdxui/compiler';
export default { plugins: [pdx()] };
```

```html
<!-- index.html -->
<!doctype html>
<html pdx-theme="default" pdx-scheme="light">
  <head><meta charset="utf-8"><title>…</title></head>
  <body>
    <pdx-app-shell></pdx-app-shell>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

```js
// src/main.js
import '@pdxui/design';       // the whole design system, once
import './app-shell.pdx';
import './routes/job-list.pdx';   // importing a route registers its @page
```

**No `import '@pdxui/ui'`.** The compiler imports every `pdx-*` tag it finds in a `.pdx` template,
one `@pdxui/ui/<name>` each, so the app bundles the components it uses and nothing else. The
barrel registers **all** of them. Removing it from an app of four routes takes its JavaScript from
908 to 504 KiB, with the same 36 components defined and the same text on every screen.

Import a component by hand only when no template names it — when your JavaScript creates it:

```js
import { toast } from '@pdxui/ui/toast';   // a toast is created by the call, not by a tag
```

The same goes for a `document.createElement('pdx-…')` in a plain `.js` file. A route split into
`.html` + `.js` (`<template src>`) needs nothing: the compiler reads the external template.

That app is still one 504 KiB chunk, over Vite's 500 kB warning, because it imports all its routes
up front; the rest is the app and what it uses. Component-string overrides (`setLocaleStrings`) set
**before** a component's module loads survive it.

**Nobody registers the router by hand.** A component carrying `@page` adds itself to the route table
when its module is imported; `<pdx-router-outlet>` renders the match. Importing the route files is
what makes the routes exist — a route nothing imports is a route that is not there.

**A route reads its own params with `currentParams()`** from `@pdxui/router`, inside a
`$derived` so the page follows when only the param changes (`/patients/1` → `/patients/2` reuses the
component):

```html
<template>
  <h1>Patient {{ id }}</h1>
  <a href="/patients">All patients</a>
</template>
<script setup>
@page '/patients/:id';
import { currentParams } from '@pdxui/router';
const id = $derived(currentParams().id);
</script>
```

The values are strings, as in the URL. `currentQuery()` and `currentPath()` sit beside it.

**A plain `<a href="/patients">` is a router navigation**, not a reload, where the browser has the
Navigation API (`'navigation' in window`, measured in Chromium): the router takes every same-origin link
click, asks `onBeforeNavigate` first, and renders the match. `target="_blank"` still opens a new tab —
that navigation belongs to the other tab. Without the Navigation API a plain `<a>` reloads the page;
`<pdx-link to="…">` and `navigate()` are router navigations in every browser. `download` is an exit
too: a same-origin `<a href="/exports/visits.csv" download>`, with or without a file name, is left to
the browser, which saves the file and keeps the page.

**The «PDX» badge in the corner is the dev devtools**, injected by `pdx()` on the dev server and never
in a build. It opens a panel with the component tree, the signals and a trace; **Ctrl+Shift+D** toggles
it from anywhere. The badge is not shown on a touch device or below 768px, where it would cover a
bottom navigation — the shortcut still works there. Turn it off with `pdx({ devtools: false })`. If
the panel says «Debug hook not found», core is not running as a dev build (the page is a production
build, or `process.env.NODE_ENV` is `production`).

`npx @pdxui/cli new project <name>` scaffolds a project to start from: `@pdxui/framework`, and
`@pdxui/cli` and `@pdxui/compiler` as dev dependencies, at the CLI's own version; the design system
imported once in `index.html`; an `AGENTS.md`. Then `npm install` and `npm run dev`.

## Things that will cost you an hour otherwise

- **Design tokens have a NAMED scale, not a numeric one.** `--pdx-space-4` is not a token: `var()`
  resolves to nothing, **the whole app loses its padding, and nothing errors**. The scales are
  `2xs xs sm md lg xl 2xl 3xl` for `--pdx-space-*` and `--pdx-text-*` (plus `--pdx-text-base` and
  `--pdx-text-display`), and `sm md lg xl full` for `--pdx-radius-*`.
- **`:disabled` sets the PROPERTY, not the attribute.** `el.hasAttribute('disabled')` is false while
  `el.disabled` is true — a check written against the attribute passes always.
- **A new `.pdx` is picked up without restarting the dev server**; the server says so
  on the console when it happens.
- **`onMount` is one-shot.** For anything reactive use `$effect`, and for a route whose params change
  without remounting use `onRouteChange` — two URLs on the same route do **not** re-create the
  component.
