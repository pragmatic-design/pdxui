# The PDX UI theme system — a designer's guide

> How a theme is built, what you can change, and why accessibility is guaranteed rather than hoped for.

## In one sentence

A **theme** is a set of **tokens** (values: colours, radii, spacing, fonts, behaviours). Components **have no colours of their own**: they read tokens. Change the tokens and the whole product changes with them — **consistently**, and **accessibly** by construction.

---

## 1. The three levels

```
1. Base tokens       tokens.css          → the "palette" plus the default scales
2. Themes            themes/<name>.css   → each theme redefines some tokens to give it a personality
3. Components        surfaces/ components → read tokens through var(--pdx-*). Never touched to build a theme
```

A designer works at levels **1–2**. Level 3 is a *consumer*: when a component looks wrong, it is almost always a token to fix, not the component.

---

## 2. What a theme defines

**A. Colours** (in OKLCH — see §3)
- `primary`, `accent`
- semantic: `danger`, `success`, `warning`, `info` (plus their `*-text` label colour)
- greys (a 50→950 scale), surfaces (`bg`, `surface`, `inset`), `text`, `muted`, `border`, `focus`

**B. Behaviour tokens** — the **personality levers** (they change the *shape*, not only the colour):
| Token | Values |
|---|---|
| `--pdx-button-radius` | `0` · `0.5rem` · `9999px` (pill) |
| `--pdx-input-style` | `outlined` · `filled` · `underlined` |
| `--pdx-tab-indicator` | `underline` · `pill` |
| `--pdx-card-style` | `bordered` · `elevated` · `flat` |
| `--pdx-accordion-glyph` + `--pdx-accordion-open-transform` | the glyph, and how it rotates when open |
| density | `compact` · `normal` · `comfort` |

**C. Scales**: spacing, radii, **typography** (font plus a modular scale), **shadows** (5 levels), motion.

---

## 3. OKLCH — the colour model

Every colour is `oklch(Lightness Chroma Hue)`:
- **Lightness** 0–1 (0 = black, 1 = white)
- **Chroma** 0–0.4 (saturation: 0 = grey, 0.2 = vivid)
- **Hue** 0–360

Hue reference: `25` red · `85` gold · `155` green · `220` blue · `290` purple · `330` pink.

**Why OKLCH and not HEX/HSL:** it is *perceptually uniform* — lightening by `+0.1` looks like the same amount of lightening on any hue. That makes themes predictable and computable, which is what the engine and the contrast checker work on.

---

## 4. Light and dark

- A `pdx-scheme="light|dark"` attribute on `<html>` picks the scheme.
- Tokens carry both versions: `light-dark(light-value, dark-value)` — the browser chooses.
- In **dark**: dark backgrounds but **never pure black** (`~oklch(0.13)`), **off-white** text (never pure white, which haloes), and semantic colours slightly darker so they stay legible.

> ⚠️ Without `pdx-scheme` set, `light-dark()` does not resolve and the colours fall apart. It is always present in production.

---

## 5. Accessibility — guaranteed, not optional

Every text/background pair meets **WCAG AA** (4.5:1 for normal text, 3:1 for UI elements) **in light AND in dark**.

**The rule for coloured buttons** (it matters):
- **A WHITE label** on every coloured fill (primary, danger, success, info).
- When white is not legible on it, **the FILL is darkened** until it is — a coloured button does **not** get dark text.
- **The one exception is `warning`** (a light yellow), which takes dark text.
- The **info** button, and a filled `.pdx-info` chip or badge, is painted with the **accent**, so its label is **`--pdx-color-accent-text`**: dark where a theme's accent is light. If neither label reaches 4.5:1, the accent is darkened. `secondary` keeps the same fill in dark as in light. The gate checks both pairs.

