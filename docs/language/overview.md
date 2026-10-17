# The PDX language — overview

This is the formal reference of the `.pdx` language: what each construct accepts, what the compiler
makes of it, and what it reports when the construct is wrong. It describes the language **as the
compiler reads it today**. The guide pages on the site teach; this reference defines. When the two
disagree, this page is right only if the compiler agrees with it, and
`packages/compiler/tests/language-reference.test.ts` checks that it does:

- every rune in `packages/compiler/src/compiler/runes.ts` has a section here;
- every block directive in `packages/compiler/src/parser/template.ts` has a section here;
- every example compiles with no warning, type-checks and resolves its imports.

| Page | What it defines |
|---|---|
| [overview.md](overview.md) | The file, its blocks, the notation of this reference |
| [script.md](script.md) | The component declarations (`@prop`, `@event`, …) and the `$` runes |
| [template.md](template.md) | Interpolation, every binding form, every block directive |
| [styles.md](styles.md) | `<style>`, scoping, the CSS the compiler rewrites |
| [routing.md](routing.md) | `@page` and the declarations a page carries |
| [data.md](data.md) | `@fetch`, `@form`, `@store` |
| [diagnostics.md](diagnostics.md) | Every `PDX_*` code, by the construct that raises it |

## How to read a construct

Every construct has the same five parts:

