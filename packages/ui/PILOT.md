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
library moves to `.pdx`. It passed every unchanged test, but only by reaching `ctx` in nine places of
five kinds. **The rule fell on no: the library stays TypeScript.** What a yes would take is #686, for
the owner to decide; the `.pdx` versions stay here, unexported, as the bench to run the pilot again.

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

## Measurements

Measured on 2026-10-25.

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
- **Mount.** The `.pdx` versions are slower everywhere: 1.4× the switch, 2.5× the select, 2.1–2.6× the
  popover. Production is not measured. #685 measures it and fixes what it finds; one cause is visible
  in the switch's module, the generic property-or-attribute branch on each binding.
- **The one red that went away.** With the switch and the select piloted, `navigation-live-prop`'s
  page-size test was red. The pagination imports the select lazily and clicks it 50 ms after mounting,
  and a cold `.pdx` select is defined 301 ms after its import, against 69 ms. With the filter popover
  piloted too, it is green on two runs: the grid's tests compile a `.pdx` early, and the compiler is
  warm when the lazy import comes. The cause stands (finding 11).

## Where the select reaches `ctx`

The rule asks for no escape hatch. The select needs five kinds, each marked `ESCAPE HATCH` in
[`pilot/select.pdx`](pilot/select.pdx). The switch and the filter popover need none.

| What the component does | Why no declaration covers it | Places |
|---|---|---|
| Dispatches `pdx-open`, `pdx-close`, `pdx-clear`, `pdx-search`, `pdx-create` | `@event` took an identifier, and every library event has a hyphen. **Declared since #749**: `@event 'pdx-open';`, dispatched by `pdxOpen()` | 0 (was 5 × `ctx.emit`) |
| Reads its own element: its `id`, for a `<label for>`, and as the popover's container | No declaration named the host. **Named since #750**: `@host self { … }`. The label lookup still needs `document.querySelector`, which the compiler flags (CD-A1) with no alternative to offer | 0 (was 2 × `ctx.el`) |
| Submits an empty entry when nothing is chosen, as a native select does | `@model … { form }` submits the model, and has no option for what the form gets instead | `ctx.formValue` |
| Exposes `selectedItem` as a read-only value | `@expose` puts a member on the element as it is, and a `$derived` is a function | `ctx.expose` with a getter |

## Findings

What the pilot found that the language or the toolchain does not do yet.

| # | Finding | Where it went |
|---|---|---|
| 1 | `PDX_VARIANT_UNSTYLED` warns a library `.pdx` that its variants are unstyled. They are drawn by `@pdxui/design`, not its own `<style scoped>` | moot while the library is TypeScript |
| 2 | `@variants` cannot name a value's native class (`sm: '.pdx-toggle-sm'`), which `gen-variants.mjs` draws native markup from | moot, as 1 |
| 3 | The library's generators read TypeScript. `gen-manifest.mjs` parses `component()` calls, and the catalogue, the variants and the certification registry follow from it. A `.pdx` component is invisible to them | moot, as 1 |
| 4 | The compiled render runs a generic property-or-attribute branch where the element's tag decides it | #685 |
| 5 | Certification does not check a switch's role: with `role="checkbox"` every spec stayed green, axe included | #684 |
| 6 | The signal rewrite renames a type member that shares a prop's name (`{ source?: … }` → `{ source()?: … }`), and the type erasure then gives up without a word | #675 |
| 7 | `.peek()` on a `$derived` or a prop is rewritten to a call that throws | #676 |
| 8 | `@prop xs: T[] = []` is one array shared by every instance | #677 |
| 9 | A `:value` binding does not write back a value the user changed | #678 |
| 10 | A model cannot say its attribute is a string and its value is not (`@model value: string = null`) | #686, item 5 |
| 11 | A cold `.pdx` compiles slowly in the dev transform: 301 ms for the first select against 69 ms | #685 |
| 12 | A script function named `valueOf` is taken for a core function: the lookup reads `Object.prototype` | #681 |
| 13 | A `$signal` initialiser that reads another `$signal` is left as written, and throws | #682 |
| 14 | `@defer` renders after its load resolves even when the code is there, so a box measured right after the append is empty | #686, noted |
| 15 | `PDX_UNUSED_REACTIVE` misses the reads inside a script `@snippet` | #683 |

Two things in the pilot's own wiring are worth knowing for the next run:

- A rewrite that re-exports the module it replaces must reach the original. The plugin lets the
  rewrite's own import through.
- The browser asks for a URL the import analysis has already written. A redirect on that request
  serves the rewrite at the original's URL, so the plugin redirects only imports that have an importer.
