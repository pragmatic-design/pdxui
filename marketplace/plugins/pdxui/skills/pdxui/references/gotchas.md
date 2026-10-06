# Gotchas `.pdx` / PDX UI

Traps learned while building the golden app and the **profiler** admin (`Pragmatic.Design.Builder/profiler/app`).
Read this BEFORE writing any `.pdx`: every entry cost real debugging.

> Every 🔴 / ⚠️ here is measured and has a test in
> `packages/responsive/tests/integration/ui-components/skill-claims.spec.ts` that fails the day the framework
> changes. **Do not add an entry here without one**: an unverified warning ages into a lie, and this file is
> read before every `.pdx` anyone writes.

## Template reactivity
- **A signal appears in the template only inside an expression or a wrapper function**, never as a bare identifier:
  `@if (open())` and `:class="x > 0 ? 'a' : 'b'"` are fine; `{{ signalBare }}` or `@if (signalBare)` → a ReferenceError.
  **An import is not on `ctx`**: a signal imported and used in the template makes the component throw at mount
  (`ctx.X is not a function`); a function imported and used in `@click` throws the same when clicked, and nothing
  happens. Bring it into the `<script setup>`: a **function** as `const goTo = go` or a wrapper function; a **shared
  signal** as `const user = $derived(shared())`, then `{{ user.name }}` follows it. Not `const user = shared()` —
  a snapshot that never updates — and not `const user = shared` read as `{{ user.name }}`, which renders "read",
  a property of the signal function. (Measured.)
- **The name `error` is forbidden** for a signal (the compiler does not rewrite it) → use `errMsg`.

## Binding & DOM
- 🔴 **`pdx-app-layout` knows exactly four regions**: `data-region="header" | "navbar" | "aside" | "footer"`.
  Everything **without** a `data-region` is wrapped in a generated `<main class="pdx-app-main">`. There is **no
  `content` region** and no `sidebar` (the left one is `navbar`). A child carrying an unrecognised `data-region`
  gets neither treatment: skipped by the four, skipped by the `main` wrap, it **drops out of the layout in
  silence** — no class, no `grid-area`, no warning.
- **A controlled `:value` plus an `@input` over the same signal** on a `<pdx-input>` → the input is recreated on every keystroke → and it loses
  focus. The answer: an **uncontrolled** input (`@input` alone to read it; no `:value` coming back). This does **not** apply inside
  `<pdx-form :form>`: there the compiler wires named controls itself and gives text controls no `:value` — see the recipe
  "A long form filled in more than one sitting".
- **Props that collide with a read-only DOM property**: do NOT use `:prefix` on a custom element
  (`Element.prefix` is read-only → a TypeError). Put the value somewhere else (in the `value`, for instance).
- 🔴 **Two components that declare the same `@event` name corrupt the parent's state, in silence.**
  Component events bubble, so a child's `changed` reaches a listener put on its grandparent for a
  DIFFERENT `changed`. Measured: `pdx-unit-field` declares `@event changed: number`,
  `pdx-room-rows` declares `@event changed: any`, the parent listens for `@changed` on
  `<pdx-room-rows>` — and the field's number lands in `rooms`, giving
  `TypeError: (rooms ?? []).reduce is not a function` from inside the framework, a section that
  empties itself, and an acceptance check failing with "cannot type into the fields" because the
  fields are gone. **Nothing warns, and nothing should**: two components declaring the same event
  name is legal. `changed` is the most natural name there is, which makes it the collision that
  does the most damage. Name events so they are greppable and cannot collide —
  `valuechanged`, `roomschanged` — the same rule this repository applies to its own identifiers.
  `.self` on the listener stops the bubble, but only once you know to suspect it.
