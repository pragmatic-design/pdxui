---
title: Router
description: "From URLs to pages: @page, params, guards, layouts, loaders, transitions, keep-alive."
order: 8
---

# Router

Routing answers one question: *which UI do I show for this URL?* In PDX the answer is declarative and
lives next to the component. Add `@page` to a component and it becomes a page — but it stays a normal
custom element, reusable anywhere. `@page` is **metadata, not a cage**.

## Your first page

```pdx
<!-- home.pdx -->
@page '/';
@title 'Home';
let _ready = $signal(true);
```

For it to work there must be a place where pages are rendered — the **outlet** — in the app shell:

```pdx
<pdx-router-outlet></pdx-router-outlet>
```

And links that navigate without reloading the page:

```pdx
<pdx-link to="/dashboard" active-class="active">Dashboard</pdx-link>
```

`<pdx-link>` renders a real `<a>` (so SEO, right-click, open-in-new-tab work) but intercepts the
click to navigate client-side. To navigate from code: `navigate('/dashboard')` from
`@pdxui/router`.

> **Gotcha — dynamic links.** `<pdx-link to="/x">` with a *static* `to` works. If the URL is
> *dynamic* (inside a `@for`), prefer `<a :href="url" @click="go">` with
> `function go(e){ e.preventDefault(); navigate(e.currentTarget.getAttribute('href')); }`.

## Params

A dynamic segment is written `:name`, with an optional constraint:

```pdx
@page '/users/:id(number)';
```

Inside the page you read params as signals (reactive: they change when you go from `/users/1` to
`/users/2` without remounting):

```pdx
import { currentParams } from '@pdxui/router';
const id = $derived(currentParams().id);
```

A component can answer multiple paths (handy for index + detail):

```pdx
@page '/docs', '/docs/:slug';
```

## Protect a page: @guard

Some pages must not be reachable without permission. `@guard` declares it:

```pdx
@page '/admin';
@guard 'admin.users';
```

