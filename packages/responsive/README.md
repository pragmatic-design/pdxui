# Pragmatic ResponsiveJS (`r$`)

> The screen is a parametric Cartesian plane. Every layout property is a function of viewport width.

`r$` measures, models, and validates CSS layouts mathematically — across all viewport widths.

## Quick Start

```typescript
import { test, expect } from '@playwright/test';
import { r$ } from '@pdxui/responsive';

test('layout is correct at all viewports', async ({ page }) => {
    const r = r$(page);

    await r.sweep({
        url: 'http://localhost:3000',
        widths: [320, 768, 1280, 1920],
        selectors: ['h1', '.btn', '.card', '.sidebar'],
    });

    // Validate constraints across ALL widths
    r.assert
        .noOverflow()                              // nothing outside viewport
        .sameHeight('.btn', '.input')              // aligned heights
        .sameLine('h1', '.actions')                // same visual row
        .minSize('.btn', { height: 44 })           // touch target
        .monotonic('h1', 'fontSize', 'up')         // font never shrinks
        .proportion('.sidebar', '.main', { min: 0.15, max: 0.35 });

    const report = r.report();
    expect(report.pass).toBe(true);
});
```

## Core Concepts

**The screen is a Cartesian plane** bounded by `(0,0)` to `(viewportWidth, viewportHeight)`.

**Every element is a rectangle**: `{ x, y, width, height, right, bottom, centerX, centerY, area }`.

**Every property is a curve**: `fontSize = f(viewportWidth)` — measured at N sample points.

**Constraints are equations** that must hold at ALL viewport widths:
- `child.right <= parent.right` (containment)
- `btn.height == input.height` (alignment)
- `dFontSize/dWidth >= 0` (monotonicity)
- `stddev(gaps) / mean(gaps) < 0.1` (uniform spacing)

## API

### `r$(page)` — Create validator

```typescript
const r = r$(page); // page = Playwright Page
```

### `.sweep(options)` — Measure at multiple widths

```typescript
await r.sweep({
    url: 'http://localhost:3000/page',
    widths: [320, 768, 1280, 1920],     // explicit list
    // OR: from: 300, to: 1920, step: 50  // range
    selectors: ['.btn', 'h1', '.card'],  // CSS selectors to measure
});
```

### `.at(width)` — Query at specific width

```typescript
r.at(1280).rect('h1')              // → Rect
r.at(1280).style('h1', 'fontSize') // → 32
r.at(1280).elements('.card')       // → ElementSnapshot[]
```

### `.curve(selector, prop)` — Property across widths

```typescript
r.curve('h1', 'fontSize')  // → Map<width, value>
r.curve('h1', 'width')     // → Map<width, value>
```

### `.assert.*` — Constraints (chainable)

| Method | What it checks |
|--------|---------------|
| `.noOverflow()` | No element exceeds viewport |
| `.contains(parent, child)` | Child rect inside parent rect |
| `.sameHeight(a, b)` | Elements have equal height (±2px) |
| `.sameLine(a, b)` | Elements share vertical space (same row) |
| `.minSize(sel, {height?, width?})` | Minimum dimensions |
| `.gapUniform(sel)` | Spacing between children is consistent |
| `.monotonic(sel, prop, 'up')` | Property never decreases across widths |
| `.continuous(sel, prop, maxJump)` | No sudden jumps in property |
| `.proportion(a, b, {min, max})` | Width ratio stays in range |

### `.report()` — Results

```typescript
const report = r.report();
// {
//   pass: false,
//   total: 477,
//   passed: 476,
//   failed: 1,
//   violations: [{
//     rule: 'noOverflow',
//     element: '.btn-danger[2]',
//     width: 320,
//     detail: 'right=325 > viewport=320'
//   }]
// }
```

## Math Utilities

Pure functions, no browser dependency:

```typescript
import { rect, curve, stats } from '@pdxui/responsive';

// Rect geometry
rect.contains(parent, child)
rect.overlapsVertically(a, b)
rect.distance(a, b)
rect.inViewport(r, 1280)

// Curve analysis
curve.isMonotonicUp(fontSizeCurve)
curve.maxJump(widthCurve)
curve.isContinuous(curve, 50)
curve.ratioInRange(sidebar, main, 0.2, 0.35)

// Statistics
stats.mean([16, 16, 16, 24])
stats.cv([16, 16, 16, 24])     // coefficient of variation
stats.isUniform([16, 16, 16])  // true
stats.gaps([0, 16, 32, 48])    // [16, 16, 16]
```

## Default Viewport Widths

```
320   iPhone SE
375   iPhone 12/13
390   iPhone 14/15
768   iPad portrait
1024  iPad landscape
1280  Laptop
1440  Desktop
1920  Full HD
2560  QHD
```

## Development

```bash
npm test          # Unit tests (math)
npm run test:e2e  # Integration tests (Playwright)
npm run test:all  # Both
```

## License

MIT
