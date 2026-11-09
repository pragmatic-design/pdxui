# Rendering outside the browser

What the beta renders before the browser runs a script, what it does not, and the path from one to
the other.

## Where the beta stands

| Capability | Beta | Source |
|---|---|---|
| Importing `@pdxui/core` and a compiled component in Node without a DOM | **yes** | #93 — landed |
| **Static generation**: routes rendered to HTML at build time, taken over by the client at boot | **yes** | #160 |
| **Hydration**: the client adopts the server's nodes instead of rendering them again | **yes** | #160, owner decision 2026-11-06 |
| Rendering per request on a server | no — separate roadmap | this page |
| Streaming | no — separate roadmap | this page |

## Static generation and hydration (#160)

The owner's first decision (2026-10-10) was to render and replace: the client rendered every page
again at boot. It was changed on 2026-11-06 to hydration: the client takes the server's markup over,
with no second render and no external dependency.

### Semantics

- A component renders on the server through its own code: the class `component()` registered, its
  props, its setup and its render, in Node, on a server DOM that has no document. The markup is the
  client's, node for node, with comments marking where a value's content starts and ends, so that the
  client can find it again.
- **What runs on the server is what runs before the client's first paint**: the setup, its
  `$derived`, and each `$effect` once, as at the client's setup, so that the markup is the one the
  client would build (owner decision 2026-11-08). No listener is attached and no `onMount` runs. An
  `@if` or `@for` is evaluated once; a `@defer` renders its `@placeholder` unless its trigger fires at
  once; an `@await` renders its `@loading` branch, except over a route's `@loader`, whose data the
  build has fetched (below).
- A `@for … @virtual` has no layout to measure on the server, so it writes the window it starts at: its
  first rows, between the two spacers the client places, the one after them sized for the rows not
  written by the row estimate, so the page has the list's height (#930). With nothing to show it writes
  `@empty`. Each row carries what the client's row says of itself (`aria-setsize` and `aria-posinset`
  in a list, the roving `tabindex` under a composite role), except `aria-rowindex`: the header rows
  around a table's list are not known while it is written. When it hydrates, the list measures its
  container at once and keeps the server's rows its first window holds, by key — all of them in a window
  that starts at 0, as a page that has not scrolled — builds the ones it holds that the server did not
  write, and lets the others go; an adopted `@empty` stays until rows come. The number of rows the server writes is
  `@virtual(…, serverRows: n)` in a template, `VirtualListOptions.serverRows` by hand, 40 when it is
  not set.
- `pdx build --ssg` renders every `@page` route without dynamic parameters, plus the paths listed in
  `pdx.config`'s `ssg.routes`, to `dist/<route>/index.html`. Each page is the built `index.html` with
  the route's content in its body, and its `@title` and `@meta` in its head. The head announces the
  route's own chunks (`modulepreload`), and holds the route's stylesheets inline, in a
  `<style data-pdx-route-css>` each: the content paints at once, styled, with no round trip of its own
  (#966).
- A rendered host carries `data-pdx-ssr`. At boot the client **adopts** its nodes: each binding finds
  the node it binds, and the router's outlet keeps the page the server wrote. At the first difference
  between a component's markup and what its template says, that component renders as it would have
  without the server's markup (`core/src/hydrate/adopt.ts`).
- `@hydrate (trigger) { … }`, and `@hydrate trigger;` in a script, put the takeover of a block or a
  whole component off until its trigger, with `@defer`'s vocabulary.

### Rules

- Code that runs on the server must run in Node. A browser global (`window`, `document`,
  `localStorage`, …) read in a setup, a render or a template value stops the build, naming the
  component, the global and where it was read. Browser work goes in `onMount`, or behind
  `typeof window !== 'undefined'`. That includes a request to the app's own server: a relative URL has
  no origin in Node.
- A route with dynamic parameters that is not listed in `ssg.routes` is skipped and reported, not
  rendered with empty parameters.
- Each path is prepared as a navigation to it before it is rendered. The `onBeforeNavigate` hooks
  are run and awaited in order, and then the route's guards are checked against the permissions the
  app has set. A path a hook refuses, or a guard denies, is skipped and reported. What no visitor
  brings, such as a session or a locale, is set by the module that `ssg.setup` names. The server
  imports it before the app's entries.
- No visitor asks for a generated page, so none is detected: `initI18n`'s `detect` takes the default
  locale on the server, and a prefetch there does nothing.

### What light-DOM components gain here

PDX components render into the light DOM and are styled by extracted CSS. Pre-rendered markup is
therefore plain HTML that paints with the page's stylesheet: no Declarative Shadow DOM, no style
duplicated per instance. A framework with shadow-DOM components has to serialise each shadow root
and its styles; PDX does not.

### Acceptance criteria (from #160)

Held by `packages/showcase/tests/ssg-pages.spec.ts` on the generated showcase:

- A built showcase route's HTML contains the page's content before any script runs: the test reads
  the file.
- The generated page paints its content earlier than the client build (reported).
- After the takeover, the page is identical to the client-rendered one (DOM comparison) and
  interactive.
- CLS after the takeover < 0.02, the same bound as R2 in performance.md; the time to interactive is
  not worse than the client build's.

### Data at build time (#239)

- Every generated route runs its chain's `@loader`s after its hooks and guards, outermost first, with
  each level's `LoaderContext`: the path's params coerced by their constraints, an empty query, and a
  signal that is never aborted. The page renders the loaded branch. This applies to every generated
  route, not only those `ssg.routes` lists: a page written without its data would not be the markup the
  client takes over.
- The page carries each level's result in `<script type="application/json" id="pdx-ssg-data">`, under
  its call identity (`pattern | params | query`), with its pattern, its `staleTime` and the build's
  time. `installRouteAdoption()` keeps them as the levels' results before the first navigation. While
  the build is younger than a level's `staleTime`, the level uses the result and does not run its
  loader. Once the build is older, the level shows the result with `stale()` true while the loader runs
  again. That is the cache's ordinary rule (#148), with the age counted from the build.
- A loader's `fetch` of a path is resolved against `ssg.origin`, where the app's API answers while the
  build runs (owner decision 2026-11-08). Without it, such a fetch fails, and the build says what to
  set.
- A loader that throws stops the build, naming the path. A loader's `redirect()` or `notFound()`
  skips the route and reports it. A result JSON would not bring back as it is (a `Date`, a class
  instance, a function, a cycle) stops the build, naming the level.
- `@fetch` stays client-side: its branch renders as loading.

Held by `packages/router/tests/server-route-loaders.test.ts` and `ssg-data-seed.test.ts`, by the
cases in `packages/cli/tests/build-ssg.test.ts`, and on the showcase's `/tickets/1` by
`ssg-pages.spec.ts`.

## The separate roadmap

Each step needs the one before it. None is in the beta.

| Step | What it takes | What it unlocks |
|---|---|---|
| 1. **Islands** | the compiler marks subtrees with no binding and no interactive component; they are never adopted | less JavaScript run on a content page |
| 2. **Scope per request** | the owner, batch and router state carried per request (`AsyncLocalStorage` in Node) instead of per module | rendering on a server for concurrent requests |
| 3. **Streaming** | `@defer` and `@await` boundaries become the points where the server flushes and the client fills in | first bytes before the slow data |

Adoption, which stood first on this list, is the hydration above (#160).

The decision that would open this roadmap is whether PDX targets content sites with request-time
data. The beta's audience — applications behind a login, where SEO does not apply and the first
screen is a shell — is served by static generation plus the first-render guarantees in
performance.md.
