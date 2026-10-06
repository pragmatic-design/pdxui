---
title: Design theory
description: "Why the themes work: OKLCH, colour ramps, semantic hue conflicts, contrast by construction, modular scales."
order: 15.1
---

# Design theory

A PDX theme is **generated**, not painted. You give the engine one brand colour and an
archetype; it produces a complete token set — 102 for the `neutral` archetype, 110 for
`material`, which declares more vocabulary — and every one of them is the output of a rule you
can read. This page is those rules — not so you can recite them, but because the moment you want
a theme the presets don't give you, they are what tells you which knob to turn.

Everything below is implemented in `packages/design/src/engine/`. Where a number appears, it
is the number in the code.

## 1. Colour lives in OKLCH

Every colour the engine emits is `oklch(lightness chroma hue)`. The maths is OKLab
([Björn Ottosson, 2020](https://bottosson.github.io/posts/oklab/)), converted to the polar
form CSS ships.

The reason is **perceptual uniformity**. In HSL, `hsl(60 100% 50%)` (yellow) and
`hsl(240 100% 50%)` (blue) claim the same lightness, and one of them is nearly white while the
other is nearly black. So "the same colour, one step darker" is not a thing you can express:
the step means something different on every hue. In OKLCH it is one subtraction. That single
property is what makes a *generated* palette possible at all — the engine walks lightness and
gets a ramp that looks like a ramp on any hue you hand it.

Three consequences you will feel:

- **A ramp is one hue and two curves.** `generatePalette(hue)` emits 10 shades (50…900) from
  fixed lightness and chroma arrays. Lightness runs `0.97 → 0.22`. Chroma does **not** run
  flat: it climbs from `0.03` at shade 50 to a peak of `0.20` at shade 600, then falls back to
  `0.10` at 900 — because a near-white or a near-black physically cannot hold much chroma. A
  flat chroma would give you a washed-out 50 and an out-of-gamut 900.
- **Greys are not grey.** `generateGrays(hue)` emits 11 shades with chroma between `0.002`
  and `0.015`, tinted with the theme's neutral hue (the brand's hue unless you pass
  `neutralHue`). A truly neutral grey next to a saturated brand reads as *dirty*; a whisper of
  the brand hue in the greys is what makes a palette feel like one palette.
- **hex clips your brand.** `#rrggbb` is sRGB-only. A vivid wide-gamut brand is clipped before
  the engine sees it — measured on a Fluent blue: chroma −0.054, hue 13°. If your brand is
  saturated, pass `oklch(L C H)` instead.

## 2. Semantic hues, and what happens when they collide

Red means danger. That is not a stylistic choice, it is the whole reason a destructive button
is recognisable. So the engine anchors the semantic hues:

| Role | Hue | Moves? |
|---|---|---|
| `danger` | 25 | yes |
| `warning` | 85 | yes |
| `success` | 155 | **never** |
| `info` | 220 | yes |
| `secondary` | brand + 150 | derived |
| `accent` | brand + 40 | derived |

Now: what if the brand **is** red? A red brand and a red delete button, both correct on their
own, destroy each other. `assignSemanticHues()` measures the distance on the hue circle and,
if it is under **30°**, pushes the semantic hue away from the brand by 30°. `success` is
exempt — 155 is rarely near anyone's brand.

The engine does this silently and then *tells you*: `validate()` returns
`COLOR_CONFLICT_DANGER` / `COLOR_CONFLICT_WARNING` as warnings, so you know your palette was
adjusted and can pick a different brand hue if you would rather it wasn't.

## 3. Contrast is built in, not checked afterwards

This is the part most token systems get wrong, and it is worth understanding, because the
answer is counter-intuitive.

**The measure.** WCAG 2.x contrast ratio, `(L1 + 0.05) / (L2 + 0.05)` over relative luminance
— the same formula an auditing tool uses. AA is **4.5:1** for normal text, **3:1** for large.

**Picking a label.** `autoTextColor(fill)` compares a near-white (`L 0.98`) and a near-black
(`L 0.22`), both tinted with the *fill's own* hue, and keeps whichever wins. That alone gets
you a legible label on most fills.

**The saddle.** Most fills — not all. Take a green at `oklch(0.55 0.18 155)`. White on it
measures **4.04:1**. Black measures **4.05:1**. **Neither reaches 4.5:1.** The fill is sitting on
a contrast saddle, and no choice of label gets you out of it. This is exactly the case where a
colour system quietly ships an illegible button.

**The fix is to move the fill, not the label.** `fillLightnessForLabel()` walks the fill's
lightness in both directions in steps of 0.01, bounded to `0.30…0.85`, and takes the **nearest**
value where the best label clears 4.5:1. That green moves to `L 0.52` and reaches **4.55:1**. The
direction is whichever is closer, not always down: a cyan at `oklch(0.55 0.18 200)` (white
3.78:1, black 4.33:1) moves *up* to `L 0.57` for **4.67:1**.

Why not just use a dark label? Because a dark label on a saturated fill is not what a primary
button looks like in any design language anyone recognises. Darkening the container is
[Material 3's answer](https://m3.material.io/foundations/designing/color-contrast) too. The shipped design
system therefore fixes **white on every coloured fill** — `--pdx-color-primary-text`,
`-danger-text`, `-success-text`, `-info-text` — with exactly one exception: **warning**, whose
pale yellow no white will ever survive, keeps a dark label.

Your brand lightness is otherwise **preserved**. `generatePrimaryColors()` clamps it to
`0.30…0.85` and only nudges it when the label demands it, so "my brand is `#6442d6`" produces
a primary that really is that purple. (An earlier version pinned every primary to `L 0.55`
and silently shifted every brand.)

## 4. Light and dark are one theme, not two

`pdx-scheme` is a **dimension** of a theme, not a separate theme. Every surface and interactive
colour is emitted as a single `light-dark(light-value, dark-value)` pair, and the browser picks
the branch from `color-scheme`.

What inverts: the grey ramp (background goes from `L 0.965` to `L 0.13`, text from `L 0.20` to
`L 0.93`). What stays: hue. Your brand is the same brand in both.

What happens to the brand **fill** depends on how its label is chosen, and the two cases are worth
separating because they look like a contradiction until you see the cause.

When the engine generates a theme, the label is auto-chosen — whichever of near-white or near-black
wins on that fill — so the fill is free to move. `generatePrimaryColors` lightens it by `+0.15` and
drops ~15% of its chroma in dark, because a colour that reads as saturated on white reads as garish
on black, and `fillLightnessForLabel` nudges the result until the chosen label clears AA.

The 13 **shipped** themes pin a near-white label instead, and that pin is the constraint: white
stops reaching 4.5:1 somewhere around `L 0.55`, so the fill cannot be lightened without breaking the
label. Ten of them sit at 4.51–4.81 — tuned to that edge deliberately. Their primary is therefore a
**single value**, identical in both schemes, and the scheme shows on surfaces and text instead. The
exceptions are the three whose label is nowhere near the limit: `editorial` and `neutral`, whose
primaries are very dark, and `pragmatic-gold`, which carries a dark label.

So "the fill lightens in dark" is true of a generated theme and false of a shipped one, and the
difference is not the colour — it is whether the label was allowed to move with it.

This is why hardcoding `white` or `black` as a background or text colour is a bug rather than a
shortcut — you have written a value that cannot follow the scheme. The one place a fixed colour
is correct is a label on a coloured fill, which is fixed *by design* (§3).

## 5. Scales are ratios, not opinions

Four scales, all derived:

**Spacing** — `baseUnit × [1, 2, 3, 4, 6, 8, 12, 16] × densityFactor`, emitted as
`--pdx-space-2xs … --pdx-space-3xl`. The archetype owns `baseUnit`; all twelve shipped ones use
`4`, and it is the hook for a system built on a different grid. The near-geometric progression
is what stops a layout drifting into "11px here, 13px there".

**Radius** — `sharp` collapses every step to `0`, `pill` to `9999px`, `rounded` walks
`baseUnit × 1,2,3,4`. Three coherent worlds instead of a slider.

**Shadows** — one alpha per intensity (`subtle 0.06`, `medium 0.10`, `strong 0.15`, or `none`),
multiplied by **3.5 in dark mode**, because a shadow that reads on white is invisible on near
black.

**Type** — modular ratios: minor third `1.2`, major third `1.25`, perfect fourth `1.333`,
golden `1.618`. But note the deliberate asymmetry: **the type scale is not part of a theme's
identity here.** `tokens.css` owns one fluid `clamp()` scale that every theme shares, and the
engine emits `--pdx-text-*` **only** if you explicitly pass `typeScale`. What themes actually
personalise is the **weights** (`--pdx-weight-medium`, `--pdx-weight-semibold`) — 6 of the 13
shipped themes override one (`material`, `fluent`, `metro`, `cyberpunk`, `playful`, `editorial`). That is what typographic personality looks like in this system.

> **Two different densities, don't conflate them.** The engine's `density` (`compact 0.85`,
> `normal 1`, `comfort 1.15`) multiplies the spacing values *at generation time* and bakes them
> into the theme. `--pdx-density-factor` (`0.75 / 1 / 1.25`) is a separate **runtime**
> multiplier that `tokens.css` applies to heights and spacing, changeable live without
> regenerating anything.

## 6. An archetype is everything that isn't colour

Two apps can share a brand colour and look nothing alike. What separates them is a set of
decisions the engine calls a **design language**, and they are enumerable:

- input style (`outlined` / `filled` / `underlined`) and where focus lands (ring or bottom rule)
- button shape (`sharp` / `rounded` / `pill`) and minimum height
- tab indicator (`underline` / `pill`) and its thickness
- card treatment (`bordered` / `elevated` / `flat`)
- accordion glyph (`+` / `▾` / `▸`) and how it transforms when open
- breadcrumb separator
- table-header vocabulary — transform, tracking, weight, size, colour, rules
- hover and pressed opacities, border widths, toggle geometry
- base unit, radius scale, font weights, shadow intensity, font stacks

Twelve are shipped: `material`, `fluent`, `cupertino`, `metro`, `neutral`, `corporate`,
`playful`, `cyberpunk`, `editorial`, `neumorphic`, `glass`, `pragmatic`. The four that model a
real system follow its published spec rather than an impression of it —
[Material Design 3](https://m3.material.io/), [Fluent 2](https://fluent2.microsoft.design/),
[Apple HIG](https://developer.apple.com/design/human-interface-guidelines/), and Windows 8
Modern UI for Metro (44pt touch targets in Cupertino, zero radius and no shadows in Metro, and
so on).

An archetype decides **none** of your colour. That is the split the whole engine is built
around: *your brand, in that style*.

## 7. What this does not give you

Stated plainly, because a guarantee you have to guess at is worth nothing:

- **It is not taste.** The engine produces a coherent, accessible palette. Whether it is the
  right palette for your product is your judgement.
- **The gate checks seven pairs**, in both schemes: text-on-background, muted-on-surface, and
  the label on each of the five coloured fills. It does not check every element in your app —
  run [axe](https://github.com/dequelabs/axe-core) or the builder's oracle for that.
- **WCAG 2.x, not APCA.** The ratio formula is the one WCAG 2.1 defines. APCA (WCAG 3 draft) is
  a better model of perceived contrast and is not what this measures.
- **Non-text contrast** (borders, icons, focus rings against their surround) is not gated.
- **Out-of-gamut values are possible.** OKLCH can express colours sRGB cannot; browsers clamp
  them on display.

## Where to go next

- [Theming](/docs/theming) — the tokens and how to use them day to day.
- [Making a theme](/docs/making-a-theme) — from a brand colour to a theme you ship.
- [Theme Builder](https://themebuilder.pdxui.com/) — all of the above, live, measured against
  every component.