- **A bound `:src` with a `data:image/svg+xml` URL is dropped, by design** — an SVG opened as a
  document runs its script. `sanitizeMediaUrl` accepts http(s), relative URLs, `blob:` and
  `data:image/{png,jpeg,gif,webp,avif}`; everything else becomes `null` and the attribute is not
  written. In dev it says so once per element and attribute. Two asymmetries worth knowing:
  a **static** `src="data:image/svg+xml,…"` in the template is **not filtered at all** (the
  sanitiser runs on BOUND attributes), and **`blob:` passes** — `URL.createObjectURL(file)` is how
  you preview a file the user just picked. For an inline SVG icon use `pdx-icon`, or a
  `blob:` URL from a Blob you build yourself.
- **A `:prop` that is a JSON string** (`pdx-chart`'s `series-config`, `filter-mode`, and so on): pass a **string**
  (`JSON.stringify(...)`), not an object (the component calls `JSON.parse`).

## Design system and tokens
- The real tokens are **`--pdx-color-*`** (bg, surface, text, muted, border, primary, -primary-text, -primary-hover, danger,
  success, info, warning, subtle), plus `--pdx-space-*`, `--pdx-shadow-sm/md/lg/xl` and `--pdx-radius-*`. NOT `--ink` or `--surface`.
  Never a hardcoded fallback (they break dark mode). The theme goes on `<html>` through `pdx-theme`, the scheme through `pdx-scheme`.
- **A `.pdx` scoped style does NOT reach light DOM created at runtime** by a component (a data-grid cell built through
  `column.format`, say). Use a **global** stylesheet (imported in index.html) for those classes.
- To centre an icon inside a button: `pdx-icon { display:block; line-height:0 }`.

## Routing / guard
- No global `effect` that reads `currentPath()` and calls `navigate()` (it loops). Guard **per route** in the
  `<script setup>` (a `requireAuth()` that calls `navigate('/login')` when not authenticated). Condition the **chrome** on the
  ROUTE (`currentPath() !== '/login'`), not on `authed()` (authentication resolves asynchronously).
- "Leaving loses the unsaved work": that is not a per-route guard, it is `onBeforeNavigate` from
  `@pdxui/router`, asked before every navigation, Back included. The recipe "Do not leave with unsaved
  work" wires it to a `pdx-alert-dialog`, and adds `beforeunload` for the tab being closed.
- Full-height pages (a list that does not scroll): the outlet has to propagate the height
  (`.content > pdx-router-outlet { height:100% }`), and the page needs `height:100%; display:flex; flex-direction:column`.

## DataSource (data-bound)
- The pattern done properly: one shared **explicit DataSource** — `createDataSource({ data, pageSize })` (or
  the declarative `<pdx-data-source url=…>`) passed to the `:source` of the grid, of `pdx-filter-builder` and of `pdx-pagination`.
  `:data="array"` is a shortcut (it auto-wraps, pageSize 0) and fine for simple cases, but `:source` is backend-ready
  (swap `data` for an HTTP `transport` and the UI does not change at all). For paging: `pageSize > 0` on the source.
- **A grid feeds the source's selection only if the source keeps one.** `createDataSource({selection:
  {mode:'multiple'}})` → ticking a row updates `ds.selected()`, `ds.selectedCount()` and
  `ds.selectedItems()`, and the source's extras (cross-page `selectAll()` over the current filter,
  `persistKey`) apply to what the user actually ticked. **Without that option the source stays empty by
  design** — it never asked for selection state — and the grid's own `pdx-selection-change` /
  `el.getSelectedIds()` are the way to read the selection. Pick one: opt the source in, or read the
  grid.
- ⚠️ **The grid's imperative API is FLAT on the element, not under `__dataGrid`.** That property does not
  exist (measured: `undefined`), and looking there you would conclude the grid has no selection API. Everything `ctx.expose()` publishes lands on the host:
  `el.getSelectedIds()`, `el.clearSelection()`, `el.startEdit(...)`, and the rest.

## Forms: data-driven editing (auto-form and form-template)
- **`pdx-form-template` binds the form's value to the control ONLY at build time** (it reads `field.value()` once), not
  reactively: a `form.reset(record)` AFTER the build does NOT update the controls. → load the record BEFORE building the
  template. For a reusable edit fly-out or dialog: **rebuild** the form on every opening
  (`createFormFromSchema(schema)` → `form.reset(row)` → create a `<pdx-form-template>` around that form). [a framework gap]
- **`pdx-auto-form` exposes its API on the element**: `el.form`, `el.getValues()`, `el.reset(values?)` and
  `el.validate()` (`ctx.expose`), and `record-id="1"` finds `{ id: 1 }`. `getValues()` answers `undefined` until
  the form is built, a frame after it connects. `pdx-form`'s own `record-id` misses a numeric id.
- **A component's prop setters are installed in `connectedCallback`**: on an element created through
  `createElement` but not yet in the DOM, `el.myProp = x` throws *"only has a getter"*. Set the object props
  (`schema`, `form`) AFTER the `appendChild`, inside a `requestAnimationFrame` (which is what the auto-form does internally).
- A backend-ready save: read `form.getValues()`, then `ds.update({...existing, ...values})` followed by `ds.sync()`
  (the `arrayTransport` implements `update` and `batch`; tomorrow it is just a swap to an HTTP transport). `ds.update` tracks the
  change and `_viewData` (a computed) reflects it in the grid at once; `sync()` persists it.

## Overlays, drawers and modals
- **A real modal without depending on a component**: a plain-DOM overlay on `<body>` (a `position:fixed inset:0` backdrop plus a
  centred box) is the most robust pattern for a confirmation dialog or an editor (`grid-delete.ts confirmDialog`, the JSON editor).
- **Toasts**: `import { toast } from '@pdxui/ui/toast'` (`toast.success`, `toast.error`, and so on) plus a `<pdx-toast position="top-right">`
  in the shell. Use it for a save's success and error instead of inline messages.

## Data-grid: the empty state and the source
- **Clickable rows** (they open the editor): `pdx-data-grid [role="row"]:has([role="gridcell"]) { cursor: pointer; }` (in the global CSS).

## Components: runtime dependencies
- Components that create children at runtime through `createElement('pdx-x')` (`pdx-data-grid` → select, number-input and
  date-picker for its filters) register their own dependencies; but the **compiler's auto-import registers only the
  tags written statically in the template**. If you use a component only through its API, import it explicitly.

## A project's own reusable `.pdx` components
- A `.pdx` under `src/**` is registered automatically as a component; its **tag** comes from `@tag 'name'` or from the filename
  (`list-header.pdx` → `<pdx-list-header>`). Props come from the **`@prop name: type = default`** rune (read bare in the template).
  Types map to the runtime like this: `T[]`→Array, the primitives→their counterparts, **everything else (any, object, functions)→Object**.
- The robust pattern for reuse: a partial is **pure markup** with `data-*` hooks; the logic (the events, the buttons) is wired by a
  **TS service** in `onMount` (`querySelector` plus `addEventListener`) — which avoids function props, `.pdx` events, and the
  custom-event reactivity gotcha. Put a partial's CSS in a **global stylesheet** (scoped styles do not cross the route↔partial boundary).

## Password manager (LastPass/1Password)
- `pdx-input` SUPPRESSES password managers by default; they come back with a credential `autocomplete` (username, email, *-password,
  one-time-code) or with `type=password`. LastPass in 2026 ignores `data-lpignore`: to hide its icon, use
  `visibility:hidden` on `div[data-lastpass-icon-root]` (plus a `:has()` to bring it back on the credential fields).

## Workarounds in the older apps — do not copy them

`Pragmatic.Design.Builder/golden` and `profiler` are pointed at as reference apps, and they carry
workarounds for defects the framework does not have. Copying one re-introduces code that fights the
framework. Each line below is measured; the assertions live in `skill-claims.spec.ts`.

- **A NEW `.pdx` component needs no dev-server restart.** The plugin watches for a `.pdx` appearing, rescans,
  and reloads the page so the new tag resolves — and says so on the console (`[pdx] new component x.pdx —
  reloading…`), because a silent reload is half a defect. The element goes from undefined to rendered without a
  restart, then follows its edits, whether the file is written in one go, created empty and then filled, or
  created as a bare `<template>` and then replaced; `compiler/tests/dev-server-late-component.test.ts` keeps
  that repro. Two watcher facts, true of ANY file and not specific to new ones: a save that lands within 50 ms
  of the previous one is not reported (chokidar throttles `change`), and a file written while the server is
  still scanning `src/` at startup produces no `add`. If a new file is ever served as an empty stub
  (`props: {}`, no setup) with its edits ignored, capture the response of the module's URL, the Vite version
  and how the file was created: that is the difference the repro is missing.
  A `.pdx` that is empty or only whitespace when the server reads it — a save caught in flight, the editor
  having truncated the file and not yet written it back — raises **`PDX_EMPTY_SOURCE`**, which Vite shows as an
  overlay and logs; the plugin re-reads the file once before raising, so a write still in flight simply
  compiles. If you see that error on a file you know has content, you caught the save: save again. It is an
  error because a blank source would otherwise be served with HTTP 200, no component and nothing in the
  console, or compile to a component that registers and renders an empty `<div>` — indistinguishable from one
  that legitimately draws nothing.
- **Do not clear the transform of an open drawer's panel by hand.** The four open states rest at
  `transform: none`, not `translateX(0)`, so a `pdx-select` dropdown, a tooltip or a popover inside an open
  drawer is positioned against the viewport. An active transform makes the panel their containing block —
  measured: the dropdown at left 1826 instead of 925 on a 1280 viewport — so do not set one on the panel
  yourself, or the trap comes back.
- **Setting a signal inside a CUSTOM event's handler updates the template.** Measured twice: a `CustomEvent`
  dispatched from outside any handler, and a component's own `@pdx-change`. Both update `{{ }}` **and** flip an
  `@if`. Write the handler normally; do not drive the DOM by hand.
- **`:class` on a `data-region` element of `pdx-app-layout` is fine** — measured: `:class="x"` on the header
  leaves `class="x pdx-app-header"` with `grid-area: header` intact. It merges.
- **`pdx-select` reflects the choice onto `.value`**: `reflectValue()` writes the selection back, so after
  picking, `el.value` IS the chosen value (single → scalar, `multiple` → an **array**). Read `el.value`; do not
  keep it in `el.__val` yourself. Do **not** copy `select-fix.ts` from the profiler app: it works around a bug
  that does not exist. The event carries it too: `e.detail.value` single, `e.detail.values` with `multiple`.
- **A `pdx-drawer` opens when you set `.open = true` from JS**: `el.open = true` sets `[data-open]` on the panel
  and the backdrop and slides it in at the `position` you asked for. Do not drive `[data-open]` by hand and do
  not copy `position`/`size` onto the panel yourself.
- **Inside an app-layout, do not reparent the drawer onto `<body>`.** The component portals itself, and only
  when an ancestor actually traps fixed positioning (a transform, a filter, `contain`). Measured inside
  `pdx-app-layout`: nothing paints over the open panel. Reparenting by hand is actively harmful — it detaches
  slotted content from its scoped styles and reconnects child components.
- **The drawer's own X closes it** — measured: clicking the X sets `open` to false, drops `[data-open]`, and
  emits `pdx-close` once. Listen to the event if you need to know; you do not need to close it yourself.
- **A static `createDataSource({data})` renders its rows** — measured: three rows in, six cells rendered. Use a
  transport when the data comes from a server, not as a workaround.
- **The 'No data' message does not end up at the bottom** — measured on a 420px grid, the empty block sits
  slightly ABOVE the middle (the header takes the top). Not perfectly centred, but nowhere near the bottom, and
  the global `flex: 999 1 auto` override is not needed.
