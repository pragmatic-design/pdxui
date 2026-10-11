# Decisions

What this specification decided beyond the issues it cites, point by point. Every point was decided
by the owner on 2026-10-11; the pages state the resulting rule, marked **proposed** (or †) until an
issue implements it. Each line names where the rule lives.

## Two ways to write one thing

| # | Decision | Where |
|---|---|---|
| 1 | `@route { … }` is removed: every route field has one home, its own declaration or `@page`'s options. `pdx migrate` splits a `@route` mechanically | [routing.md](routing.md), [migration.md](migration.md) |
| 2 | `@alias` is removed: further paths are further `@page` paths (mechanical) | routing.md |
| 3 | `@head` is removed: `@title` and `@meta` say the same (mechanical) | routing.md |
| 4 | Template pipes stay for **chains of two or more** formatters; a single pipe is `PDX_PIPE_SINGLE` (info), suggesting the call | [template.md](template.md) |
| 5 | `:style.prop` is removed like `:class.name`; the `:style` object takes quoted custom-property keys (mechanical) | template.md |
| 6 | `@mixin` is removed: a composable is an imported function that uses core's lifecycle functions. No `.pdx` file in the repository uses it | [script.md](script.md) |

## One keyword, one meaning

| # | Decision | Where |
|---|---|---|
| 7 | The page transition moves into `@page`'s options (`@page '/x' { transition: 'fade' }`); `@transition` is the template block modifier only | routing.md |
| 8 | `@meta` writes head tags only; route data moves into `@page`'s options (`@page '/x' { meta: { … } }`) | routing.md |
| 9 | The script `@snippet` body is a template, like the `@snippet` inside a component's tag (`pdx migrate` turns `${arg}` into `{{ arg }}`) | script.md |
| 19 | `@prefetch` is removed: the policy is `@page`'s `prefetch` option (mechanical) | routing.md |

## Rules and diagnostics

