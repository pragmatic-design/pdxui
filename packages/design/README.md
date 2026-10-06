# Pragmatic Design CSS

> Context-driven CSS framework. Agent-first, human-friendly. ~10KB.

Part of the [Pragmatic.Design](https://github.com/pragmatic-design/Pragmatic.Design) ecosystem.

## Quick Start

```html
<link rel="stylesheet" href="@pdxui/design/src/pragmatic-design.css">

<html pdx-scheme="auto" pdx-theme="neutral" pdx-density="normal">
```

No build step required. Native `@import` + `@layer`.

## Core Concepts

**Layout** = custom element tags (`pdx-stack`, `pdx-row`, `pdx-grid`).
**Appearance** = CSS classes (`pdx-primary`, `pdx-surface-card`, `pdx-txt-display`).
**Theme** = attributes on `<html>` (`pdx-scheme`, `pdx-theme`, `pdx-density`).

Everything uses the `pdx-` prefix for safety.

## Layout Primitives

CSS-only custom element tags. No JavaScript, no Web Component registration.

```html
<!-- Vertical stack -->
<pdx-stack gap="md">
    <div>Item 1</div>
    <div>Item 2</div>
</pdx-stack>

<!-- Horizontal row -->
<pdx-row gap="sm" items="center" justify="between">
    <span>Left</span>
    <span>Right</span>
</pdx-row>

<!-- Grid (auto-collapses on narrow containers) -->
<pdx-grid cols="3" gap="md">
    <div>Card 1</div>
    <div>Card 2</div>
    <div>Card 3</div>
</pdx-grid>

<!-- Centered content with max-width -->
<pdx-center max="lg" pad="md">
    <p>Centered content</p>
</pdx-center>

<!-- Wrapping flow for tags/chips -->
<pdx-cluster gap="xs">
    <span>Tag 1</span>
    <span>Tag 2</span>
</pdx-cluster>

<!-- Two-panel layout (auto-stacks on narrow) -->
<pdx-split ratio="1:3" gap="md">
    <nav>Sidebar</nav>
    <main>Content</main>
</pdx-split>
```

### Layout Attributes

| Attribute | Values | Elements |
|-----------|--------|----------|
| `gap` | `2xs` `xs` `sm` `md` `lg` `xl` `2xl` | All |
| `pad` | `2xs` `xs` `sm` `md` `lg` `xl` `2xl` | All |
| `items` | `start` `center` `end` `baseline` `stretch` | stack, row, cluster |
| `justify` | `start` `center` `end` `between` `around` `evenly` | row, cluster |
| `cols` | `1`-`6`, `auto` | grid |
| `max` | `xs` `sm` `md` `lg` `xl` `2xl` `full` | center |
| `ratio` | `1:1` `1:2` `1:3` `1:4` `2:1` `2:3` `3:1` `3:2` `4:1` | split |
| `wrap` | `no`, `stack` | row |

## Surfaces

```html
<div class="pdx-surface-base">Background surface</div>
<div class="pdx-surface-card">Card with border + shadow</div>
<div class="pdx-surface-inset">Recessed area</div>
<div class="pdx-surface-overlay">Modal/popover surface</div>
<div class="pdx-surface-glass">Frosted glass effect</div>
```

## Interactive (Buttons)

```html
<button class="pdx-primary">Primary action</button>
<button class="pdx-secondary">Secondary</button>
<button class="pdx-ghost">Subtle</button>
<button class="pdx-danger">Destructive</button>

<!-- Works on links too -->
<a href="/action" class="pdx-primary" role="button">Link button</a>

<!-- Disabled state -->
<button class="pdx-primary" disabled>Disabled</button>
```

## Form Inputs

```html
<input class="pdx-input" placeholder="Text input" />
<input class="pdx-input" aria-invalid="true" value="Error state" />
<input class="pdx-input" disabled value="Disabled" />
<select class="pdx-input"><option>Option</option></select>
<textarea class="pdx-input">Text area</textarea>
```

## Typography

```html
<h1 class="pdx-txt-display">Display</h1>
<h2 class="pdx-txt-title">Title</h2>
<h3 class="pdx-txt-heading">Heading</h3>
<h4 class="pdx-txt-subheading">Subheading</h4>
<p class="pdx-txt-body">Body text</p>
<p class="pdx-txt-small">Small text</p>
<span class="pdx-txt-caption">Caption</span>
<span class="pdx-txt-label">LABEL</span>
<code class="pdx-txt-mono">code</code>
```

### Ink Colors

```html
<span class="pdx-ink-default">Default text</span>
<span class="pdx-ink-muted">Secondary info</span>
<span class="pdx-ink-subtle">Tertiary — an alias of muted, see below</span>
<span class="pdx-ink-primary">Brand color</span>
<span class="pdx-ink-accent">Accent</span>
<span class="pdx-ink-danger">Error</span>
<span class="pdx-ink-success">Success</span>
<span class="pdx-ink-warning">Warning</span>
```

`--pdx-color-subtle` is not a text colour: it reads 2.07–2.89:1 on the page in every theme, so
`.pdx-ink-subtle` paints `--pdx-color-muted` and is kept only so existing markup keeps working.
Subtle is for borders, dividers, decorative icons and fills. There are two levels of
text, default and muted.

## Theming

Three orthogonal axes on `<html>`:

```html
<html pdx-scheme="auto"    <!-- light | dark | auto -->
      pdx-theme="neutral"  <!-- neutral | pragmatic | corporate | playful -->
      pdx-density="normal"  <!-- compact | normal | comfort -->
>
```

- **Scheme**: controls `color-scheme` which drives `light-dark()`. Zero extra CSS needed.
- **Theme**: overrides primary/accent colors, gray tint, border-radius, font weights.
- **Density**: scales all spacing by 0.75x (compact) or 1.25x (comfort).

### Available Themes

| Theme | Primary | Character |
|-------|---------|-----------|
| `default` | Indigo (250) | Neutral, warm grays |
| `pragmatic` | Gold (85) | Brand, premium dark |
| `corporate` | Blue (220) | Serious, sharp corners |
| `playful` | Purple (290) | Vibrant, rounded |

## Adaptive (Automatic)

No media queries needed. Everything adapts automatically:

- **Grid**: `cols=3` collapses to 2, then 1 based on container width (Container Queries)
- **Split**: stacks vertically when container is narrow
- **Touch**: buttons and inputs grow to 44px minimum on `pointer: coarse`
- **Motion**: all transitions disabled when `prefers-reduced-motion: reduce`
- **Contrast**: borders strengthen when `prefers-contrast: more`
- **Typography**: fluid sizing via `clamp()` — scales between viewport widths

## Customization

Every surface/component exposes CSS Custom Properties:

```css
/* Override card globally */
.my-hero-card {
    --pdx-radius-lg: 2rem;
    --pdx-shadow-sm: 0 8px 30px oklch(0 0 0 / 0.12);
}

/* Create a custom theme */
[pdx-theme="my-brand"] {
    --pdx-color-primary: oklch(0.6 0.2 150);
    --pdx-color-primary-hover: oklch(0.53 0.22 150);
    --pdx-color-primary-text: oklch(0.98 0.01 150);
    --pdx-color-accent: oklch(0.7 0.15 30);
    --pdx-color-focus: oklch(0.65 0.20 150);
    --pdx-hue-primary: 150;
    --pdx-hue-accent: 30;
}
```

### A theme inside a theme

`pdx-theme` works on any element, not only `<html>`. A subtree with its own theme, such as a themed preview or an embedded widget, gets that theme's tokens and its component rules. A theme's component rules stop at a nested root of another theme. To do that, each rule carries a guard on its subject:

```css
[pdx-theme="my-brand"] .pdx-primary:not(:where(
    [pdx-theme="my-brand"] [pdx-theme]:not([pdx-theme="my-brand"]),
    [pdx-theme="my-brand"] [pdx-theme]:not([pdx-theme="my-brand"]) *)) { … }
```

`:where()` adds no specificity. `tests/nested-themes.spec.ts` fails on any rule of a shipped theme that lacks the guard. `@scope` would express the same thing directly, but it is outside the browser baseline below.

A generated theme gets the same guard: `createTheme().toCSS()` passes the design language's and the author's `cssOverrides` through `guardThemeRules` (`src/engine/nested-theme-guard.ts`), so a theme saved from the builder stops at a nested theme too.

The theme's tokens are declared on `:root` and on every `[pdx-theme]`, so a nested root recomputes the derived ones from its own theme: `--pdx-color-text` from its own `--pdx-gray-900`, the ramps from its hues, the spacing from its density. A token its theme leaves out comes back to the default, and the nested root takes its theme's text colour and font. `tests/nested-themes.spec.ts` checks that every element of a nested theme computes as it does under that theme alone, for every pair of shipped themes.

What stays the page's, declared on `:root` only and inherited through a nested theme: the motion scale and the durations, the touch-target minimum, the type scale, and the z-index and max-width scales. A generated theme declares the type scale or the motion scale only when its input sets `typeScale` or `motionScale`.

Density is a theme's too: seven themes declare their own. A nested root gets its theme's density, or the default 1, not the page's. To give a nested theme a density, put `pdx-density` on its root.

One limit: an island of the outer theme inside a nested one (`a > b > a`) gets `a`'s tokens but not `a`'s component rules.

## Token Reference

### Spacing (`--pdx-space-*`)

| Token | Default | Compact | Comfort |
|-------|---------|---------|---------|
| `2xs` | 4px | 3px | 5px |
| `xs` | 8px | 6px | 10px |
| `sm` | 12px | 9px | 15px |
| `md` | 16px | 12px | 20px |
| `lg` | 24px | 18px | 30px |
| `xl` | 40px | 30px | 50px |
| `2xl` | 64px | 48px | 80px |

### Typography (`--pdx-text-*`)

| Token | Range (fluid) |
|-------|---------------|
| `xs` | 0.7rem - 0.75rem |
| `sm` | 0.8rem - 0.875rem |
| `base` | 0.925rem - 1rem |
| `lg` | 1.05rem - 1.125rem |
| `xl` | 1.15rem - 1.25rem |
| `2xl` | 1.35rem - 1.5rem |
| `3xl` | 1.6rem - 1.875rem |
| `display` | 2rem - 2.5rem |

### Radius (`--pdx-radius-*`)

| Token | Default | Corporate | Playful |
|-------|---------|-----------|---------|
| `sm` | 0.25rem | 0.125rem | 0.5rem |
| `md` | 0.5rem | 0.25rem | 0.75rem |
| `lg` | 0.75rem | 0.375rem | 1.25rem |
| `xl` | 1rem | 0.5rem | 1.75rem |
| `full` | 9999px | 9999px | 9999px |

### Shadows (`--pdx-shadow-*`)

`sm`, `md`, `lg`, `xl` — all auto-adapt to light/dark scheme.

### Z-index (`--pdx-z-*`)

`dropdown(100)` < `sticky(200)` < `overlay(300)` < `modal(400)` < `toast(500)`

### Max-width (`--pdx-max-*`)

`xs(320px)` `sm(480px)` `md(768px)` `lg(1024px)` `xl(1280px)` `2xl(1536px)`

## Vocabulary (~50 words)

An agent needs only these words to compose any layout:

**Tags**: `pdx-stack`, `pdx-row`, `pdx-grid`, `pdx-center`, `pdx-cluster`, `pdx-split`

**Layout attrs**: `gap`, `pad`, `items`, `justify`, `cols`, `max`, `ratio`, `wrap`

**Sizes**: `2xs`, `xs`, `sm`, `md`, `lg`, `xl`, `2xl`

**Surfaces**: `pdx-surface-base`, `pdx-surface-card`, `pdx-surface-inset`, `pdx-surface-overlay`, `pdx-surface-glass`

**Buttons**: `pdx-primary`, `pdx-secondary`, `pdx-ghost`, `pdx-danger`

**Input**: `pdx-input`

**Text**: `pdx-txt-display`, `pdx-txt-title`, `pdx-txt-heading`, `pdx-txt-subheading`, `pdx-txt-body`, `pdx-txt-small`, `pdx-txt-caption`, `pdx-txt-label`, `pdx-txt-mono`

**Ink**: `pdx-ink-default`, `pdx-ink-muted`, `pdx-ink-subtle`, `pdx-ink-primary`, `pdx-ink-accent`, `pdx-ink-danger`, `pdx-ink-success`, `pdx-ink-warning`

## Architecture

```
@layer pdx.reset     — Modern CSS reset
@layer pdx.tokens    — All --pdx-* custom properties
@layer pdx.layout    — Layout primitives (pdx-stack, pdx-row, etc.)
@layer pdx.surfaces  — Surface + interactive + input styles
@layer pdx.typography — Text roles + ink colors
@layer pdx.adaptive  — Container queries, touch, motion, print
@layer pdx.themes    — Theme overrides (colors, radius, weights)

Your CSS (unlayered) always wins — zero !important needed.
```

## Browser Support

Baseline 2024+: Chrome 111+, Firefox 118+, Safari 17.4+.

Key features used: `@layer`, `light-dark()`, `oklch()`, Container Queries, CSS Nesting, `:has()`, `color-scheme`.

## Ecosystem

| Package | Purpose |
|---------|---------|
| `@pdxui/design` | CSS framework (this) |
| `@pdxui/components` | UI component library (future) |
| `@pdxui/ui` | TypeScript SPA framework (future) |

## Development

```bash
# Serve demo locally
npx http-server . -p 3333 -c-1
# Open http://localhost:3333/demo/showcase.html

# Run tests (137 automated checks)
npm test
```

## License

MIT
