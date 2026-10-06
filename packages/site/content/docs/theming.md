---
title: Theming
description: "A different look without touching components: tokens, themes, archetypes, dark mode, density."
order: 15
---

# Theming

The central idea of theming in PDX: components **don't know colors**. They never write
`color: #1a73e8`. They read **tokens** (`var(--pdx-color-primary)`), and it's the *themes* that decide
what that token is worth. So you change the whole look of the app — colors, radii, shadows, fonts —
**without touching a line of the components**, and even at runtime.

The architecture has three layers:

```text
  pdx.tokens      base (grays, spacing, fonts) — no brand colors
      ▲
  pdx.themes      each theme defines --pdx-color-primary, accent, radius, shadow…
      ▲
  pdx.components  component styles use var(--pdx-*) — never hardcoded values
```

This page is the practical view. [Design theory](/docs/design-theory) is *why* it works, and
[Making a theme](/docs/making-a-theme) is how to build your own.

## Activating a theme

Two attributes on `<html>`:

```html
<html pdx-theme="pragmatic-gold" pdx-scheme="dark">
```

`pdx-theme` picks the token set; `pdx-scheme` (`light`/`dark`) decides which branch of the
`light-dark()` colors to use.

Some themes also set **structural** attributes — `pdx-tab-style="pill"`,
`pdx-card-style="elevated"`, `pdx-input-style="filled"`, `pdx-input-focus="bottom"` — for the
variants that are a different shape rather than a different value. A generated theme hands them
to you in `theme.attributes`.

## Letting a user pick one

Both attributes can be set by hand, and **you should not**:

```ts
import { setTheme, setScheme, toggleDarkMode, currentTheme, currentScheme } from '@pdxui/core';

setTheme('pragmatic-gold');
setScheme('dark');
toggleDarkMode();              // the other one
```

`setTheme` does three things, and only the first is the attribute:

1. sets `pdx-theme` on `<html>`;
2. **persists it**, so the choice survives a reload;
3. **re-derives the structural attributes** above from the new theme's tokens.

The third is the one that bites. Those attributes are read by CSS selectors, and a theme switch that
sets only `pdx-theme` leaves the *previous* theme's behaviour in place: a card keeps a border it
should have lost, an input keeps the wrong fill. That is not hypothetical — it is what made 36 of
1591 screenshots differ when a test re-themed a page by hand.

`currentTheme` and `currentScheme` are **signals**, so a picker binds to them and follows a change
made anywhere:

```pdx
<template>
  <pdx-select :value="currentTheme()" @pdx-change="e => setTheme(e.detail.value)" :options="themes" />
  <pdx-button @click="toggleDarkMode">{{ currentScheme() === 'dark' ? '☀' : '☾' }}</pdx-button>
</template>
```

`getTheme()` and `getScheme()` are the plain reads, for code that is not in a reactive context and
just wants to know — a one-off decision, a value to send with a bug report. In a template or an
effect use the signals, or the UI will not follow a change.

On startup the stored choice is applied for you: a theme and a scheme saved earlier are read back
before the first paint, and a `pdx-scheme` you wrote in the HTML yourself is adopted rather than
overwritten. With neither, the system preference decides.

### Reading a token back

`cssVar(name, initial, target?)` is a signal over a CSS custom property's computed value — for the
cases where JavaScript has to know what the theme resolved to, a canvas or a chart being the usual
ones:

```ts
const accent = cssVar('--pdx-color-accent', '#000');
chart.setStroke(accent());
```

`createTokenBridge(prefix?, target?)` is the bulk form over a whole prefix, and `applyTheme(tokens,
target?)` writes a set of custom properties onto an element — a subtree themed differently from the
page, which the [nested-theme guard](/docs/making-a-theme) is about.

## The tokens

They're CSS variables `--pdx-*`: colors (`--pdx-color-primary`, `--pdx-color-text`, `--pdx-color-bg`…),
spacing (`--pdx-space-sm/md/lg…`), radii, fonts, shadows. When you customize, you **override a token**,
not a component:

```css
:root { --pdx-color-primary: oklch(0.55 0.2 260); }
```

Every component using `primary` adapts. Colors are in **OKLCH** (`oklch(lightness chroma hue)`) because
it's perceptually uniform: raising the *lightness* brightens predictably on any hue — handy for
generating a theme's variants.

### Label colors are tokens too

Every colored fill ships with the color its label must use:
`--pdx-color-primary-text`, `-danger-text`, `-success-text`, `-info-text`, `-warning-text`.

The rule is **white on every colored fill, with warning the single exception** (its pale yellow
keeps a dark label). If white can't reach 4.5:1 on a fill, the answer is to **darken the fill**,
not to darken the label — a dark label on a saturated button isn't what a primary button looks
like anywhere. [Design theory §3](/docs/design-theory) explains the mechanism, and why the naive
version of this rule silently shipped illegible buttons.

Use the token. Writing `color: white` on a button happens to be right today and is unowned by
the system tomorrow.

### Behavior tokens

Not every difference between two themes is a color. A second family of tokens carries the
decisions that change *shape*:

| Token | Decides |
|---|---|
| `--pdx-button-radius` | Button corners, independently of the global radius ramp |
| `--pdx-button-min-height` / `--pdx-input-min-height` | Control heights (44px in Cupertino, per Apple HIG) |
| `--pdx-input-style` | `outlined` / `filled` / `underlined` |
| `--pdx-tab-indicator` / `-size` | `underline` or `pill`, and its thickness |
| `--pdx-card-style` | `bordered` / `elevated` / `flat` |
| `--pdx-accordion-glyph` / `-open-transform` | The glyph, and how it moves when open |
| `--pdx-breadcrumb-separator` | The separator character |
| `--pdx-table-header-*` | Transform, tracking, weight, size, color, rules |
| `--pdx-opacity-disabled` | How far a disabled control fades |
| `--pdx-border-width` / `-focus` | Border weights |

