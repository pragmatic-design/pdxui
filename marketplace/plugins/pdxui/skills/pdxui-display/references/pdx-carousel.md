### `<pdx-carousel>`

A swipeable slideshow.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | array | `null` | The data items to render. |
| `renderSlide` | — | object | `null` | Render function for each slide. |
| `autoplay` | `autoplay` | boolean | `false` | Advances slides automatically. |
| `interval` | `interval` | number | `5000` | Autoplay interval in milliseconds. |
| `loop` | `loop` | boolean | `true` | Wraps around from the last slide to the first. |
| `showArrows` | `showarrows` | boolean | `true` | Shows previous/next arrows. |
| `showDots` | `showdots` | boolean | `true` | Shows the slide-position dots. |
| `slidesPerView` | `slidesperview` | number | `1` | How many slides are visible at once. |
| `gap` | `gap` | number | `0` | Gap between slides in px. |
| `swipeable` | `swipeable` | boolean | `true` | Enables touch/drag swiping. |
| `pauseOnHover` | `pauseonhover` | boolean | `true` | Pauses autoplay while hovered. |
| `animation` | `animation` | string | `'slide'` | Transition style between slides. |
| `label` | `label` | string | `''` | The region's accessible name. Empty: the component string `carousel.label` ("Carousel"). |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `next()` | Advances to the next item. |
| `prev()` | Goes to the previous item. |
| `goTo(index)` | Go to a slide by index — wrapped around when `loop` is set, clamped otherwise. Ignored while a transition is running. |
| `play()` | Start autoplay. Does nothing when `interval` is 0 or less. |
| `pause()` | Stop autoplay, leaving the slide where it is. |
| `goto(index)` | `goTo` under its all-lowercase spelling. |
| `index` _(read-only)_ | Read-only, via a ref: `el.index`. |

**Events:** `pdx-autoplay-start` → `detail: {}` — Fired on `pdx-autoplay-start`.; `pdx-autoplay-stop` → `detail: {}` — Fired on `pdx-autoplay-stop`.; `pdx-change` → `detail: { index, item }` — Fired when the value changes.

**Renders:** roles `group` · `region` · `tab` · `tablist`

**Slot:** `slide` — Scoped — renders one slide. Receives `{ slide, index, isActive }`.

**Shapes:** `CarouselItem { src?: string; alt?: string; content?: string; caption?: string }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — 5 landscape photos with prev/next arrows and dot indicators.

```html
<pdx-carousel :items="slides"></pdx-carousel>
```

```js
// slides = [
//   { src: '/demo-images/mountains.svg', alt: 'Landscape 1' },
//   { src: '/demo-images/ocean.svg', alt: 'Landscape 2' },
//   ...
// ]
```

**Autoplay** — Auto-advances every 3 seconds and pauses on hover. The control at the top left stops and restarts the rotation, and it also stops when keyboard focus moves into the carousel.

```html
<pdx-carousel :items="slides" autoplay :interval="3000" pause-on-hover></pdx-carousel>
```

**Fade Animation** — Crossfade between slides instead of sliding.

```html
<pdx-carousel :items="slides" animation="fade"></pdx-carousel>
```

**Multiple Slides** — 3 slides visible at once with a 16px gap. Great for product cards.

```html
<pdx-carousel :items="cards" :slides-per-view="3" :gap="16" :show-dots="false"></pdx-carousel>
```

**Custom Slide Template** — Use `renderSlide` for full control over each slide's content.

```html
<pdx-carousel :items="testimonials" :render-slide="renderFn"></pdx-carousel>
```

```js
// renderFn = (item, index) => {
//   return '<div class="testimonial">...' + item.content + '</div>';
// }
```

**Swipe** — Swipeable is on by default. Try dragging left/right with mouse or touch. _(from the live demo)_

```html
<div class="demo-container">
  <pdx-carousel :items="basicSlides" :show-arrows="false"></pdx-carousel>
</div>
```

**No Loop** — When `loop` is false, the carousel stops at the first and last slide, and the arrow that cannot move is disabled. _(from the live demo)_

```html
<div class="demo-container">
  <pdx-carousel :items="basicSlides" :loop="false"></pdx-carousel>
</div>
```

**Slot Template** — Custom slide content via scoped slot. Receives `slide`, `index`, and `isActive`.

```html
<!-- Compose PDX components inside carousel slides -->
<pdx-carousel :items="slides">
  <slot name="slide" let:slide let:index>
    <div class="slide">
      <pdx-badge variant="outline">Step {index + 1}</pdx-badge>
      <h3>{slide.title}</h3>
      <p>{slide.desc}</p>
    </div>
  </slot>
</pdx-carousel>
```

