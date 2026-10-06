### `<pdx-toolbar>`

A row of grouped actions.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `compact` | `compact` | boolean | `false` | Compact mode (less padding) |
| `bordered` | `bordered` | boolean | `false` | Show border |
| `vertical` | `vertical` | boolean | `false` | Vertical orientation: ↑/↓ move between the controls instead of ←/→ |
| `label` | `label` | string | `''` | The toolbar's accessible name ("Text formatting"). Empty: the toolbar.label component string. |

**Renders:** roles `toolbar`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Text Editor Toolbar** — Google Docs-style toolbar with icon groups, separators, and spacer.

```html
<pdx-toolbar bordered label="Text formatting">
  <div class="pdx-toolbar-group">
    <button class="pdx-btn pdx-ghost pdx-btn-xs" title="Bold"><pdx-icon name="bold"></pdx-icon></button>
    <button class="pdx-btn pdx-ghost pdx-btn-xs" title="Italic"><pdx-icon name="italic"></pdx-icon></button>
  </div>
  <span class="pdx-toolbar-sep"></span>
  ...
</pdx-toolbar>
```

**File Actions Toolbar** — Actions with labels + icon-only buttons + primary CTA.

```html
<pdx-toolbar bordered label="File actions">
  <button class="pdx-btn pdx-ghost pdx-btn-xs">
    <pdx-icon name="file-plus"></pdx-icon> New
  </button>
  <button class="pdx-btn pdx-ghost pdx-btn-xs" aria-label="Undo">
    <pdx-icon name="undo"></pdx-icon>
  </button>
  <span class="pdx-toolbar-spacer"></span>
  <button class="pdx-btn pdx-primary pdx-btn-xs">Publish</button>
</pdx-toolbar>
```

**Compact Icon-Only** — Minimal toolbar for inline editors or table actions.

```html
<pdx-toolbar compact bordered label="Row actions">
  <button class="pdx-btn pdx-ghost pdx-btn-xs" aria-label="Edit">
    <pdx-icon name="edit" size="13"></pdx-icon>
  </button>
  ...
</pdx-toolbar>
```