Material has pill buttons on rounded cards; Metro has zero radius and no shadows; Cupertino has
large-radius buttons and 44pt targets. These tokens are how a theme says so.

## The built-in themes

Thirteen themes: `neutral` (the canvas), `material`, `fluent`, `cupertino`, `pragmatic`,
`pragmatic-gold`, `corporate`, `playful`, `cyberpunk`, `editorial`, `neumorphic`, `glass`,
`metro`. The "famous" themes follow the original specs (Material 3, Fluent 2, Apple HIG,
Windows 8 Modern UI), not rough imitations.

Twelve of them are also available as **archetypes** to the generator — a starting point that
keeps that design language and takes *your* brand color. `pragmatic-gold` is a shipped theme
rather than an archetype: it is the `pragmatic` language with a different brand.

### Shipping one instead of thirteen

`import '@pdxui/design'` gives you all of them, which is what you want while you are choosing
and what you want if the app lets the **user** choose. An application that renders one theme is
paying for twelve it cannot reach — **9.4 KB gzipped** on the showcase, measured, and it is
render-blocking CSS, so it is the first paint and not only the transfer.

Take the base and the one you use:

```ts
import '@pdxui/design/base';        // tokens, layout, surfaces, and the @layer order
import '@pdxui/design/themes/pragmatic';
```

Import several if you offer a few — or `@pdxui/design/themes` for all of them, which is what an
app with a theme picker wants. The base goes in once either way. Both halves are needed: `base` is
where the `@layer` declaration lives, and that declaration is what makes **your** unlayered CSS beat
everything the design system ships, with no `!important` anywhere.

**The component styles are not in `base`.** Each component imports its own — `@pdxui/ui/data-grid`
brings `@pdxui/design/components/data-grid` with it — so an app ships the styles of what it
renders. You write nothing: the compiler already auto-imports the components your templates use, and
their CSS travels with them. On the showcase that is another **25.7 KB gzipped**, which is why its
whole stylesheet is 18.3 KB and not 53.4.

## Dark mode

It's not a separate theme: it's the `scheme` dimension. Tokens use `light-dark(light-value,
dark-value)`, and `pdx-scheme` decides which. In dark the grays invert: the background goes dark, the
text light.

**In twelve of the thirteen themes the primary fill is the same colour in both schemes**, and that is
a consequence of the label rule above rather than an oversight. A white label fixes the ceiling of the
fill's lightness at about L 0.52–0.58 in *either* scheme — above it the white drops below 4.5:1 — and
most themes sit at 4.51–4.81, tuned to that edge. The scheme changes surfaces and text; it does not
change the brand colour.

The rule underneath is the one to carry, because it is what makes the exception legal: **a fill and
its label move together, or neither moves.** `editorial` is the one that moves — a near-black blue
behind a white label in light, a pale gold behind a near-black label in dark — and it flips
`--pdx-color-primary` and `--pdx-color-primary-text` in the same breath. A theme that brightened only
the fill would ship a label nobody can read: brightening the primaries in dark takes white-on-primary
to 2.44–3.19:1.

> **Gotcha.** Never hardcode `white`/`black` as background or text: you'd use a color that doesn't
> follow the scheme. Use `var(--pdx-color-bg)` / `var(--pdx-color-text)`. (The one exception is
> the label on a colored fill — and that has its own token, see above.)

Check both schemes whenever you change anything. A contrast pair can pass in light and fail in
dark; that is the most common way a theme ships broken.

## Density

The same UI, more compact or more airy, without redesigning anything. Three levels (`compact`,
`normal`, `comfort`) via a factor:

```text
height = calc(var(--pdx-*-min-height) * var(--pdx-density-factor))
```

with `--pdx-density-factor` = 0.75 / 1 / 1.25. Change the factor and every control tightens or widens
consistently — useful for dense dashboards vs touch interfaces.

> There are **two** densities and they are not the same knob. The one above is a *runtime*
> multiplier you can change live. The generator's `density` option (`0.85 / 1 / 1.15`) multiplies
> the spacing values when a theme is produced and bakes them into it. Use the runtime factor for
> a user preference; use the generator option when a theme is inherently dense.

## Your own theme

Three ways, one engine — all produce the same CSS:

- **[Theme Builder](https://themebuilder.pdxui.com/)** — pick a brand and an archetype, watch
  every component restyle, export CSS or DTCG.
- **`pdx theme acme --brand "#6442d6" --language material`** — one command, WCAG-gated, exits
  non-zero on failure.
- **`createTheme()` from `@pdxui/design/engine`** — when a theme is data in your app.

Shipping one is a CSS file plus an attribute:

```ts
import '@pdxui/design';
import './themes/acme.css';    // after, so it wins
```

```html
<html pdx-theme="acme" pdx-scheme="light">
```

Full walkthrough, including the WCAG gate and DTCG interchange:
[Making a theme](/docs/making-a-theme).

## In practice

- **Re-brand** → override the tokens (`--pdx-color-primary`…), not the components.
- **Label on a colored button** → `--pdx-color-*-text`, never a literal.
- **Dark mode** → `pdx-scheme="dark"`; use tokens, never `white`/`black`; verify both schemes.
- **Compact** → `--pdx-density-factor`.
- **Change everything live** → `setAttribute('pdx-theme', …)` at runtime.
- **A theme of your own** → generate it; don't hand-write 200 tokens.
