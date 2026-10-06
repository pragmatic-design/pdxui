# Rating Component — Cross-Library Research

> Research date: 2026-04-06 | Libraries: 11 analyzed

## Feature Matrix

| Feature | MUI | Ant Design | Mantine | PrimeVue | Naive UI | Shoelace | Element+ | Radzen | Chakra UI | Ark UI | HeroUI |
|---------|-----|------------|---------|----------|----------|----------|----------|--------|-----------|--------|--------|
| **value** (controlled) | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | -- |
| **defaultValue** | Y | Y (0) | Y | -- | Y (null) | -- | -- | -- | Y | Y | -- |
| **max/count/stars** | max=5 | count=5 | -- | stars=5 | count=5 | max=5 | max=5 | Stars=5 | count=5 | count=5 | -- |
| **Half-star** | precision | allowHalf | fractions | -- | allowHalf | precision | allowHalf | -- | allowHalf | allowHalf | -- |
| **Arbitrary precision** | Y (any) | -- | Y (2,3,4) | -- | -- | Y (any) | -- | -- | -- | -- | -- |
| **readOnly** | Y | -- | Y | Y | Y | Y | disabled* | Y | Y | Y | -- |
| **disabled** | Y | Y | -- | Y | -- | Y | Y | Y | Y | Y | -- |
| **Size** | sm/md/lg | sm/md/lg | xs-xl | -- | sm/md/lg/N | --* | lg/sm | -- | Y | -- | -- |
| **Color** | sx | -- | Y (theme) | -- | Y | CSS vars | colors[] | -- | colorPalette | -- | -- |
| **Custom icons** | icon+emptyIcon | character | fullSymbol+emptySymbol | slots | -- | getSymbol(fn) | icons[] | -- | icon | via render | -- |
| **Tooltips** | -- | tooltips[] | -- | -- | -- | -- | texts[] | -- | -- | -- | -- |
| **allowClear** | -- | Y (default!) | Y | toggle* | Y | -- | clearable | -- | -- | -- | -- |
| **Show text/score** | -- | -- | -- | -- | -- | -- | showText+showScore | -- | -- | -- | -- |
| **Threshold colors** | -- | -- | -- | -- | -- | -- | low/high+colors | -- | -- | -- | -- |
| **onChange** | Y | Y | Y | Y | Y | sl-change | change | Change | onValueChange | onValueChange | -- |
| **onHover** | onChangeActive | onHoverChange | -- | -- | -- | sl-hover | -- | -- | onHoverChange | onHoverChange | -- |
| **name (form)** | Y | -- | Y | -- | -- | -- | -- | Name | -- | Y | -- |
| **Hidden input** | Y | -- | -- | -- | -- | -- | -- | -- | Y | Y | -- |
| **required** | -- | -- | -- | -- | -- | -- | -- | -- | -- | Y | -- |
| **form** attr | -- | -- | -- | -- | -- | -- | -- | -- | -- | Y | -- |
| **ARIA label** | getLabelText | -- | -- | -- | -- | label | aria-label | RateAriaLabel | -- | translations | -- |
| **Keyboard nav** | arrows | arrows+keyboard | -- | arrows | -- | -- | -- | Tab+Space | arrows | arrows | -- |
| **highlightSelectedOnly** | Y | -- | Y | -- | -- | -- | -- | -- | -- | -- | -- |
| **Has component** | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | **NO** |

`--` = not supported or not documented. `*` = notes below.

**Notes:**
- HeroUI (NextUI): does **not** have a Rating component as of 2026-04.
- Shoelace: size via `--symbol-size` CSS var, not a prop. `disabled` serves as both disabled+readonly semantically.
- PrimeVue: cancel prop removed in v4; clicking selected star toggles it off. No half-star natively (PR pending).
- Element+: `disabled` prop actually means readonly (still shows colored). Three-tier threshold color system is unique.
- Mantine: `fractions={2}` = half, `fractions={3}` = thirds, `fractions={4}` = quarters. Not arbitrary float.
- Naive UI: `size` accepts preset string OR number (px). `color` is a single string override.
- Radzen: Blazor component, integer-only (no half-star support).

## Prop Name Frequency (consensus)

| Prop concept | Most common name | Count (out of 10) |
|---|---|---|
| Current value | `value` | 10/10 |
| Max stars | `count` (5) / `max` (3) / `stars` (2) | 10/10 |
| Half-star | `allowHalf` (5) / `precision` (2) / `fractions` (1) | 8/10 |
| Read-only | `readOnly` / `readonly` | 8/10 |
| Disabled | `disabled` | 8/10 |
| Size | `size` | 7/10 |
| Clear on re-click | `allowClear` / `clearable` | 5/10 |
| Custom icon | various (icon/character/symbol/slot) | 7/10 |
| onChange | `onChange` / `onValueChange` / `change` | 10/10 |
| onHover | `onHoverChange` / `onChangeActive` / `sl-hover` | 5/10 |
| Form name | `name` | 5/10 |
| Color | `color` / `colors` / CSS var | 5/10 |
| Tooltips/texts | `tooltips` / `texts` | 2/10 |
| ARIA label | `label` / `aria-label` / `getLabelText` | 5/10 |

## Must-Have Features (>50% adoption)

1. **value / defaultValue** — controlled + uncontrolled
2. **count** (max stars, default 5)
3. **Half-star support** — via `precision` (most flexible)
4. **readOnly** + **disabled** (separate states)
5. **size** — at least sm/md/lg
6. **Custom icons** — slot-based for WC
7. **onChange event**
8. **onHover event** — with hovered value
9. **Keyboard navigation** — arrow keys
10. **ARIA** — role, label, screen reader text per star

