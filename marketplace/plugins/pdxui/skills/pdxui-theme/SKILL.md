---
name: pdxui-theme
description: "Theme and brand a PDX app: generate a WCAG-AA theme from one brand color with `npx pdx theme`, pick one of the 13 shipped themes, use the semantic tokens, dark mode and density. Use when branding an app, editing a theme, choosing a token, or when a theme does not apply."
---

# Pragmatic theming (brand an app, generate a theme)

Theming is **engine-generated, not hand-written**: one brand color + a design language →
a full OKLCH palette, scales, behavior tokens, and a **WCAG-AA gate** that fails the build
if a text/label pair is unreadable. You almost never write theme CSS by hand.

> **Golden rule: style ONLY with tokens** (`var(--pdx-color-*)`, `--pdx-space-*`, `--pdx-radius-*`,
> `--pdx-shadow-*`). A hardcoded color (`#fff`, `white`, `oklch(...)` inline) breaks dark mode and
> every theme at once. There are **216 tokens but only ~30 you actually pick from** — see below.

## 1. Decide the path first

| Situation | Do this |
|---|---|
| "Make it look like our brand" | **Generate**: `pdx theme` with your brand hex (§2). This is the default answer. |
| "Use a known look" (Material/Fluent/Apple/Metro…) | Use a **shipped theme** — set `pdx-theme="material"`, write no CSS (§4). |
| "Our brand, but in the Material style" | Generate with `--language=material` — brand × archetype (§3). |
| "Tweak one detail of an existing theme" | Add a thin CSS override on `[pdx-theme="x"]`, or `cssOverrides` in `createTheme` (§7). |
| "Change the whole app's spacing/roundness" | Behavior tokens + `--density`/`--radius`, not per-component CSS (§6). |

## 2. The loop: generate → validate → apply

```bash
# In a consumer app. The CLI is a dev dependency, and @pdxui/framework does NOT include it:
# without this line npx looks for a public package called `pdx` and fails with a 404.
npm i -D @pdxui/cli
npx pdx theme acme --brand=#6442d6 --language=material --out=src/theme-acme.css
```

Flags: `--brand` (**required — `#hex` or `oklch(L C H)`**; hex is sRGB-only, so a vivid wide-gamut brand
gets clipped before the engine sees it — a saturated blue measured a −0.054 chroma / 13° hue loss, so
pass OKLCH for those) · `--language` (§3, default `neutral`) · `--accent` (same forms; auto if omitted —
the auto value is a derived complement, so pass it when the brand has a specific companion color)
· `--neutral=<hue 0-360>` (gray tint; **by default every gray AND surface is tinted with your brand
hue** — pass this to decouple them) · `--density compact|normal|comfort` (scales `--pdx-space-*` only,
see §6) · `--radius sharp|rounded|pill` · `--out` (file; **stdout otherwise, and `--quiet` only
suppresses the report, not the CSS**).

**Strict mode is ON by default** → exit ≠ 0 when a pair fails the WCAG gate. That is what makes this an
**agent/CI loop**: generate → gate → non-zero means *fix the input* (brand/language), not the CSS. To
emit anyway, pass **`--no-strict`** (there is no `--strict` flag to type; it is the default).

Then apply — the CSS block is scoped to `[pdx-theme="acme"]`:

```html
<html pdx-theme="acme" pdx-scheme="light">
<script type="module">
  import '@pdxui/design';   // FIRST — base tokens/reset/components/shipped themes
  import './theme-acme.css';    // then your generated theme (partial override)
</script>
```

> ⚠️ **The generated file is a PARTIAL override — `@pdxui/design` must be imported first.** It sets
> the palettes, hues, semantic `bg/surface/text/muted/border/primary/danger/success/warning/info(+ -text)`
> and behavior tokens, but **not** `--pdx-color-secondary*`, `--pdx-color-subtle`, most `*-hover`,
> `--pdx-text-display`, `--pdx-transition` — those fall back to base `tokens.css`. Consequence:
> **`secondary` is not brand-derived** (it keeps the stock hue). If your brand needs a specific
> secondary, set it yourself via `cssOverrides` (§7) or a small CSS override.

