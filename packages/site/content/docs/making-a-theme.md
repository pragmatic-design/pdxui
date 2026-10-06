---
title: Making a theme
description: "From a brand colour to a theme you ship: the builder, the CLI, the API, the WCAG gate, DTCG."
order: 15.2
---

# Making a theme

Three doors, one engine. The builder, the CLI and the API all call the same
`createTheme()` and produce **byte-identical CSS** — so you can start in the browser, move to
the command line, and end up with the same artefact. Pick by what you are doing, not by what
you are allowed to do.

| Door | Use it when |
|---|---|
| [Theme Builder](https://themebuilder.pdxui.com/) | You are deciding. Live preview over every component, measured. |
| `pdx theme` | You know what you want, or you are in CI. |
| `@pdxui/design/engine` | A theme is data in your app — per-tenant branding, a theme editor of your own. |

If you have not read [Design theory](/docs/design-theory), read §3 of it first. It explains why
the primary you get back is sometimes not exactly the primary you asked for, which is the one
surprise in this process.

## 1. Start in the builder

<https://themebuilder.pdxui.com/>

Pick a brand colour and an archetype and the whole component library restyles live. What makes
it more than a preview:

- **It measures.** Contrast, overflow and touch targets are checked on the *rendered* page, per
  scenario, per theme — not on the token values.
- **A composite screen.** A row of isolated buttons will never tell you whether a theme works.
  There is a realistic screen (nav, KPIs, a table with status badges, a form, destructive
  actions) that uses only shipped components and design-system classes.
- **Every token is editable**, grouped by what it does, showing the value the browser
  *resolves* rather than the one that was declared.
- **The URL is the state.** A theme in progress is a link. That is also how an agent drives it.

Export **CSS** or **DTCG** when you are happy. Then come back here for §4 to ship it.

## 2. `pdx theme` — one command

```bash
npm i -D @pdxui/cli   # once per app: the CLI is a dev dependency, not part of @pdxui/framework
npx pdx theme acme --brand "#6442d6" --language material --out src/themes/acme.css
```

| Flag | Meaning |
|---|---|
| `<name>` | Positional. Becomes the `[pdx-theme="name"]` selector. |
| `--brand` | Required. `#6442d6` or `oklch(0.52 0.16 215)` — use OKLCH for wide-gamut brands, hex clips them. |
| `--language` | Archetype. Default `neutral`. |
| `--accent` `--focus` | Explicit colours; derived from the brand when omitted. |
| `--neutral` | Hue `0-360` for the grey tint. Defaults to the brand's hue. |
| `--density` | `compact` / `normal` / `comfort`. Default `normal`. |
| `--radius` | `sharp` / `rounded` / `pill`. Overrides the archetype's. |
| `--out` | Write the CSS to a file. Prints to stdout otherwise. |
| `--no-strict` | Emit the CSS even if a pair fails WCAG AA. |
| `--quiet` | Suppress the validation report. |

**`--strict` is on by default, and that is the point.** The command exits non-zero if any pair
fails AA, so it is a check, not just a generator:

```bash
# CI: fail the build if the brand cannot produce an accessible theme
npx pdx theme acme --brand "$BRAND_COLOR" --language corporate --out dist/acme.css
```

Warnings do not fail it — only errors do. A `COLOR_CONFLICT_DANGER` tells you the palette was
adjusted; it does not mean the theme is broken.

One nuance that matters in a pipeline: the CSS is **written before the exit code is set**. A
strict failure still leaves the file on disk, so a later step that reads it will find a theme
that did not pass. Gate on the exit code, not on the file's existence.

## 3. The engine, as an API

```ts
import { createTheme } from '@pdxui/design/engine';

const theme = createTheme({
  name: 'acme',
  brandColor: '#6442d6',
  language: 'material',
  density: 'comfort',
});

theme.toCSS();      // the complete [pdx-theme="acme"] { … } block
theme.apply();      // set the tokens on <html> right now
theme.tokens;       // Record<string, string> — every token, as data
theme.behaviors;    // the archetype's decisions
theme.attributes;   // structural attributes for <html> (pdx-tab-style, pdx-card-style, …)
theme.validate();   // ThemeIssue[]
```

`apply()` takes an optional target document, so you can theme a same-origin iframe in isolation
instead of the ambient page:

```ts
theme.apply(previewFrame.contentDocument);
```

Every field of `ThemeInput` is optional except `name`, `brandColor` and `language`. Useful ones
not covered above: `fontSans` / `fontHeading` / `fontMono`, `typeScale`, `motionScale`
(`0` disables motion), `overrides`, `cssOverrides`.

## 4. Validate, then fix

`validate()` returns issues, and the interesting ones carry a **machine-actionable** remedy —
so a tool does not have to parse English out of a message:

```ts
for (const issue of theme.validate()) {
  if (issue.level !== 'error') continue;
  console.log(issue.code);   // e.g. CONTRAST_MUTED_ON_SURFACE
  console.log(issue.remedy); // shape:
  // { foreground: '--pdx-color-muted', background: '--pdx-color-surface',
  //   scheme: 'light' | 'dark', ratio: number, required: 4.5,
  //   suggested: 'oklch(…)' }
}
```

`remedy.suggested` is produced by the engine's own label rule, so applying it is guaranteed to
clear the threshold. Note `remedy.scheme`: the same pair can pass in light and fail in dark, and
the fix must only rewrite the failing branch of the `light-dark()` pair.

The gate covers seven pairs in both schemes — text-on-background, muted-on-surface, and the
label on each coloured fill. See [Design theory §7](/docs/design-theory) for what it does not
cover.

## 5. Overrides, and what they cost

Two escape hatches, in increasing order of regret:

```ts
createTheme({
  name: 'acme', brandColor: '#6442d6', language: 'material',

  // 1. Token overrides — applied after generation, still fully gated.
  overrides: {
    '--pdx-color-surface': 'oklch(0.99 0.004 260)',
    '--pdx-radius-md': '10px',
  },

  // 2. Raw CSS — appended inside the theme block. Nested selectors auto-scope
  //    to [pdx-theme="acme"] via CSS nesting, so you don't repeat the name.
  cssOverrides: `
    & .pdx-surface-card { backdrop-filter: blur(8px); }
  `,
});
```

**Overrides are gated too.** The WCAG check runs on the *merged* map, not on what the engine
generated — otherwise the hand-edited part would be the only part nobody checks, which is
backwards. (If you are building your own editor, `validateTokenContrast(tokens)` runs the same
gate on any token map.)

`cssOverrides` is the one that costs you something: it is CSS no tool can reason about. A token
override still participates in the system — every component reading that token adapts, the gate
sees it, DTCG export carries it. Raw CSS does none of that. Use it for personality that is
genuinely not a token yet (a pseudo-element, a per-component rule), and prefer a token every
other time.

## 6. DTCG — talking to design tools

Tokens go out and come back in the
[Design Tokens Community Group](https://tr.designtokens.org/format/) format — the interchange
design tools and token pipelines (Style Dictionary, Figma plugins) are converging on:

```ts
import { toDTCGJson, fromDTCG } from '@pdxui/design/engine';

// Out — `root` wraps everything under one top-level group.
writeFileSync('acme.tokens.json', toDTCGJson(theme, { root: 'pdx' }));

// Back in — tolerant of the root wrapper and of extra $-fields.
const tokens = fromDTCG(JSON.parse(readFileSync('acme.tokens.json', 'utf8')));
```

The `$type` of each token is inferred from its name, so a colour arrives in a design tool as a
colour rather than as a string. A token whose value is one CSS string, like the breadcrumb separator
`'/'`, arrives as its text (`/`); its quote travels in `$extensions.pdx.quote`, and `fromDTCG` puts it
back. The builder exports the same thing from its **DTCG** button.

## 7. Ship it

A theme is a CSS file plus one attribute.

```css
/* src/themes/acme.css — the output of pdx theme, unedited */
[pdx-theme="acme"] {
  --pdx-color-primary: light-dark(oklch(0.52 0.16 285), oklch(0.67 0.14 285));
  /* … */
}
```

```ts
import '@pdxui/design';     // tokens, base components, the shipped themes
import './themes/acme.css';     // yours, after
```

```html
<html pdx-theme="acme" pdx-scheme="light">
```

Import order matters: your theme must come **after** the design system, so its block wins on
equal specificity.

If your theme sets structural behaviours (a pill tab indicator, an elevated card style), also
set the attributes the engine hands you:

```ts
for (const [name, value] of Object.entries(theme.attributes)) {
  document.documentElement.setAttribute(name, value);
}
```

Inside this repository there is one extra step: a theme saved from the builder lands in
`packages/design/src/themes/custom/` and is registered by a single `@import` line in
`_custom.css`, which `pragmatic-design.css` imports once. That is the only integration point —
a save can add a theme but can never touch the shipped ones.

## Checklist

- [ ] Brand passed as `oklch()` if it is saturated (hex clips wide gamut).
- [ ] Archetype chosen deliberately — it decides everything that is not colour.
- [ ] `validate()` clean, or every remaining warning understood.
- [ ] Checked in **both** schemes. A pair can pass in light and fail in dark.
- [ ] Checked at a real density, not only `normal`.
- [ ] `cssOverrides` empty, or each rule justified as "not expressible as a token".
- [ ] Theme CSS imported **after** `@pdxui/design`.
- [ ] Looked at the composite screen, not only at isolated components.