## Differentiators We Should Add

| Feature | Inspiration | Value |
|---------|-------------|-------|
| **Arbitrary precision** (0.1-1.0) | MUI, Shoelace | Supports NPS, fine-grained feedback |
| **Threshold colors** | Element+ | Auto color by score range (red/yellow/green) |
| **Tooltips per star** | Ant Design | "Poor", "Fair", "Good", "Great", "Excellent" |
| **Show value text** | Element+ | Display numeric score or template |
| **highlightSelectedOnly** | MUI, Mantine | Only highlight selected, not all up to it |
| **clearable** | Ant Design (default on!) | Click same star to reset to 0/null |
| **getSymbol(value)** | Shoelace | Different icon per star value (emoji scale) |
| **form association** | Ark UI | `form` attr, `required`, hidden input |
| **Hover phase tracking** | Shoelace | `start`/`move`/`end` phases |

## Recommended API: `pdx-rating`

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `number` | `0` | Current rating value |
| `count` | `number` | `5` | Number of symbols |
| `precision` | `number` | `1` | Step increment (1=whole, 0.5=half, 0.25=quarter, etc.) |
| `size` | `'sm'\|'md'\|'lg'` | `'md'` | Predefined sizes |
| `readonly` | `boolean` | `false` | Display only, no interaction |
| `disabled` | `boolean` | `false` | Grayed out, no interaction |
| `clearable` | `boolean` | `false` | Click same value to clear to 0 |
| `color` | `string` | `'amber'` | Active symbol color (theme token or CSS color) |
| `highlight-selected-only` | `boolean` | `false` | Only highlight exact selected, not range |
| `label` | `string` | `'Rating'` | ARIA label for screen readers |
| `name` | `string` | -- | Form field name (enables hidden input) |
| `required` | `boolean` | `false` | Form validation required |
| `form` | `string` | -- | Associate with `<form>` by id |
| `tooltips` | `string[]` | -- | Tooltip text per star (`['Bad','Poor','OK','Good','Great']`) |
| `show-value` | `boolean` | `false` | Display numeric value next to stars |
| `value-template` | `string` | `'{value}'` | Template for displayed value (e.g. `'{value}/5'`) |

### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `pdx-change` | `{ value: number }` | Fired when value changes |
| `pdx-hover` | `{ value: number, phase: 'start'\|'move'\|'end' }` | Fired on hover with phase tracking |

### Slots

| Slot | Args | Description |
|------|------|-------------|
| `icon` | `{ value: number, index: number, state: 'empty'\|'half'\|'full' }` | Custom symbol per star |
| `value-display` | `{ value: number, count: number }` | Custom value text rendering |

### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--pdx-rating-size` | `24px` | Symbol dimensions |
| `--pdx-rating-gap` | `2px` | Spacing between symbols |
| `--pdx-rating-color` | `var(--pdx-amber-500)` | Active color |
| `--pdx-rating-color-empty` | `var(--pdx-neutral-300)` | Inactive color |
| `--pdx-rating-color-hover` | `var(--pdx-amber-400)` | Hover color |
| `--pdx-rating-color-disabled` | `var(--pdx-neutral-200)` | Disabled color |
| `--pdx-rating-transition` | `150ms ease` | Color/scale transition |

### CSS Parts

| Part | Description |
|------|-------------|
| `base` | Outer container |
| `item` | Each star wrapper |
| `symbol` | The SVG/icon element |
| `value` | The value text display |

### Data Attributes (state)

| Attribute | Applied to | When |
|-----------|------------|------|
| `data-value` | `base` | Always (current value) |
| `data-readonly` | `base` | When readonly |
| `data-disabled` | `base` | When disabled |
| `data-highlighted` | `item` | Index <= hovered value |
| `data-selected` | `item` | Index <= current value |
| `data-half` | `item` | Partial fill (precision < 1) |

### ARIA / Accessibility

- Role: `radiogroup` on container, each star is `radio` with `aria-checked`
- `aria-label` from `label` prop on container
- Each star: `aria-label` = `"{n} out of {count}"` (customizable via `label` prop pattern)
- **Keyboard**: `ArrowRight`/`ArrowUp` = increment by precision, `ArrowLeft`/`ArrowDown` = decrement, `Home` = 0, `End` = max
- `tabindex="0"` on container, roving tabindex on items
- Hidden `<input>` when `name` is set for form submission
- Focus ring visible on keyboard navigation

### Threshold Colors (auto-color by score)

Optional: if `color` is an object `{ [threshold]: color }`:
```
color="{{ 2: 'red', 3: 'orange', 4: 'amber', 5: 'green' }}"
```
Stars change color based on current value vs thresholds. Inspired by Element+.

## Key Design Decisions

1. **`precision` over `allowHalf`** — single prop handles all granularity (whole, half, quarter, tenth)
2. **`count` not `max`** — "count" is clearer: number of symbols rendered. `max` is ambiguous (max value vs max count)
3. **Slot-based icons** — WC-native approach, more flexible than callback function
4. **Separate `readonly` vs `disabled`** — readonly shows current value styled normally; disabled grays out
5. **`clearable` default false** — Ant Design defaults true which surprises users; explicit opt-in is safer
6. **Phase-tracking hover** — Shoelace pattern enables rich hover UI (preview tooltips, etc.)
7. **Form-first** — hidden input + name + required + form association from day one (Ark UI pattern)
