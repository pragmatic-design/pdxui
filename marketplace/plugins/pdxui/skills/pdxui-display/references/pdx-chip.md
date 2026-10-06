### `<pdx-chip>`

Compact, optionally removable tag.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `label` | `label` | string | `''` | Visible label text. |
| `variant` | `variant` | string | `''` | Visual variant. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `removable` | `removable` | boolean | `false` | Shows a × button — the chip's tab stop — named "Remove {label}", which emits pdx-remove. The chip does not remove itself: the app removes it and owns focus afterwards (move it to the next chip's ×, or the previous one), or a keyboard user is left on <body>. |
| `selectable` | `selectable` | boolean | `false` | A toggle button (role="button", aria-pressed): click, Enter or Space flips `selected` and emits pdx-toggle. |
| `selected` | `selected` | boolean | `false` | Selected state. A user toggle writes it before pdx-toggle; a parent that sets it afterwards wins. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `value` | `value` | string | `''` | Value passed in remove/toggle event detail for identification. |
| `avatar` | `avatar` | string | `''` | Avatar URL — renders a small circle image before the label. |

**Events:** `pdx-remove` → `detail: { value, label }` — Fired when an item is removed.; `pdx-toggle` → `detail: { selected, value }` — Fired when toggled open or closed. Does not bubble.

**Renders:** roles `button`

**Slot:** `icon` — An icon shown before the chip's label.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Outline Variants** — Default style — colored border + text, transparent background.

```html
<pdx-chip variant="primary">Primary</pdx-chip>
<pdx-chip variant="success" selected>Selected</pdx-chip>
```

**Tonal / Subtle Variants** — Muted background, no border. Use `variant="tonal-primary"` etc.

```html
<pdx-chip variant="tonal-primary">Primary</pdx-chip>
<pdx-chip variant="tonal-danger">Danger</pdx-chip>
```

**Sizes** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-chip size="sm">Small</pdx-chip>
  <pdx-chip>Default</pdx-chip>
  <pdx-chip size="lg">Large</pdx-chip>
</div>
```

**With Avatar** — `avatar` prop renders a small circle image before the label.

```html
<pdx-chip avatar="https://..." removable @pdx-remove="onRemove">
  Jane Doe
</pdx-chip>
```

**With Icon** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-chip variant="primary"><pdx-icon name="tag" size="sm"></pdx-icon> Label</pdx-chip>
  <pdx-chip variant="success"><pdx-icon name="check" size="sm"></pdx-icon> Verified</pdx-chip>
  <pdx-chip variant="danger"><pdx-icon name="alert-triangle" size="sm"></pdx-icon> Error</pdx-chip>
  <pdx-chip variant="tonal"><pdx-icon name="clock" size="sm"></pdx-icon> Pending</pdx-chip>
</div>
```

**Removable** — `removable` adds a close button — the chip's one tab stop, named "Remove React". The remove event carries `value` + `label`. The chip does not remove itself, and the app owns focus afterwards: here it moves to the next chip's ×, else the previous one, else Reset.

```html
<pdx-chip removable value="react" @pdx-remove="onRemove">React</pdx-chip>
```

```js
// event.detail = { value: "react", label: "React" }
```

**Selectable (Toggle)** — `selectable` makes the chip a toggle button (`role="button"` + `aria-pressed`): click, Enter or Space. Plain chips are not tab stops.

```html
<pdx-chip selectable variant="primary" :selected="sel" @pdx-toggle="onToggle">
  Music
</pdx-chip>
```

```js
// event.detail = { selected: true, value: "Music" }
```

**Disabled** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-chip disabled>Disabled</pdx-chip>
  <pdx-chip disabled removable>No Remove</pdx-chip>
  <pdx-chip disabled selected>Selected</pdx-chip>
  <pdx-chip disabled variant="primary">Primary</pdx-chip>
</div>
```

**Composition** — Select categories to filter. _(from the live demo)_

```html
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Filter Bar</h3>
  <div class="pdx-chip-group" style="margin-top:var(--pdx-space-sm)">
    <pdx-chip selectable variant="primary" selected>All</pdx-chip>
    <pdx-chip selectable variant="primary">Active</pdx-chip>
    <pdx-chip selectable variant="primary">Pending</pdx-chip>
    <pdx-chip selectable variant="primary">Archived</pdx-chip>
  </div>
</div>
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Article Tags</h3>
  <div class="pdx-chip-group" style="margin-top:var(--pdx-space-sm)">
    <pdx-chip variant="tonal-primary" size="sm"><pdx-icon name="tag" size="sm"></pdx-icon> JavaScript</pdx-chip>
    <pdx-chip variant="tonal-success" size="sm"><pdx-icon name="tag" size="sm"></pdx-icon> Tutorial</pdx-chip>
    <pdx-chip variant="tonal-warning" size="sm"><pdx-icon name="tag" size="sm"></pdx-icon> Advanced</pdx-chip>
  </div>
</div>
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Team Members</h3>
  <div class="pdx-chip-group" style="margin-top:var(--pdx-space-sm)">
    @for (team as member; track member.name) {
      <pdx-chip :avatar="member.avatar" removable :value="member.name" @pdx-remove="e => team = dropPerson(team, e)">{{ member.name }}</pdx-chip>
    }
    @if (team.length === 0) {
      <button class="pdx-ghost" size="sm" @click="team = startTeam()">Add everyone back</button>
    }
  </div>
</div>
```

