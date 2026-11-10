# The file, targets and the render model

## The file

### Syntax

```ebnf
PdxFile        ::= ( TemplateBlock | ScriptBlock | StyleBlock | S )*
TemplateBlock  ::= "<template" ( S "shadow" )? ( S "src=" StringLiteral S? "/>" | ">" Template "</template>" )
ScriptBlock    ::= "<script" ( S "setup" )? ( S 'lang="js"' )? ( S "src=" StringLiteral S? "/>" | ">" Script "</script>" )
StyleBlock     ::= "<style" ( S "scoped" )? ( S "src=" StringLiteral S? "/>" | ">" Css "</style>" )
```

### Semantics

A `.pdx` file is a single-file component: up to three kinds of block, each optional. `Template` is
defined in [template.md](template.md), `Script` in [script.md](script.md), `Css` in
[styles.md](styles.md).

- **At most one `<template>` and one `<script>`.** `<style>` may appear more than once: a component
  can carry its scoped CSS and the page-level CSS it owns side by side.
- **`src`** reads the block from another file, as if its contents were written inline: bindings,
  form wiring and scoping work unchanged, in development and in a production build.
- **`<template shadow>`** renders into a shadow root instead of light DOM; the component's CSS is
  adopted into the root, unrewritten, and `scoped` makes no difference there. Light DOM is the default.
