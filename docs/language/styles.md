# Styles

A `.pdx` file carries its CSS in `<style>` blocks, any number of them, in source order. This page
defines the `Css` production that [overview.md](overview.md) leaves open, what `scoped` does to a
selector, where each block's CSS ends up in development and in a build, and the two CSS functions the
compiler rewrites. The source is `packages/compiler/src/compiler/codegen-styles.ts`; the block is read
by `packages/compiler/src/parser/sfc.ts`.

```ebnf
Css            ::= ( CssText | ResponsiveCall | BindCall )*
CssText        ::= /* CSS, as the browser reads it; comments allowed */
```

`ResponsiveCall` and `BindCall` are defined under [`responsive()`](#responsive) and
[`bind()`](#bind). Everything else in a block is CSS the compiler does not parse beyond the rule
structure `scoped` needs.

## The blocks

### `<style scoped>`

#### Syntax

```ebnf
ScopedStyle    ::= "<style" S "scoped" S? ">" Css "</style>"
```

#### Semantics

The block's CSS is rewritten so that every selector sits under the host's scope attribute,
`data-pdx-HASH`, where `HASH` is six base-36 characters hashed from the file path the compiler was
given. Comments are removed, `responsive()` and `bind()` are rewritten, and then each top-level rule
has its selector list split at every comma and each part prefixed with `[data-pdx-HASH] ` (a
descendant combinator): `.a, .b:hover { … }` becomes `[data-pdx-HASH] .a, [data-pdx-HASH] .b:hover
{ … }`. The selectors inside `@media`, `@supports`, `@layer`, `@container` and `@starting-style` are
scoped the same way, recursively. `@keyframes` and `@font-face` are copied as written (their names are
not selectors), and so is every other at-rule with a block, `@scope` included: an author's `@scope`
sets its own boundary. A rule's body, nested rules (`&`) included, is copied as written. The setup the
compiler generates calls `ctx.el.setAttribute('data-pdx-HASH', '')` on the host when at least one
block of the file is scoped. Because the scope is an ancestor, a rule reaches everything rendered
inside the host — child components, slotted content, `@raw` output — but never the host element
itself.

#### Rules

- `:global(…)` is not CSS; it raises `PDX_GLOBAL_SELECTOR` (warning) and the browser drops the rule.
  A plain descendant selector already reaches what a child component renders.
- The selector list is split at its top-level commas only: a list inside `:is()`, `:where()`,
  `:not()` or `:has()` is one selector, `:is(.a, .b) > span` → `[data-pdx-HASH] :is(.a, .b) > span`.
- A statement at-rule — `@import`, `@charset`, `@namespace`, `@layer a, b;` — ends at its `;` (one
  inside parentheses or quotes does not end it). It is copied as written, and the rule after it is
  scoped as usual.
- At-rule names are matched as whole names, in any case: `@MEDIA` is scoped like `@media`, and
  `@media-x` is not `@media`.
- `:root`, `html`, `body` and the host's own tag become descendants of the host and match nothing;
  style the host from a plain `<style>` block. Not checked today.
- `@keyframes` names are global: two components that both define `@keyframes fade` collide. Not
  checked today.
- `@scope` and any at-rule not listed above (`@property`, `@page`, `@font-feature-values`, …) are
  copied unscoped. Not checked today.
- A `lang` attribute on the block is read and ignored: the content is CSS. Not checked today.
- Under `<template shadow>`, `scoped` makes no difference (see [below](#template-shadow-styles)).

#### Examples

```pdx
<template>
  <article class="card">
    <h2 class="title">{{ title }}</h2>
  </article>
</template>

<script setup>
@prop title: string = 'Report';
</script>

<style scoped>
.card { padding: var(--pdx-space-md); }
.card .title { margin: 0; }
@media (min-width: 600px) {
  .card { padding: var(--pdx-space-lg); }
}
@keyframes card-in { from { opacity: 0; } to { opacity: 1; } }
.card { animation: card-in 150ms ease-out; }
</style>
```

`.card .title` reaches the browser as `[data-pdx-HASH] .card .title`; the rule inside `@media` is
scoped the same way; `@keyframes card-in` is not.

#### Since

alpha

### `<style>` without `scoped`

#### Syntax

```ebnf
GlobalStyle    ::= "<style" S? ">" Css "</style>"
```

#### Semantics

The block is global: its CSS is not rewritten at all — no scoping, no comment removal, no
`responsive()` and no `bind()` — and only trimmed. In development it is injected into
`document.head` when the module is evaluated, once per module, not once per instance: the generated
code finds or creates `<style id="pdx-s-HASH">` (the second block of a file is `pdx-s-HASH-1`, the
third `-2`, …) and sets its `textContent`, so a hot reload replaces the element instead of appending
another. A file may combine one `scoped` block for its own elements with a plain one for page-level
CSS it owns, such as rules for elements it creates imperatively, which carry no scope attribute.

#### Rules

- `:global(…)` raises `PDX_GLOBAL_SELECTOR` here too.
- `responsive()` and `bind()` are rewritten in a plain block as in a scoped one. A bound custom
  property is set on the host, so it reaches the component's own elements only.
- `<style />`, self-closing without `src`, carries no CSS and is ignored. Not checked today.

#### Examples

```pdx
<template>
  <div class="list"></div>
</template>

<style scoped>
.list { position: relative; }
</style>

<style>
.list-row { position: absolute; inset-inline: 0; }
</style>
```

#### Since

alpha

### `src=` on a style block

#### Syntax

```ebnf
ExternalStyle  ::= "<style" ( S "scoped" )? S "src=" StringLiteral S? "/>"
```

#### Semantics

The block's content is read from the named file, resolved against the `.pdx` file, and then treated
exactly as if it had been written inline: a `scoped` block is scoped, a plain block is global. Every
block resolves its own `src`, so a file may name several stylesheets. `compile()` called without a
file resolver throws `<style src="…"> requires a file resolver`; the Vite plugin provides one.

#### Rules

- In a production build the virtual style module (see
  [Development and production](#development-and-production)) resolves `src=` with the same resolver,
  and the same project-root check, as the transform.
- A missing file is an error from the resolver, not a `PDX_*` diagnostic.

#### Examples

```pdx
<template>
  <p>Ready</p>
</template>

<style scoped src="./status.css" />
```

#### Since

alpha

### `<template shadow>` styles

#### Syntax

```ebnf
ShadowTemplate ::= "<template" S "shadow" S? ">" Template "</template>"
ShadowStyle    ::= ScopedStyle | GlobalStyle | ExternalStyle   /* in a file with a ShadowTemplate */
```

#### Semantics

When the template is `<template shadow>`, nothing goes to `document.head`. Every style block of the
file, scoped or not, is joined into one stylesheet with comments removed and `responsive()` and
`bind()` rewritten, but **no selector is rewritten**: the shadow root is the scope. The setup the
compiler generates calls `__adoptStyles(ctx.el.shadowRoot, css, 'HASH')`, which builds one
constructed `CSSStyleSheet` per component, shared by every instance and adopted into each root
(a `<style data-pdx-s="HASH">` per root where constructable stylesheets are not available). The host
gets no `data-pdx-HASH` attribute. In a production build the stylesheet is minified but stays in the
JavaScript module; it is not extracted.

#### Rules

- The document's stylesheets, the design system's included, do not reach into the root: the
  component styles itself.
- `scoped` has no effect. Not checked today.

#### Examples

```pdx
<template shadow>
  <p class="note">Isolated</p>
</template>

<style>
.note { margin: 0; font-weight: 600; }
</style>
```

#### Since

alpha

## The CSS the compiler rewrites

Both rewrites run in a `scoped` block and under `<template shadow>`, at compile time. A plain block
keeps them as written.

### `responsive()`

#### Syntax

```ebnf
ResponsiveCall ::= "responsive(" S? Length S? "," S? Length S? ( "," S? Number S? "," S? Number S? )? ")"
Length         ::= Number Unit
Number         ::= "-"? [0-9.]+
Unit           ::= "px" | "rem" | "em"
```

Both lengths take the same unit.

#### Semantics

`responsive(min, max)` becomes a fluid `clamp()` between a viewport of 320px and one of 1920px;
`responsive(min, max, vMin, vMax)` names the viewport range, in pixels, unitless. With `delta = max −
min`, the output is `clamp(min, calc(min + delta * ((100vw - vMinpx) / (vMax − vMin))), max)`:
`responsive(16px, 64px)` → `clamp(16px, calc(16px + 48 * ((100vw - 320px) / 1600)), 64px)`. The middle
term is a length in px, so with `rem` or `em` `delta` is converted at 16px each, the browsers' default
root size: `responsive(1rem, 2rem)` → `clamp(1rem, calc(1rem + 16 * ((100vw - 320px) / 1600)), 2rem)`.
The ends stay in the unit written. Nothing of it reaches the runtime.

#### Rules

- A call that does not match the grammar — two different units, a unit other than `px`, `rem` or
  `em`, a `calc()` argument — is left as written, and the browser drops the declaration. Not checked
  today.
- With `rem` the slope assumes a 16px root, with `em` a 16px font where the declaration applies:
  under another size the middle term reaches `max` a little before or after `vMax`, and the `clamp()`
  still holds both ends. Not checked today.
- Not to be confused with `responsive()` in `@pdxui/core`, the runtime breakpoint signal.

#### Examples

```pdx
<template>
  <h1 class="hero">Welcome</h1>
</template>

<style scoped>
.hero { font-size: responsive(24px, 48px); }
.hero { padding-block: responsive(8px, 32px, 480, 1200); }
</style>
```

#### Since

alpha

### `bind()`

#### Syntax

```ebnf
BindCall       ::= "bind(" S? Word S? ")"
Word           ::= [A-Za-z0-9_]+
```

#### Semantics

`bind(name)` becomes `var(--pdx-HASH-name)`, so the stylesheet stays static. The setup the compiler
generates adds one `ctx.track(() => { … })` that, for every name bound in any block of the file,
calls `ctx.el.style.setProperty('--pdx-HASH-name', String(value))` on the host, reading the name as
the setup does — `__name()` for a `$signal`, `name()` for a `$derived`, `ctx.name()` for a prop; the property
inherits into the subtree (and into a shadow root). The effect reads every bound name, so a change
to any of them re-writes all the bound properties of that instance.

#### Rules

- `name` is an `@prop`, a `$signal`, a `$derived` or a route param of the script. Not checked today.
- The value is written with `String(…)`, with no unit added: `bind(n)` with `n = 42` gives `42`,
  which is not a length. Bind a value that already carries its unit, or write `calc(bind(n) * 1px)`.
  Not checked today.

#### Examples

```pdx
<template>
  <div class="bar"></div>
</template>

<script setup>
@prop width: string = '40%';
</script>

<style scoped>
.bar { inline-size: bind(width); block-size: 4px; background: var(--pdx-color-primary); }
</style>
```

#### Since

alpha

## Where the CSS goes

### Development and production

#### Syntax

```ebnf
StyleModuleId  ::= "virtual:pdx-style/" Base64Url "-" [0-9]+ ".css"
Base64Url      ::= [A-Za-z0-9_-]+
```

`StyleModuleId` is not written by hand: it is what the compiler emits in a build.

#### Semantics

In development every light-DOM block is a string inside the component's module, written to a
`<style>` in `document.head` when the module is evaluated; this is what makes a hot reload of a style
block instant. In a production build (`pdx build`, or Vite's build with the `pdx()` plugin) the
module instead imports one virtual stylesheet per block, `import 'virtual:pdx-style/…-N.css'`, where
the id carries the `.pdx` path base64url-encoded and the block index `N`. The plugin's `resolveId`
and `load` hooks answer that id with the block's CSS — produced by the same function as the dev path,
scoped and then minified — and the `.css` ending makes Vite run its CSS pipeline on it, so the
bundler extracts it into a stylesheet like any other: a route's CSS travels as a `.css` file, not in
its JavaScript chunk. Minification removes comments and collapses whitespace, tightening a selector
around its combinators and a declaration around its colon and commas, and keeps the spaces inside a
value (`calc(a + b)`) and the descendant space before `:` in a selector. A `<template shadow>`
component is the exception: its CSS is minified and stays in the module.

#### Rules

- The same block must produce the same CSS in both modes; the production CSS comes from the same
  `styleCssFor` the dev injection uses. Not checked by a diagnostic; covered by the compiler's tests.
- If the `.pdx` cannot be read when the virtual module loads, the build warns
  `could not read the styles of …` and ships the component unstyled (a build warning, not a `PDX_*`
  code).

#### Examples

```pdx
<template>
  <nav class="tabs"><slot></slot></nav>
</template>

<style scoped>
.tabs { display: flex; gap: var(--pdx-space-sm); }
</style>

<style>
pdx-tabs-bar { display: block; }
</style>
```

In development both blocks are injected as `<style id="pdx-s-HASH">` and `<style id="pdx-s-HASH-1">`;
in a build the module imports `virtual:pdx-style/…-0.css` and `virtual:pdx-style/…-1.css` instead.

#### Since

alpha

## The design system's attributes

### Density

#### Syntax

```ebnf
DensityAttr ::= "pdx-density=" Quote ( "compact" | "normal" | "comfort" ) Quote
```

#### Semantics

`pdx-density` on any element sets `--pdx-density-factor` for that element and its subtree: `compact`
0.75, `normal` 1, `comfort` 1.25. Control heights are `calc(var(--pdx-*-min-height) *
var(--pdx-density-factor, 1))`, and the spacing tokens scale by the same factor. The rules live in the
layer `pdx.preferences`, ordered after `pdx.themes`, so the reader's choice overrides a theme's default
factor (seven shipped themes declare one); without the attribute the theme's own factor applies.

#### Rules

- Not a `.pdx` construct and not checked by a diagnostic: it is the design package's CSS, measured by
  `packages/design/tests/density.spec.ts` on every theme.
- An inline `--pdx-density-factor` still wins over the attribute, as any inline style does.

#### Examples

On the page, `<html pdx-theme="fluent" pdx-density="compact">` gives 0.75 over fluent's own 0.9. In
a component, a subtree:

```pdx
<template>
  <section pdx-density="comfort">
    <pdx-input label="Name"></pdx-input>
  </section>
</template>
```

#### Since

alpha; overriding a theme's own factor since #157.
