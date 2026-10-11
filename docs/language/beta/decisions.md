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
| 15 | Assignment storing the value (#187) is a **fix**; `pdx migrate` flags each arrow function assigned to a `$signal` whose type is not a function type, and the release notes state it | script.md, migration.md |
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

## Decisions of the backlog reconciliation (2026-10-11)

| # | Decision | Where |
|---|---|---|
| 36 | **No language levels.** The beta replaces the alpha outright: no `language` option, no deprecated aliases; a removed form is `PDX_REMOVED_FORM` (error) and a removed export leaves the package. `pdx migrate` stays, to move code written in alpha. The browser target `baseline-2024` stays | file.md, migration.md |
| 37 | `@defer`'s `hover` trigger is removed: `interaction` is the same trigger (mechanical) | template.md, grammar.md |
| 38 | #170 option B is declined: a component's text follows its container, like a native element | — |
| 39 | `PDX_DEFER_UNKNOWN_TRIGGER` is an error as soon as it lands: a misspelt trigger must never fire silently | template.md |
| 40 | A field required by the `@form` schema shows the required marker in its label by default; the marker can be turned off or customised. `aria-required` is always set | [agents.md](agents.md) A1, [library.md](library.md) |
| 41 | The behavioural agent test is a local script run on demand, outside CI; its result goes in the pull request | agents.md |
| 42 | The golden compile corpus is regenerated in bulk for #107, accepted only when the parity table and the browser suites are green and a script shows that each entry changed in its render function only; entries that change anything else are read line by line | performance.md |
| 43 | Benchmark thresholds (`pnpm bench:jfb`) fail in a nightly CI job, not in the pre-push gate | performance.md |
| 44 | The component library is brought to the beta contract in the same refactoring, component by component, with the accessibility and agent rules | [library.md](library.md) |
| 45 | `@virtual`'s scroll container is the parent written in the template, with spacers of the body root's tag; any other shape is `PDX_VIRTUAL_SHAPE` | performance.md |
| 46 | `content-visibility` applies per component, on div-based rows, after reading what each draws outside a row; measured on a real long list | performance.md R7 |
| 47 | `invalidate` takes tags, as documented; a `@fetch` tags itself with its own key, so its URL invalidates it | data.md |
| 48 | `pdx-pin-input` is removed: `pdx-otp-input` declares `mask` and `numeric` (mechanical) | library.md, migration.md |
| 49 | `pdx-button`'s toggle mode is removed: a pressed button is `pdx-toggle` (mechanical) | library.md, migration.md |
| 51 | `pdx-button-group`'s selection modes (`mode="single"`, `mode="multiple"`) are removed: selecting among buttons is `pdx-toggle-group`; `pdx-button-group` only groups action buttons visually (mechanical) | library.md, migration.md |
| 52 | `pdx-otp-input mask` takes the PIN defaults: `autocomplete="off"` and the accessible name «PIN» | library.md |
| 53 | A `pdx-button toggle` migrated to `pdx-toggle` gets `variant="solid"`, the closest to its filled look | migration.md |
| 50 | One rule across the library: a prop the component writes itself is a `@model`, one only the parent writes is a `@prop`, a read-only output emits `<name>-change`; overlays emit `open-change`; overlays share `show()`/`close()`/`toggle()`, navigation `next()`/`prev()`/`goTo(n)` | library.md |

## Still open

- **The separate server roadmap** (adoption, islands, per-request scope, streaming): decided when the
  beta ships, on whether PDX targets content sites with request-time data. Template cloning (O1) is
  built so that adoption can reuse its walk. (Point 34.)
- **Starting data with a built-in `@defer` trigger** (`viewport`): needs the trigger to be readable
  as a signal; deferred.
- **The WebMCP adapter**: revisited at the end of Chrome's origin trial.
- **Four questions the examples raised**, for the next revision: whether a `data-part` may sit inside
  a `@for`; how `@part` and `@state` names relate to the script's other names; whether the callee rule
  (decision 17) covers `onSave?.()`; whether `execute()` rejects when the action fails, or only on
  cancellation.

## Names this specification chose

Diagnostics and types the issues describe without naming: `PDX_LOADER_UNKNOWN_OPTION` (#148),
`PDX_ACTION_UNKNOWN_OPTION` (#142), `PDX_RUNE_POSITION`, `PDX_FORM_FIELD_RESERVED`,
`PDX_PIPE_SINGLE`, `PDX_DEFER_UNKNOWN_TRIGGER`, `PDX_AWAIT_TIMING`, `PDX_VIRTUAL_SHAPE`,
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
