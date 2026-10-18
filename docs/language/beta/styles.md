# Styles

A `.pdx` carries its CSS in `<style>` blocks. In the beta a component's styling surface is exactly
three things — **tokens**, **parts** and **states** — plus its declared **variants**; everything else
inside a component is internal. The CSS a block contains is CSS, plus the compiler's extensions:
`responsive()`, `bind()` and `@variant`.

```ebnf
Css            ::= ( CssText | ResponsiveCall | BindCall | VariantRule )*
```

## `<style scoped>`

### Syntax

```ebnf
ScopedStyle ::= "<style" S "scoped" S? ">" Css "</style>"
```

### Semantics

A scoped block applies to the component's own elements and **stops at nested components** (#152 —
landed).

- `target: 'baseline-2026'` (default): the block compiles to a donut scope,
  `@scope ([data-pdx-H], [data-pdx-H-in]) to ([data-pdx-root] > *) { … }`. Every component host
  carries the fixed attribute `data-pdx-root` (set by core at first mount) besides its own
  `data-pdx-H`, and the scope ends at the elements a child renders. A rule reaches the component's
  elements and not the inside of a child component. Content the component writes inside a child's
  tag — which light DOM projects into the child's subtree — carries the compiler's mark
  `data-pdx-H-in` and stays in the component's scope. Each selector keeps the specificity it had under
  the ancestor form (`:scope S, :where(:not([data-pdx-H])):scope:is(S)`). The host itself is styled
  with `:scope`, which becomes `:where(:scope)[data-pdx-H]`. The full rewrite is in
  [styles.md](../styles.md#style-scoped).
- `target: 'baseline-2024'`: the alpha output, the ancestor selector `[data-pdx-H] sel`, which also
  reaches children (the documented alpha behaviour) and marks nothing. `:scope` is rewritten to the
  host, `[data-pdx-H]`, so a block that styles its host means the same on both targets.

Selectors inside `@media`, `@supports`, `@layer`, `@container` and `@starting-style` are scoped
too — under 2026 each gets a `@scope` inside the at-rule; `@keyframes`, `@font-face` and an author's
own `@scope` are copied as written (alpha, with #104 — landed). The production build extracts each
block into a stylesheet (alpha).

### Rules

- `:global()` is `PDX_GLOBAL_SELECTOR` (alpha).
- A style that targets a library component's internal class is `PDX_LIBRARY_INTERNALS` (alpha);
  the public surface is `[data-part]`, `:state()` and the component tokens.
- `:root`, `html`, `body` inside a scoped block match nothing (alpha) — `:scope` is the host.
- `pdx migrate` flags a scoped selector that reached inside a child (`scoped-reaches-child`, #152):
  it cannot be rewritten, the replacement is the child's `[data-part]`, `:state()` or tokens.

### Examples

```pdx
<template>
  <article class="card">
    <h2 class="title">{{ title }}</h2>
    <app-badge label="new"></app-badge>
  </article>
</template>

<script>
@prop title: string = 'Report';
</script>

<style scoped>
:scope { display: block; }
.card { padding: var(--pdx-space-md); }
.title { margin: 0; }        /* never reaches inside <app-badge> */
</style>
```

### Since

alpha → beta (#152)

## `<style>`, `src=`, `<template shadow>` — unchanged

As alpha (`docs/language/styles.md`): a plain block is global; `src=` reads the block from a file;
under `<template shadow>` the shadow root is the scope and no selector is rewritten.

## `responsive()`, `bind()` — unchanged

```ebnf
ResponsiveCall ::= "responsive(" S? Length S? "," S? Length S? ( "," S? Number S? "," S? Number S? )? ")"
BindCall       ::= "bind(" S? Word S? ")"
```

As alpha: `responsive()` becomes a fluid `clamp()` at compile time; `bind(name)` becomes
`var(--pdx-H-name)` written on the host from a prop, a model, a `$signal` or a `$derived`.

## Variants

### Syntax

```ebnf
VariantsDecl ::= "@variants" S? "{" ( S? VariantAxis )+ S? "}"                     /* in the script */
VariantAxis  ::= Identifier S? ":" S? "{" S? Word ( S? "," S? Word )* S? "}" ( S? "=" S? Word )? S? ";"
VariantRule  ::= "@variant" S VariantTest ( S "and" S VariantTest )* S? "{" CssText "}"   /* in a style block */
VariantTest  ::= Identifier "(" Word ")"
```

### Semantics

A recipe (#153). The `@variants` block in the script declares each axis and its values; the compiler
generates a typed prop per axis (`variant: 'primary' | 'ghost' | 'danger'`), reflects it as a host
attribute (`variant="ghost"`), and compiles each `@variant` rule of the style block to a selector on
those attributes inside the component's scope — `:scope[variant="ghost"] …` under `baseline-2026`,
`[data-pdx-H][variant="ghost"] …` under `baseline-2024`. `and` combines axes (compound variants). The
values are CSS; colours are tokens. The manifest lists every axis and value, and certification
generates one scenario per value. Descriptor: `variants: { size: ['sm', 'md', 'lg'] }`, with the same
`@variant` rules in the component's stylesheet, processed by the design build.

### Rules

- An `@variant` naming an undeclared axis or value: `PDX_VARIANT_UNKNOWN` (error).
- A declared value with no rule and no default styling: `PDX_VARIANT_UNSTYLED` (warning).
- The token lint applies to the values (colours as tokens).

### Examples

```pdx
<template>
  <button data-part="root"><slot></slot></button>
</template>

<script>
@variants {
  variant: { primary, ghost, danger } = primary;
  size: { sm, md, lg } = md;
}
@part root;
</script>

<style scoped>
[data-part="root"] { border-radius: var(--pdx-button-radius); }
@variant variant(primary) { [data-part="root"] { background: var(--pdx-button-bg, var(--pdx-color-primary)); color: var(--pdx-color-primary-text); } }
@variant variant(ghost)   { [data-part="root"] { background: transparent; color: var(--pdx-color-text); } }
@variant variant(danger)  { [data-part="root"] { background: var(--pdx-color-danger); color: var(--pdx-color-danger-text); } }
@variant size(sm)         { [data-part="root"] { min-block-size: calc(var(--pdx-control-height) * 0.85); } }
@variant size(md)         { [data-part="root"] { min-block-size: var(--pdx-control-height); } }
@variant size(lg)         { [data-part="root"] { min-block-size: calc(var(--pdx-control-height) * 1.25); } }
@variant variant(ghost) and size(sm) { [data-part="root"] { padding-inline: var(--pdx-space-xs); } }
</style>
```

### Since

beta (#153)

## Component tokens

### Syntax

```ebnf
ComponentToken ::= "--pdx-" KebabName "-" KebabName ( "-" KebabName )?   /* --pdx-<component>-<property>[-<state>] */
```

### Semantics

Every component's customisable values are custom properties named `--pdx-<component>-<property>[-<state>]`
(`--pdx-button-bg`, `--pdx-button-bg-hover`, `--pdx-button-border-invalid`), read with the global
token as fallback: `var(--pdx-button-bg, var(--pdx-color-primary))` (#154). The design build extracts
each component's tokens into the manifest, and the component's docs list them. They are overridden by
the cascade at any level: `:root`, a subtree, one element.

### Rules

- A component's CSS reads only its own `--pdx-<component>-*` tokens and global tokens: reading
  another component's is a design lint error.

### Since

beta (#154)

## States in CSS

`:state(name)` styles a state the component declares with `@state` ([components.md](components.md),
#132); under `baseline-2024` the design build also emits `[data-state-name]`.

**Landed** (#132) for `:state(name)` written in a theme or a page. The `baseline-2024` selector comes
with the `target` option (#121). `:scope` inside a `<style scoped>` is the host since #152, so
`:scope:state(…)` reaches it.

## Design CSS extensions (the `@pdxui/design` themes)

### `@pdx-theme`

```ebnf
ThemeBlock ::= "@pdx-theme" S KebabName S? "{" CssText "}"
```

In a theme file, overrides are written inside `@pdx-theme <name> { … }` and the design build writes
the nested-theme guard on each rule: `[pdx-theme="<name>"] sel:not(:where(<guard>))` (#155). The
built CSS of the thirteen shipped themes is identical to the hand-guarded one. Since: beta (#155).

### Theme behaviours

A theme declares its behaviours as custom properties (`--pdx-card-style: elevated`,
`--pdx-input-style: filled`, …). Under `baseline-2026` component CSS reads them with container style
queries — `@container style(--pdx-card-style: elevated) { … }` — so a nested `pdx-theme` subtree gets
its own behaviours with no script and in the same frame (#156). Under `baseline-2024`, `setTheme`
keeps mirroring them as attributes on `<html>` (alpha). Since: beta (#156).

### Density

`pdx-density="compact|normal|comfort"` on any element sets `--pdx-density-factor` (0.75, 1, 1.25) in
the layer `pdx.preferences`, ordered after `pdx.themes`, so the user's choice overrides a theme's
default factor; without the attribute the theme's own factor applies (#157 — landed). Since: beta (#157).
