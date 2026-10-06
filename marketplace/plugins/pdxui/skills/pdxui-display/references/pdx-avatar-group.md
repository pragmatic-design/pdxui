### `<pdx-avatar-group>`

Stacked avatars with an overflow count.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | array | `null` | The data items to render. |
| `max` | `max` | number | `5` | Maximum allowed value. |
| `size` | `size` | string | `'md'` | Size of the control (e.g. sm, md, lg). |
| `overlap` | `overlap` | number | `-8` | How much adjacent avatars overlap. |
| `direction` | `direction` | string | `'row'` | Stacking direction. |
| `clickable` | `clickable` | boolean | `false` | Avatars and the +N become buttons: a click, Enter or Space fires pdx-click / pdx-overflow-click. |
| `bordered` | `bordered` | boolean | `true` | Adds a border. |

**Events:** `pdx-click` → `detail: { item, index }` — Fired on `pdx-click`.; `pdx-overflow-click` → `detail: { count, items }` — Fired when the overflow is clicked.

**Renders:** roles `button` · `img`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — 8 team members, max=5 — shows +3 overflow badge.

```html
<pdx-avatar-group :items="teamItems" :max="5"></pdx-avatar-group>
```

**With Images** — Avatars with profile images. _(from the live demo)_

```html
<div class="demo-container">
  <pdx-avatar-group :items="imageItems" :max="4"></pdx-avatar-group>
</div>
```

**Sizes** _(from the live demo)_

```html
<div class="demo-stack">
  <div class="demo-row">
    <span class="pdx-txt-small pdx-ink-muted size-label">xs</span>
    <pdx-avatar-group :items="teamItems" :max="4" size="xs" :overlap="-6"></pdx-avatar-group>
  </div>
  <div class="demo-row">
    <span class="pdx-txt-small pdx-ink-muted size-label">sm</span>
    <pdx-avatar-group :items="teamItems" :max="4" size="sm" :overlap="-6"></pdx-avatar-group>
  </div>
  <div class="demo-row">
    <span class="pdx-txt-small pdx-ink-muted size-label">md</span>
    <pdx-avatar-group :items="teamItems" :max="4" size="md"></pdx-avatar-group>
  </div>
  <div class="demo-row">
    <span class="pdx-txt-small pdx-ink-muted size-label">lg</span>
    <pdx-avatar-group :items="teamItems" :max="4" size="lg" :overlap="-10"></pdx-avatar-group>
  </div>
  <div class="demo-row">
    <span class="pdx-txt-small pdx-ink-muted size-label">xl</span>
    <pdx-avatar-group :items="teamItems" :max="4" size="xl" :overlap="-12"></pdx-avatar-group>
  </div>
</div>
```

**Clickable** — Click on an avatar or the overflow badge, or Tab to it and press Enter or Space. Each avatar is a button named by its person, the badge one named "4 more". Hover scales up. _(from the live demo)_

```html
<div class="demo-container">
  <pdx-avatar-group :items="teamItems" :max="4" :clickable="true" @pdx-click="onAvatarClick" @pdx-overflow-click="onOverflowClick"></pdx-avatar-group>
</div>
<div class="event-log pdx-txt-mono pdx-txt-small" id="click-log">{{ clickLog }}</div>
```

**Reversed** — row-reverse direction — avatars stack from right to left. _(from the live demo)_

```html
<div class="demo-container">
  <pdx-avatar-group :items="teamItems" :max="5" direction="row-reverse"></pdx-avatar-group>
</div>
```

**Custom Max** _(from the live demo)_

```html
<div class="demo-stack">
  <div class="demo-row">
    <span class="pdx-txt-small pdx-ink-muted size-label">max=3</span>
    <pdx-avatar-group :items="teamItems" :max="3"></pdx-avatar-group>
  </div>
  <div class="demo-row">
    <span class="pdx-txt-small pdx-ink-muted size-label">max=7</span>
    <pdx-avatar-group :items="teamItems" :max="7"></pdx-avatar-group>
  </div>
</div>
```

**Without Border** _(from the live demo)_

```html
<div class="demo-container">
  <pdx-avatar-group :items="teamItems" :max="5" :bordered="false"></pdx-avatar-group>
</div>
```

