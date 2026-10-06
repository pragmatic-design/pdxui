---
name: pdxui
description: "Build web app UIs with PDX (@pdxui): the catalogue of its components by area, screen recipes and the measured .pdx gotchas. Use before building any UI piece, since the component usually exists. The language is pdxui-language; theming, pdxui-theme; composing a screen, pdxui-screens."
---

# PDX UI (build .pdx web apps)

Knowledge + playbook for building UIs on **PDX UI**: the `.pdx` language (SFC:
`<template>`/`<script setup>`/`<style scoped>`, signal reactivity, compiled to Web Components) and its
115 `pdx-*` components.

> **Golden rule: search the catalog BEFORE building anything.** The library is large; a component
> almost always exists already (`pdx-filter-builder`, for one, is easy to rebuild by hand without noticing it is there).
> This is the GENERAL skill; the components live in **per-area skills** (`pdxui-<area>`), one page each, like the
> .NET `pragmatic-use-*` model. Quick index: [`references/README.md`](references/README.md).

## How to work

0. **Before the first line of code**, two things that are cheap now and expensive later:
   - the language — skill **`pdxui-language`**: the file format, the runes, the declarations, and how a
     project is wired (index.html, vite.config, main.js, who registers the router). Writing that wiring
     from memory works until it does not.
   - the brand — skill **`pdxui-theme`**: `pdx theme --brand=#hex` generates a WCAG-AA theme. Deciding
     this first costs ten minutes; retrofitting it costs a pass over every screen. It is easy to skip,
     so it is named here rather than left as an optional extra.
1. **Find the component** — open the **area skill** for props/attributes/events (each is a standalone skill):
   - `pdxui-layout` · `pdxui-navigation` · `pdxui-data` · `pdxui-forms` ·
     `pdxui-inputs` · `pdxui-overlay` · `pdxui-display` · `pdxui-infra`.
   - Not sure which area? Use the index [`references/README.md`](references/README.md) (every component, one-liner each).
   - **Beyond one component** — a topic skill each, short, with the site's docs pages as references:
     `pdxui-data-layer` (loading, writing, sharing state) · `pdxui-validation` (forms and their rules) ·
     `pdxui-routing` (pages, guards, loaders, keep-alive, head and scroll) · `pdxui-i18n` ·
     `pdxui-setup` (install, CLI, build, devtools) · `pdxui-testing` (tests, identity, permissions).
2. **Decide what the screen IS** — skill **`pdxui-screens`**, before any markup: grid or cards,
   what the header carries, the four states every screen has, and what you never re-build by hand.
   Every rule there has a check: a screen can pass its acceptance and still not look like a
   product. Then [`references/structure.md`](references/structure.md) for
   where the pieces live, and [`references/component-design.md`](references/component-design.md) for
   how to cut them: where a component's edge goes, who owns each piece of state, how logic is shared,
   what its API and its styles look like, and the anti-patterns with how to recognise each.
3. **Assemble the screen** — follow [`references/recipes.md`](references/recipes.md) for the common screens
   (app shell, list/grid, dashboard, auth, CRUD/form) **and the at-scale admin patterns** (descriptor →
   `createCrud`/`createDetail`, master-detail + relation tabs, JSON-editor, idiomatic grid transport).
   ⚠️ Recipes that point at `Pragmatic.Design.Builder/golden` or `/profiler` are pointing at a repository
   **you do not have** if you installed from npm: treat those as provenance, not as something to open.
   Anything you actually need is inline in the recipe.
   ⚠️ **Building a LOB admin with many entities? Don't hand-write screens** — use the descriptor →
   `createCrud`/`createDetail` recipe (the UI analogue of the backend's generate-then-implement loop).
4. **Heed the traps** — read [`references/gotchas.md`](references/gotchas.md) before writing `.pdx`. The ones
   that cost the most: **a transform on an open drawer's panel throws fixed overlays off screen**
   (do not set one yourself); **the grid's selection
   reaches the DataSource only if the source opted into `selection`**; **`data-region` accepts exactly four
   names and an unknown one drops out**; **a trailing comma in `$derived(...)` kills the reactivity**; and the
   token scale is named (`2xs…3xl`), never numeric — `--pdx-space-4` silently removes your padding.
   ⚠️ A summary ages faster than the page it summarises: if this paragraph and `gotchas.md` ever
   disagree, the page wins and this one is stale.
5. **Verify in the browser** — run the dev server and MEASURE: element geometry, text, attributes, state
   after an interaction, and zero console errors. A screenshot is evidence for a human, never an
   acceptance check. A short Playwright script beats a browser you drive by hand.

## The rules most often broken

One line each; `AGENTS.md`, which `pdx new project` writes, carries exactly these, and a test in
`packages/cli` fails when the two differ — change them here, then in its template.

- Bind with `:attr="expr"`, never `${expr}` inside an attribute: `pdx check` flags it as `PDX_RAW_INTERPOLATION` and offers the rewrite.
- Do not import library components in a `.pdx`: the compiler imports each `<pdx-*>` the template uses, and `import '@pdxui/ui'` registers all 115 of them.
- Search the catalog before building a component: one almost always exists (the area skills, or `components` in `pdx mcp`).
- Style with the design tokens (`--pdx-color-*`, `--pdx-space-*`, `--pdx-radius-*`), never hard-coded colours; the scales are named (`--pdx-space-md`), and `--pdx-space-4` resolves to nothing, silently.
- `onMount` runs once: anything that must follow a signal is a `$derived` or an `$effect`.

## The component areas (what lives where)

- **layout** — `pdx-app-layout` (shell), navbar/sidebar, splitter, scroll-area, grid (row/col), aspect-ratio.
- **navigation** — nav-menu, breadcrumb, menu/menubar/dropdown/context-menu, command (⌘K), tabs, pagination, fab.
- **data** — `pdx-data-grid`, `pdx-data-source`, `pdx-filter-builder`, `pdx-chart`/`pdx-sparkline`, list,
  statistic, timeline, pagination, infinite-scroll, empty-state.
- **forms** — `pdx-form`, `pdx-auto-form`, `pdx-form-template`, form-field/section/actions, fieldset, wizard,
  inline-edit (data-driven from `FieldDefinition[]` — same JSON drives grid columns + form fields).
- **inputs** — every control: input/textarea/number/masked/password/otp/search, checkbox/radio/switch/segmented,
  select/autocomplete/tree-select/cascader, date/time/color pickers, slider, rating, tag-input, file-upload, transfer.
- **overlay** — dialog/alert-dialog, drawer, bottom-sheet, popover, tooltip, toast, banner, block-ui.
- **display** — button(s), icon, badge, chip, avatar(s), card, accordion, carousel, progress, spinner, image, divider.
- **infra** — provide (DI/context), error-boundary, overlay-outlet.

## Design system

Theme via `pdx-theme` + scheme via `pdx-scheme` on `<html>`. Style ONLY with `--pdx-color-*` / `--pdx-space-*`
/ `--pdx-shadow-*` / `--pdx-radius-*` tokens — never hardcoded colors (breaks dark). Import `@pdxui/design`
(CSS) once; components come from `@pdxui/ui`.

**Branding, generating a theme, choosing a token, dark mode/density → skill `pdxui-theme`**
(`pdx theme --brand=#hex --language=X` generates a WCAG-AA-gated theme; 13 shipped themes, 12 design
languages, the ~30 semantic tokens).
