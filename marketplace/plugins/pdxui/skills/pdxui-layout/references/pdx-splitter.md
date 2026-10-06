### `<pdx-splitter>`

Resizable panes.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `orientation` | `orientation` | string | `'horizontal'` | Orientation: horizontal (side-by-side) or vertical (stacked) |
| `panes` | — | array | `[]` | Pane configurations — array matching child elements |
| `gutterSize` | `guttersize` | number | `6` | Gutter size in px |
| `autoSaveId` | `autosaveid` | string | `''` | localStorage key for persistence (empty = no save) |
| `keyboardStep` | `keyboardstep` | number | `2` | Keyboard step size in % |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `getSizes()` | The pane sizes now, in percent of the space the gutters leave. |
| `setSizes(sizes)` | Apply pane sizes, in percent, and save them when `auto-save-id` is set. |
| `resetSizes()` | Forget the saved sizes and lay the panes out again from their props. |
| `isDragging()` | Whether a divider is being dragged right now. |

**Events:** `pdx-resize` → `detail: { sizes }` — Fired on `pdx-resize`.; `pdx-resize-end` → `detail: { sizes }` — Fired on `pdx-resize-end`.; `pdx-resize-start` → `detail: { sizes }` — Fired on `pdx-resize-start`.

**Renders:** roles `separator`

**Shapes:** `SplitterPane { min?: number; max?: number; defaultSize?: number; collapsible?: boolean; collapsedSize?: number }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Horizontal Split** — Drag the handle to resize. Arrow keys to resize by keyboard.

```html
<pdx-splitter orientation="horizontal" :panes="panes">
  <div>Left Pane</div>
  <div>Right Pane</div>
</pdx-splitter>
```

```js
// panes = [{ min: 15, max: 50, defaultSize: 30 }, { min: 20 }]
```

**Vertical Split** — Editor area _(from the live demo)_

```html
<div class="demo-split">
  <pdx-splitter orientation="vertical" :panes="vPanes">
    <div class="pane-content">
      <strong>Top Pane</strong>
    </div>
    <div class="pane-content">
      <strong>Bottom Pane</strong>
      <p class="pdx-txt-small pdx-ink-muted">Terminal / output panel</p>
    </div>
  </pdx-splitter>
</div>
```

**Three Panes** _(from the live demo)_

```html
<div class="demo-split">
  <pdx-splitter orientation="horizontal" :panes="threePanes">
    <div class="pane-content pane-left">
      <pdx-icon name="folder" size="20"></pdx-icon>
      <strong>Explorer</strong>
    </div>
    <div class="pane-content">
      <pdx-icon name="code" size="20"></pdx-icon>
      <strong>Editor</strong>
    </div>
    <div class="pane-content">
      <pdx-icon name="terminal" size="20"></pdx-icon>
      <strong>Terminal</strong>
    </div>
  </pdx-splitter>
</div>
```

**Collapsible (Double-Click Handle)** — Double-click the handle to collapse/expand the left pane. _(from the live demo)_

```html
<div class="demo-split">
  <pdx-splitter orientation="horizontal" :panes="collapsiblePanes">
    <div class="pane-content pane-left">
      <strong>Sidebar</strong>
      <p class="pdx-txt-small pdx-ink-muted">Double-click handle to collapse</p>
    </div>
    <div class="pane-content">
      <strong>Content</strong>
    </div>
  </pdx-splitter>
</div>
```

**Nested Splits (IDE Layout)** _(from the live demo)_

```html
<div class="demo-split demo-split-tall">
  <pdx-splitter orientation="horizontal" :panes="idePanesH">
    <div class="pane-content pane-left">
      <pdx-icon name="folder" size="18"></pdx-icon>
      <span class="pdx-txt-small">Files</span>
    </div>
    <pdx-splitter orientation="vertical" :panes="idePanesV">
      <div class="pane-content">
        <pdx-icon name="code" size="18"></pdx-icon>
        <span class="pdx-txt-small">Editor</span>
      </div>
      <div class="pane-content">
        <pdx-icon name="terminal" size="18"></pdx-icon>
        <span class="pdx-txt-small">Terminal</span>
      </div>
    </pdx-splitter>
  </pdx-splitter>
</div>
```

