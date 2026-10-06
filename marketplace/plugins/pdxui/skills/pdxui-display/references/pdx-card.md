### `<pdx-card>`

A surface for grouped content.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `variant` | `variant` | string | `''` | Card variant: default, outline, elevated, flat |
| `loading` | `loading` | boolean | `false` | Show loading skeleton state |
| `clickable` | `clickable` | boolean | `false` | Make entire card clickable (emits pdx-click) |
| `hoverable` | `hoverable` | boolean | `false` | Hoverable elevation effect |
| `horizontal` | `horizontal` | boolean | `false` | Horizontal layout (media + content side by side) |
| `compact` | `compact` | boolean | `false` | Compact padding |
| `selected` | `selected` | boolean | `false` | Selectable card (radio/checkbox style). On a clickable card, announced as pressed (`aria-pressed`). |
| `disabled` | `disabled` | boolean | `false` | Disabled state |
| `href` | `href` | string | `''` | Makes the card a link: it renders an `<a>` overlay across the card, so middle-click, open-in-a-new-tab, copy-link-address and the status bar all work, and the address is in the DOM. An interactive element inside the card stays clickable (it sits above the overlay). The URL is sanitised before it is written. |
| `elevation` | `elevation` | number | `-1` | Shadow elevation: 0 (none), 1 (sm), 2 (md), 3 (lg), 4 (xl) |

**Events:** `pdx-click` — Fired on `pdx-click`.

**Renders:** roles `button` · `link`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Variants** — Surface background with subtle border and shadow. _(from the live demo)_

```html
<div class="demo-grid">
  <pdx-card>
    <div class="pdx-card-body">
      <h4 class="pdx-txt-subheading">Default</h4>
    </div>
  </pdx-card>
  <pdx-card variant="outline">
    <div class="pdx-card-body">
      <h4 class="pdx-txt-subheading">Outline</h4>
      <p class="pdx-txt-small pdx-ink-muted">Stronger border, transparent background.</p>
    </div>
  </pdx-card>
  <pdx-card variant="elevated">
    <div class="pdx-card-body">
      <h4 class="pdx-txt-subheading">Elevated</h4>
      <p class="pdx-txt-small pdx-ink-muted">Raised shadow for prominent content.</p>
    </div>
  </pdx-card>
  <pdx-card variant="flat">
    <div class="pdx-card-body">
      <h4 class="pdx-txt-subheading">Flat</h4>
      <p class="pdx-txt-small pdx-ink-muted">Inset background, no border, no shadow.</p>
    </div>
  </pdx-card>
</div>
```

**Elevation** — 5 levels of shadow depth via `elevation` prop. Overrides variant shadow. Theme-adaptive. _(from the live demo)_

```html
<div class="elevation-row">
  <pdx-card elevation="0">
    <div class="pdx-card-body elev-label"><span class="elev-num">0</span><span class="pdx-txt-small pdx-ink-muted">none</span></div>
  </pdx-card>
  <pdx-card elevation="1">
    <div class="pdx-card-body elev-label"><span class="elev-num">1</span><span class="pdx-txt-small pdx-ink-muted">sm</span></div>
  </pdx-card>
  <pdx-card elevation="2">
    <div class="pdx-card-body elev-label"><span class="elev-num">2</span><span class="pdx-txt-small pdx-ink-muted">md</span></div>
  </pdx-card>
  <pdx-card elevation="3">
    <div class="pdx-card-body elev-label"><span class="elev-num">3</span><span class="pdx-txt-small pdx-ink-muted">lg</span></div>
  </pdx-card>
  <pdx-card elevation="4">
    <div class="pdx-card-body elev-label"><span class="elev-num">4</span><span class="pdx-txt-small pdx-ink-muted">xl</span></div>
  </pdx-card>
</div>
```

**Product Cards** — Furniture _(from the live demo)_