Before entering, the router checks the permission (via `@pdxui/core`'s permission system).
Authorization logic doesn't scatter across pages: it's a declaration next to the route.

### Where a denial goes

By default the refusal is shown **where it happened**: a `403` in the outlet of the level that was
denied, so a tab a visitor may not open leaves the page around it standing.

An app with a login wants the other answer too — but only for one of the two causes:

```ts
// a path: every denial goes there
globalThis.__pdx_guard_redirect = '/login';

// or a function of the permission that was refused
globalThis.__pdx_guard_redirect = () => (auth.isAuthenticated() ? null : '/login');
```

`null` means *"not a redirect: refuse here"*. The distinction matters because **a missing permission
is not a missing session**: sending an authenticated visitor to a sign-in form asks them for the one
thing they already have, and signing in again lands them back on the same denial. The router cannot
tell the two apart — it asks a guard checker that answers a boolean — so the application does.

The same value reaches `createRouter({ guardFailRedirect })` for an app that boots the router
itself. A target outside the origin is refused either way.

## Data before the page: @loader

Often you want data *ready* when the page appears, not a "loading" flash. `@loader` runs a function
before entering:

```pdx
@page '/users/:id';
@loader loadUser;

async function loadUser() {
    const res = await fetch('/api/users/1');
    return res.json();
}
```

The resolved data is in `currentLoaderData()`, and `currentLoaderState()` reports
`idle → loading → done` (or `error`). The page mounts only once the loader has settled, which is
what makes it *blocking* data — for declarative fetching inside the page see
[Data layer](/docs/data).

The function is declared in the same `<script>`, and the compiler lifts it to module scope so the
route can call it. It therefore runs **before the component exists**: it cannot read props or
signals, and takes what it needs from the URL. A `@loader` naming a function that is not declared
is reported as `PDX_LOADER_NOT_FOUND` rather than silently registering nothing.

## Shared layouts: @layout

A **shell around a group of pages** — a rail, a topbar, whatever every screen in a section has —
without those pages knowing about each other:

```pdx
<!-- admin/_layout.pdx -->
<template>
  <aside class="rail">…</aside>
  <slot></slot>          <!-- the page renders here -->
</template>
```

```pdx
<!-- users.pdx -->
<script setup>
@page '/admin/users';
@layout 'admin';
</script>
```

The name resolves to a **component tag at build time**, and the page's module imports it, so the
shell arrives with the page that declares it rather than through a registry read at startup:

| `@layout 'admin'` finds | when |
| --- | --- |
| `pdx-admin-layout` — `admin/_layout.pdx` | preferred: the layout-file convention |
| `pdx-admin` — `admin.pdx` | when no layout file claims the name |

The second form is what lets a shell be an ordinary component with a `<slot>`.

The shell is **diffed, not rebuilt**: navigating from `/admin/users` to `/admin/roles` keeps the
layout element mounted, with whatever state it holds — a collapsed rail stays collapsed. A route
that declares no layout tears the stack down and renders in the outlet itself.

One layout per page, not a chain. A frame *inside* a frame is a **nested route**: put a
`<pdx-router-outlet>` in the parent page and the routes below its path render inside it. That is
the next section, and it is what the showcase's ticket screen uses.

## Nested routes: a page inside a page

Master-detail is the shape of most business screens: a list or a header that **stays**, a detail that
changes, both in the URL so both can be linked and both survive a reload.

Put a `<pdx-router-outlet>` in a page and every route below its path renders **inside** it:

```pdx
<!-- ticket.pdx -->
<template>
  <h1>Ticket {{ $params.id }}</h1>
  <nav>…tabs…</nav>
  <pdx-router-outlet />          <!-- the child renders here -->
</template>

<script setup>
@page '/tickets/:id';
</script>
```

```pdx
<!-- intervention.pdx -->
<script setup>
@page '/tickets/:id/interventions/:n';
</script>
```

Open `/tickets/7/interventions/2` and both render: the ticket, with the intervention inside its
outlet. Each level is still a route of its own, so the child keeps its `@guard`, its `@transition`
and its keep-alive — which is what a single flat route with the split done by hand cannot give you.

**The parent does not remount.** Moving from `/tickets/7/interventions/2` to `…/3` swaps only the
child: the ticket's element, its signals, its scroll position and anything it has loaded stay exactly
as they were. That is the whole reason to nest, and it is worth checking in your own app — it is the
part a hand-rolled split always loses.

A few rules worth knowing:

- **the outlet is the declaration.** A route is a parent because its page renders an outlet, not
  because its path happens to be a prefix. `/owners` and `/owners/new` share a prefix and are
  siblings; nothing changes for them;
- **params from every level** reach every level: the child reads `id` *and* `n`, and the parent sees
  them too — it is one match;
- **a bare parent URL is the parent alone.** `/tickets/7` renders the ticket with an empty outlet,
  not a 404;
- **guards run outermost first**, and a parent that denies stops the child;
- **loaders run outermost first too**, and only the levels that need to — see below;
- a change of `:id` is a param change on the same route, so the parent stays and is told — the same
  rule a flat route has always had.

### A loader per level

Each level runs its own `@loader`, outermost first, and a level whose **own** params did not change
does not run again. That is the pairing a master-detail screen is for: the parent loads the ticket,
the child loads one intervention, and moving between interventions refetches the intervention only.

```pdx
<!-- ticket.pdx -->
@page '/tickets/:id';
@loader loadTicket;
```

```pdx
<!-- intervention.pdx -->
@page '/tickets/:id/interventions/:n';
@loader loadIntervention;

import { currentLoaderData, loaderData } from '@pdxui/router';

const intervention = $derived(currentLoaderData());        // this level's
const ticket = $derived(loaderData('/tickets/:id'));       // the parent's, by its pattern
```

`currentLoaderData()` still means **the matched route's** data, which is what it has always meant
and what a flat route still gets. `loaderData(pattern)` reads a named level — that is how a child
reads its parent's record, and it is reactive, so it updates when that level reloads.

What decides a refetch is the level's **own** params. `/tickets/7/interventions/1` →
`…/interventions/2` leaves `:id` alone, so `loadTicket` does not run and the header does not
flicker; `/tickets/9/interventions/1` changes it, so it does. Leaving the branch entirely forgets
it: `loaderData('/tickets/:id')` from a page outside is `undefined`, never a stale ticket.

`loaderState(pattern)` is the same for the state, and `currentLoaderState()` remains the matched
route's.

> **Not named outlets.** `@outlet 'sidebar'` fills a *parallel* region at the same URL — a sidebar
> and a main area showing different things at once. Nesting is about the path.

## The breadcrumb nobody writes

`<pdx-breadcrumb>` takes an `items` array, and a page that fills it by hand restates a path the
router already holds — a copy that goes stale the day a route is renamed, silently, because nothing
connects the two.

Say what each route is called, on the route:

```pdx
@page '/tickets'                      { label: 'Tickets' };
@page '/tickets/:id'                  { label: 'Ticket :id' };
@page '/tickets/:id/interventions/:n' { label: 'Intervention :n' };
```

Then put one breadcrumb in the shell, with **no `items`**:

```pdx
<pdx-breadcrumb></pdx-breadcrumb>
<pdx-router-outlet></pdx-router-outlet>
```

`/tickets/42/interventions/7` renders **Tickets › Ticket 42 › Intervention 7**. Every crumb but the
last is a link to that level with the params filled in; the last is not a link and carries
`aria-current="page"`. Rename a route's label and the crumb follows — no page mentions it.

- **`:param` in a label** is substituted from the matched route's params, the same way the href is:
  "Ticket 42" is the useful crumb, "42" is not.
- **A route with no `label` contributes no crumb.** Nothing is derived from the path, on purpose:
  a trail of URL segments is what the address bar already shows.
- **An ancestor counts by path, not by nesting.** `/tickets` is above `/tickets/:id` whether or not
  the detail renders inside it — a breadcrumb is navigation, and nesting is rendering.
- **`items` still wins.** Pass it and the component shows exactly that.

Behind it: the router publishes the trail into core and the component reads it from there, which is
also how `@pdxui/ui` gets this without depending on the router.

```ts
import { routeTrail, setRouteTrail, clearRouteTrail } from '@pdxui/core';

routeTrail();        // RouteCrumb[] — a signal: read it in a template or an effect
```

`setRouteTrail(crumbs)` is what the router calls on every navigation, and `clearRouteTrail()`
empties it. An application calls neither — they are there for a screen that drives its own
navigation without this router, and for a test that wants a trail without one.

## One chunk per page

A route is a **split point**. `@page` makes the page its own JavaScript chunk, and the browser
downloads it the first time that route is shown — not before.

You write nothing. The compiler scans the project's `@page` declarations at build time and emits the
route table into the router, so the router knows every route without loading any page. The outlet
imports the one it is about to render.

What that costs you is one line in your entry, and it is a line to **delete**:

```ts
// index.html — not needed by a PDX app: delete it
import.meta.glob('./src/pages/**/*.pdx', { eager: true });
```

The router does not need a page imported to know its route exists, and the glob puts **every page
in the first download** — the dynamic import the outlet performs resolves to a module already in the
entry, and the bundler has nothing to split. Measured on the showcase: with the glob, one chunk,
28.5 KB, the whole application on `/`. Without it: **20.7 KB in the entry and a chunk per route.**

Two things worth knowing:

- **`@page '/x' { preload: true }`** keeps a page in the entry. For the one route that is almost
  always the first one, that is a round trip saved rather than a chunk gained;
- a route that splits **stalls the first time it is opened**, which is the cost of not downloading it
  earlier. That is what prefetching is for, and it is the next section.

In dev nothing changes: there is no bundle to split, the glob costs nothing, and the interpreted
router builds its table from the pages as they are imported.

## The first screen: a splash, then the app

A cold load of an app with `@page` routes paints a **splash** before any JavaScript has run — the
page's `<title>` on the theme's background — and the app appears whole once it is ready, with one
200 ms fade (none under `prefers-reduced-motion`). The compiler writes it into `index.html`; you
declare it, or turn it off:

```ts
// vite.config.ts
pdx({ splash: { title: 'Service Desk', logo: '/logo.svg' } }); // or `splash: false`
```

«Ready» is the router's first screen by default: the first page shown, or its refusal. An app that
wants more — its first data, say — adds a condition, and the splash waits for that too:

```ts
import { splashReady, isSplashUp } from '@pdxui/core';

splashReady(loadTheDashboard()); // settled either way: a failure is the app's to show
isSplashUp();                    // true while the start-up splash covers the page
```

After the start, a page whose chunk is still on its way shows a «Loading…» placeholder — but only
after 300 ms, so a chunk that arrives sooner never flashes one, and never while the splash is up.
The page takes the focus when it arrives, without the browser drawing a ring round it.

## Before the click: prefetching

A split route is downloaded when it is shown, so the first click on it waits for a round trip.
`<pdx-link>` removes that wait: it fetches the target route's chunk on **hover**, on **focus** and on
**pointerdown** — a mouse, a keyboard and a finger, in that order — and by the time the click lands
the module is already in the cache.

You write nothing for the common case. What you can write is the exception:

```pdx
@page '/reports' { prefetch: 'eager' };   <!-- fetch it as soon as a link to it is on screen -->
@page '/admin'   { prefetch: 'never' };   <!-- never speculatively -->
```

`never` is the one worth knowing. A route behind a permission the visitor does not have should not
be fetched to find that out, and a page nobody is expected to open is bytes spent on nothing. A
single link can also opt out on its own, `<pdx-link to="/x" prefetch="never">`, for a link the page
draws a hundred times.

Two things happen without being asked:

- **nothing is prefetched on a connection that is paying for it.** `navigator.connection.saveData`
  is the visitor asking you not to, and `2g`/`slow-2g` is a connection where a speculative download
  competes with the page they are reading. Both turn it off;
- **once per route, not per link or per URL.** `/tickets/1` and `/tickets/2` are one chunk.

The same call is yours when nothing is hovered. An app that holds its outlet back — until a route's
strings are in, say — would otherwise ask for the route's chunk only once the outlet renders, a
round trip after everything else. `prefetchRoute(url)` starts it alongside:

```ts
import { prefetchRoute, currentPath } from '@pdxui/router';

prefetchRoute(currentPath());   // the route's chunk, in the same wave as whatever the shell awaits
```

It follows the same rules as the link — the route's policy, the connection, once per route — and
answers whether a fetch was started.

> **This is not `<link rel="prefetch">`.** That asks the server for a *document*, and in a
> single-page app the document for `/tickets/1` is `index.html` — which the router will never
> navigate to. What is fetched here is the route's JavaScript, through the same `import()` the
> outlet performs on the click.

## Transitions

```pdx
@transition 'fade';   <!-- or slide-left/right/up/down, scale -->
```

On navigation the router applies the transition between the outgoing and incoming page, using
`@pdxui/core`'s enter/exit classes.

## Destroy or keep: keep-alive

By default, when you leave a page its component is **destroyed** (a clean mount/destroy cycle).
Sometimes you don't want that: a list with filters set, a half-scroll, a partially filled form. With
`keepAlive` the page is **frozen**, not destroyed:

```pdx
@page '/results' { keepAlive };
```

What happens under the hood: the component is moved into a `DocumentFragment` (zero CPU while frozen)
and, on return, re-appended to the DOM, reconciling with state. Come back and you find everything as
it was. Use it for views that are expensive to rebuild or hold precious user state; leave the default
(destroy) for the rest, so you don't accumulate memory.

## The query string

The query is a signal, and it is read the same way params are:

```pdx
import { currentQuery } from '@pdxui/router';
const page = $derived(Number(currentQuery().page ?? 1));
```

Writing it is the part with a rule attached:

```ts
import { setQueryParam, setQuery } from '@pdxui/router';

setQueryParam('page', '2');        // one key
setQueryParam('filter', null);     // null removes it
setQuery({ page: '2', sort: 'name' });   // the whole query, replacing what was there
```

> **Do not write the URL yourself.** `history.replaceState` moves the address bar and leaves the
> router's own state behind: `currentQuery()` keeps the old value, and so does every
> [`@search`](/docs/router) declaration reading it. These two write the URL *and* update the signals,
> which is the only reason to prefer them.

Both use `replaceState`, so changing a filter does not add a history entry the Back button has to
walk through. Reach for `navigate()` when the new query *is* a new place the user should be able to
come back from.

## Hooks: before and after a navigation

`onBeforeLeave` guards one page. These two are global — one registration covers every route — and
each returns the function that removes it:

```ts
import { onBeforeNavigate, onAfterNavigate } from '@pdxui/router';

const stopGuard = onBeforeNavigate((from, to) => {
  if (!hasUnsavedChanges()) return true;
  return confirmDiscard();        // a promise resolving to a boolean is fine
});

const stopTrack = onAfterNavigate((from, to) => analytics.page(to));
```

**Returning `false` cancels the navigation**, and the URL is put back if it had already moved.

One thing about the shape, because it is deliberate and visible in what you return: **a boolean is
not awaited, a promise is.** Answering `true`/`false` synchronously keeps the whole navigation
synchronous; returning a promise makes that one navigation asynchronous. Awaiting unconditionally
would have made *every* navigation async — including the pages with nothing to ask — merely because
one hook exists somewhere.

The hooks run **before** the guard and the loader — and **once per hop**, not once per gesture. A
redirect asks again with the new destination: a redirect table entry, a route's own `@redirect`, a
denied guard's `guardFailRedirect`. So `to` is the path being tried, which is not always the path
that will be entered.

That matters the moment a hook asks the USER something. The third argument says which hop this is:

```ts
onBeforeNavigate((from, to, hop) => {
  if (hop.redirected) return true;     // the same gesture, already answered
  return confirmDiscard();
});
```

`destroyRouter()` removes the router's own listeners. An application never calls it; a test does, and
so does an HMR pass that re-creates the router. It is idempotent.

## Other route declarations

```pdx
@redirect '/old' -> '/new';      <!-- redirect -->
@alias '/people';                <!-- alternative path for the same page -->
@outlet 'sidebar' -> 'pdx-nav';  <!-- named outlet -->
@params { id: number };          <!-- param types: parsed, not implemented -->
@prefetch 'hover';               <!-- 'hover' (the default), 'eager', or 'never' -->
```

`@prefetch` is the policy for fetching the page's chunk before the click — see
[Before the click](#before-the-click-prefetching) above, which is where it is explained.

> Two things `@prefetch` does not do: **`'viewport'`** is not a policy the router
> knows (it is accepted by the parser and then behaves as `hover`), and nothing emits the browser's
> **Speculation Rules** — `GeneratedRouter.speculationRules` is a type with no producer. Prefetching
> is done by `<pdx-link>` calling the route's own `import()`, which is a different mechanism and
> the one that works in a single-page app.

## In practice

| You want… | Declare |
| --- | --- |
| a page | `@page '/path'` |
| a variable segment | `@page '/x/:id'` + `currentParams()` |
| to protect it | `@guard 'permission'` |
| data ready on entry | `@loader fn` |
| a shared frame | `@layout 'admin'` — or, for a frame inside a frame, a parent page with a `<pdx-router-outlet>` |
| to keep state | `@page '/x' { keepAlive }` |
| to navigate from code | `navigate('/path')` |
| the chunk ready before the click | nothing — `<pdx-link>` does it; `@page '/x' { prefetch: 'never' }` opts out |
| to read or write the query | `currentQuery()` · `setQueryParam(k, v)` |
| to guard or track every route | `onBeforeNavigate` · `onAfterNavigate` |