## 3. Design languages (the archetype = style WITHOUT your color)

`--language=X` picks behavior + scale + fonts + glyphs; **your brand supplies the color**. Same
language + different brands = same personality, different palette.

`neutral` (unopinionated canvas — the default) · `material` (M3: pill buttons, filled inputs, elevation)
· `fluent` (compact, 32px controls, double-ring focus) · `cupertino` (Apple HIG, 44pt targets, ultra-soft
shadows) · `metro` (Win8: zero radius, flat, uppercase) · `corporate` (dense enterprise, 36px controls)
· `playful` (large radius, bouncy) · `cyberpunk` (neon, underlined inputs, zero radius) · `editorial`
(serif headings, underlined inputs) · `neumorphic` (soft inset/outset shadows) · `glass` (translucent,
blur) · `pragmatic` (house style: gradient primary, pill tabs, chevron breadcrumb).

**A language also picks the control height.** Choosing one is choosing a density, so choose it knowingly:
an app generated with `corporate` or `fluent` gets smaller inputs and buttons than the 40px base, and a
reader of that app will see it. What each language sets (`--pdx-input-min-height` /
`--pdx-button-min-height`; one figure when both are the same):

| Language | Controls |
|---|---|
| `neutral` | 40px |
| `material` | 56px / 40px |
| `fluent` | 32px |
| `cupertino` | 44px |
| `metro` | 32px |
| `corporate` | 36px |
| `playful` | 44px |
| `cyberpunk` | 40px |
| `editorial` | 40px |
| `neumorphic` | 40px |
| `glass` | 40px |
| `pragmatic` | 40px |

`fluent` and `metro` are 32px because their specs are (Fluent medium, Metro).

**A shipped theme renders the figure above, factor or no factor.** The height is used as
`min-height × --pdx-density-factor`, and seven shipped themes set a factor of their own:
`cyberpunk` 0.85 · `corporate` 0.88 · `fluent` 0.9 · `metro` 0.9 · `cupertino` 1.1 ·
`neumorphic` 1.15 · `editorial` 1.2. Each of them divides that factor back out of the token
(`calc(2rem / 0.9)`), so the factor scales the SPACING and leaves the controls where the language
puts them — the shipped `corporate` renders 36px, `fluent` 32, `cupertino` the HIG's 44.

Rendering `figure × factor` would put fluent at 28.8px and cupertino at 48.4 — overshooting a
44px accessibility target. A theme that genuinely wants different controls DECLARES them; it does
not get them from a multiplication.

`pdx-density="compact|comfort"` on an element scales the result again, and that one is meant to.

**The two control heights stop at the host's own control.** They size the input and the button you
write; they do not reach the commands a component carries inside — a menu item, an option, the ✕ of a
dialog, the arrows of a calendar, a grid row. Those follow one token, `--pdx-target-min`: 24px with a
fine pointer (WCAG 2.5.8) and 44px under `@media (pointer: coarse)` (WCAG 2.5.5, Apple HIG), switched in
`tokens.css`. A phone gets 44px targets with no app CSS, and the desktop does not change. A theme tunes
the two values with `--pdx-target-min-fine` and `--pdx-target-min-coarse`; do not set
`--pdx-target-min` itself, or the pointer no longer switches it. Do not write rules on internal classes
(`.pdx-menu-item { min-height: 44px }`) to reach 44: the token already does.

## 4. The 13 shipped themes

`neutral` (canvas — also active when no `pdx-theme` is set) · `pragmatic` · `pragmatic-gold` · `material`
· `fluent` · `cupertino` · `metro` · `corporate` · `playful` · `cyberpunk` · `editorial` · `neumorphic`
· `glass`. All are imported by `@pdxui/design`; activate one with `pdx-theme="<name>"` on `<html>`.

> ⚠️ **Never regenerate `pragmatic` / `pragmatic-gold` from the engine.** They are hand-tuned
> *signature* themes — their exact colors are the brand identity. The engine's label-contrast model
> darkens light fills (a bright gold gets pushed to a dull dark gold). Regenerating them is a
> visible regression. The `pragmatic` **language** exists for applying the style to *other* brands.