**The rule for coloured text**:
- A fill colour is **never** a text colour. A fill tuned for a white label is too light for text on the light page and too dark for text on the dark one, and warning's amber is unreadable as text on white. Written in the fill colour, tinted badges, outline and tonal chips, links and error messages fail AA in 26 of 26 theme×scheme combinations.
- Text in a feedback colour uses **`--pdx-color-{primary,accent,danger,success,warning,info}-ink`**, on `bg`, `surface`, `inset` or its own tint.
- A tint behind such text uses **`--pdx-color-{…}-soft`**.
- Both are **derived** from the theme's own colour with relative colour syntax, in `tokens.css`. Ink is darkened in light (L ≤ 0.46) and lightened in dark (L ≥ 0.72). A theme that re-hues danger gets a matching ink and tint without declaring either.
- `--pdx-color-muted` must hold on `bg` and `inset` as well as on `surface`: it carries every description.

An automatic **gate** measures the contrast of every theme: a pair that fails is reported, with its line and its ratio. **Current audit: 14 themes × light/dark → 0 failures.**

Other rules: colour is never the only signal of a state (an icon or a word carries it too); `prefers-reduced-motion` disables the animations; disabled elements are exempt from the contrast requirement.

---

## 6. Two ways to build a theme

**A. By hand (CSS)** — for a signature theme with a strong personality.
Write `themes/<name>.css`, redefining the tokens plus whatever per-component touches it needs (gradients, accents, icons). Material, Cupertino and Fluent are built this way.

**B. Generated by the engine** — for a brand, in one command.
Give it a brand colour and a few options, and it produces a **complete theme, mathematically coherent and WCAG-safe already**:

```bash
pdx theme my-brand --brand=#6442d6 --language=material
# → the theme's full CSS: OKLCH palette + scales + behaviour, validated (--strict)
```

Options: `--language` (material, fluent, cupertino, neutral…), `--accent`, `--neutral` (the hue of the greys), `--density`, `--radius`. The engine resolves hue conflicts on its own (a brand too close to `danger` red, say) and picks the label colours.

---

## 7. The themes that ship (13)

`neutral` (the neutral canvas) · `pragmatic` · `pragmatic-gold` · `material` · `fluent` · `cupertino` · `metro` · `corporate` · `playful` · `cyberpunk` · `editorial` · `neumorphic` · `glass` — the 13 imported by `pragmatic-design.css`.

> ℹ️ **`neutral` is one name for two things, deliberately aligned:** the **shipped canvas theme** (`themes/neutral.css`, active even with no `[pdx-theme]`) and the **engine's default design language** (`pdx theme --language=neutral`), used to *generate* a theme from a brand colour. (The 13 shipped stylesheets are still hand-written; the engine does not generate the shipped themes yet.)

The **Pragmatic** themes are a family sharing one design language: filled pill tabs, a `›` chevron breadcrumb, a "premium" hover with lift and glow, Inter/DM Sans.

The **famous** themes (Material, Fluent, Cupertino) follow the official specs — update them by reading the original guidelines, not by eye.

---

## 8. What a designer may change

✅ Brand, accent and semantic colours (in OKLCH) · behaviour tokens (radius, input/tab/card style, icons) · fonts, type scale, radii, shadows.

🚫 Colours picked by eye and out of contrast (the gate rejects them) · inline styles on individual components · hardcoded pure black or white for backgrounds and text.

---

## 9. A workflow that works

1. **Start close**: an existing theme that resembles what you want, or `pdx theme` with your brand colour.
2. **Give it a personality** through the behaviour tokens (radius, input-style, tab/card, icons) — not colour alone.
3. **Check light and dark**, both.
4. **Let the gate speak**: the WCAG check confirms the accessibility, or refuses it.
5. **Screenshot** the components that matter (buttons, forms, cards, tables) in both schemes.

### New-theme checklist
- [ ] Colours: primary, accent, semantic, greys, surfaces, borders, focus
- [ ] Behaviour tokens: button-radius, input-style, tab-indicator, card-style, accordion-glyph
- [ ] Dark mode: every token in `light-dark(...)`, off-white text, semantic fills dark enough for a white label (`warning` excepted)
- [ ] Font and type scale
- [ ] WCAG gate: 0 failures in light and dark
- [ ] Screenshots of the main components, light and dark

---

## 10. What is tokenised and what is not (the honest section)

A theme's **frame** is 100% tokens; its **rich personality** is still partly per-theme CSS. The map below is measured against the 14 themes that exist today.

