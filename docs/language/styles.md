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

A scoped block applies to the component's own elements and stops at nested components (#152). Its
scope attribute is `data-pdx-HASH`, where `HASH` is six base-36 characters hashed from the file path
the compiler was given; the setup the compiler generates calls `ctx.el.setAttribute('data-pdx-HASH',
'')` on the host when at least one block of the file is scoped. Comments are removed and
`responsive()` and `bind()` rewritten first. What follows depends on `pdx({ target })`
([file.md, Browser targets](beta/file.md#browser-targets)):

- **`'baseline-2026'`, the default** — the rules are wrapped in a donut scope,
  `@scope ([data-pdx-HASH], [data-pdx-HASH-in]) to ([data-pdx-root] > *) { … }`. Core sets
  `data-pdx-root` on every component host when it first mounts, so the scope ends at the elements a
  child component renders: a rule reaches the component's own elements and not the inside of a child.
  The second root, `data-pdx-HASH-in`, is the compiler's mark on every element the template writes
  inside a component's tag — slotted content, which light DOM places inside the child's subtree, stays
  in the parent's scope. Each selector `S` becomes `:scope S, :where(:not([data-pdx-HASH])):scope:is(S)`,
  which matches inside either root and a marked element itself, with the specificity
  `[data-pdx-HASH] S` had, so a page's scoped rule weighs against a global one as before. `:scope` is
  the host: it becomes `:where(:scope)[data-pdx-HASH]`. A trailing pseudo-element stays outside the
  `:is()` (`:is(.a)::before`). The selectors inside `@media`, `@supports`, `@layer`, `@container` and
  `@starting-style` get a scope of their own inside the at-rule. A template that writes nothing
  inside a component's tag marks nothing, and its blocks get the single-root form:
  `@scope ([data-pdx-HASH]) to ([data-pdx-root] > *) { … }`, each selector `S` becoming `:scope S`
  alone, with the same specificity (#511). The dev injection and the production stylesheet decide it
  from the same template, an external `<template src>` included.
- **`'baseline-2024'`** — each top-level rule has its selector list split at every comma and each part
  prefixed with `[data-pdx-HASH] ` (a descendant combinator): `.a, .b:hover { … }` becomes
  `[data-pdx-HASH] .a, [data-pdx-HASH] .b:hover { … }`, and `:scope` becomes `[data-pdx-HASH]`. The
  selectors inside the at-rules above are scoped the same way, recursively. Because the scope is an
  ancestor, a rule reaches everything rendered inside the host — child components included — and no
  element is marked.

On both targets `@keyframes` and `@font-face` are copied as written (their names are not selectors),
and so is every other at-rule with a block, `@scope` included: an author's `@scope` sets its own
boundary. A rule's body, nested rules (`&`) included, is copied as written.

#### Rules

- `:global(…)` is not CSS; it raises `PDX_GLOBAL_SELECTOR` (warning) and the browser drops the rule.
  What a child component makes public is its parts, `pdx-menu [data-part="popup"]` (`@part`, #134),
  its states, `:state(name)` (`@state`, #132), and its tokens; its internal classes are not public,
  and under `'baseline-2026'` a scoped rule does not reach them. `pdx migrate` flags a scoped selector
  that did (`scoped-reaches-child`): one that names a component's tag and descends into it, or one whose
  subject the template never writes and the script never puts on an element (`el.className = …`,
  `el.classList.add(…)`).
- An element the script creates inside an element of the template is the component's own, and a
  scoped rule reaches it — unless it sits inside a child component without a marked element around
  it: a node appended straight into a component's tag is past the scope's end. Not checked today.
- A class handed to a component to put on what it renders — `pdx-data-grid`'s `cellClass` and
  `rowClass` — lands past the scope's end under `'baseline-2026'`: style it from a plain `<style>`
  block. `pdx migrate` flags the scoped rule.
- The selector list is split at its top-level commas only: a list inside `:is()`, `:where()`,
  `:not()` or `:has()` is one selector, `:is(.a, .b) > span` → `[data-pdx-HASH] :is(.a, .b) > span`
  under `'baseline-2024'`.
- A statement at-rule — `@import`, `@charset`, `@namespace`, `@layer a, b;` — ends at its `;` (one
  inside parentheses or quotes does not end it). It is copied as written, and the rule after it is
  scoped as usual.
- At-rule names are matched as whole names, in any case: `@MEDIA` is scoped like `@media`, and
  `@media-x` is not `@media`.
- `:root`, `html`, `body` and the host's own tag become descendants of the host and match nothing;
  style the host with `:scope`. Not checked today.
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

<script>
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

Under the default target `.card .title` reaches the browser as `:scope .card .title,
:where(:not([data-pdx-HASH])):scope:is(.card .title)` inside the component's `@scope`; under
`'baseline-2024'` as `[data-pdx-HASH] .card .title`. The rule inside `@media` gets the same treatment;
`@keyframes card-in` is copied as written.

#### Since

alpha; the donut scope of `'baseline-2026'` and `:scope` as the host since beta (#152); its
single-root form for a template that marks nothing since #511.

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

<script>
@prop width: string = '40%';
</script>

<style scoped>
.bar { inline-size: bind(width); block-size: 4px; background: var(--pdx-color-primary); }
</style>
```

#### Since

alpha

### `@variants` and `@variant`

#### Syntax

```ebnf
VariantsDecl   ::= "@variants" S? "{" ( S? VariantAxis )+ S? "}"                     /* in the script */
VariantAxis    ::= Word S? ":" S? "{" S? Word ( S? "," S? Word )* S? "}" ( S? "=" S? Word )? S? ";"?
VariantRule    ::= "@variant" S VariantTest ( S "and" S VariantTest )* S? "{" CssText "}"   /* in a <style scoped> */
VariantTest    ::= Word S? "(" S? Word S? ")"
LibraryRule    ::= "@variant" S ( TagName S )? VariantTest ( S "and" S VariantTest )* S? "{" CssText "}"   /* in @pdxui/design */
TagName        ::= "pdx-" Word
```

#### Semantics

`@variants` in the script declares the component's variants once (#153), on one line —
`@variants { variant: { primary, ghost } = primary; }` — or one axis per line. Each axis becomes a prop
typed with its values — `variant: { primary, ghost } = primary;` is
`@prop variant: 'primary' | 'ghost' = 'primary';` — and is reflected on the host as an attribute,
`variant="ghost"`, as `@host { :variant="variant" }` would write it. An axis without `= default`
defaults to its first value. The generated `.d.ts` carries the union.

`@variant` in a `<style scoped>` keys rules by those attributes. Before the block is scoped, each
selector of its body is put under the host's attribute test: `@variant variant(ghost) { .label { … } }`
becomes `:scope[variant="ghost"] .label { … }`, and a selector that starts with `:scope` takes the
test on the host itself (`:scope { … }` → `:scope[variant="ghost"] { … }`). `and` combines axes:
`@variant variant(ghost) and size(sm)` tests both attributes. The scoping then compiles `:scope` as it
does everywhere: `:where(:scope)[data-pdx-HASH][variant="ghost"] .label` inside the donut scope under
`'baseline-2026'`, `[data-pdx-HASH][variant="ghost"] .label` under `'baseline-2024'`. An `@variant` may
sit inside `@media`, `@supports`, `@layer` or `@container`, and may hold one. Under
`<template shadow>` the test is `:host([variant="ghost"])`.

**In the library** (specified by #626, lands with #512). A library component declares its axes in its
descriptor instead of a script. An axis is a list of values, `size: ['md', 'sm', 'lg']`, or a record
from each value to the selector that draws the same look on native HTML,
`variant: { primary: '.pdx-primary', solid: '.pdx-primary', ghost: '.pdx-ghost' }`; the first entry
is the default. Both forms generate what `@variants` generates — a typed prop per axis, reflected on
the host — and `packages/ui/custom-elements.json` lists every axis with its values, its default and
its native selectors.

The rules live in `@pdxui/design`, in sources the design build compiles, because `src/` reaches the
browser as written. A stylesheet with `@variant` rules is written in
`packages/design/variant-sources/<path>.css`, and `node packages/design/scripts/gen-variants.mjs`
writes `src/<path>.css`; a theme source, `theme-sources/<name>.css`, is compiled by `gen-themes.mjs`.
In the component's own stylesheet, `variant-sources/components/<name>.css` for `pdx-<name>`, the tag
is implied and may be written. Anywhere else — a surface stylesheet, a theme source inside
`@pdx-theme`, the theme engine's output — the rule names it: `@variant pdx-button variant(primary) { … }`.
The design build compiles every rule with the block walker a `.pdx` uses (`expandVariantBlocks`, in
`packages/compiler/src/compiler/variant-css.ts`). A selector `S` of the body is relative to the host,
as in a `.pdx`, and becomes

```css
:where(pdx-button[variant="ghost"]) S:not(:where(pdx-button[variant="ghost"] [data-pdx-root] S))
```

which reads: under the host's attribute test, and never inside another component. Core marks every
component host with `data-pdx-root`, so a rule on the card's root does not reach the root of a
component nested in the card. The host test sits in `:where()`, so a rule weighs what `S` weighs.
`:scope` is the host, `:where(pdx-button[variant="ghost"])`; a pseudo-element stays last, after the
bound. The form is the same on both targets: the
design CSS is not scoped, and `:where()` and `:not()` with complex selectors are in `baseline-2024`.

Where the axis gives a value a native selector, the same rule also yields it. The root part,
`[data-part="root"]`, is the element the native selector goes on, so `[data-part="root"]` in `S` is
replaced by the selector: `[data-part="root"]:hover` → `.pdx-ghost:hover`. A class for an attribute
keeps the rule's weight. A selector that names another part has no native form and yields the host
selector alone. Values that share a native selector (`solid` and `primary` both give `.pdx-primary`)
share their rules: the host test names them all, `:where(pdx-button:is([variant="primary"],
[variant="solid"]))`. In a theme source the expansion runs before the theme's guard (`gen-themes.mjs`),
so every selector it yields takes the theme root and the nested-theme guard like any other theme rule.

#### Rules

- An axis without values, declared twice, or whose default is not one of its values:
  `PDX_VARIANTS_MALFORMED` (error); the axis is skipped and no prop is generated for it.
- An `@variant` naming an axis `@variants` does not declare, or a value its axis does not have:
  `PDX_VARIANT_UNKNOWN` (error) — any `@variant` in a component that declares no `@variants` is one.
- A declared value other than the default that no `@variant` rule names: `PDX_VARIANT_UNSTYLED`
  (warning). The default is the base rules' look and is never reported.
- The values are CSS: a colour in them is a token, like any colour in a component (CD-C3).
- An `@variant` in a plain `<style>` block is copied as written: the browser drops it.
- In the library, the design build checks the rules against `custom-elements.json`, so it runs after
  `pnpm --dir packages/ui run manifest`. A rule naming a tag, an axis or a value the manifest does not
  declare is `PDX_VARIANT_UNKNOWN`, and fails the build: `gen-variants.mjs` and `gen-themes.mjs` write
  nothing. A declared value other than the default that no rule of the package styles is
  `PDX_VARIANT_UNSTYLED`; a value that shares the default's native selector has the default's look and
  is not reported either. A rule outside the component's own stylesheet that does not name its tag is
  `PDX_VARIANT_UNKNOWN`.
- An axis is a closed set of values the CSS draws. An open value, such as a free colour
  (`pdx-avatar`'s `color`), stays a plain prop.
- A native selector is a compound: a class (`.pdx-ghost`) or the attributes the native form needs. It
  keeps the rule's weight only when it is one class or one attribute, like the part it replaces.
- Rules outside `@variant` are plain CSS. A component's base look, and its states (`.pdx-loading`),
  are written as such.

#### Examples

```pdx
<template>
  <button data-part="root"><slot></slot></button>
</template>

<script>
@variants {
  variant: { primary, ghost } = primary;
  size: { sm, md } = md;
}
@part root;
</script>

<style scoped>
[data-part="root"] { background: var(--pdx-color-primary); color: var(--pdx-color-primary-text); }
@variant variant(ghost) { [data-part="root"] { background: transparent; color: var(--pdx-color-text); } }
@variant size(sm) { [data-part="root"] { padding-inline: var(--pdx-space-xs); } }
@variant variant(ghost) and size(sm) { [data-part="root"] { padding-inline: 0; } }
</style>
```

`<app-button variant="ghost" size="sm">` matches the last three rules; the props are typed
`variant?: 'primary' | 'ghost'` and `size?: 'sm' | 'md'`.

In the library, the descriptor declares the axes and their native selectors:

```ts
component('pdx-button', {
    variants: {
        variant: { primary: '.pdx-primary', solid: '.pdx-primary', ghost: '.pdx-ghost' },
        size: ['md', 'sm', 'lg'],
    },
    // …
});
```

The component's stylesheet writes the rules once. The tag is implied:

```css
/* packages/design/variant-sources/components/button.css */
@variant variant(ghost) {
    [data-part="root"] { background: var(--pdx-button-bg, transparent); color: var(--pdx-color-muted); }
}
```

The design build compiles that to one rule for `pdx-button variant="ghost"` and for a native
`<button class="pdx-ghost">`:

```css
:where(pdx-button[variant="ghost"]) [data-part="root"]:not(:where(pdx-button[variant="ghost"] [data-pdx-root] [data-part="root"])),
.pdx-ghost { background: var(--pdx-button-bg, transparent); color: var(--pdx-color-muted); }
```

A theme source names the tag:

```css
/* packages/design/theme-sources/material.css */
@pdx-theme material {
    @variant pdx-button variant(primary) { [data-part="root"]:hover { box-shadow: var(--pdx-shadow-sm); } }
}
```

#### Since

beta (#153). The library form is specified by #626 and lands with #512.

### Component tokens

#### Syntax

```ebnf
ComponentToken ::= "--pdx-" KebabName "-" KebabName ( "-" KebabName )?   /* --pdx-<component>-<property>[-<state>] */
```

#### Semantics

A component's own customisable values are custom properties named `--pdx-<component>-<property>[-<state>]`
(#154): `--pdx-button-bg`, `--pdx-button-bg-hover`, `--pdx-button-color`, `--pdx-button-radius`. The
component's CSS reads its own token first and falls back to a global token, or to the value it draws
itself: `background: var(--pdx-button-bg, var(--pdx-color-primary))`. They are overridden by the cascade
at any level — `:root`, a subtree, one element's `style` — and a theme sets them like any token. Each
component's tokens are read off the design CSS into the manifest's `cssProperties`, with the default
`tokens.css` gives (`packages/design/scripts/component-tokens.mjs`), and listed on its docs page. A
token belongs to the component whose name is its longest prefix; one read only as another's fallback
is a renamed token's old name, not part of the surface.

#### Rules

- A token renamed to the convention keeps its old name as the fallback of the new one, so a theme
  written before the rename keeps working: `--pdx-button-hover-shadow`, `--pdx-button-hover-transform`
  and `--pdx-accordion-open-transform` still apply.
- A component's CSS reading another component's token — as the first argument of a `var()` — is a
  design lint error, `pnpm lint` (#514). A stylesheet's own components are the one its file name names
  and every one its selectors name (`pdx-x`, `.pdx-x`, `.pdx-surface-x`); a theme and `tokens.css` are
  not checked. A measure two components share is a global token, read with the other's token as the
  fallback alias: `--pdx-control-min-height` (the height a row of buttons and inputs aligns on) and
  `--pdx-control-radius` (the corner of a button-like control). The registry of global namespaces is
  `GLOBAL_PREFIXES` in `packages/design/scripts/component-tokens.mjs`.

#### Examples

```pdx
<template>
  <div class="actions">
    <pdx-button>Save</pdx-button>
    <pdx-button class="quiet">Later</pdx-button>
  </div>
</template>

<style scoped>
.actions { --pdx-button-radius: 9999px; }
.quiet { --pdx-button-bg: var(--pdx-color-inset); --pdx-button-color: var(--pdx-color-text); }
</style>
```

Both buttons are pills; the second has the inset background and the text colour.

#### Since

beta (#154)

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
