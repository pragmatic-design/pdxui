### `<pdx-fab>`

A floating action button.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `icon` | `icon` | string | `'plus'` | Main button icon name |
| `label` | `label` | string | `''` | Main button label (screen reader). Empty: the fab.label component string, «Actions». |
| `actions` | — | array | `[]` | Speed dial actions |
| `direction` | `direction` | string | `'up'` | Speed dial direction: up (default), down, left, right |
| `type` | `type` | string | `'linear'` | Speed dial layout: linear (default), circle, semi-circle, quarter-circle |
| `showTooltip` | `showtooltip` | boolean | `true` | Show tooltip labels next to actions |
| `mask` | `mask` | boolean | `false` | Show mask overlay when open |
| `trigger` | `trigger` | string | `'click'` | Trigger mode: click (default), hover |
| `variant` | `variant` | 'primary' \| 'secondary' \| 'danger' | `'primary'` | primary (the default), secondary or danger. |
| `size` | `size` | 'md' \| 'sm' \| 'lg' | `'md'` | sm, md (the default) or lg. |
| `position` | `position` | 'bottom-right' \| 'bottom-left' \| 'top-right' \| 'top-left' | `'bottom-right'` | bottom-right (the default), bottom-left, top-right or top-left. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `show()` | Shows it. |
| `close()` | Closes it. |
| `toggle()` | Toggles it open/closed. |
| `isOpen` _(read-only)_ | Read-only, via a ref: `el.isOpen`. |

**Events:** `open-change` → `detail: { value: boolean }` — The speed dial opened (`true`) or closed (`false`): its open state, read-only (#288). The parent never writes it, so it is not a model, and `::open` on it is an error.; `pdx-click` → `detail: Record<string, never>` — The button was pressed, on a FAB with no speed dial.; `pdx-select` → `detail: { key: string; action: FabAction }` — An action of the speed dial was chosen.

**Renders:** roles `menu` · `menuitem`

**States:** `:state(open)` — Matched with `:state(open)`.

**Parts:** `[data-part="root"]` — The element reached as `[data-part="root"]`.; `[data-part="menu"]` — The element reached as `[data-part="menu"]`.; `[data-part="item"]` — The element reached as `[data-part="item"]`.; `[data-part="label"]` — The element reached as `[data-part="label"]`.; `[data-part="mask"]` — The element reached as `[data-part="mask"]`.

**Shapes:** `FabAction { key: string; label: string; icon: string }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic FAB** — Single action. Click fires `pdx-click`. _(from the live demo)_

```html
<div class="demo-frame" style="width:200px;height:160px">
  <pdx-fab icon="plus" label="Add new" position="bottom-right" @pdx-click="onFabClick"></pdx-fab>
</div>
<div class="event-log pdx-txt-mono pdx-txt-small" id="fab-log">{{ fabLog }}</div>
```

**Speed Dial — Directions** — Click each FAB to expand. Actions appear in the specified direction.

```html
<pdx-fab icon="plus" :actions="actions" direction="up" :show-tooltip="true">
</pdx-fab>

<pdx-fab icon="plus" :actions="actions" direction="left">
</pdx-fab>
```

**Circular Layouts** — Actions in circle, semi-circle, or quarter-circle around the FAB. _(from the live demo)_

```html
<div class="demo-row-wrap">
  <div>
    <h3 class="pdx-txt-small">type="circle"</h3>
    <div class="demo-frame" style="width:260px;height:260px">
      <pdx-fab icon="plus" :actions="circleActions" type="circle" position="bottom-right"></pdx-fab>
    </div>
  </div>
  <div>
    <h3 class="pdx-txt-small">type="semi-circle"</h3>
    <div class="demo-frame" style="width:260px;height:260px">
      <pdx-fab icon="plus" :actions="speedDialActions" type="semi-circle" direction="up" position="bottom-right"></pdx-fab>
    </div>
  </div>
  <div>
    <h3 class="pdx-txt-small">type="quarter-circle" direction="up-left"</h3>
    <div class="demo-frame" style="width:260px;height:260px">
      <pdx-fab icon="plus" :actions="speedDialActions" type="quarter-circle" direction="up-left" position="bottom-right"></pdx-fab>
    </div>
  </div>
</div>
```

**Mask Overlay + Hover Trigger** — Hover to expand. Dark overlay behind. Click outside or Escape to close. _(from the live demo)_

```html
<div class="demo-frame" style="width:320px;height:280px">
  <pdx-fab icon="plus" :actions="speedDialActions" mask trigger="hover" position="bottom-right" :show-tooltip="true"></pdx-fab>
</div>
```

**Variants & Sizes** _(from the live demo)_

```html
<div class="demo-row-wrap">
  <div class="demo-frame" style="width:140px;height:140px">
    <span class="frame-tag pdx-txt-small">sm / primary</span>
    <pdx-fab icon="plus" variant="primary" size="sm" position="bottom-right"></pdx-fab>
  </div>
  <div class="demo-frame" style="width:140px;height:140px">
    <span class="frame-tag pdx-txt-small">md / secondary</span>
    <pdx-fab icon="edit" variant="secondary" size="md" position="bottom-right"></pdx-fab>
  </div>
  <div class="demo-frame" style="width:140px;height:140px">
    <span class="frame-tag pdx-txt-small">lg / danger</span>
    <pdx-fab icon="trash" variant="danger" size="lg" position="bottom-right"></pdx-fab>
  </div>
</div>
```