### ✅ Complete (tokens only)
- **Colours**: all of them
- **Scales**: spacing, radius, typography, shadows (5 levels), durations and easings, z-index
- **Tonal elevation**: levels 2 and 3 are read by dialog/drawer/menu/toast to lift off the background — in dark, higher means lighter (Material 3); in light it stays near the base.
- **Opt-in decoration** (value tokens, off by default, no JS): `--pdx-primary-gradient` (a gradient on primary), `--pdx-button-hover-transform` + `--pdx-button-hover-shadow` (the premium lift/glow). A card's accent edge is the `.pdx-card-accent-*` classes; a single or double focus ring is already a value of `--pdx-focus-ring`.
- **Base behaviour**: `input-style`, `button-radius`, `button/input-min-height`, `tab-indicator` (+ `size`), `card-style`, `focus-ring`, `density-factor`

### 🟡 Partly tokenised
- **Glyphs** (the breadcrumb separator, the accordion icon): the glyph itself is a token (`--pdx-accordion-glyph`, `--pdx-breadcrumb-separator`), but its font-size and weight are still per-theme, written by hand in the `content:` rule.

### ⚪ Declared, and read by nothing

Some tokens exist in `tokens.css` and **no component reads them**: setting one does nothing at all. That is why they do not appear in the §11 tables — a lever that moves nothing, documented beside levers that work, is worse than a missing lever, because the documentation is what makes it look alive.

The list is **measured, not hand-compiled**: `pnpm lint` prints it on every run, and the decision taken about each one — adopt it (a component ought to read it and has the value hardcoded today) or reserve it (the set is real, and adopting it is a design choice) — lives in `packages/core/tests/design-tokens.test.ts`, next to the number it defends. A token that is adopted comes back here with a row of its own.

### ❌ Not tokens yet — the roadmap
Hardcoded patterns counted across the themes: `box-shadow` ×61 · `transform` ×31 · `::after` ×34 · `content:` ×22 · `backdrop-filter` ×18 · `linear-gradient` ×4.

| Gap | Kind | Effort | Note |
|---|---|---|---|
| `--pdx-breadcrumb-separator` (the glyph) | value | low | a partial win — font-size and weight remain |

> **Why value tokens:** the "flags" that look as though they need an attribute plus JS (gradient, hover, accent) are expressible as **value tokens with a neutral default** (`initial`/`none`), read by the component with a fallback → a pure-CSS opt-in, no JS. That is what `primary-gradient` and `button-hover` are; `card-accent` is a class system; and single/double focus is a value of `--pdx-focus-ring`.

### Intrinsically CSS (an escape hatch, and rightly so)
`backdrop-filter` (vibrancy / Liquid Glass, Acrylic / Mica), real **icon glyphs**, and `transform` **animations**. Forcing these into tokens is not worth it: a theme writes them in its own file.

### Where that leaves us
A **neutral or corporate** theme is already 100% tokens. A **strongly styled** theme is still ~50–75% hand-written CSS: every roadmap item we close moves a slice of that CSS into the vocabulary.

---

## 11. Reference — the tokens components read

> Defaults from the base theme. Every theme redefines a subset of them. `light-dark(a,b)` is the
> light/dark pair.

This section is **generated** from `packages/design/src/tokens.css`:

```
node packages/design/scripts/gen-theming-reference.mjs
```

`packages/core/tests/design-tokens.test.ts` regenerates it and compares it with the file on disk, so
a token added to `tokens.css` and not carried here is a red test rather than an oversight nobody
notices. A hand-written copy drifts behind its source, and a reader who finds no row for a token
family concludes it cannot be themed.

Two things the generator decides:

- **colour ramps are abbreviated** — `--pdx-primary-50 … -950` is a single `--pdx-primary-*` row,
  because a ramp is generated from a hue token and twelve rows across seven ramps is noise;
- **tokens nothing reads do not appear** — listing them would be documentation promising a lever
  that moves nothing. The set is the one `unreadTokens()` computes,
  the same one the test asserts a ceiling on. Which they are, and why, is §10.

<!-- BEGIN GENERATED token-reference — node scripts/gen-theming-reference.mjs -->

### Neutral grays

Near-zero chroma for a truly vanilla default.

