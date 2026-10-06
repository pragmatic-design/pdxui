### `<pdx-kbd>`

Render keyboard keys and shortcuts.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `keys` | `keys` | string | `''` | The key combination to render (e.g. 'Ctrl+K'). |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `symbols` | `symbols` | boolean | `false` | Show modifier symbols (⌘⌥⌃⇧) instead of text. Default: false. |


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Single Keys** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-kbd keys="Enter"></pdx-kbd>
  <pdx-kbd keys="Esc"></pdx-kbd>
  <pdx-kbd keys="Tab"></pdx-kbd>
  <pdx-kbd keys="Space"></pdx-kbd>
  <pdx-kbd keys="Delete"></pdx-kbd>
</div>
```

**Key Combinations** — `+` separated modifier combinations.

```html
<pdx-kbd keys="Ctrl+C"></pdx-kbd>
<pdx-kbd keys="Ctrl+Shift+P"></pdx-kbd>
<pdx-kbd keys="Ctrl+K"></pdx-kbd> then <pdx-kbd keys="Ctrl+S"></pdx-kbd>
```

**Modifier Symbols** — `symbols` prop replaces modifier names with symbols: Cmd→⌘, Alt→⌥, Ctrl→⌃, Shift→⇧.

```html
<pdx-kbd keys="Cmd+C" symbols></pdx-kbd>  <!-- shows ⌘ C -->
<pdx-kbd keys="Cmd+Shift+P" symbols></pdx-kbd>  <!-- shows ⌘ ⇧ P -->
```

**Inline with Text** _(from the live demo)_

```html
<p class="pdx-txt-body">Press <pdx-kbd keys="Ctrl+S"></pdx-kbd> to save, or <pdx-kbd keys="Ctrl+Z"></pdx-kbd> to undo.</p>
<p class="pdx-txt-body">Use <pdx-kbd keys="Tab"></pdx-kbd> to navigate and <pdx-kbd keys="Enter"></pdx-kbd> to confirm.</p>
```

**Composition** _(from the live demo)_

```html
<div class="comp-card" style="max-width:360px">
  <h3 class="pdx-txt-subheading">Shortcut Reference</h3>
  <div class="ref-list">
    <div class="ref-row"><span class="pdx-txt-small">New File</span><pdx-kbd keys="Ctrl+N"></pdx-kbd></div>
    <div class="ref-row"><span class="pdx-txt-small">Open File</span><pdx-kbd keys="Ctrl+O"></pdx-kbd></div>
    <div class="ref-row"><span class="pdx-txt-small">Save</span><pdx-kbd keys="Ctrl+S"></pdx-kbd></div>
    <div class="ref-row"><span class="pdx-txt-small">Find</span><pdx-kbd keys="Ctrl+F"></pdx-kbd></div>
    <div class="ref-row"><span class="pdx-txt-small">Replace</span><pdx-kbd keys="Ctrl+H"></pdx-kbd></div>
    <div class="ref-row"><span class="pdx-txt-small">Terminal</span><pdx-kbd keys="Ctrl+~"></pdx-kbd></div>
  </div>
</div>
```