| # | Decision | Where |
|---|---|---|
| 10 | `@defer`'s `@error` takes `(err, retry)`; `retry` loads the code again | template.md |
| 11 | Any declaration may span lines when it opens a balanced `{ … }` or `( … )` on its first line; it ends at its `;` or at the end of the block | [file.md](file.md), [grammar.md](grammar.md) |
| 12 | A `$` rune outside the position the compiler reads it in is `PDX_RUNE_POSITION` (error), the hint naming the core function for that place | script.md |
| 13 | A form field named like a form member (`valid`, `errors`, `reset`, `dirty`, `getValues`, `handleSubmit`, `array`) is `PDX_FORM_FIELD_RESERVED` (error) | [data.md](data.md) |
| 14 | A `persist` value other than `'local'` or `'session'` is `PDX_UNKNOWN_DECLARATION` | data.md |
| 15 | Assignment storing the value (#187) is a **fix at every language level**; `pdx migrate` flags each arrow function assigned to a `$signal` whose type is not a function type, and the release notes state it | script.md, migration.md |
| 16 | The `baseline-2024` target is maintained frozen — fixes only, a reduced certification run, retired when `@scope` is Baseline widely available (September 2028); the details go into #121 | file.md |
| 17 | A `$signal` in callee position is read, then called: `onSave()` is `__onSave()()` | script.md |
| 18 | In `@await (x as name)`, the binding is the last top-level `as` followed by a bare identifier and `)`; a type assertion inside is parenthesised | template.md |
| 20 | Under `baseline-2024`, `:scope` in a scoped block is rewritten to the host attribute | file.md, [styles.md](styles.md) |
| 21 | On `@host`, `::x`, `data-part` and a generic argument are errors, each with its own message | [components.md](components.md) |
| 22 | `@render row?.(args) @else { … }` renders the block when the parent gives no snippet; `pdx migrate` uses it for every alpha slot with fallback content | components.md |

## Execution, lifecycle, performance, agents, server

| # | Decision | Where |
|---|---|---|
| 23 | The execution contract E1–E9, with a shared acceptance suite first | data.md |
| 24 | `@action … with { concurrency }`: `queue` (default), `drop`, `coalesce`, `parallel`; no policy aborts a running write | data.md |
| 25 | Form rules F1–F7; server field errors in RFC 9457 shape | data.md |
| 26 | `@await` timing: `minMs` is a delay, `maxMs` a timeout to `@error`; no minimum display time | template.md |
| 27 | `@defer`: `; prefetch` and `when (expr)`; an unknown trigger is an error; the disposal test first | template.md |
| 28 | The lifecycle matrix; a frozen page costs no CPU; kept-alive pages and instances have a maximum of 10 by default, set on the container | [lifecycle.md](lifecycle.md) |
| 29 | Performance guarantees; order of work: bounded caches and dedupe, the prefetch queue, `@virtual` | [performance.md](performance.md) |
| 30 | Accessibility rules A1–A6; A1 is a defect today | [agents.md](agents.md) |
| 31 | `with { agent, consequential }`, `@form { agent }` and `PDX_AGENT_ACTION_UNBOUND` are specified now; the WebMCP adapter waits for the API to settle | agents.md |
| 32 | `__PDX_DEVTOOLS__` v2, starting with `page()` and `outline()`, then a behavioural test with an agent before any other agent work | agents.md |
| 33 | Static generation runs a listed route's `@loader` at build time, as a second step after render-and-replace | [server.md](server.md) |
| 35 | Edit-to-screen and project-wide time budgets; the compiler micro-benchmark asserts what its comment states | performance.md |

## Still open

- **The separate server roadmap** (adoption, islands, per-request scope, streaming): decided when the
  beta ships, on whether PDX targets content sites with request-time data. Template cloning (O1) is
  built so that adoption can reuse its walk. (Point 34.)
- **Starting data with a built-in `@defer` trigger** (`viewport`): needs the trigger to be readable
  as a signal; deferred.
- **The WebMCP adapter**: revisited at the end of Chrome's origin trial.
- **`hover` and `interaction` as `@defer` triggers**: in alpha they are the same trigger
  (`pointerenter`/`focusin`), two spellings of one thing. Recommendation: keep `interaction`, remove
  `hover` (mechanical); a syntax removal, so the owner's call.
- **#170, option B** — whether a component's root takes its text style from the tokens instead of its
  container. It decides what «a component's internals are its own» means for text, and so what the
  style-isolation certification promises.

## Names this specification chose

Diagnostics and types the issues describe without naming: `PDX_LOADER_UNKNOWN_OPTION` (#148),
`PDX_ACTION_UNKNOWN_OPTION` (#142), `PDX_RUNE_POSITION`, `PDX_FORM_FIELD_RESERVED`,
`PDX_PIPE_SINGLE`, `PDX_DEFER_UNKNOWN_TRIGGER`, `PDX_AWAIT_TIMING`, `PDX_AWAIT_MAXMS_CHANGED`,
`PDX_VIRTUAL_TRANSITION`, `PDX_AGENT_ACTION_UNBOUND`, `PDX_HOST_INVALID_ATTRIBUTE`; the types
`LoaderContext<P>` (#146), `AwaitTimeoutError`, `HttpTimeoutError`, `ActionDisabledError`; and the
`keep-alive-max` attribute. The
implementing issue may rename them; this page and [diagnostics.md](diagnostics.md) follow.

## Known defects of today's runtime

Read in the code on 2026-10-11 while writing points 23–32. Each becomes an issue with its failing
test; an entry marked *inference* is filed as «write the test first».

- A field required by the `@form` schema does not carry `required` or `aria-required` on its control
  (agents.md A1).
- A form submit sends a value that changed during its async validation (`core/src/form/form.ts`; F4).
- `resource()` and `@fetch` are not disposed with their component: the cache subscription and any
  retry chain outlive it (`core/src/reactivity/resource.ts`; E8).
- `resource.abort()` leaves the state pending; the HTTP client reports its own timeout as an
  `AbortError` (E3).
- The `AbortSignal` does not reach the transport (E2).
- Two consumers of one key make two requests (E7).
- `useQuery` retries on top of the client's retry; the client retries `PUT` and `DELETE` by default
  (E6).
- `useQuery`'s refetch on focus and on reconnect supersedes a request in flight.
- `@await (x)` on a non-promise decides by truthiness, so `null` or `0` stays on `@loading` (E5).
- `@await { maxMs }` renders the body over a pending promise.
- An unknown `@defer` trigger fires immediately.
- A `@defer` body mounted after its load may not be disposed with its block (*inference*).
- A frozen route page keeps running effects and polling, and its child components are probably
  destroyed (*inference* for the children).
- `:ref` is never reset to `null` when its element is removed.
- `pdx-data-grid` column headers take their tools into their accessible name.
- The compiler micro-benchmark asserts 200 ms where its comment states 50 ms.