| Token | Default |
|---|---|
| `--pdx-gray-*` | `scale (50…900/950)` |
| `--pdx-hue-primary` | `260` |
| `--pdx-hue-secondary` | `30` |
| `--pdx-hue-accent` | `170` |
| `--pdx-hue-danger` | `25` |
| `--pdx-hue-warning` | `85` |
| `--pdx-hue-success` | `155` |
| `--pdx-hue-info` | `220` |

### Primary ramp

Uses var(--pdx-hue-primary) so themes adapt automatically.

| Token | Default |
|---|---|
| `--pdx-primary-*` | `scale (50…900/950)` |

### Secondary ramp (inverse brand)

| Token | Default |
|---|---|
| `--pdx-secondary-*` | `scale (50…900/950)` |

### Accent ramp

| Token | Default |
|---|---|
| `--pdx-accent-*` | `scale (50…900/950)` |

### Danger ramp

| Token | Default |
|---|---|
| `--pdx-danger-*` | `scale (50…900/950)` |

### Warning ramp

| Token | Default |
|---|---|
| `--pdx-warning-*` | `scale (50…900/950)` |

### Success ramp

| Token | Default |
|---|---|
| `--pdx-success-*` | `scale (50…900/950)` |

### Info ramp

| Token | Default |
|---|---|
| `--pdx-info-*` | `scale (50…900/950)` |

### Surfaces

| Token | Default |
|---|---|
| `--pdx-color-bg` | `light-dark(var(--pdx-gray-50), var(--pdx-gray-950))` |
| `--pdx-color-surface` | `light-dark(white, var(--pdx-gray-900))` |
| `--pdx-color-inset` | `light-dark(var(--pdx-gray-100), var(--pdx-gray-800))` |
| `--pdx-color-overlay` | `light-dark(white, var(--pdx-gray-800))` |

### Backdrop

The dimmed page behind a dialog, drawer, sheet or palette, one value in both schemes; -strong, the page all but gone behind an image lightbox.

| Token | Default |
|---|---|
| `--pdx-color-backdrop` | `oklch(0 0 0 / 0.5)` |
| `--pdx-color-backdrop-strong` | `oklch(0 0 0 / 0.9)` |

### Tonal elevation (Material 3). In DARK, higher elevation = LIGHTER surface —

| Token | Default |
|---|---|
| `--pdx-surface-2` | `light-dark(oklch(0.995 0.002 260), oklch(0.205 0.010 260))` |
| `--pdx-surface-3` | `light-dark(oklch(0.990 0.003 260), oklch(0.225 0.012 260))` |

### Text

| Token | Default |
|---|---|
| `--pdx-color-text` | `light-dark(var(--pdx-gray-900), var(--pdx-gray-100))` |

### Muted is gray-500, capped at L 0.50 in light: six themes' gray-500 read 4.0–4.45 on their

| Token | Default |
|---|---|
| `--pdx-color-muted` | `light-dark(oklch(from var(--pdx-gray-500) min(l, 0.50) c h), var(--pdx-gray-400))` |

### Subtle is not a text colour

Borders, dividers, decorative icons and fills only.

| Token | Default |
|---|---|
| `--pdx-color-subtle` | `light-dark(var(--pdx-gray-400), var(--pdx-gray-600))` |

### Borders

| Token | Default |
|---|---|
| `--pdx-color-border` | `light-dark(var(--pdx-gray-200), var(--pdx-gray-700))` |
| `--pdx-color-border-strong` | `light-dark(var(--pdx-gray-300), var(--pdx-gray-600))` |

### Neutral charcoal primary

Functional, deliberately unbranded.

| Token | Default |
|---|---|
| `--pdx-color-primary` | `oklch(0.35 0.02 260)` |
| `--pdx-color-primary-hover` | `oklch(0.28 0.03 260)` |
| `--pdx-color-primary-text` | `oklch(0.98 0.002 260)` |

### The secondary fill carries a near-white label, so it stays as dark in dark as in light

The.

