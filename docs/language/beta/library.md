# The component library under the beta

`@pdxui/ui` (115 components today, `packages/ui/custom-elements.json`) is the first consumer of the
beta contract, and it is brought to it in the same refactoring as the compiler and the language
(decisions.md 44). This page says what «brought to the beta» means for one component, so that each
can be done, measured and closed on its own. Everything here is **proposed** unless it names an
issue.

## What every component meets

**One rule for the whole library** (decisions.md 50): a prop the component writes itself is a
`@model`; a prop only the parent writes stays a `@prop`; a read-only output (an affix's state, the
open items of an accordion) emits `<name>-change` with `{ value }` without being a model. Overlays
emit `open-change`, and share `show()`, `close()`, `toggle()`; navigation shares `next()`, `prev()`,
`goTo(n)`. One component per job: `pdx-pin-input` is gone (`pdx-otp-input mask numeric`), and a
pressed button is `pdx-toggle`, not a mode of `pdx-button` (decisions.md 48, 49). The families and
their issues are #286–#293.

| Area | The component | Source |
|---|---|---|
| Contract | declares its API with the typed descriptor, or is a `.pdx` file — one declaration model for both | #123, #137 |
| Value | a value component declares a `@model` and emits exactly one change event per model, `{ value }` | #124, #125 |
| Forms | a value component is form-associated: it takes part in `<form>`, `FormData`, reset and validity | #135 |
| States | visual states are custom states (`:state(name)`), not classes on the host | #132 |
| Parts | its stylable inner elements are named parts (`data-part`), listed in the manifest | #134 |
| Host | host attributes and listeners are declared with `@host` | #133 |
| Variants and tokens | variants are recipes (`@variants`); per-component tokens follow `--pdx-<component>-<property>[-state]` and are in the manifest | #153, #154 |
| Text | its text follows its container (decisions.md 38); hostile host CSS on bare elements reaches it only through that container | #170 |
| Events | its events do not bubble unless declared `(bubbles)` | #138 |

## Accessibility, for people and for agents

The rules of [agents.md](agents.md) A1–A6 are rules of the components that render the DOM:

- **A1** — `pdx-form-field` sets `aria-required` when the field is required by the schema or by its
  prop, and shows the required marker in the label by default; a form or the field can turn the
  marker off or replace it (decisions.md 40).
- **A2** — a field in error carries `aria-invalid` and `aria-describedby` → its message.
- **A3** — a list or grid that shows part of its data carries the total (`aria-rowcount`,
  `aria-setsize`) from its source.
- **A4** — a region whose source is pending is `aria-busy`; a `status` carries text only while it
  has something to say.
- **A5** — a sortable header carries `aria-sort`, and its accessible name is its label alone (today
  `pdx-data-grid` headers take their tools' labels into it).
- **A6** — a multi-step flow marks the current step (`aria-current="step"`) and the count.

A component's manifest entry is also what an agent's page card reads ([agents.md](agents.md)
`page()`): its role, its model and value, its states, its actions (sortable, filterable,
selectable…). A capability the manifest does not declare is one an agent cannot be told about.

## Performance

A component is held to [performance.md](performance.md) like application code: no effect for a
constant, delegated row events, no work while frozen ([lifecycle.md](lifecycle.md)). A component
that renders a long list virtualizes through the same mechanism as `@for … @virtual`: `pdx-select` already calls the runtime
virtualizer; `pdx-data-grid` keeps its own fixed-row one until it moves onto it.

## Done, for one component

A component is done when:
1. its manifest entry declares model, events, states, parts, tokens and variants as above;
2. `pnpm certify` is green for it in all 13 themes — contract geometry, axe, hostile CSS, keyboard —
   and `pnpm certify:visual` shows no unintended change;
3. a browser test asserts each A-rule that applies to it;
4. its showcase page and its skill entry describe the beta API;
5. no alpha alias, event or class remains in it.

The work runs component by component, families together (value inputs, overlays, navigation,
data), after the pilot (#137) has measured the first three.
