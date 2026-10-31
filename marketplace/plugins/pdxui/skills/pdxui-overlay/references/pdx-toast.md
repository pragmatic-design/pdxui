### `<pdx-toast>`

Transient, stacked notifications.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `position` | `position` | 'top-right' \| 'top-left' \| 'bottom-right' \| 'bottom-left' \| 'top-center' \| 'bottom-center' | `'top-right'` | Where the stack sits on the screen: top-right (the default), top-left, bottom-right, bottom-left, top-center or bottom-center. |

**Renders:** roles `alert` · `status`

**Parts:** `[data-part="root"]` — The element reached as `[data-part="root"]`.; `[data-part="toast"]` — The element reached as `[data-part="toast"]`.; `[data-part="icon"]` — The element reached as `[data-part="icon"]`.; `[data-part="title"]` — The element reached as `[data-part="title"]`.; `[data-part="message"]` — The element reached as `[data-part="message"]`.; `[data-part="action"]` — The element reached as `[data-part="action"]`.; `[data-part="close"]` — The element reached as `[data-part="close"]`.; `[data-part="progress"]` — The element reached as `[data-part="progress"]`.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Types** — 4 semantic types with auto-matched icons and colors. _(from the live demo)_

```html
<div class="btn-row">
  <pdx-button variant="primary" size="sm" @click="showSuccess">Success</pdx-button>
  <pdx-button variant="danger" size="sm" @click="showError">Error</pdx-button>
  <pdx-button variant="warning" size="sm" @click="showWarning">Warning</pdx-button>
  <pdx-button variant="secondary" size="sm" @click="showInfo">Info</pdx-button>
</div>
```

**Visual Variants** — 3 styles: filled (colored bg), bordered (left accent), minimal (neutral). _(from the live demo)_

```html
<div class="btn-row">
  <pdx-button variant="outline" size="sm" @click="showFilled">Filled (default)</pdx-button>
  <pdx-button variant="outline" size="sm" @click="showBordered">Bordered</pdx-button>
  <pdx-button variant="outline" size="sm" @click="showMinimal">Minimal</pdx-button>
</div>
```

**Title + Description** — Add `title` for a bold heading above the message. _(from the live demo)_

```html
<div class="btn-row">
  <pdx-button variant="primary" size="sm" @click="showRichSuccess">Rich Success</pdx-button>
  <pdx-button variant="danger" size="sm" @click="showRichError">Rich Error</pdx-button>
  <pdx-button variant="outline" size="sm" @click="showRichBordered">Rich Bordered</pdx-button>
</div>
```

**Sizes** — 3 sizes: compact, default, large. Affects padding, font size, icon size. _(from the live demo)_

```html
<div class="btn-row">
  <pdx-button variant="outline" size="sm" @click="showCompact">Compact</pdx-button>
  <pdx-button variant="outline" size="sm" @click="showDefault">Default</pdx-button>
  <pdx-button variant="outline" size="sm" @click="showLargeSize">Large</pdx-button>
</div>
```

**With Action** — Toast with an action button (e.g., Undo). _(from the live demo)_

```html
<pdx-button variant="outline" size="sm" @click="showWithAction">Delete Item (with Undo)</pdx-button>
```

**Custom Icon** — Override the default icon per type, or set `icon: null` for no icon. _(from the live demo)_

```html
<div class="btn-row">
  <pdx-button variant="outline" size="sm" @click="showCustomIcon">Custom Icon (star)</pdx-button>
  <pdx-button variant="outline" size="sm" @click="showNoIcon">No Icon</pdx-button>
</div>
```

**Promise API** — `toast.promise()` — loading → success/error automatically. _(from the live demo)_

```html
<div class="btn-row">
  <pdx-button variant="primary" size="sm" @click="showPromiseSuccess">Save (succeeds in 2s)</pdx-button>
  <pdx-button variant="danger" size="sm" @click="showPromiseFail">Save (fails in 2s)</pdx-button>
</div>
```

**Persistent & Hover Pause** _(from the live demo)_

```html
<div class="btn-row">
  <pdx-button variant="outline" size="sm" @click="showPersistent">Persistent (no auto-dismiss)</pdx-button>
  <pdx-button variant="outline" size="sm" @click="showLong">8s Toast (hover to pause)</pdx-button>
</div>
```