```html
<div class="demo-grid">
  <pdx-card hoverable>
    <div class="pdx-card-media"><img src="/demo-images/desk.svg" alt="Desk setup" /></div>
    <div class="pdx-card-body">
      <h4 class="pdx-txt-subheading" style="margin-bottom:4px">Standing Desk Pro</h4>
      <p class="pdx-txt-small pdx-ink-muted">Electric height-adjustable, bamboo top, cable management.</p>
      <p style="margin-top:8px;font-weight:600;color:var(--pdx-color-primary)">$599.00</p>
    </div>
    <div class="pdx-card-footer">
      <pdx-button variant="primary" size="sm" full>Add to Cart</pdx-button>
    </div>
  </pdx-card>
  <pdx-card hoverable>
    <div class="pdx-card-media"><img src="/demo-images/chair.svg" alt="Chair" /></div>
    <div class="pdx-card-body">
      <p class="pdx-txt-small pdx-ink-muted" style="margin-bottom:4px">Furniture</p>
      <h4 class="pdx-txt-subheading" style="margin-bottom:4px">Ergonomic Chair</h4>
      <p class="pdx-txt-small pdx-ink-muted">Lumbar support, adjustable armrests, mesh back.</p>
      <p style="margin-top:8px;font-weight:600;color:var(--pdx-color-primary)">$449.00</p>
    </div>
    <div class="pdx-card-footer">
      <pdx-button variant="primary" size="sm" full>Add to Cart</pdx-button>
    </div>
  </pdx-card>
  <pdx-card hoverable>
    <div class="pdx-card-media"><img src="/demo-images/monitor.svg" alt="Monitor" /></div>
    <div class="pdx-card-body">
      <p class="pdx-txt-small pdx-ink-muted" style="margin-bottom:4px">Electronics</p>
      <h4 class="pdx-txt-subheading" style="margin-bottom:4px">4K Monitor 32"</h4>
      <p class="pdx-txt-small pdx-ink-muted">IPS panel, USB-C, 100% sRGB, height adjustable.</p>
      <p style="margin-top:8px;font-weight:600;color:var(--pdx-color-primary)">$349.00</p>
    </div>
    <div class="pdx-card-footer">
      <pdx-button variant="primary" size="sm" full>Add to Cart</pdx-button>
    </div>
  </pdx-card>
</div>
```

**Horizontal Layout** — Media + content side by side. Great for article lists, notifications, user profiles. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-card horizontal hoverable>
    <div class="pdx-card-media"><img src="/demo-images/mountains.svg" alt="Article" /></div>
    <div class="pdx-card-body">
      <p class="pdx-txt-small pdx-ink-muted">Mar 28, 2026 · 5 min read</p>
      <h4 class="pdx-txt-subheading" style="margin:4px 0">Building a Design System from Scratch</h4>
      <p class="pdx-txt-small pdx-ink-muted">How we created Pragmatic Design with CSS-first approach, token system, and 13 themes.</p>
    </div>
  </pdx-card>
  <pdx-card horizontal hoverable>
    <div class="pdx-card-media"><img src="/demo-images/city.svg" alt="Article" /></div>
    <div class="pdx-card-body">
      <p class="pdx-txt-small pdx-ink-muted">Mar 15, 2026 · 8 min read</p>
      <h4 class="pdx-txt-subheading" style="margin:4px 0">Source Generators: Zero Reflection at Scale</h4>
      <p class="pdx-txt-small pdx-ink-muted">Why we replaced runtime reflection with compile-time code generation across 15 modules.</p>
    </div>
  </pdx-card>
</div>
```

**Interactive States** — Emits pdx-click. Tab + Enter works. _(from the live demo)_

```html
<div class="demo-grid">
  <pdx-card clickable>
    <div class="pdx-card-body">
      <h4 class="pdx-txt-subheading">Clickable</h4>
    </div>
  </pdx-card>
  <pdx-card selected>
    <div class="pdx-card-body">
      <h4 class="pdx-txt-subheading">Selected</h4>
      <p class="pdx-txt-small pdx-ink-muted">Primary ring. For pricing/option selection.</p>
    </div>
  </pdx-card>
  <pdx-card disabled>
    <div class="pdx-card-body">
      <h4 class="pdx-txt-subheading">Disabled</h4>
      <p class="pdx-txt-small pdx-ink-muted">Faded, non-interactive.</p>
    </div>
  </pdx-card>
</div>
```

**Loading Skeleton** — Set `loading` prop — content replaced with animated skeleton placeholders. _(from the live demo)_

```html
<div class="demo-grid">
  <pdx-card loading></pdx-card>
  <pdx-card loading></pdx-card>
  <pdx-card loading></pdx-card>
</div>
```

**Compact — Dashboard Stats** _(from the live demo)_

```html
<div class="demo-grid-sm">
  <pdx-card compact hoverable elevation="1">
    <div class="pdx-card-body"><strong>Revenue</strong><br /><span style="font-size:1.5rem;font-weight:700">$12,450</span><br /><span class="pdx-txt-small pdx-ink-muted">+12% from last month</span></div>
  </pdx-card>
  <pdx-card compact hoverable elevation="1">
    <div class="pdx-card-body"><strong>Users</strong><br /><span style="font-size:1.5rem;font-weight:700">1,234</span><br /><span class="pdx-txt-small pdx-ink-muted">+5% from last week</span></div>
  </pdx-card>
  <pdx-card compact hoverable elevation="1">
    <div class="pdx-card-body"><strong>Orders</strong><br /><span style="font-size:1.5rem;font-weight:700">89</span><br /><span class="pdx-txt-small pdx-ink-muted">3 pending</span></div>
  </pdx-card>
</div>
```

