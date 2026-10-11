# Agents

How a PDX application is read and operated by an agent — a browser agent, a test agent, a model
judging a page. Everything on this page is **proposed** (decisions.md, points 30–32). The
baselines below come from a prototype run on four pages of the showcase application on 2026-10-11.

## Principles

1. **One perception: the accessibility tree.** An agent reads what an assistive technology reads.
   PDX adds no agent-only markup and puts no agent text into ARIA. What an agent misses is fixed in
   the page's own semantics, where a screen-reader user gains it too (WebKit's position on WebMCP;
   the W3C APA discussion of 2026-07-08).
2. **Capabilities are typed, opt-in and visible.** An action offered to an agent is a declared
   `@action` that a control on the page also runs. No capability exists only for agents.
3. **The application is a graph.** Routes, their parameters and guards are known at build time;
   the shell is shared by every page. An agent receives the map and the shell once, then each page
   as a card and an outline of its main region, then only what changed.
4. **A summary says what it left out.** Every compressed view states the count it removed and how
   to reach it (a ref, a search box, a pager).

## Accessibility the framework guarantees

Each rule is something PDX knows and today does not always put in the DOM. They are accessibility
rules first; agents benefit because they read the same tree. Each is measured in a browser
(certification, Dim 2 or a manifest rule), not in happy-dom.

| # | The DOM carries | From | Today (read on 2026-10-11) |
|---|---|---|---|
| A1 | `required` / `aria-required` on a control bound to a required field | the `@form` schema | missing: `showcase/src/pages/intake.pdx:83-84` declares `requester` and `email` required; their `<input>` has neither |
| A2 | `aria-invalid` and `aria-describedby` → the message, on a field in error | the field's `error()` | to measure |
| A3 | `aria-rowcount` / `aria-setsize` with the source's total when a list shows a part of it | the data source, the pager | present on `pdx-data-grid` (`aria-rowcount` counts header rows, as ARIA defines); missing on the dashboard's three-item lists |
| A4 | `aria-busy="true"` on the region whose source is pending; a `status` with text only while it is | the async vocabulary | to check: the showcase dashboard (Italian locale) shows a 'Loading' status beside a loaded list |
| A5 | `aria-sort` on a sortable column header; the header's name is its label alone | the grid's column state | `aria-sort` present; a header's accessible name includes its sort and filter buttons' labels (column «X» is announced as «X Filter X») |
| A6 | the current step and the count of a multi-step flow (`aria-current="step"`, «step 1 of 4») | `pdx-wizard` | present as visible text («step 1 of 4»), not as `aria-current="step"` |

## The description API (development and test)

`window.__PDX_DEVTOOLS__` (version 1 today: `tree`, `inspect`, `errors`, `route`, `navigations`,
`stores`; `core/src/debug/devtools-api.ts:232`) grows to version 2. The order of work (decisions.md 32):
`page()` and `outline()` first, then a behavioural test — an agent completing tasks with them as often
as with full snapshots — before any other member or any other agent work.

| Member | Returns |
|---|---|
| `map()` | the route graph: each route pattern, its parameters and their types, its title, its guard; with the current user's access to each |
| `shell()` | the outline of everything outside the route's `main`, once per session |
| `page()` | the **page card**, JSON: route and params, title, the route's visible components with their state (a list: total, shown, sort, filter; a source: the async vocabulary), forms (fields, required, invalid, valid), live messages, errors, the actions available now, the routes the page leads to |
| `outline({ maxItems })` | the **outline** of `main`: the accessibility tree, with the compression rules below, each actionable node carrying a stable selector |
| `delta()` | what changed in the card and the outline since the last call |
| `actions()`, `run(component, name, input)` | the `@action`s on the page, `enabled()`, `pending()`, `error()`, input schema; and running one |
| `sources()`, `forms()` | every async source in the vocabulary; every form's fields, values, errors |

**Outline rules.** The outline is a projection of the accessibility tree, never a second source:
- visibility is read from the DOM, never from component state;
- text that repeats its parent's accessible name, unnamed images and unnamed wrappers are dropped;
- a run of controls that share a role (a toolbar, a pager) is one line with **every** name kept;
- only **data repetition** is summarised — the items of an `@for` or a data source — and only above
  a threshold: two samples, then `… N more <role>` with the refs of the next ones; telling data
  repetition from controls that share a role takes the framework (the prototype's role-based rule
  hid toolbar buttons and dashboard tiles until it was narrowed);
- the route/shell boundary is the router's, not a CSS selector (`agent-browser snapshot -s` lists
  nodes the full snapshot hides).

**Addressing.** The outline's selectors stay valid across calls and across agent-browser sessions:
the element's `data-test` when it has one, otherwise a selector the runtime derives from the
component instance and the node's path in its template. Development only.

## Capabilities in production

An `@action` is offered to agents only when it says so:

```pdx
@action deleteUser(id: number) when canDelete with { agent: 'Deletes a user account', consequential: true } {
  await api.deleteUser(id);
}
```

- `agent` is the description the tool carries; `consequential` maps to the tool's
  `consequentialHint`; the input schema comes from the parameter's TypeScript type.
- An action with `agent` that no control in the template runs is `PDX_AGENT_ACTION_UNBOUND`
  (error): principle 2, checked at build.
When the adapter is built — it waits for the WebMCP API to settle (decisions.md, «Still open») — it
behaves as follows; the options and the build check above hold from now:

- The adapter registers the tool while `when` is true and unregisters it when the component is
  disposed (the registration's `AbortSignal` is the scope's; lifecycle.md).
- A form with a schema gets the declarative attributes (`toolname`, `tooldescription`,
  `toolparamdescription`) only when its `@form` says `agent: '…'`; field errors return through the
  submit's response.
- A read-only `describe_page` tool returns the card; `navigate` takes a route and its typed params.
- The adapter is a separate, opt-in module; its target API is WebMCP as Chrome ships it
  (`document.modelContext.registerTool`), which is an origin trial and still changing. Nothing is
  exposed by default.

## Acceptance criteria

Baselines from the prototype (four pages of the showcase, 2026-10-11, ~4 characters per token):

| Criterion | Prototype |
|---|---|
| every named control of `main` is reachable from the outline (listed, or through its row, search or pager) | 59 / 59 |
| card ≤ 200 tokens | 85–166 |
| outline of `main` ≤ 50% of the full snapshot | 14% (`/customers`) to 41% (`/intake`) |
| a session of four pages costs ≤ 40% of four full snapshots (shell once + outlines + cards) | 3008 / 8750 = 34% |
| every rule A1–A6 holds on the showcase, in all 13 themes where it is visual | A1 fails today |

The next measurement is behavioural: an agent given only `map`, `shell`, `page` and `outline`
completes a set of tasks as often as with full snapshots.