## 5. The token surface you style with

**Semantic colors (30 — the whole surface):**
- Neutrals/structure (10): `--pdx-color-` `bg` · `surface` · `inset` · `overlay` · `text` · `muted` ·
  `subtle` · `border` · `border-strong` · `focus`.
- Fills (7 families), each with `-hover`, and with `-text` (the label) **except `accent`**:
  `primary` · `secondary` · `danger` · `success` · `warning` · `info` (base + `-hover` + `-text`) ·
  `accent` (base + `-hover` only — **there is no `--pdx-color-accent-text`**; label an accent fill with
  `--pdx-color-text` or use `primary` if you need a guaranteed label token).

**Other families:** `--pdx-space-{2xs,xs,sm,md,lg,xl,2xl,3xl}` · `--pdx-radius-{sm,md,lg,xl,full}` ·
`--pdx-shadow-{sm,md,lg,xl}` · `--pdx-text-{xs,sm,base,lg,xl,2xl,3xl,display}` · `--pdx-weight-*` ·
`--pdx-font-{sans,heading,mono}` · `--pdx-transition`.

**Button/label contrast rule.** Always take the label from the fill's `-text` token
(`--pdx-color-primary-text`, `…-danger-text`, …); for transparent fills (outline/ghost) use
`--pdx-color-text` / `--pdx-color-muted`. **Never hand-pick a label color.**

⚠️ The *resolved value* differs by domain — do not hardcode an expectation:

| Domain | What `-text` resolves to |
|---|---|
| **Shipped hand-written themes** (base `tokens.css`) | **white** for primary/secondary/danger/success/info; **dark** for `warning` only (a light yellow fill can never carry white). A theme redefining a fill must keep it dark enough for white. |
| **Engine-generated themes** (`pdx theme`) | **auto-contrast per fill and per scheme.** `warning` matches the shipped convention (light amber fill ≈L 0.75/0.78 + dark label). The others are mid-lightness fills whose label flips by scheme: near-white in light, near-dark in dark (yes, including `primary`). |

→ In tests, assert the **contrast ratio**, never a literal color: the label side flips by scheme, so
a hardcoded `rgb(255,255,255)` expectation breaks in dark mode.

## 6. Dark mode, density, structure

- **Dark mode**: `pdx-scheme="light|dark"` on `<html>`. Tokens use `light-dark()`, so one attribute
  flips everything. **Gotcha:** without `pdx-scheme` present, `light-dark()` falls back to the *system*
  scheme — a theme can look "wrong" purely because the attribute is missing.
