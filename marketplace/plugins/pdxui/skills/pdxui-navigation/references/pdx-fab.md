### `<pdx-fab>`

A floating action button.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `icon` | `icon` | string | `'plus'` | Main button icon name |
| `label` | `label` | string | `''` | Main button label (screen reader). Empty: the fab.label component string, «Actions». |
| `actions` | — | array | `[]` | Speed dial actions |
| `position` | `position` | string | `'bottom-right'` | Position: bottom-right (default), bottom-left, top-right, top-left |
| `variant` | `variant` | string | `'primary'` | Variant: primary, secondary, danger |
| `size` | `size` | string | `'md'` | Size: sm, md, lg |
| `direction` | `direction` | string | `'up'` | Speed dial direction: up (default), down, left, right |
| `type` | `type` | string | `'linear'` | Speed dial layout: linear (default), circle, semi-circle, quarter-circle |
| `showTooltip` | `showtooltip` | boolean | `true` | Show tooltip labels next to actions |
| `mask` | `mask` | boolean | `false` | Show mask overlay when open |
| `trigger` | `trigger` | string | `'click'` | Trigger mode: click (default), hover |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `open()` | Opens it. |
| `close()` | Closes it. |
| `toggle()` | Toggles it open/closed. |

**Events:** `pdx-click` → `detail: {}` — Fired on `pdx-click`.; `pdx-select` → `detail: { key, action }` — Fired when an item is selected.

**Renders:** roles `menu` · `menuitem`

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