| Token | Default |
|---|---|
| `--pdx-color-secondary` | `light-dark(oklch(0.55 0.18 30), oklch(0.55 0.16 30))` |
| `--pdx-color-secondary-hover` | `light-dark(oklch(0.48 0.20 30), oklch(0.48 0.18 30))` |
| `--pdx-color-secondary-text` | `oklch(0.98 0.01 30)` |
| `--pdx-color-accent` | `light-dark(oklch(0.55 0.12 170), oklch(0.65 0.12 170))` |
| `--pdx-color-accent-hover` | `light-dark(oklch(0.48 0.14 170), oklch(0.58 0.14 170))` |

### The label on an accent FILL

The info button, a filled info chip or badge are painted with.

| Token | Default |
|---|---|
| `--pdx-color-accent-text` | `light-dark(white, var(--pdx-gray-900))` |
| `--pdx-color-danger` | `light-dark(oklch(0.55 0.20 25), oklch(0.575 0.18 25))` |
| `--pdx-color-danger-hover` | `light-dark(oklch(0.48 0.22 25), oklch(0.50 0.20 25))` |
| `--pdx-color-warning` | `light-dark(oklch(0.75 0.15 85), oklch(0.78 0.12 85))` |
| `--pdx-color-warning-hover` | `light-dark(oklch(0.68 0.17 85), oklch(0.72 0.14 85))` |

### danger/success/info fills darkened (esp. dark scheme 0.65→~0.53) so a WHITE label

| Token | Default |
|---|---|
| `--pdx-color-success` | `light-dark(oklch(0.52 0.18 155), oklch(0.53 0.15 155))` |
| `--pdx-color-success-hover` | `light-dark(oklch(0.45 0.20 155), oklch(0.46 0.18 155))` |
| `--pdx-color-info` | `light-dark(oklch(0.52 0.16 220), oklch(0.53 0.14 220))` |
| `--pdx-color-info-hover` | `light-dark(oklch(0.45 0.18 220), oklch(0.46 0.16 220))` |

### Semantic button label colors. danger/success/info keep a WHITE label in both

| Token | Default |
|---|---|
| `--pdx-color-danger-text` | `white` |
| `--pdx-color-success-text` | `white` |
| `--pdx-color-warning-text` | `var(--pdx-gray-900)` |
| `--pdx-color-info-text` | `white` |

### A colour as TEXT, and the tint behind it. A fill cannot double as a text

| Token | Default |
|---|---|
| `--pdx-color-primary-ink` | `light-dark(oklch(from var(--pdx-color-primary) min(l, 0.46) min(c, 0.15) h), oklch(from var(--pdx-color-primary) max(l, 0.72) min(c, 0.12) h))` |
| `--pdx-color-accent-ink` | `light-dark(oklch(from var(--pdx-color-accent) min(l, 0.46) min(c, 0.15) h), oklch(from var(--pdx-color-accent) max(l, 0.72) min(c, 0.12) h))` |
| `--pdx-color-danger-ink` | `light-dark(oklch(from var(--pdx-color-danger) min(l, 0.46) min(c, 0.15) h), oklch(from var(--pdx-color-danger) max(l, 0.72) min(c, 0.12) h))` |
| `--pdx-color-success-ink` | `light-dark(oklch(from var(--pdx-color-success) min(l, 0.46) min(c, 0.15) h), oklch(from var(--pdx-color-success) max(l, 0.72) min(c, 0.12) h))` |
| `--pdx-color-warning-ink` | `light-dark(oklch(from var(--pdx-color-warning) min(l, 0.46) min(c, 0.15) h), oklch(from var(--pdx-color-warning) max(l, 0.72) min(c, 0.12) h))` |
| `--pdx-color-info-ink` | `light-dark(oklch(from var(--pdx-color-info) min(l, 0.46) min(c, 0.15) h), oklch(from var(--pdx-color-info) max(l, 0.72) min(c, 0.12) h))` |
| `--pdx-color-primary-soft` | `light-dark(oklch(from var(--pdx-color-primary) 0.94 min(c, 0.05) h), oklch(from var(--pdx-color-primary) 0.27 min(c, 0.05) h))` |
| `--pdx-color-accent-soft` | `light-dark(oklch(from var(--pdx-color-accent) 0.94 min(c, 0.05) h), oklch(from var(--pdx-color-accent) 0.27 min(c, 0.05) h))` |
| `--pdx-color-danger-soft` | `light-dark(oklch(from var(--pdx-color-danger) 0.94 min(c, 0.05) h), oklch(from var(--pdx-color-danger) 0.27 min(c, 0.05) h))` |
| `--pdx-color-success-soft` | `light-dark(oklch(from var(--pdx-color-success) 0.94 min(c, 0.05) h), oklch(from var(--pdx-color-success) 0.27 min(c, 0.05) h))` |
| `--pdx-color-warning-soft` | `light-dark(oklch(from var(--pdx-color-warning) 0.94 min(c, 0.05) h), oklch(from var(--pdx-color-warning) 0.27 min(c, 0.05) h))` |
| `--pdx-color-info-soft` | `light-dark(oklch(from var(--pdx-color-info) 0.94 min(c, 0.05) h), oklch(from var(--pdx-color-info) 0.27 min(c, 0.05) h))` |

