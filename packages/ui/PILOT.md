# The .pdx pilot

Issue #137 asks whether the library can be written in `.pdx`, the language it ships, instead of
TypeScript `component()` descriptors. The pilot rewrites three components in `.pdx` under
[`pilot/`](pilot/) and holds each one to the tests the TypeScript component already passes, unchanged:

| | Component | Why this one | State |
|---|---|---|---|
| 1 | `pdx-switch` | a form control: a model, a form value, an imperative API | done |
| 2 | `pdx-select` | the hardest control: a listbox, a floating panel, keyboard, search | to do |
| 3 | the data grid's filter popover | a piece of a large component, not a whole tag | to do |

The rule set by the owner: if `pdx-select` passes with no escape hatch, the library moves to `.pdx`.
The decision, and the follow-up issue it opens, close this document when the third component is in.

## How a pilot component is held to the same bar

[`pilot/plugin.ts`](pilot/plugin.ts) redirects the **resolved** TypeScript module to its `.pdx`, so
every import reaches the rewrite: a unit test's relative import, a sibling component's import, and a
scenario page's `@pdxui/ui/<name>` alias alike. The `.pdx` is compiled by `pdx({ prefix: 'pdx' })`,
so `switch.pdx` registers `<pdx-switch>`, the tag the tests create.

- **Unit tests:** `pnpm --dir packages/ui test:pilot` runs the test files that mount a piloted
  component ([`vitest.pilot.config.ts`](vitest.pilot.config.ts)) against the `.pdx`.
- **Certification:** `PDX_PILOT=1` puts the same plugin into the scenario server, so
  `PDX_PILOT=1 pnpm --dir packages/responsive exec playwright test --config tests/playwright-ui.config.ts --grep <name>`
  runs the component's manifest, axe, isolation, keyboard and guard specs against the `.pdx`.

Neither is part of `pnpm test` or `pnpm certify`: the pilot measures, and the piloted components are
not exported.

Each run was checked by removal: with the switch's `role` changed to `checkbox`, two unit tests go red;
with the track's class removed, the manifest contracts go red across the 13 themes. A run that stayed
green under those changes would have been measuring the TypeScript component.

## Measurements

Measured on 2026-10-25. Lines are the source file. Weight is the component's own module, built with
Vite in library mode, minified, every import external. Mount is 100 instances appended to a loaded
scenario page in Chromium, until each has rendered its input, layout read once: the median of 40 warm
runs, on the scenario dev server, two runs per side.

| | TypeScript | `.pdx` |
|---|---|---|
| `pdx-switch`: lines | 96 | 77 |
| weight, minified / gzip | 3.05 / 1.12 KB | 4.76 / 1.52 KB |
| mount, 100 instances (dev) | 8.5 / 8.8 ms | 11.8 / 12.6 ms |
| escape hatches (`ctx.el`, imperative DOM) | 3 `ctx.el.querySelector` | none |
| unit tests (6 files) | 85 / 85 | 85 / 85 |
| certification (`--grep switch`) | 124 / 124 | 124 / 124 |

What the numbers mean:

- **Lines and escape hatches.** The `.pdx` states the same component in declarations: `@model … { form }`
  for the model and its form value, `@host { :name }` for what the TypeScript does with
  `reflectNameToHost(ctx)`, `@expose` for `ctx.expose`, and a `:ref` where the TypeScript queried its
  own element three times. `clear()` still sets the input's `checked` by hand in both, because the
  input is uncontrolled between renders.
- **Weight.** Not like for like. The TypeScript module hands its markup to `html```, which parses it
  at run time with code that lives in core; the `.pdx` module carries the compiled render inline (a
  cloned static block and one binding per dynamic attribute). The library's weight as a whole is
  measured when there is more than one component to measure.
- **Mount.** The `.pdx` switch mounts about 35% slower in dev. Its render runs one effect per bound
  attribute, each guarded by `Object.is` and by a generic property-or-attribute branch, where the
  element's tag (`input`) already says which. Production is not measured yet.

## Findings

What the pilot found that the language or the toolchain does not do yet. Each becomes an issue when
the pilot closes, unless the decision makes it moot.

1. **`PDX_VARIANT_UNSTYLED` is wrong for a library component.** A `.pdx` that declares
   `@variants { size: { md, sm, lg } }` is warned that `sm` and `lg` are unstyled, because the check
   looks for `@variant` rules in the component's own `<style scoped>`. A library component's variants
   are drawn by `@pdxui/design`, in `variant-sources/`.
2. **`@variants` cannot name the native class of a value.** The TypeScript descriptor maps
   `sm: '.pdx-toggle-sm'`, which is what `gen-variants.mjs` uses to draw the same look on native
   markup. The `.pdx` form has no place for it.
3. **The library's generators read TypeScript.** `gen-manifest.mjs` parses `component()` calls with the
   TypeScript compiler, for props, variants, generics and the doc tags (`@alphaevent`), and the
   catalogue, the variants and the certification registry are generated from its output. A `.pdx`
   component is invisible to all of them.
4. **The compiled render does not use what it knows about the element.** See Mount above.
5. **Certification does not check a switch's role.** With `role="checkbox"` every certification spec
   stayed green, axe included; only the unit tests caught it.
