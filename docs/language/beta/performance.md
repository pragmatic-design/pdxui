# Performance guarantees

What the beta promises about cost, each with the measurement that holds it. A guarantee here is a
test that fails when the number is crossed, not a property of the design. Everything is **proposed**
(decisions.md, point 29) unless it says **landed**. The render-path and reactivity work already
in the roadmap (#107, #109–#119) is not repeated. The order of the work this page adds (decisions.md
29): bounded caches and request dedupe first, then the prefetch queue, then `@virtual`.

## The compiler

| # | Guarantee | Measured by | Status |
|---|---|---|---|
| C1 | Compile time is linear in the number of declarations | `compiler/tests/perf/compiler-scaling.test.ts`: 500 declarations under 600 ms (about 15 ms measured; the O(n²) regression it guards was about 1230 ms) | **landed** |
| C2 | A production compile costs at most 3× a development one | `compiler/tests/perf/production-speed.test.ts:69` | **landed** |
| C3 | One component compiles in a few ms in development | `compiler/tests/perf/compiler-bench.test.ts:103` asserts an average under 50 ms for ten components, what its comment says (#264; it asserted 200). Measured on 2026-10-12: 14.3–16.8 ms | **landed** |
| C4 | **Edit to screen in development**: a `.pdx` save reaches the open page within 300 ms on the showcase; an edit to `<style scoped>` only swaps the style, without remounting the component or losing its state | `showcase/tests/hmr.spec.ts` on its own dev server (`playwright.hmr.config.ts`): a template edit in the DOM within 300 ms of the save (25–36 ms measured locally on 2026-10-14), and a style edit that changes the computed style while the section is the same node and an unbound input keeps its value. The style-only decision: `compiler/tests/hmr-style.test.ts` | **landed** (#246) |
| C5 | **Project-wide passes** — `pdx check`, `pdx analyze`, a cold `pdx build` of the showcase — each have a time budget in CI, set at the first measurement + 20% | CI timings | proposed |

## The compiled output

The render path is one (#107); dev and a build render the same, held by the parity table
(`core/tests/render-parity.test.ts`, #92 — **landed**). What the compiler emits for a template is
held to the benchmark (`pnpm bench:jfb`):

| # | Guarantee | Target |
|---|---|---|
| O1 | Static structure is **cloned** from a `<template>`, dynamic nodes reached by index | create 10 000 rows: script ≤ 75 ms, then ≤ 45 ms (135–149 ms measured on 2026-10-10) |
| O2 | An expression that reads no signal creates **no effect**; a `track` key is not reactive (#110) | memory per 1 000 rows ≤ 3.5 MB (4.8 MB measured) |
| O3 | Whitespace HTML ignores is not emitted (`table`, `tr`, between cells), except where it renders | node count of the benchmark table |
| O4 | `:class` compiles to the cheapest DOM write its shape allows (`className`, `classList.toggle`) | select benchmark |
| O5 | Events inside an `@for` are **delegated**: one listener per type on the component's host (#113), and a row's handler is declared once per `@for`, not once per row (#375) | memory, create |
| O6 | `item === selected` in an `@for` updates two rows, not N | select with 10 000 rows |
| O7 | Clearing and appending a list take their fast paths (#118) | clear, append |
| O8 | A handler's writes flush once (`batch()` in compiled handlers, #114 — **landed**); an unchanged computed does not rerun what reads it (#115 — **landed**); tracking allocates nothing per run (#116 — **landed**) | the reactivity probes |
| O9 | **What is not used is not shipped**: the hello scenario's bundle contains no router, no forms, no resource code | the per-scenario budgets below |
| O10 | Diagnostics are behind `DEV` and leave a production bundle (**landed**, `core/tests/diagnostics-behind-dev.test.ts`); CSS is extracted to `.css` files in production (**landed**) | `showcase/tests/diagnostics.spec.ts`, `compiler-claims.spec.ts` |

## Loading and deferred code

| # | Guarantee | Measured by | Status |
|---|---|---|---|
| L1 | Each route is its own chunk, loaded when first shown, not at boot | `showcase/tests/dev-server.spec.ts` («a page is loaded when it is first shown») | **landed** |
| L2 | A cold load fetches its JavaScript in **at most two waves**: the landing route's chunk and its static imports are named in `modulepreload` | `showcase/tests/first-paint-waves.spec.ts` | **landed** |
| L3 | A route's stylesheets start with the entry, not after it | `first-paint-waves.spec.ts` | **landed** |
| L4 | **A navigation with data costs two waves, not three**: a route's `@loader` starts in parallel with its chunk, not after it | `first-paint-waves.spec.ts`, extended to count the data request | proposed (#119) |
| L5 | A component used only inside a `@defer` body ships in that body's chunk (#98 — **landed**); `; prefetch` loads it before the render trigger (template.md); prefetches go through one bounded queue (below) | bundle inspection, request timing | partly proposed |
| L6 | The entry carries only the components the shell renders, and only the active locale | `showcase/tests/entry-attribution.spec.ts:95,126` | **landed** for the showcase |
| L7 | A route's chunk is fetched on hover, focus or when its link is in view, by policy, so the click needs no further request; off under Save-Data and 2G | `showcase/tests/prefetch.spec.ts`; `router/src/prefetch.ts:134-139` | **landed** |

## The first render

| # | Guarantee | Measured by | Status |
|---|---|---|---|
| R1 | The app's first page is ready within **1000 ms on slow 4G** (884–889 ms on 2026-10-09) | `showcase/tests/first-paint.spec.ts:72,215` | **landed** |
| R2 | Nothing moves after the first paint: CLS < 0.02 | `first-paint.spec.ts:186-193` | **landed** |
| R3 | The stylesheet is not what the paint waits for | `first-paint.spec.ts:161-174` | **landed** |
| R4 | The bytes before first paint are budgeted (entry 36 KB, blocking 90 KB gzip) | `showcase/tests/bundle-budget.spec.ts:159` | **landed** |
| R5 | **LCP** has its own budget, separate from «app ready»: a page whose largest element is a list or an image is not ready when the shell is | Playwright `largest-contentful-paint` on three showcase routes, over HTTP/1.1 (`first-paint.spec.ts`) and over HTTP/2 (`first-paint-http2.spec.ts`, the number a real host gives) | **landed** (#251, #407) |
| R6 | A route rendered at build time paints its content **before any script runs** (server.md) | the SSG build's HTML and `first-paint.spec.ts` on it | proposed (#160) |
| R7 | A long list that is not virtualized skips its off-screen rows with `content-visibility: auto` and `contain-intrinsic-size: auto <h>` — per component, on div-based rows only (not table rows), after reading what each component draws outside a row (decisions.md 46; #285). On `pdx-list` (the rows it writes itself, not the `item` slot's), `pdx-tree` and `pdx-transfer`; their focus ring is drawn inside the row, which the paint containment would otherwise clip. Layout of the first render: 7.5 ms against 30 ms with the rule off, 2 000 rows of each | `responsive/tests/integration/ui-components/long-rows.spec.ts` | **landed** |

## Virtualized lists

### Syntax (proposed)

```ebnf
ForBlock ::= /* the beta @for */ ( S? "@virtual" ( S? "(" S? Number S? ")" )? )? Block ( S? "@empty" Block )?
```

`@virtual` goes after `track` and any `@transition`; its number is the estimated item size in px
(default: measured from the first item). Diagnostics (proposed): `@virtual` with `@move` or
`@stagger` is `PDX_VIRTUAL_TRANSITION` (an item leaving the window is not leaving the list);
a virtual list whose container has no bounded height is a development warning at runtime, since
the compiler cannot see the layout.

### Semantics

`@for (rows as r; track r.id) @virtual(48) { … }` renders only the items in view plus an overscan
(#283). **The scroll container is the parent the template writes** — the `<ul>`, the `<tbody>`, the
element with `overflow` — never an element the compiler adds, so lists and tables stay valid HTML
(decisions.md 45). The runtime puts two spacers of the body root's tag before and after the window,
`aria-hidden`, sized to the offsets (a third splits around a focused item scrolled away, #284). So the
`@for` must be its parent's only content and its body must have one root element, or the template is
`PDX_VIRTUAL_SHAPE` (error). It goes through the runtime's
`createVirtualizer` (`core/src/renderer/virtualizer.ts`, today called by hand, e.g. from
`pdx-select`). The template is the same as a plain `@for`: making a list virtual is one word.

**Landed** (#283): the grammar, `PDX_VIRTUAL_SHAPE`, and core's `eachVirtual`
(`core/src/renderer/virtual-list.ts`). Both render paths emit the same call. Rows are keyed over the
window by `track`, each measured by `measureElement`, and a `DataSource` pages through `loadMore()`.
`PDX_VIRTUAL_TRANSITION` is wider than proposed above: it refuses `@transition` and `@mode` too,
since a row scrolling into view is not arriving either. Measured in Chromium
(`responsive/…/virtual-list.spec.ts`):
- 10 000 items in a 400 px `ul` keep at most the visible rows plus 2 × overscan, besides the two
  `aria-hidden` spacers;
- the last item is reached and the scroll height is the whole list;
- a paged source loads once per page.

**Landed** (#284): the **Accessible** row, as written, measured with `getByRole` and the keyboard in
the same spec. One addition: a container under a role without keys, whose rows hold nothing
focusable, takes `tabindex="0"` while it scrolls. axe, run on the harness, found that region
unreachable from the keyboard (`scrollable-region-focusable`). The same check made a listbox scrolled
away from its active option give the tab stop to its first rendered option.

**Acceptance criteria**

| Criterion | Measured by |
|---|---|
| 10 000 items → at most the visible items + 2 × overscan in the DOM | DOM count, Chromium — holds since #283 |
| **Variable heights** without code: each rendered item is measured by a `ResizeObserver` and the offsets corrected; scrolling to index *n* lands on it ±1 px | geometry, Chromium. Since #252 every element handed to `measureElement` is observed, a size change above the viewport keeps the visible content in place, and `scrollTo` lands on the item ±1 px (`responsive/…/virtualizer-heights.spec.ts`, 2 000 items of 24–120 px). Since #283, `@virtual` hands each rendered row to `measureElement` itself: no code |
| **Accessible**, by the role the template gives the container: `list`/`listbox`/`tree` items carry `aria-setsize` and `aria-posinset`; `grid`/`table` rows carry `aria-rowindex` and the container `aria-rowcount`. Keys belong to the composite roles only — in a `listbox`, `tree` or `grid`, arrow keys and Home/End move focus to an item not yet rendered by rendering it first; a plain `list` has no arrow keys (Tab moves through its focusable content). A focused item scrolled away is kept in the DOM | Playwright `getByRole`, keyboard — holds since #284 (`responsive/…/virtual-list.spec.ts`, with axe on a list, a listbox and a table) |
| **Progressive pagination**: over a `DataSource` (`core/src/data/data-source.ts`, `loadMore()` / `hasMore()`), reaching the last rendered item calls `loadMore()` once while `hasMore()`; `@empty` renders only when the source is settled and empty | request count — holds since #283 (3 pages of 50: two `loadMore()`, none after) |
| Stated limits: find-in-page and print see only rendered items; the docs say so | — the site's template page and `docs/language/template.md` say so (#283) |

`data-grid` keeps its own fixed-row virtualization (`ui/src/data-grid/grid-virtual.ts`) until it can
move onto this one; that move is not part of the beta.

## Bounded memory

| Criterion | Measured by |
|---|---|
| Every cache has a maximum and an eviction: resource cache (**landed**: 200 entries LRU, 5 min `gcTime`), kept-alive pages and `@keepAlive` instances (lifecycle.md) | unit tests per cache |
| Mount and destroy a page with `@fetch`, `@for`, `attach:` and child components 100 times → retained heap returns within 5% of the first iteration, and the resource cache holds no subscription for the destroyed instances | heap snapshot, Chromium (needs data.md E8) |
| Memory per 1 000 benchmark rows ≤ 3.5 MB (4.8 MB measured on 2026-10-10) | `pnpm bench:jfb` |

## Requests

| Criterion | Measured by |
|---|---|
| In-flight dedupe: N consumers of one key → one request (data.md E7) | transport call count |
| **Prefetch budget**: route prefetch and `@defer` prefetch go through one queue with a concurrency limit (proposed default 2, idle-priority), behind navigations, first loads and `@defer` render loads (polling and background refreshes do not hold it back); a navigation cancels the queued prefetches that are not for its target. Today each prefetch starts at once — a page with many `eager`/`viewport` links starts every `import()` together (`router/src/prefetch.ts`), and `@defer` has no limit | number of concurrent `import()`s in a page with 50 `viewport` links |
| Save-Data and 2G turn prefetch off (**landed**, `router/src/prefetch.ts:134-139`) | — |

## Heavy work that does not block input

Signals stay **synchronous**: a `set` is seen by the next read, and a batch flushes in a microtask.
What can be split is work the developer marks as heavy, never the reactive graph:

| Criterion | Measured by |
|---|---|
| A runtime helper processes a large array in slices, yielding to input between slices; it is cancellable with an `AbortSignal` (**landed**: `processInSlices`, `core/src/utils/slices.ts`). It yields through a `MessageChannel` macrotask, not `scheduler.yield()`: measured in Chromium, a `scheduler.yield()` continuation runs ahead of rendering and held a frame for 100–105 ms while the page had something to paint | the longest frame while it runs a 100 000-item job: < 50 ms (Long Animation Frames), `packages/responsive/tests/integration/ui-components/slices-long-task.spec.ts` |
| A `@for` that inserts more than a threshold of new items at once renders them in slices, the first slice in the same frame; `@for` with `@virtual` does not need it (**landed**: above 1 000 rows, a first slice of 250 rows and then slices of 40 ms, `core/src/renderer/list-slices.ts`, for an append and a replace with no row in common, with a plain or a destructured binding — #398) | INP while appending 10 000 rows: under 200 ms, `packages/responsive/tests/integration/ui-components/append-slices.spec.ts` |
| Moving a pure computation to a Worker is the developer's choice and is documented with a pattern; the beta adds no Worker syntax | — |

`processInSlices` is the runtime's one scheduling primitive for this; there is no `postTask` or
Worker helper.

## Bundle budgets per scenario

The showcase and the site already hold a budget (**landed**: showcase entry 35 KB, JS 380 KB, CSS
59 KB, before first paint 89 KB, gzip — `packages/showcase/tests/bundle-budget.spec.ts:149`; site
entry 250 KB — `packages/site/tests/entry-budget.spec.ts:24`). The beta adds the scenarios a user
compares frameworks on, each a small app in the repository built in CI with a budget that fails
when crossed and a slack that fails when it is stale (the showcase's pattern):

| Scenario | What it contains |
|---|---|
| hello | one component, one `$signal` (**landed**: JS 3.8 KB, no CSS; budget 4.2 KB) |
| benchmark | the js-framework-benchmark app (**landed**: JS 16.5 KB, no CSS; budget 18.2 KB — built here with its own config against the workspace's sources; 13 KB was measured on 2026-10-10 inside the benchmark's clone) |
| crud | one routed page with `@loader`, `@form`, `@action`, a `@for` of 100 rows |
| dashboard | four `@defer` panels, a virtual list, a theme |

Each budget is set at the scenario's first measurement plus 10%, and lowered by a stale-number
check like the showcase's, so it is a number from the first day. The landed scenarios live under
`packages/showcase/scenarios/` and are held by `packages/showcase/tests/scenario-budgets.spec.ts`;
their slack is a share of the measurement (`SLACK_SHARE`), because the showcase's fixed 4 KB is the
whole size of hello. That spec also holds O9 for hello, on the list of modules the build writes —
and found it false: core's form registry ran its built-in registrations at load and was in every
bundle until it was made pure (#244).

## Out of scope for the beta

Declared so that nothing above is read as promising them: **streaming** rendering, **offline
conflict resolution** for writes, and **hydration** of server-rendered markup. They belong to a
separate roadmap (README.md, server.md); static generation (#160) is the only server-side work in
the beta.