### Focus

Single ring via outline (no double-border effect).

| Token | Default |
|---|---|
| `--pdx-color-focus` | `oklch(0.65 0.20 250)` |
| `--pdx-focus-ring` | `0 0 0 3px oklch(from var(--pdx-color-focus) l c h / 0.4)` |

### C. Spacing (density-scaled)

| Token | Default |
|---|---|
| `--pdx-density-factor` | `1` |
| `--pdx-space-2xs` | `calc(0.25rem * var(--pdx-density-factor))` |
| `--pdx-space-xs` | `calc(0.5rem * var(--pdx-density-factor))` |
| `--pdx-space-sm` | `calc(0.75rem * var(--pdx-density-factor))` |
| `--pdx-space-md` | `calc(1rem * var(--pdx-density-factor))` |
| `--pdx-space-lg` | `calc(1.5rem * var(--pdx-density-factor))` |
| `--pdx-space-xl` | `calc(2.5rem * var(--pdx-density-factor))` |
| `--pdx-space-2xl` | `calc(4rem * var(--pdx-density-factor))` |
| `--pdx-space-3xl` | `calc(4.5rem * var(--pdx-density-factor))` |
| `--pdx-row-height` | `auto` |
| `--pdx-row-cell-height` | `var(--pdx-row-height)` |
| `--pdx-nav-item-height` | `auto` |
| `--pdx-section-height` | `calc(48px * var(--pdx-density-factor))` |
| `--pdx-control-height` | `calc(32px * var(--pdx-density-factor))` |

### A modal's geometry, so an application can state it

| Token | Default |
|---|---|
| `--pdx-dialog-width-sm` | `360px` |
| `--pdx-dialog-width-md` | `480px` |
| `--pdx-dialog-width-lg` | `640px` |
| `--pdx-dialog-width-xl` | `800px` |
| `--pdx-dialog-header-height` | `auto` |
| `--pdx-dialog-footer-height` | `auto` |

### The two spacing values a page has: the gutter AROUND a surface and the inset INSIDE it

| Token | Default |
|---|---|
| `--pdx-gutter` | `calc(24px * var(--pdx-density-factor))` |
| `--pdx-inset` | `calc(16px * var(--pdx-density-factor))` |

### D. Typography

| Token | Default |
|---|---|
| `--pdx-font-sans` | `'Inter', system-ui, -apple-system, sans-serif` |
| `--pdx-font-heading` | `'Manrope', system-ui, sans-serif` |
| `--pdx-font-mono` | `'JetBrains Mono', 'Fira Code', 'Consolas', monospace` |

### Line heights

| Token | Default |
|---|---|
| `--pdx-line-tight` | `1.25` |
| `--pdx-line-normal` | `1.6` |
| `--pdx-line-loose` | `1.8` |

### Font weights

| Token | Default |
|---|---|
| `--pdx-weight-normal` | `400` |
| `--pdx-weight-medium` | `500` |
| `--pdx-weight-semibold` | `600` |
| `--pdx-weight-bold` | `700` |

### E. Radius

