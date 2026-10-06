### `<pdx-popover>`

Floating content anchored to a trigger.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `trigger` | `trigger` | string | `'click'` | How it opens: 'click', 'hover', 'focus' or 'manual'. |
| `placement` | `placement` | string | `'bottom'` | Position relative to the anchor element. |
| `ariaLabel` | `arialabel` | string | `''` | The dialog's name. Empty: its first heading, else the popover.label component string. |
| `open` | `open` | boolean | `false` | Whether it is open. |
| `closeOnOutside` | `closeonoutside` | boolean | `true` | Close when clicking outside. |
| `closeOnEscape` | `closeonescape` | boolean | `true` | Close when the Escape key is pressed. |
| `offsetPx` | `offsetpx` | number \| null | `null` | Gap in px between the popover and its anchor. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `show()` | Shows it. |
| `hide()` | Hides it. |
| `toggle()` | Toggles it open/closed. |
| `isOpen` _(read-only)_ | Read-only, via a ref: `el.isOpen`. |

**Renders:** roles `dialog`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic (Click)** — Click the button to toggle the popover. Click outside or press Escape to close. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button variant="outline" size="sm">Click me</pdx-button>
  <pdx-popover>
    <p style="margin:0;font-size:var(--pdx-text-sm)">This is a popover with rich content. Click outside to close.</p>
  </pdx-popover>
</div>
```

**Placements** — 4 main placements. Click each button to see. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button variant="outline" size="sm">Top</pdx-button>
  <pdx-popover placement="top"><p class="pop-text">Popover on top</p></pdx-popover>
  <pdx-button variant="outline" size="sm">Bottom</pdx-button>
  <pdx-popover placement="bottom"><p class="pop-text">Popover on bottom</p></pdx-popover>
  <pdx-button variant="outline" size="sm">Left</pdx-button>
  <pdx-popover placement="left"><p class="pop-text">Popover on left</p></pdx-popover>
  <pdx-button variant="outline" size="sm">Right</pdx-button>
  <pdx-popover placement="right"><p class="pop-text">Popover on right</p></pdx-popover>
</div>
```

**Hover Trigger** — Use `trigger="hover"` to open on mouse enter, or when the trigger takes keyboard focus. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button variant="outline" size="sm">Hover me</pdx-button>
  <pdx-popover trigger="hover" placement="bottom">
    <p class="pop-text">This popover opens on hover.</p>
  </pdx-popover>
</div>
```

**Rich Content** — Popovers can contain forms, lists, or any interactive content. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button variant="primary" size="sm">Settings</pdx-button>
  <pdx-popover placement="bottom-start">
    <div class="pop-form">
      <strong style="font-size:var(--pdx-text-sm)">Quick Settings</strong>
      <label class="pop-label"><input type="checkbox" checked /> Notifications</label>
      <label class="pop-label"><input type="checkbox" /> Dark mode</label>
      <label class="pop-label"><input type="checkbox" checked /> Auto-save</label>
    </div>
  </pdx-popover>
</div>
```