- **`<script>`** has one grammar (#158): it is read for its declarations and runes whatever it
  contains, and a script with none of them is a component that returns every top-level name to its
  template. There is no `setup` attribute that changes the meaning, and no legacy mode. A file without
  a `<script>` compiles like one with an empty one.
- **`<script lang="js">`** compiles the script as written. Without it the script is TypeScript:
  annotations, `as`, generics, `import type`, `interface` and `type` are erased (replaced by spaces, so
  lines and columns stay where they were). TypeScript with a runtime meaning — `enum`, `namespace`, a
  constructor parameter property, `import x = require()` — stops the compile with
  `PDX_TS_UNSUPPORTED`. So does a module generated from a script that parses when the module itself
  does not: that code is the compiler's, and the error names its line instead of reaching the browser
  unerased (#675). A script with a syntax error of its own is `PDX_SCRIPT_SYNTAX_ERROR`.
- **A `.pdx.ts` file** is a script with no template: a store (`@store`, [data.md](data.md)) or a module
  of functions that uses runes. It is compiled with the same rewrites as a `<script>` and exports what
  it declares.

### Rules

- `<script setup>` is accepted and `setup` ignored: `PDX_SETUP_REDUNDANT` (info). Landed (#158).
- A legacy marker — `defineProps`, `defineEmits`, a top-level `return { … }` — is `PDX_REMOVED_FORM`;
  `pdx migrate` converts it (migration.md). Landed (#158): the registry entry `legacy-script`, and the
  legacy code generator is removed — a file without a script compiles like one with an empty script.
- A second `<template>` or `<script>` is `PDX_DUPLICATE_TEMPLATE` / `PDX_DUPLICATE_SCRIPT`, as in alpha.
- **One reading rule for declarations** (decisions.md 11 — landed, #524): any declaration may span
  lines when it opens a balanced `{ … }` or `( … )` on its first line; it ends at its `;` or at the end
  of that block. Alpha allowed it declaration by declaration. The full rule, bodies included, is in
  [script.md](script.md#the-script-and-its-rewrite).

### Examples

```pdx
<template>
  <p>{{ count }} of {{ total }}</p>
</template>

<script>
@prop total: number = 10;
let count = $signal(0);
</script>

<style scoped>
  p { margin: 0; }
</style>
```

### Since

alpha → beta (#158)

## The tag

### Semantics

The file name is the tag, lowercased, prefixed with the **application prefix** (#136 — landed):
`pdx({ prefix })`, default `'app'`. `user-card.pdx` → `<app-user-card>`, `App.pdx` → `<app-app>`. A
name that already starts with the prefix keeps it. A file whose name starts with `_` keeps its parent
folder for uniqueness: `admin/_layout.pdx` → `<app-admin-layout>` (but `pages/_layout.pdx`, `src/…`,
`routes/…` and `components/…` → `<app-layout>`). `@tag 'x-y'` ([script.md](script.md)) names the tag
explicitly. The prefix `pdx-` is reserved for the `@pdxui/*` packages.

### Rules

- An application tag written with `@tag` that starts with `pdx-` is `PDX_TAG_RESERVED`. A file whose
  name starts with `pdx-` does not derive one: the reserved prefix is dropped, `pdx-code.pdx` →
  `<app-code>` (landed so, rather than as an error, so an alpha file named that way keeps compiling
  and only its tag changes).
- A file of a published `@pdxui/*` package (the nearest `package.json` above it is named `@pdxui/…`
  and is not `private`) derives its tag with `pdx-`, whatever the application's prefix (#1009): an
  app that compiles the library's source, through its `development` condition, registers
  `@pdxui/ui`'s `pdx-switch.pdx` as `<pdx-switch>`, not `<app-switch>`. A private `@pdxui/*` package
  (the showcase, the site) is an application, and its files take its prefix; so is an app that sits
  inside the package, with no `package.json` of its own (a demo, the package's own test harness),
  which names `prefix: 'pdx'` itself when it compiles the package's components.
- Two files that derive one tag are `PDX_TAG_COLLISION`, as in alpha.
- `pdx migrate` renames an existing application's `pdx-` tags in its templates, its CSS selectors and
  its `@tag` lines, and reports a tag it finds inside a string.

### Examples

```pdx
<template>
  <app-user-card :user="me"></app-user-card>
</template>

<script>
import type { User } from './user';
let me = $signal<User>({ id: 1, name: 'Ada' });
</script>
```

### Since

alpha → beta (#136)

## One language, no levels

### Semantics

The beta **replaces** the alpha: there is no `language` option and no period in which both are
accepted (owner decision, 2026-10-11 — decisions.md 36; the alpha has no users to protect). Each form
the beta removes is registered once in the compiler with how to detect it, its message and the
mechanical fix when there is one, and is an error, `PDX_REMOVED_FORM`, whose message names the beta
form and `pdx migrate`.

Every form the beta removes or changes is registered once (`packages/compiler/src/language/changes.ts`),
with how to find it, what to write instead and, when there is one, the mechanical rewrite. Each entry
is one of four kinds, migration.md's:

- `removed` — a language change: the old form is an error, `PDX_REMOVED_FORM`, whose message names
  the beta form and `pdx migrate`. A form that already has a code of its own (an unknown `@defer`
  trigger, `PDX_DEFER_UNKNOWN_TRIGGER`) keeps it. A removed export of a `@pdxui/*` package leaves the
  package; an import of it in a `.pdx` script is `PDX_REMOVED_FORM`, naming its replacement. Each
  removed entry also names a `marker`, a substring or regex every instance of the form contains: the
  compiler looks for the form only in a file that has it (#648), and the compiler's tests fail when a
  detected fixture lacks it;
- `changed` — still valid source with a new meaning: the compiler says nothing;
- `fix` — a behaviour that changed because the old one was a defect: nothing is an error;
- `target` — compiled output that depends on the browser target, with nothing to rewrite.

`pdx migrate [paths] [--dry]` reads the same registry. It rewrites every `removed` and `changed` form
that has a mechanical rewrite, writes the files, and lists each place a person has to rewrite: a form
with no mechanical rewrite, and every `fix`. It reads `.pdx` files, scripts and `vite.config.*`. It is
idempotent; `--dry` writes nothing. It exists to move code written in alpha — the repository's own
showcase, site, examples and skills first — and the full list is migration.md.

### Rules

- A removed form is `PDX_REMOVED_FORM` (error), never a warning and never accepted silently.
- A removed export of `@pdxui/*` is removed from the package; the release notes list each one with
  its replacement.

### Since

beta (#121 — **landed**: the registry, `PDX_REMOVED_FORM` and `pdx migrate`; each removal adds its
entry in its own issue)

## Browser targets

### Semantics

`pdx({ target })` selects which platform features the compiled output relies on (#121). The default
is `'baseline-2026'`. `'baseline-2024'` is the support target for existing projects whose users run
older browsers: it emits today's mechanisms where the beta output depends on a 2026 feature. It is
maintained frozen — fixed, not developed — with a reduced certification run, and retired when `@scope`
is Baseline widely available (September 2028); #121 carries the details (decisions.md 16). The
reduced run is a CI job of its own (#509 — landed): Dim 1, the contract math, on the 13 themes, with
the scenario pages building the design CSS for `baseline-2024` (the environment names the target,
`packages/responsive/tests/certify-target.ts`). DOM, ARIA
and keyboard do not depend on the target, so Dims 2, 4 and 5 are not run for it. A scenario that
asserts what only `baseline-2026` gives declares `onlyOn` in its manifest, with the reason, and is left
out of that run.

| Output | `baseline-2026` | `baseline-2024` |
|---|---|---|
| Scoped style | `@scope (…) to (…)` donut, slotted content marked `data-pdx-H-in` (#152 — landed) | ancestor selector `[data-pdx-H] …` (alpha) |
| `:scope` in a scoped block (the host) | `:where(:scope)[data-pdx-H]`, inside `@scope` (#152 — landed) | rewritten to the host, `[data-pdx-H]` (#152 — landed; decisions.md 20) |
| Theme behaviours | custom properties read with style queries (#156 — landed) | attributes on `<html>` synced by `setTheme` (alpha) |
| Custom states | `:state(name)` (#132) | `:state(name)` plus a mirrored `data-state-name` attribute |
| Variants | `:scope[variant="x"]` inside the `@scope` block (#153) | `[data-pdx-H][variant="x"]` |

A target never changes what a `.pdx` **means**, with one stated exception: under `'baseline-2024'` a
scoped rule still reaches inside child components (the alpha scoping), because no 2024 mechanism stops
it without per-element attributes.

### Since

beta (#121 — **landed**: the option and `ctx.target`; the scoped-style outputs with #152, custom
states with #132, variants with #153, theme behaviours with #156 — all landed)

## The render model

### Semantics

A template is compiled by **one** code generator, in development and in a production build (#107 —
landed; the parity table's recorded expectations, #237 — landed; the template path's removal, #238 —
landed, the alpha scoped slot's body last, #364):
the template becomes imperative DOM code — with its static parts copied from a `<template>` built once
(#109 — landed) — that binds each dynamic part in place. There is no second render path whose behaviour could
differ: a construct means the same everywhere, and the render parity table
(`packages/core/tests/render-parity.test.ts`) asserts the single path against recorded expectations.
`html\`\`` remains in `@pdxui/core` for hand-written TypeScript components (#107); the script
`@snippet` body is a template, compiled like any other (decisions.md 9). Hot reload replaces the component's prototype and re-renders, whatever the render code is; a save that changes only `<style>` blocks rewrites their style elements instead and re-renders nothing (#246).

What the compiler guarantees about the emitted code, as observable rules:

- A binding whose expression reads no signal, prop, store or loop item is assigned once, with no
  effect; inside a `@for`, an expression that reads only the `track` key is assigned once per row
  (#110).
- Whitespace-only text between table-internal elements (`table`, `thead`, `tbody`, `tfoot`, `tr`,
  `colgroup`) is not emitted (#111).
- Whitespace at the start and the end of an element's content, and of a block's — the space between
  `{` and the markup of an `@if` branch or a `@for` row — is not emitted; between two nodes a run of
  it is one space (#907, the rule of Svelte 5). `<pre>`, `<textarea>`, `<listing>`, `<plaintext>`,
  `<script>` and `<style>` keep their text as written, so does `@raw` text, and `&nbsp;` is not
  whitespace. Text that must start or end with a space writes it as `&nbsp;` or `{{ ' ' }}`.
- Bubbling events inside a `@for` body — `click`, `dblclick`, `input`, `change`, `keydown`, `keyup`,
  `pointerdown`, `pointerup`, `contextmenu`, without `.capture`, `.once`, `.passive`, `.self` — are
  delegated to one listener per type on the component's host (#113). The handler is declared once,
  before the outermost `@for`, and a row stores with it the names in scope — its item and index, an
  outer row's — which `delegate` passes to it after the event (#375).
- `row.key === sig` inside a `@for` keyed by `row.key` compiles to a keyed selector: a change of `sig`
  updates two rows, not all (#117).
- Every compiled event handler runs inside `batch()`; outside handlers, a write flushes at once
  (#114, decided 2026-10-10, landed).

### Rules

- `pdx({ inlineBindings })` is ignored with `PDX_INLINE_BINDINGS_IGNORED` (warning) in alpha, and is
  not an option of the beta.

### Since

beta (#107, #109–#118)

## Static generation

### Semantics

`pdx build --ssg` renders every `@page` route without dynamic params (and the routes listed in
`pdx({ ssg: { routes } })`) to `dist/<route>/index.html`, from a string emitter of the same template
AST (#160): initial values only, no effects, no listeners; `@defer` renders its placeholder and
`@await` its loading branch — except the data of a listed route's `@loader`, which runs at build time
so its loaded branch is rendered (server.md, decisions.md 33). A pre-rendered host carries `data-pdx-ssr`, and at mount the component
**replaces** that content with its client render in the same frame. Code that needs the browser
belongs in `onMount`, which the emitter does not run. There is no hydration and no request-time
rendering.

### Since

beta (#160)