- **Syntax** — a grammar in EBNF, in the notation of the
  [W3C XML specification](https://www.w3.org/TR/xml/#sec-notation): `Name ::= expression`, literal
  text in quotes, `A?` optional, `A*` zero or more, `A+` one or more, `A | B` either, `( … )` grouping,
  `[a-z]` a character class. A production this page defines (below) is used by name everywhere else.
- **Semantics** — what the construct means and what the compiler generates for it, in one paragraph.
- **Rules** — what is an error or a warning, with its `PDX_*` code. A rule with no code is one the
  compiler does not check today; it says so.
- **Examples** — each a complete `.pdx` file.
- **Since** — the release the construct appeared in, `alpha` or `beta` (see [Removed forms and browser targets](#removed-forms-and-browser-targets)).

## Shared productions

The grammars of the other pages use these. A script is TypeScript, so where a grammar says
`Expression` or `Type` it means a TypeScript expression or type, read by the TypeScript grammar, not
restated here.

```ebnf
Identifier    ::= [A-Za-z_$] [A-Za-z0-9_$]*
StringLiteral ::= "'" [^']* "'" | '"' [^"]* '"'
Expression    ::= /* a TypeScript expression */
Type          ::= /* a TypeScript type */
TagName       ::= "pdx-" [a-z0-9] [a-z0-9-]*
S             ::= ( " " | "\t" | "\n" | "\r" )+
```

## The file

A `.pdx` file is a single-file component: up to three kinds of block, each optional.

```ebnf
PdxFile        ::= ( TemplateBlock | ScriptBlock | StyleBlock | S )*
TemplateBlock  ::= "<template" ( S "shadow" )? ( S "src=" StringLiteral S? "/>" | ">" Template "</template>" )
ScriptBlock    ::= "<script" ( S "setup" )? ( S 'lang="js"' )? ( S "src=" StringLiteral S? "/>" | ">" Script "</script>" )
StyleBlock     ::= "<style" ( S "scoped" )? ( S "src=" StringLiteral S? "/>" | ">" Css "</style>" )
```

`Template` is defined in [template.md](template.md), `Script` in [script.md](script.md), `Css` in
[styles.md](styles.md).

- **At most one `<template>` and one `<script>`.** `<style>` may appear more than once: a component
  can carry its scoped CSS and the page-level CSS it owns side by side.
- **`src`** reads the block from another file, as if its contents were written inline: bindings,
  form wiring and scoping work unchanged, in development and in a production build.
- **`<template shadow>`** renders into a shadow root instead of light DOM; the component's CSS is
  adopted into the root, unrewritten, and `scoped` makes no difference there. Light DOM is the default.
- **`<script setup>`** is the convention. What the compiler reads are the runes, line by line; `setup`
  states the intent.
- **`<script setup lang="js">`** compiles the script as written. Without it the script is TypeScript:
  annotations, `as`, generics, `import type`, `interface` and `type` are erased (replaced by spaces, so
  lines and columns stay where they were). TypeScript with a runtime meaning — `enum`, `namespace`, a
  constructor parameter property, `import x = require()` — stops the compile with
  `PDX_TS_UNSUPPORTED`.

### The tag

The file name is the tag, lowercased, with the application prefix in front (#136): `pdx({ prefix })`,
`app` by default. `user-card.pdx` → `<app-user-card>`, `App.pdx` → `<app-app>`. A name that already
starts with the prefix keeps it; one that starts with `pdx-` drops it (`pdx-code.pdx` → `<app-code>`).
A file whose name starts with `_` keeps its parent folder for uniqueness: `admin/_layout.pdx` →
`<app-admin-layout>` (but `pages/_layout.pdx`, `src/…`, `routes/…` and `components/…` →
`<app-layout>`). `@tag` ([script.md](script.md)) names another tag. The `pdx-` prefix is the
`@pdxui/*` packages': an application tag that starts with it raises `PDX_TAG_RESERVED`. Two files that
derive the same tag raise `PDX_TAG_COLLISION`. `pdx migrate` renames an application's alpha `pdx-`
tags in its templates, its style selectors and its `@tag` lines, and flags one written in a string.

### The two script modes

The runes are the **new mode**. The pre-rune syntax — `defineProps`, `defineEmits`, a top-level
`return { … }` — is the **legacy mode**, still compiled, and not described further in this
reference. A `<script>` with no rune and no legacy marker is legacy; `<script setup>` without either
is the new mode. A legacy marker inside `<script setup>` raises `PDX_LEGACY_IN_SETUP`, naming the
marker and which mode won. In the legacy mode a name the template reads that the script does not
return raises `PDX_TEMPLATE_NAME_NOT_PROVIDED`.

### Script-only files

A `.pdx.ts` file is a script with no template: a store (`@store`, [data.md](data.md)) or a module of
functions that uses runes. It is compiled with the same rewrites as a `<script setup>` and exports
what it declares.

```pdx
<template>
  <p>{{ count }} of {{ total }}</p>
</template>

<script setup>
@prop total: number = 10;
let count = $signal(0);
</script>

<style scoped>
  p { margin: 0; }
</style>
```

## Removed forms and browser targets

There are **no language levels**: the beta replaces the alpha, and the compiler has no option that
keeps an old form compiling (decision 36 of `beta/decisions.md`). **Since** names the release a
construct appeared in, `alpha` or `beta`, not a level to choose.

**Removed forms.** Every form the beta removes or changes is registered once in the compiler
(`packages/compiler/src/language/changes.ts`), with how to find it, what to write instead and, when
there is one, the mechanical rewrite. Each entry is one of four kinds, `beta/migration.md`'s:

- `removed` — a language change: the old form is an error, `PDX_REMOVED_FORM`, whose message names
  the beta form and `pdx migrate`. A form that already has a code of its own (an unknown `@defer`
  trigger, `PDX_DEFER_UNKNOWN_TRIGGER`) keeps it. A removed export of a `@pdxui/*` package leaves the
  package; an import of it in a `.pdx` script is `PDX_REMOVED_FORM`, naming its replacement;
- `changed` — still valid source with a new meaning: the compiler says nothing;
- `fix` — a behaviour that changed because the old one was a defect: nothing is an error;
- `target` — compiled output that depends on the browser target, with nothing to rewrite.

`pdx migrate [paths] [--dry]` reads the same registry. It rewrites every `removed` and `changed` form
that has a mechanical rewrite, writes the files, and lists each place a person has to rewrite: a form
with no mechanical rewrite, and every `fix`. It reads `.pdx` files, scripts and `vite.config.*`. It is
idempotent; `--dry` writes nothing.

**Browser targets.** `pdx({ target: 'baseline-2026' | 'baseline-2024' })` selects which platform
features the compiled output may rely on; the default is `'baseline-2026'`. Where the beta's output
needs a 2026 feature, `'baseline-2024'` emits today's mechanism instead (`beta/file.md` → «Browser
targets» lists them). No output depends on the target yet: the changes that add one bring it.

`'baseline-2024'` is a support target, and is maintained **frozen**: it is fixed, not developed. It is
certified by a reduced run, built with the first output that depends on it, and it is retired when
`@scope` is Baseline widely available, September 2028.
