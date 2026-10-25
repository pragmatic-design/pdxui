# The .pdx pilot

Issue #137 asks whether the library can be written in `.pdx`, the language it ships, instead of
TypeScript `component()` descriptors. The pilot rewrites three components in `.pdx` under
[`pilot/`](pilot/) and holds each one to the tests the TypeScript component already passes, unchanged:

| | Component | Why this one | State |
|---|---|---|---|
| 1 | `pdx-switch` | a form control: a model, a form value, an imperative API | done |
| 2 | `pdx-select` | the hardest control: a listbox, a floating panel, keyboard, search | done |
| 3 | the data grid's filter popover | a piece of a large component, not a whole tag | to do |

The rule set by the owner: if `pdx-select` passes with no escape hatch, the library moves to `.pdx`.
Measured against it below; the decision, and the follow-up issue it opens, close this document when
the third component is in.

## How a pilot component is held to the same bar

[`pilot/plugin.ts`](pilot/plugin.ts) redirects the **resolved** TypeScript module to its `.pdx`, so
every import reaches the rewrite: a unit test's relative import, a sibling component's import (the
pagination's page-size select, the grid's lazy editors), and a scenario page's `@pdxui/ui/<name>`
alias alike. The `.pdx` is compiled by `pdx({ prefix: 'pdx' })`, so `select.pdx` registers
`<pdx-select>`, the tag the tests create.

- **Unit tests:** `pnpm --dir packages/ui test:pilot` runs the **whole** unit suite of the package
  ([`vitest.pilot.config.ts`](vitest.pilot.config.ts)) with every piloted component replaced: a
  component is held by the tests of the components that compose it too.
- **Certification:** `PDX_PILOT=1` puts the same plugin into the scenario server, so
  `PDX_PILOT=1 pnpm --dir packages/responsive exec playwright test --config tests/playwright-ui.config.ts --grep <name>`
  runs the manifest, axe, isolation, keyboard and guard specs against the `.pdx`.

Neither is part of `pnpm test` or `pnpm certify`: the pilot measures, and the piloted components are
not exported.

Each run was checked by removal: a run that stayed green with the `.pdx` broken would have been
measuring the TypeScript component.

- **Switch.** With its `role` changed to `checkbox`, two unit tests go red. With the track's class
  removed, the manifest contracts go red across the 13 themes.
- **Select.** With the listbox's `role` changed to `list`, four unit tests go red, and so do the axe
  and keyboard specs (16 of 40).

## Measurements

Measured on 2026-10-25.

- **Lines** are the source file.
- **Weight** is the component's own module, built with Vite in library mode, minified, with every
  import external.
- **Mount** is 100 instances appended to a loaded scenario page in Chromium, until each has rendered,
  with layout read once. The figure is the median of 40 warm runs on the scenario dev server, two runs
  per side.

| | TypeScript | `.pdx` |
|---|---|---|
| `pdx-switch`: lines | 96 | 77 |
| weight, minified / gzip | 3.05 / 1.12 KB | 4.76 / 1.52 KB |
| mount, 100 instances (dev) | 8.5 / 8.8 ms | 11.8 / 12.6 ms |
| `ctx` reached | 3 × `ctx.el.querySelector` | none |
| `pdx-select`: lines | 1008 | 733, and 17 of types in a `.ts` |
| weight, minified / gzip | 27.54 / 7.45 KB | 40.63 / 9.44 KB |
| mount, 100 instances (dev) | 20.0 / 17.4 ms | 45.8 / 45.6 ms |
| `ctx` reached | throughout | 9 places, 5 kinds (below) |
| unit tests, the whole suite | 2393 / 2393, the switch piloted alone | 2392 / 2393, both piloted |
| certification, `--grep select` | — | 375 / 375 |
| certification, the components that hold a select | — | 442 / 442 |
| certification, `--grep switch` | 124 / 124 | 124 / 124 |

What the numbers mean:

- **Lines.** The `.pdx` states the same components in declarations.
  - `@model … { form }` declares the model and its form value.
  - `@host { :name }` replaces `reflectNameToHost(ctx)`.
  - `@expose` replaces `ctx.expose`.
  - `:ref` replaces the queries on the component's own element.
  - `@render item?.(…) @else { <slot …> }` replaces `snippetOrSlot(ctx, …)`.
  - `$derived` replaces `ctx.track` where the value follows from props. The compiler's
    `PDX_EFFECT_STATE` said so, correctly, for the select's data source.
- **Weight.** Not like for like. The TypeScript module hands its markup to `html```, which parses it
  at run time with code that lives in core. The `.pdx` module carries the compiled render inline: a
  cloned static block and one binding per dynamic attribute.