| Token | Default |
|---|---|
| `--pdx-radius-sm` | `0.25rem` |
| `--pdx-radius-md` | `0.5rem` |
| `--pdx-radius-lg` | `0.75rem` |
| `--pdx-radius-xl` | `1rem` |
| `--pdx-radius-full` | `9999px` |

### Shadow color adapts to scheme via light-dark() on the color portion

| Token | Default |
|---|---|
| `--pdx-shadow-color` | `light-dark(oklch(0 0 0 / 0.08), oklch(0 0 0 / 0.4))` |
| `--pdx-shadow-sm` | `0 1px 2px var(--pdx-shadow-color)` |
| `--pdx-shadow-md` | `0 4px 6px -1px var(--pdx-shadow-color), 0 2px 4px -2px var(--pdx-shadow-color)` |
| `--pdx-shadow-lg` | `0 10px 15px -3px var(--pdx-shadow-color), 0 4px 6px -4px var(--pdx-shadow-color)` |
| `--pdx-shadow-xl` | `0 20px 25px -5px var(--pdx-shadow-color), 0 8px 10px -6px var(--pdx-shadow-color)` |

### Easings (Material 3 spec)

| Token | Default |
|---|---|
| `--pdx-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--pdx-ease-decelerate` | `cubic-bezier(0, 0, 0, 1)` |
| `--pdx-ease-accelerate` | `cubic-bezier(0.3, 0, 1, 1)` |

### Legacy aliases (backward compat)

| Token | Default |
|---|---|
| `--pdx-ease` | `var(--pdx-ease-standard)` |
| `--pdx-transition` | `var(--pdx-duration) var(--pdx-ease)` |

### J. Border, Opacity, Focus

Extracted from hardcoded values.

| Token | Default |
|---|---|
| `--pdx-border-width` | `1px` |
| `--pdx-border-width-focus` | `2px` |

### State layer opacities (Material 3 spec): hover 8%, focus 10%, pressed 10%, dragged 16%

| Token | Default |
|---|---|
| `--pdx-opacity-disabled` | `0.5` |
| `--pdx-focus-width` | `3px` |
| `--pdx-focus-offset` | `2px` |

### Input

| Token | Default |
|---|---|
| `--pdx-input-style` | `outlined` |
| `--pdx-input-min-height` | `2.5rem` |
| `--pdx-input-border-width` | `var(--pdx-border-width)` |

### Form field

The space a pdx-form-field leaves below itself, in any container.

| Token | Default |
|---|---|
| `--pdx-form-field-gap` | `var(--pdx-space-md)` |

### Button

Shape is expressed by --pdx-button-radius (what the CSS actually reads);.

| Token | Default |
|---|---|
| `--pdx-button-min-height` | `2.5rem` |

### Floating elements (popover, tooltip, dropdown, select, autocomplete)

| Token | Default |
|---|---|
| `--pdx-float-offset` | `4px` |
| `--pdx-float-radius` | `var(--pdx-radius-md)` |
| `--pdx-float-shadow` | `var(--pdx-shadow-lg)` |

### Tabs

| Token | Default |
|---|---|
| `--pdx-tab-indicator` | `underline` |
| `--pdx-tab-indicator-size` | `2px` |

### Cards

`--pdx-card-style` picks the STRUCTURE; these three carry the VALUES.

| Token | Default |
|---|---|
| `--pdx-card-style` | `bordered` |
| `--pdx-card-radius` | `var(--pdx-radius-lg)` |
| `--pdx-card-shadow` | `var(--pdx-shadow-sm)` |
| `--pdx-card-border-color` | `var(--pdx-color-border)` |

### Accordion

The disclosure glyph + its open-state transform are behavior.

| Token | Default |
|---|---|
| `--pdx-accordion-glyph` | `'+'` |
| `--pdx-accordion-glyph-size` | `var(--pdx-text-lg)` |
| `--pdx-accordion-open-transform` | `rotate(45deg)` |

### Breadcrumb

Single source of truth for the separator glyph, read by BOTH.

| Token | Default |
|---|---|
| `--pdx-breadcrumb-separator` | `'/'` |

### Table header

The most theme-specific surface in a table. Tokenized so a theme.

