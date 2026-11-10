# The .pdx pilot

Issue #137 asks whether the library can be written in `.pdx`, the language it ships, instead of
TypeScript `component()` descriptors. The pilot rewrites three components in `.pdx` under
[`pilot/`](pilot/) and holds each one to the tests the TypeScript component already passes, unchanged:

| | Component | Why this one | State |
|---|---|---|---|
| 1 | `pdx-switch` | a form control: a model, a form value, an imperative API | done |
| 2 | `pdx-select` | the hardest control: a listbox, a floating panel, keyboard, search | done |
| 3 | the data grid's filter popover | a piece of a large component, heavy and imperative | done |

**The outcome.** The rule was set by the owner: if `pdx-select` passes with no escape hatch, the
library moves to `.pdx`.

- **First run, 2026-10-25.** It passed every unchanged test, but only by reaching `ctx` in nine
  places of five kinds. **The rule fell on no: the library stayed TypeScript.** The owner decided each
  gap in #686, and each became a declaration: #749–#753, then #986, #987, #988 and #999.
- **Second run, 2026-11-10.** The three components are on the beta contract (#287, #293). The
  select reaches `ctx` nowhere and has no `ESCAPE HATCH` left, and neither do the switch and the
  popover. Results:
  - `test:pilot`: 3096 passed and 29 skipped, the TypeScript suite's numbers;
  - `PDX_PILOT=1` certification of the three and of the components that hold them: 684 passed, with
    1 flaky in an axe spec of `pdx-filter-builder`, a TypeScript component (below).

  **The rule falls on yes.** The move itself changes how every component is written and published,
  so it is the owner's to start. What it needs first is under «Before the library moves».

The `.pdx` versions stay here, unexported, until then.

## How a pilot component is held to the same bar

[`pilot/plugin.ts`](pilot/plugin.ts) redirects the **resolved** TypeScript module to its rewrite, so
every import reaches it: a unit test's relative import, a sibling component's import (the pagination's
page-size select, the grid's filter popover), and a scenario page's `@pdxui/ui/<name>` alias alike. A
`.pdx` is compiled by `pdx({ prefix: 'pdx' })`, so `select.pdx` registers `<pdx-select>`, the tag the
tests create.

The filter popover is not a tag but a module of functions. Its rewrite is
[`pilot/filter-popover.ts`](pilot/filter-popover.ts), which re-exports the shared module and redefines
what builds the content. The content is now `<pdx-filter-popover>`
([`pilot/filter-popover.pdx`](pilot/filter-popover.pdx)): the condition rows, the AND/OR switch and
the value list that `buildConditionRow`, `buildFilterPopoverContent` and `buildEnumContent` built by
hand. The lifecycle around it stays TypeScript: one open popover per page, the press outside, the
placement. That is module state, not a component's.

- **Unit tests:** `pnpm --dir packages/ui test:pilot` runs the **whole** unit suite of the package
  ([`vitest.pilot.config.ts`](vitest.pilot.config.ts)) with every piloted module replaced: a component
  is held by the tests of the components that compose it too.
- **Certification:** `PDX_PILOT=1` puts the same plugin into the scenario server, so
  `PDX_PILOT=1 pnpm --dir packages/responsive exec playwright test --config tests/playwright-ui.config.ts --grep <name>`
  runs the manifest, axe, isolation, keyboard and guard specs against the rewrites.

Neither is part of `pnpm test` or `pnpm certify`: the pilot measures, and nothing it holds is exported.

Each run was checked by removal: a run that stayed green with a rewrite broken would have been
measuring the TypeScript one.

- **Switch.** With its `role` changed to `checkbox`, two unit tests go red. With the track's class
  removed, the manifest contracts go red across the 13 themes.
- **Select.** With the listbox's `role` changed to `list`, four unit tests go red, and so do 16 of 40
  axe and keyboard specs.
- **Filter popover.** With the actions row renamed, four unit tests go red. With the title emptied,
  the grid's filter-menu guard goes red. Before its placement observed its size, the anchor guard was
  red too, 44 px off the funnel: certification was measuring the `.pdx` content.

## The second run

On 2026-11-10, against `main` with every declaration above merged.

- **The switch was behind.** `pilot/switch.pdx` had never followed #293. Unchanged, its
  certification failed `switch-disabled` in 13 themes and four beta-contract guards. It now has:
  - the custom states and the `label` and `description` parts;
  - `aria-invalid` and `aria-busy`;
  - `::checked`, two-way, where a one-way `:checked` had a handler writing the model back
    (`PDX_ONE_WAY_EDITED_FIELD`).
- **One defect came out of it, #999.** A `@part` named like a prop replaced the prop, with no
  diagnostic, and the switch's label was not rendered: 16 certification tests. Now the script's name
  wins.
- **What the compiler says, with `prefix: 'pdx'`:**
  - the switch's `label` and `description` and the select's `clear` are parts only a theme needs.
    `PDX_PART_NAME_TAKEN` says the script does not reach them by name, and each file silences it with
    a `pdx-ignore` that gives the reason;
  - the select keeps three `PDX_EFFECT_STATE`, a design heuristic the build does not print.
    `selectedValues` is written by the user's actions too, so it is no `$derived`. `virtualItems` and
    `virtualTotalSize` copy the signals of a virtualizer the effect creates and disposes.
- **The flaky test.** `a11y: filter-builder-empty [pragmatic]` failed once and passed on its retry.
  The page it scanned showed every scenario, not the one asked for. It was the second test of the
  first wave, on the scenario server's first compile. `pdx-filter-builder` is not piloted.
- **Not measured again:** the lines, weights and mount times below are the first run's.

## Before the library moves

The rule is met. These stand between it and a library written in `.pdx`:

- **The generators read TypeScript (finding 3).** `gen-manifest.mjs` parses `component()` calls, and
  the catalogue, the variants and the certification registry follow from it. A `.pdx` component is
  invisible to them. The compiler already produces the descriptor, so the generators can read it from
  the compiled module.
- **A cold `.pdx` in the dev transform (finding 11).** The first select compiles in 301 ms against
  69 ms for the TypeScript one.
- **Weight and the value list's mount.** On a production build the switch and the select mount at
  or under their TypeScript versions. The filter popover's value list is 1.82–1.84×, and every `.pdx`
  module is heavier, because it carries its compiled render inline.

## Measurements

Measured on 2026-10-25, the first run.

- **Lines** are the source file. For the filter popover, the part the `.pdx` replaces: lines 145–383
  and 428–582 of `src/shared/filter-popover.ts`.
- **Weight** is the module, built with Vite in library mode, minified, with every import external.
- **Mount** is in Chromium on the scenario dev server, the median of 20–40 warm runs, two runs per
  side. For a component it is 100 instances appended to a page until each has rendered. For the
  filter popover it is 100 contents built through `buildFilterPopoverContent`.

| | TypeScript | `.pdx` |
|---|---|---|
| **`pdx-switch`**: lines | 96 | 77 |
| weight, minified / gzip | 3.05 / 1.12 KB | 4.76 / 1.52 KB |
| mount, 100 | 8.5 / 8.8 ms | 11.8 / 12.6 ms |
| **`pdx-select`**: lines | 1008 | 733, and 17 of types in a `.ts` |
| weight, minified / gzip | 27.54 / 7.45 KB | 40.63 / 9.44 KB |
| mount, 100 | 20.0 / 17.4 ms | 45.8 / 45.6 ms |
| **filter popover**: lines | 394 | 271, and 127 of TypeScript lifecycle |
| weight, minified / gzip | 15.56 / 5.00 KB, the whole module | 23.00 / 5.43 KB, the content alone |
| mount, 100, value list | 25.6 / 26.8 ms | 59.6 / 52.0 ms |
| mount, 100, two conditions | 112.5 / 110.0 ms | 289.3 / 291.6 ms |
| **unit tests**, the whole suite | 2393 / 2393 | 2393 / 2393, all three piloted, two runs |
| **certification**, the specs of the three and of the components that hold them | | 959 / 959 |

The concepts in each version are counted the same way in both languages:

- **Effects** are `$effect`, `ctx.track`, `effect()`, `onMount`, `ctx.frame` and `queueMicrotask`.
- **Manual DOM** is `createElement`, `querySelector`, `appendChild`, `addEventListener`,
  `setAttribute`, `.style.*`, `.classList.*` and `textContent =`.
- **`ctx` reached** is `ctx.el`, `ctx.emit`, `ctx.expose`, `ctx.formValue`, `ctx.track` and
  `ctx.frame`.

Both versions declare the same props, models and slots.

| | TypeScript | `.pdx` |
|---|---|---|
| `pdx-switch`: effects / manual DOM / `ctx` reached | 0 / 3 / 4 | 0 / 0 / 0 |
| `pdx-select` | 9 / 13 / 27 | 8 / 6 / 9 |
| filter popover content | 0 / 128 / 0 | 0 / 1 / 0 |

What the numbers mean:

- **Lines and concepts.** The `.pdx` states the same components in declarations.
  - `@model … { form }` declares the model and its form value.
  - `@host { :name }` replaces `reflectNameToHost(ctx)`.
  - `@expose` replaces `ctx.expose`.
  - `:ref` replaces the queries on the component's own element.
  - `@render item?.(…) @else { <slot …> }` replaces `snippetOrSlot(ctx, …)`.
  - `$derived` replaces `ctx.track` where a value follows from props. The compiler's
    `PDX_EFFECT_STATE` said so, correctly, for the select's data source.

  The filter popover gains the most. Its 128 hand-written DOM calls become a template, and the one
  left is the attachment that focuses the first value.
- **Weight.** Not like for like.
  - The TypeScript module hands its markup to `html```, which parses it at run time with code that
    lives in core.
  - The `.pdx` module carries the compiled render inline: a cloned static block and one binding per
    dynamic attribute.
  - The `.pdx` filter popover content alone weighs more than the whole TypeScript module, helpers
    included.
- **Mount.** On the dev server the `.pdx` versions were slower everywhere: 1.4× the switch, 2.5× the
  select, 2.1–2.6× the popover. On a production build (#685) they are not: the switch mounts at 0.74×
  and the select at 0.92× of their TypeScript versions. The popover's conditions were 1.85×, because
  every popover rendered its editors' `@defer` a flush after its append; with a `@defer`'s code
  loaded once per module and a block whose code has arrived rendered at once, they mount at
  1.06–1.18×. The value list stays slower, 1.82–1.84× (1.96–2.05× before whitespace at an element's
  edges stopped being a text node, #907; 2.1–2.3× before an `@if` chain compiled to one branch),
  because each of its rows is a set of reactive bindings where a TypeScript row is built
  once. The profile is in `packages/showcase/tests/scenario-pilot-mount.spec.ts`, which measures the
  four rows in the pre-push and holds each to its ratio.
- **The one red that went away.** With the switch and the select piloted, `navigation-live-prop`'s
  page-size test was red. The pagination imports the select lazily and clicks it 50 ms after mounting,
  and a cold `.pdx` select is defined 301 ms after its import, against 69 ms. With the filter popover
  piloted too, it is green on two runs: the grid's tests compile a `.pdx` early, and the compiler is
  warm when the lazy import comes. The cause stands (finding 11).

## Where the select reaches `ctx`

The rule asks for no escape hatch. In the first run the select needed five kinds, each marked
`ESCAPE HATCH` in [`pilot/select.pdx`](pilot/select.pdx). Each is a declaration now, and the select
has none left. The switch and the filter popover never needed one.

| What the component does | Why no declaration covers it | Places |
|---|---|---|
| Dispatches `pdx-open`, `pdx-close`, `pdx-clear`, `pdx-search`, `pdx-create` | `@event` took an identifier, and every library event has a hyphen. **Declared since #749**: `@event 'pdx-open';`, dispatched by `pdxOpen()` | 0 (was 5 × `ctx.emit`) |
| Reads its own element: its `id`, for a `<label for>`, and as the popover's container | No declaration named the host. **Named since #750**: `@host self { … }`. The label lookup still needs `document.querySelector`, which the compiler flags (CD-A1) with no alternative to offer | 0 (was 2 × `ctx.el`) |
| Submits an empty entry when nothing is chosen, as a native select does | `@model … { form }` submitted the model, with no option for what the form gets instead. **Declared since #751**: `{ form: () => … }` on the model | 0 (was `ctx.formValue`) |
| Exposes `selectedItem` as a read-only value | `@expose` put a member on the element as it is, and a `$derived` is a function. **A value since #752**: `@expose` of a `$derived` is a read-only getter | 0 (was `ctx.expose` with a getter) |

## Findings

What the pilot found that the language or the toolchain does not do yet.

| # | Finding | Where it went |
|---|---|---|
| 1 | `PDX_VARIANT_UNSTYLED` warns a library `.pdx` that its variants are unstyled. They are drawn by `@pdxui/design`, not its own `<style scoped>` | fixed, #986: a library component's variants are checked against the design package's rules |
| 2 | `@variants` cannot name a value's native class (`sm: '.pdx-toggle-sm'`), which `gen-variants.mjs` draws native markup from | fixed, #986: a value carries its native selector |
| 3 | The library's generators read TypeScript. `gen-manifest.mjs` parses `component()` calls, and the catalogue, the variants and the certification registry follow from it. A `.pdx` component is invisible to them | open: the first thing a move needs |
| 4 | The compiled render runs a generic property-or-attribute branch where the element's tag decides it | fixed, #685: a property the native element certainly has is assigned with no branch |
| 5 | Certification does not check a switch's role: with `role="checkbox"` every spec stayed green, axe included | #684 |
| 6 | The signal rewrite renames a type member that shares a prop's name (`{ source?: … }` → `{ source()?: … }`), and the type erasure then gives up without a word | #675 |
| 7 | `.peek()` on a `$derived` or a prop is rewritten to a call that throws | #676 |
| 8 | `@prop xs: T[] = []` is one array shared by every instance | #677 |
| 9 | A `:value` binding does not write back a value the user changed | #678 |
| 10 | A model cannot say its attribute is a string and its value is not (`@model value: string = null`) | fixed, #753: `@model value: … { attribute: string }` |
| 11 | A cold `.pdx` compiles slowly in the dev transform: 301 ms for the first select against 69 ms | open: #685 measured the mount on a production build, not the dev transform |
| 12 | A script function named `valueOf` is taken for a core function: the lookup reads `Object.prototype` | #681 |
| 13 | A `$signal` initialiser that reads another `$signal` is left as written, and throws | #682 |
| 14 | `@defer` renders after its load resolves even when the code is there, so a box measured right after the append is empty | fixed after the first block, #685: a `@defer`'s code is one loader per module, and a block whose code has arrived renders in its trigger's task. The first block of a `@defer` still waits for its load, so the popover keeps observing its size |
| 15 | `PDX_UNUSED_REACTIVE` misses the reads inside a script `@snippet` | #683 |
| 16 | A `<label for>` needed the host's `id` and a document query | fixed, #987: a form-associated host has `labels` |
| 17 | A part could sit on one element only: the select's options and tags are rows | fixed, #988: a part is every element that carries it, an array when there can be more than one |
| 18 | A `@part` named like a prop replaced the prop with no diagnostic; named like a function, it bound nothing | fixed, #999: the script's name wins, `PDX_PART_NAME_TAKEN` (info) |

Two things in the pilot's own wiring are worth knowing for the next run:

- A rewrite that re-exports the module it replaces must reach the original. The plugin lets the
  rewrite's own import through.
- The browser asks for a URL the import analysis has already written. A redirect on that request
  serves the rewrite at the original's URL, so the plugin redirects only imports that have an importer.