- **Mount.** The `.pdx` switch mounts about 35% slower in dev, the select about 2.5× slower. The
  switch's render runs one effect per bound attribute, each guarded by `Object.is` and by a generic
  property-or-attribute branch where the element's tag already says which. The select's gap is larger
  than that accounts for, and is not explained yet. Production is not measured.
- **The one red unit test.** `navigation-live-prop`'s page-size test fails with the select piloted. The
  pagination imports `pdx-select` lazily, and the test clicks the select 50 ms after mounting. A cold
  `.pdx` select is defined 301 ms after its import, against 69 ms for the TypeScript one (a probe on
  the same dev transform). Once the select is defined, the test's own steps pass in full, checked by a
  probe. So the behaviour is right and the load is slow. It stays a red, and it is counted as one.

## Where the select reaches `ctx`

The rule asks for no escape hatch. The select needs five kinds, each marked `ESCAPE HATCH` in
[`pilot/select.pdx`](pilot/select.pdx):

| What the component does | Why no declaration covers it | Places |
|---|---|---|
| Dispatches `pdx-open`, `pdx-close`, `pdx-clear`, `pdx-search`, `pdx-create` | `@event` takes an identifier, and every library event has a hyphen | 5 × `ctx.emit` |
| Reads its own element: its `id`, for a `<label for>`, and as the popover's container | No declaration names the host. The label lookup also needs `document.querySelector`, which the compiler flags (CD-A1) with no alternative to offer | 2 × `ctx.el` |
| Submits an empty entry when nothing is chosen, as a native select does | `@model … { form }` submits the model, and has no option for what the form gets instead | `ctx.formValue` |
| Exposes `selectedItem` as a read-only value | `@expose` puts a member on the element as it is, and a `$derived` is a function | `ctx.expose` with a getter |

By the owner's rule, then, the answer today is **no**. The library does not move to `.pdx` as the
language stands. The five rows are what the language would need for the answer to be yes.

## Findings

What the pilot found that the language or the toolchain does not do yet. The compiler defects (6 to
9) are issues already: #675, #676, #677, #678. The rest become issues when the pilot closes, unless
the decision makes them moot.

1. **`PDX_VARIANT_UNSTYLED` is wrong for a library component.** A `.pdx` that declares
   `@variants { size: { md, sm, lg } }` is warned that `sm` and `lg` are unstyled, because the check
   looks for `@variant` rules in the component's own `<style scoped>`. A library component's variants
   are drawn by `@pdxui/design`, in `variant-sources/`.
2. **`@variants` cannot name the native class of a value.** The TypeScript descriptor maps
   `sm: '.pdx-toggle-sm'`, which is what `gen-variants.mjs` uses to draw the same look on native
   markup. The `.pdx` form has no place for it.
3. **The library's generators read TypeScript.** `gen-manifest.mjs` parses `component()` calls with the
   TypeScript compiler, for props, variants, generics and the doc tags (`@alphaevent`). The catalogue,
   the variants and the certification registry are all generated from its output. A `.pdx` component
   is invisible to all of them.
4. **The compiled render does not use what it knows about the element.** See Mount above.
5. **Certification does not check a switch's role.** With `role="checkbox"` every certification spec
   stayed green, axe included; only the unit tests caught it.
6. **The signal rewrite renames type members, and the failure surfaces far from its cause.** In the
   script, a member of a type literal or an interface that shares a prop's name is rewritten:
   `{ source?: unknown }` becomes `{ source()?: unknown }`. `eraseTypes` then finds a module that does
   not parse and returns it **unerased**, without a word. The error is reported by Rollup, on the
   first `interface` or `import type` of the module, as `Expression expected`. The pilot's types live
   in [`pilot/select-types.ts`](pilot/select-types.ts) for that reason.
7. **A `$derived` has no `.peek()`.** `x.peek()` on a `$signal` reads it untracked. On a `$derived` it
   is rewritten to `x().peek()`, which throws.
8. **`@prop xs: T[] = []` shares one array.** The default is emitted as written, one literal in the
   descriptor, so every instance starts with the same array. The TypeScript form is a factory,
   `prop(() => [])`. Leaving the default out (`@prop xs?: T[]`) gives each instance its own.
9. **A `:value` binding does not write back a value the user changed.** The compiled binding compares
   with the last value it wrote, not with the element's current value. When the user's typing and a
   reset meet, the input keeps the text while the signal is cleared. `html``` rewrote it. The select
   opens before it records the query, so that the two never meet; for a person typing, the focus has
   already opened it.
10. **A model cannot say its attribute is a string and its value is not.** `model(null, { type: String })`
    coerces an attribute or a number to a string and still holds an array in multiple mode. In
    `.pdx` that is `@model value: string = null`: the type is wrong for half the component.
11. **A cold `.pdx` compiles slowly in the dev transform.** 301 ms for the first select against 69 ms,
    enough to miss a lazy import that a test or a page waits 50 ms for.
