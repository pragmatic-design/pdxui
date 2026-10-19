# Lifecycle

What happens to what a component started when the piece of template that owns it leaves the page,
hides, is frozen, comes back, or is destroyed. One matrix, so that every construct answers the same
five questions. It adds **no syntax**. Every cell is **proposed** (decisions.md, point 28) unless it
says **landed**; the «Today» notes say where the runtime differs, read on 2026-10-11 — the ones
marked *inference* are read from the code and still need the test that shows them.

## The five transitions

| Transition | What it is |
|---|---|
| **removed** | an `@if` / `@switch` branch, an `@for` item or a `@defer` body leaves the DOM |
| **hidden** | `@show` turns false: the nodes stay, with `display: none` |
| **frozen** | a `keepAlive` route page is left, or a `<component :is @keepAlive>` instance is switched away |
| **resumed** | a frozen page or instance comes back |
| **destroyed** | the component's element leaves the document for good |

## The matrix

| What | removed | hidden | frozen | resumed | destroyed |
|---|---|---|---|---|---|
| `$effect`, `$derived`, `$watch`, template bindings | disposed (**landed**, the branch's scope) | run | **paused**: a change marks them, nothing runs (**landed**, #269) | each marked one runs **once** (**landed**) | disposed (**landed**) |
| `@fetch`, `resource()` | disposed: request aborted, cache released (data.md E8) | run | no new request; one in flight completes and writes the cache (**landed**, #269) | refreshes if `stale()` (**landed**) | disposed (E8) |
| `useQuery` polling, refetch on focus / reconnect | stopped (**landed**) | run | **paused** (**landed**, #269) | resumes; refreshes if `stale()` (**landed**) | stopped (**landed**) |
| `@action` call in flight or queued | runs to its end; only `cancel()` stops it | runs | runs | — | runs to its end: `invalidate` and `onSuccess` still run; writing a signal of the destroyed scope raises no error and is observed by nothing |
| `$effect` cleanup (timers, listeners) | run | — | not run: the effect is paused, not disposed | — | run |
| framework timers: `@await` `minMs`/`maxMs`, `@defer` `idle`/`timer` triggers | cleared | run | **suspended**: the remaining time is kept (**landed**, #269) | resume with the remaining time (**landed**) | cleared |
| timers the developer starts in `onMount` | cleared only through the cleanup the developer registers (`onDestroy`, an `$effect` return) | run | keep running — the framework cannot see them; the docs say to use `$effect` | — | as removed |
| `attach:` | its cleanup runs | stays | stays | — | its cleanup runs |
| `:ref` | set to `null` | unchanged | unchanged | unchanged | set to `null` |
| a snippet rendered by `@render` | disposed with the block that renders it, not with the component that declared it (**landed**, #489) | — | frozen with its renderer | resumed | disposed |
| child components | destroyed (**landed**) | kept, no hook | **frozen with the page** | resumed, `onShow` | destroyed (**landed**) |
| hooks | `onDestroy` of each child | none | `onHide` | `onShow` | `onDestroy` |
| `@title` / document head | — | — | not written while frozen (**landed**, #269: the dynamic `@title` is an effect, paused with the page) | written again when it changed | — |

`@show` is CSS: hiding a block does not pause it. Code that must stop while hidden is an `@if`.

## Rules that the matrix implies

- **A frozen page costs no CPU.** Nothing in it runs until it resumes: no effect, no polling, no new
  request, no head write. A frozen page is the same in a route outlet and in `<component :is
  @keepAlive>`.
- **Frozen is bounded.** Kept-alive route pages and `<component :is @keepAlive>` instances each
  have a maximum (LRU); the oldest frozen one is destroyed past it. The maximum belongs to the
  **container**, not to one page, since the LRU spans its pages: `<pdx-router-outlet keep-alive-max="10">`
  for routes, `@keepAlive(10)` on `<component :is>` (both proposed, grammar.md, decisions.md
  point 28). **The default is 10** for both, the number `dynamic()` already uses. `@page { keepAlive: n }` keeps its alpha meaning, a timeout in ms.
- **Writes outlive their component; reads do not.** A read belongs to what shows it, so it stops
  with it. A write belongs to the user who asked for it, so it ends unless `cancel()` is called.

## Today

- Effects kept running while frozen: the router moved the page into a `DocumentFragment` and skipped
  its cleanup, and nothing in the reactive core paused them. Since #269 an ownership scope is an object
  that can be **suspended** (`core/src/reactivity/signal.ts`): each component of a frozen page suspends
  its scope, the flush parks an effect whose scope or a scope above it is suspended, and the resume runs
  each parked effect once. `useQuery`'s polling, focus and reconnect refetch, `@await`'s timers and
  `@defer`'s `idle`/`timer` triggers pause through internal suspension hooks
  (`core/src/reactivity/scope-timer.ts`), and a `resource()` / `@fetch` refreshes on resume when
  `stale()`. Measured in Chromium: `packages/showcase/tests/scenario-lifecycle.spec.ts`; the core
  half is `core/tests/scope-suspension.test.ts`.
- Children of a frozen page were destroyed — measured in Chromium, then fixed by #268. Only the page
  element is marked `_keepAlive`, so each child's `disconnectedCallback` cleaned up and the child ran
  its setup again on resume, its state lost. A mounted component that is disconnected while a
  kept-alive ancestor still holds it is now frozen with the page: `onHide`, then `onShow` on resume,
  and the outlet tears the children down, deepest first, when it destroys a frozen page for good
  (`core/src/component/element.ts`, `router/src/outlet.ts` `_destroyFrozen`;
  `responsive/tests/integration/ui-components/keepalive-children.spec.ts`).
- `@fetch` leaks its cache subscription when its component is destroyed (data.md E8).
- `:ref` was never reset: `bindRef` only set the element. Since #262 both render paths reset it to
  `null` when the scope that rendered the element is disposed, unless another element has taken it
  (`core/src/renderer/template.ts`, `bindRef`; `compiler/src/compiler/codegen-template-inline.ts`,
  `refBind`); `core/tests/ref-reset.test.ts`.
- `<component :is @keepAlive>` keeps at most 10 instances, LRU (`core/src/renderer/dynamic.ts:51,103`),
  were hidden with `display: none` and still connected, so they kept running and received no `onHide`;
  since #269 the instance switched away is frozen in a fragment, as a route page is.
  Since #270 `@keepAlive(n)` sets the maximum (`maxAlive: n`, both render paths), and a route
  outlet keeps at most `keep-alive-max` frozen pages (default 10), the least recently used
  destroyed past it; `@page { keepAlive: n }` stays a timeout (`core/tests/keepalive-max-dynamic.test.ts`,
  `router/tests/outlet-keepalive-max.test.ts`).
- `@show` hid only the block's root elements: a root text node stayed visible. Since #265 a root
  text node is swapped for a placeholder while hidden and put back, still bound, when shown
  (`core/src/renderer/helpers.ts`, `show`); acceptance case 7 is `core/tests/show-root-text.test.ts`.

## Acceptance cases

One browser suite (Chromium: mount order and disconnection are not reliable in happy-dom), proposed:

1. A page with an effect, a `useQuery` with `refetchInterval` and a dynamic `@title` is frozen →
   during 1 s no effect run, no request, no title write; a signal it reads changes → on resume the
   effect runs once. **Landed** (#269), in Chromium: `packages/showcase/tests/scenario-lifecycle.spec.ts`.
2. A frozen page's child component keeps its state (a counter) across freeze and resume, and its
   setup runs once.
3. An `@if` removes a block with a `:ref`, an `attach:` and a child component that declares a
   `@fetch` → the ref is `null`, the attachment's cleanup ran, the child's request was aborted and its
   cache subscription released. **Landed** (#143), in Chromium: `packages/showcase/tests/lifecycle.spec.ts`.
4. A component is destroyed while its `@action` is pending → the request completes, `invalidate`
   runs, no error is thrown for the gone component.
5. Eleven `<component :is @keepAlive>` views visited with a maximum of ten → the first is destroyed.
6. A page frozen 300 ms into an `@await { maxMs: 1000 }` and resumed 5 s later → the timeout fires
   700 ms after the resume, not at once. **Landed** (#269), in the same suite.
7. `@show` false over a text root → nothing visible.