| Token | Default |
|---|---|
| `--pdx-table-header-font` | `inherit` |
| `--pdx-table-header-weight` | `var(--pdx-weight-semibold)` |
| `--pdx-table-header-size` | `var(--pdx-text-xs)` |
| `--pdx-table-header-color` | `var(--pdx-color-muted)` |
| `--pdx-table-header-bg` | `transparent` |
| `--pdx-table-header-transform` | `uppercase` |
| `--pdx-table-header-letter-spacing` | `0.03em` |
| `--pdx-table-header-border-width` | `2px` |
| `--pdx-table-header-border-color` | `var(--pdx-color-border)` |

### Decorative leves

OPT-IN, neutral by default (no JS, no attributes). A theme sets.

| Token | Default |
|---|---|
| `--pdx-primary-gradient` | `initial` |
| `--pdx-button-hover-transform` | `none` |
| `--pdx-button-hover-shadow` | `none` |

### Toggle/Switch

| Token | Default |
|---|---|
| `--pdx-toggle-width` | `2.75rem` |
| `--pdx-toggle-height` | `1.5rem` |

### Checkbox/Radio

| Token | Default |
|---|---|
| `--pdx-check-size` | `1.25rem` |
| `--pdx-check-radius` | `var(--pdx-radius-sm)` |

### Tokens themes declare with no default here: the components read them with a fallback

| Token | Default |
|---|---|
| `--pdx-button-radius` | `initial` |
| `--pdx-select-caret-size` | `initial` |
| `--pdx-select-caret-stroke` | `initial` |
| `--pdx-weight-heading` | `initial` |

### Fluid type scale

| Token | Default |
|---|---|
| `--pdx-text-xs` | `clamp(0.7rem, 0.65rem + 0.25vw, 0.75rem)` |
| `--pdx-text-sm` | `clamp(0.875rem, 0.825rem + 0.25vw, 0.9375rem)` |
| `--pdx-text-base` | `clamp(0.925rem, 0.875rem + 0.25vw, 1rem)` |
| `--pdx-text-lg` | `clamp(1.05rem, 1rem + 0.25vw, 1.125rem)` |
| `--pdx-text-xl` | `clamp(1.15rem, 1.05rem + 0.5vw, 1.25rem)` |
| `--pdx-text-2xl` | `clamp(1.35rem, 1.2rem + 0.75vw, 1.5rem)` |
| `--pdx-text-3xl` | `clamp(1.6rem, 1.4rem + 1vw, 1.875rem)` |
| `--pdx-text-display` | `clamp(2rem, 1.7rem + 1.5vw, 2.5rem)` |

### G. Z-index scale

| Token | Default |
|---|---|
| `--pdx-z-popover` | `150` |
| `--pdx-z-sticky` | `200` |
| `--pdx-z-tooltip` | `250` |
| `--pdx-z-overlay` | `300` |
| `--pdx-z-toast` | `500` |

### H. Max-width (for pdx-center)

| Token | Default |
|---|---|
| `--pdx-max-xs` | `20rem` |
| `--pdx-max-sm` | `30rem` |
| `--pdx-max-md` | `48rem` |
| `--pdx-max-lg` | `64rem` |
| `--pdx-max-xl` | `80rem` |
| `--pdx-max-2xl` | `96rem` |

### Durations. Scaled by --pdx-motion-scale (default 1), which is what makes it a lever instead

| Token | Default |
|---|---|
| `--pdx-duration-fast` | `calc(100ms * var(--pdx-motion-scale, 1))` |
| `--pdx-duration-base` | `calc(200ms * var(--pdx-motion-scale, 1))` |
| `--pdx-duration-slow` | `calc(350ms * var(--pdx-motion-scale, 1))` |
| `--pdx-duration` | `var(--pdx-duration-base)` |

### Motion scale

0 = no motion, 1 = normal.

| Token | Default |
|---|---|
| `--pdx-motion-scale` | `1` |

### Touch target

The smallest a command inside a component may be: a menu item, an option, a ✕.

| Token | Default |
|---|---|
| `--pdx-target-min-fine` | `24px` |
| `--pdx-target-min-coarse` | `44px` |
| `--pdx-target-min` | `var(--pdx-target-min-fine)` |

<!-- END GENERATED token-reference -->