- **Never hardcode** `white`/`black` as bg or text — use `--pdx-color-bg` / `--pdx-color-text`.
- **Density = TWO complementary mechanisms.** Neither alone gives you a compact app:
  1. **Spacing** — `pdx theme --density=compact|normal|comfort` at generation time. Measured: it scales
     **only** the eight `--pdx-space-*` tokens (`md` 0.85rem vs 1.15rem). It emits **no** density factor
     and leaves control heights untouched.
  2. **Control heights** — the runtime factor, set as an **inline style via JS**:
     `document.documentElement.style.setProperty('--pdx-density-factor', '0.75')`
     (`compact 0.75 | normal 1 | comfort 1.25`); heights are `calc(var(--pdx-*-min-height) * var(--pdx-density-factor, 1))`.
     CSS attribute selectors are **not** reliable here (Vite doesn't propagate them).
- **Behavior tokens** drive structural variants app-wide: `--pdx-button-radius`, `--pdx-input-style`
  (`outlined|filled|underlined`), `--pdx-tab-indicator` (`underline|pill|filled`), `--pdx-card-style`,
  `--pdx-accordion-glyph` + `--pdx-accordion-open-transform`, `--pdx-breadcrumb-separator`,
  `--pdx-toggle-width/height`.

## 7. Programmatic API (`@pdxui/design/engine`)

```ts
import { createTheme } from '@pdxui/design/engine';

const theme = createTheme({
  name: 'acme', brandColor: '#6442d6', language: 'material',
  radiusScale: 'rounded', density: 'normal',
  cssOverrides: '& .pdx-surface-card { border-top: 3px solid var(--pdx-color-primary); }',
});

theme.apply();               // set vars + attributes on <html> (live, no build)
theme.toCSS();               // the [pdx-theme="acme"] block
theme.validate();            // ThemeIssue[] { level, code, message, fix? }
```

Also exported: `getLanguage`/`getLanguageIds` · `hexToOklch`/`oklchToHex`/`deltaE` ·
`toDTCG`/`fromDTCG`/`toDTCGJson` (W3C Design Tokens interop — lossless round-trip) ·
`scoreTheme`/`combineThemeScore` (§8).

`cssOverrides` is appended **inside** the theme block (CSS nesting `&`) — use it for the intrinsically-CSS
personality (gradients, blur, glyphs) the token system can't express.

## 8. What the validator actually tells you (observed)

**How you get the diagnostics:** the CLI prints the issue list to the console and gives you a
**pass/fail exit code** — there is no `--json`. For structured `ThemeIssue[]` (`{level, code, message,
fix?}`) you must call **`createTheme(...).validate()`** (§7). On a clean run the CLI prints a single
`✔ … (WCAG AA clean)` line.

The engine **self-corrects**, so a hard failure is rare — know what each message means:

| Code | Level | Reality |
|---|---|---|
| `CONTRAST_*` (e.g. `CONTRAST_PRIMARY_LABEL`, `CONTRAST_MUTED_ON_SURFACE`) | error/warning | Checked on the critical pairs in **both** light and dark. Rare, because the engine already tunes fill lightness and picks the label per scheme (§5). If you get one, change the brand/language — don't patch the CSS. |
| `EXTREME_LIGHTNESS` | warning | Brand L < 0.25 or > 0.85 (e.g. `#ffee00` → 0.93). The brand's lightness is otherwise **preserved**, but it gets clamped to 0.30-0.85 (and nudged for label contrast), so a very light/dark brand renders noticeably different from the hex you passed. Pick L 0.35-0.70 if primary must match exactly. |
| `LOW_CHROMA` | info | Brand chroma < 0.03 (a gray). The engine boosts chroma to 0.18 — buttons won't look gray. Informational. |
| `COLOR_CONFLICT_DANGER` / `_WARNING` | warning | Almost never fires: when the brand lands within ΔE 30 of a semantic hue, the engine **auto-shifts that hue away** (a red brand at hue 29 moves `danger` to −5; an orange brand at 56 moves `warning` 85 → 115). **So you don't need to avoid red/orange brands.** |

**Beyond WCAG — the oracle.** `scoreTheme()` fuses the token gate with `@responsivejs/design`
`analyzeDOM` (rendered geometry + on-page contrast + aesthetic score) into one `ThemeScore`
(`{ wcag, rendered, pass, aesthetic }`). Use it to compare two themes on real rendered components,
not just token math.

## 9. Gotchas that cost the most

1. **Theme doesn't apply** → the theme CSS isn't imported, or `pdx-theme` doesn't match the block name
   exactly. The name in `[pdx-theme="x"]` **is** the contract.
2. **Everything looks light-mode-ish in dark** → `pdx-scheme` missing on `<html>` (see §6).
3. **`neutral` is the canvas theme name** (`pdx-theme="default"` matches nothing). `'default'` is still a valid *button size* / slot name — don't confuse them.
4. **Styling a component "just for this page"** → use tokens + a scoped class; never hardcode colors,
   and check the component's own theme override before fighting it.
5. **Where the theme file goes.** Keep the generated CSS in your app and import it after
   `@pdxui/design` (§2) — nothing to register.
6. **Negative hues are normal in the output** (`oklch(0.52 0.2 -5)`) — a side effect of the hue auto-shift
   (§8). Valid CSS, don't "fix" it.

## 10. Verify, don't eyeball

A theme change is only done when measured: run the app, then check computed values with Playwright
(`getComputedStyle`) across **light and dark** and at least 3 themes — contrast ratio (not a literal
color, see §5), and that no element kept a hardcoded color.
