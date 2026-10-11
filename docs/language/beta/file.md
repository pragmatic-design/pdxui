# The file, levels, targets and the render model

## The file

### Syntax

```ebnf
PdxFile        ::= ( TemplateBlock | ScriptBlock | StyleBlock | S )*
TemplateBlock  ::= "<template" ( S "shadow" )? ( S "src=" StringLiteral S? "/>" | ">" Template "</template>" )
ScriptBlock    ::= "<script" ( S "setup" )? ( S 'lang="js"' )? ( S "src=" StringLiteral S? "/>" | ">" Script "</script>" )
StyleBlock     ::= "<style" ( S "scoped" )? ( S "src=" StringLiteral S? "/>" | ">" Css "</style>" )
```

### Semantics

A `.pdx` file is a single-file component: at most one template, at most one script, any number of
style blocks. **The script has one grammar** (#158): there is no `setup` attribute that changes the
meaning, and no legacy mode. A `<script>` is always read for declarations and runes, whatever it
contains; a script with none of them is a component that returns every top-level name to its
template. `src=`, `<template shadow>`, `lang="js"` and type erasure are unchanged from alpha
(`docs/language/overview.md`). A `.pdx.ts` file is a script-only module (a store, or functions that
use runes), unchanged.

### Rules

- `<script setup>` is accepted and `setup` ignored: `PDX_SETUP_REDUNDANT` (info).
- A legacy marker — `defineProps`, `defineEmits`, a top-level `return { … }` — is `PDX_ALPHA_FORM`
  under `language: 'alpha'` and an error under `'beta'`; `pdx migrate` converts it (migration.md).
- A second `<template>` or `<script>` is `PDX_DUPLICATE_TEMPLATE` / `PDX_DUPLICATE_SCRIPT`, as in alpha.
- **One reading rule for declarations** (decisions.md 11 — proposed): any declaration may span lines
  when it opens a balanced `{ … }` or `( … )` on its first line; it ends at its `;` or at the end of
  that block. Alpha allowed it declaration by declaration.

### Since

alpha → beta (#158)

## The tag

### Semantics

The file name is the tag, lowercased, prefixed with the **application prefix** (#136):
`pdx({ prefix })`, default `'app'`. `user-card.pdx` → `<app-user-card>`; `admin/_layout.pdx` →
`<app-admin-layout>` (the folder rule of alpha is unchanged). `@tag 'x-y'` names the tag explicitly.
The prefix `pdx-` is reserved for the `@pdxui/*` packages.

### Rules

- An application tag that starts with `pdx-` (derived or written with `@tag`) is `PDX_TAG_RESERVED`.
- Two files that derive one tag are `PDX_TAG_COLLISION`, as in alpha.
- Under `language: 'alpha'` the derived prefix stays `pdx-`; `pdx migrate` renames the application's
  tags in its templates, its CSS selectors and its `@tag` lines, and reports a tag it finds inside a
  string.

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

## Language levels

### Syntax

```ebnf
PdxOption ::= "language" ":" ( "'alpha'" | "'beta'" ) | "target" ":" ( "'baseline-2026'" | "'baseline-2024'" )
```

### Semantics

`pdx({ language })` selects the forms the compiler accepts (#121). Each form the beta removes is a
**language change**, registered once in the compiler with how to detect it, the message, and the
mechanical fix when there is one:

| Level | A removed form | A beta form |
|---|---|---|
| `'alpha'` | compiles as before, `PDX_ALPHA_FORM` (warning) naming the beta form and `pdx migrate` | compiles |
| `'beta'` | error, same message | compiles |

The default is `'alpha'` until #159 makes it `'beta'`; after that `'alpha'` stays selectable for the
support period the release notes state.

`pdx migrate [paths] [--dry]` applies every mechanical fix, writes the files, and reports the changes
it could only flag. It is idempotent. The full list is migration.md.

### Since

beta (#121, #159)

## Browser targets

### Semantics

`pdx({ target })` selects which platform features the compiled output relies on (#121). The default
is `'baseline-2026'`. `'baseline-2024'` is the support target for existing projects whose users run
older browsers: it emits today's mechanisms where the beta output depends on a 2026 feature. It is
maintained frozen — fixed, not developed — with a reduced certification run, and retired when `@scope`
is Baseline widely available (September 2028); #121 carries the details (decisions.md 16).

| Output | `baseline-2026` | `baseline-2024` |
|---|---|---|
| Scoped style | `@scope (…) to (…)` donut (#152) | ancestor selector `[data-pdx-H] …` (alpha) |
| `:scope` in a scoped block (the host) | native, inside `@scope` | rewritten to the host, `[data-pdx-H]` (proposed — decisions.md) |
| Theme behaviours | custom properties read with style queries (#156) | attributes on `<html>` synced by `setTheme` (alpha) |
| Custom states | `:state(name)` (#132) | `:state(name)` plus a mirrored `data-state-name` attribute |
| Variants | `:scope[variant="x"]` inside the `@scope` block (#153) | `[data-pdx-H][variant="x"]` |

A target never changes what a `.pdx` **means**, with one stated exception: under `'baseline-2024'` a
scoped rule still reaches inside child components (the alpha scoping), because no 2024 mechanism stops
it without per-element attributes.

### Since

beta (#121)

## The render model

### Semantics

A template is compiled by **one** code generator, in development and in a production build (#107):
the template becomes imperative DOM code — with its static parts cloned from a `<template>` built once
(#109) — that binds each dynamic part in place. There is no second render path whose behaviour could
differ: a construct means the same everywhere, and the render parity table
(`packages/core/tests/render-parity.test.ts`) asserts the single path against recorded expectations.
`html\`\`` remains in `@pdxui/core` for hand-written TypeScript components (#107); the script
`@snippet` body is a template, compiled like any other (decisions.md 9). Hot reload replaces the component's prototype and re-renders, whatever the render code is.

What the compiler guarantees about the emitted code, as observable rules:

- A binding whose expression reads no signal, prop, store or loop item is assigned once, with no
  effect; inside a `@for`, an expression that reads only the `track` key is assigned once per row
  (#110).
- Whitespace-only text between table-internal elements (`table`, `thead`, `tbody`, `tfoot`, `tr`,
  `colgroup`) is not emitted (#111).
- Bubbling events inside a `@for` body — `click`, `dblclick`, `input`, `change`, `keydown`, `keyup`,
  `pointerdown`, `pointerup`, `contextmenu`, without `.capture`, `.once`, `.passive`, `.self` — are
  delegated to one listener per type on the component's host (#113).
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
