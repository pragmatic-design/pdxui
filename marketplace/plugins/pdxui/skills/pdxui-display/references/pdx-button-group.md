### `<pdx-button-group>`

Joined buttons that read as one control.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `orientation` | `orientation` | string | `'horizontal'` | Layout orientation — horizontal or vertical. |
| `variant` | `variant` | string | `''` | Visual variant. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `label` | `label` | string | `''` | The group's accessible name ("Text alignment"), set as `aria-label` on the group. |

**Renders:** roles `group`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Action Group** — Visual grouping only, no selection logic: each button does its own action.

```html
<pdx-button-group>
  <pdx-button variant="secondary">Left</pdx-button>
  <pdx-button variant="secondary">Center</pdx-button>
  <pdx-button variant="secondary">Right</pdx-button>
</pdx-button-group>
```

**Orientation** — `orientation="vertical"` stacks buttons vertically. _(from the live demo)_

```html
<div class="demo-row align-start">
  <pdx-button-group orientation="vertical" label="Position">
    <pdx-button variant="outline">Top</pdx-button>
    <pdx-button variant="outline">Middle</pdx-button>
    <pdx-button variant="outline">Bottom</pdx-button>
  </pdx-button-group>
</div>
```

**Variant & Size Propagation** — Set `variant` and `size` on the group to apply to all children. _(from the live demo)_

```html
<div class="demo-col">
  <div class="demo-row">
    <span class="pdx-txt-caption pdx-ink-muted" style="min-width:60px">primary:</span>
    <pdx-button-group variant="primary">
      <pdx-button>One</pdx-button>
      <pdx-button>Two</pdx-button>
      <pdx-button>Three</pdx-button>
    </pdx-button-group>
  </div>
  <div class="demo-row">
    <span class="pdx-txt-caption pdx-ink-muted" style="min-width:60px">danger:</span>
    <pdx-button-group variant="danger">
      <pdx-button>One</pdx-button>
      <pdx-button>Two</pdx-button>
      <pdx-button>Three</pdx-button>
    </pdx-button-group>
  </div>
  <div class="demo-row">
    <span class="pdx-txt-caption pdx-ink-muted" style="min-width:60px">sm:</span>
    <pdx-button-group variant="outline" size="sm">
      <pdx-button>Small</pdx-button>
      <pdx-button>Buttons</pdx-button>
      <pdx-button>Group</pdx-button>
    </pdx-button-group>
  </div>
  <div class="demo-row">
    <span class="pdx-txt-caption pdx-ink-muted" style="min-width:60px">lg:</span>
    <pdx-button-group variant="secondary" size="lg">
      <pdx-button>Large</pdx-button>
      <pdx-button>Buttons</pdx-button>
      <pdx-button>Group</pdx-button>
    </pdx-button-group>
  </div>
</div>
```

**Disabled** — `disabled` prop disables all buttons in the group. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button-group disabled>
    <pdx-button variant="primary">Save</pdx-button>
    <pdx-button variant="outline">Cancel</pdx-button>
  </pdx-button-group>
</div>
```

**Composition** — Button groups in realistic UI contexts. _(from the live demo)_

```html
<div class="comp-card">
  <div class="comp-toolbar">
    <h3 class="pdx-txt-subheading" style="flex:1">Document Editor</h3>
    <pdx-button-group label="History" variant="ghost" size="sm">
      <pdx-button aria-label="Undo" @click="act('Undo')"><pdx-icon name="undo" size="sm"></pdx-icon></pdx-button>
      <pdx-button aria-label="Redo" @click="act('Redo')"><pdx-icon name="redo" size="sm"></pdx-icon></pdx-button>
    </pdx-button-group>
    <pdx-button-group label="Clipboard" variant="ghost" size="sm">
      <pdx-button aria-label="Cut" @click="act('Cut')"><pdx-icon name="scissors" size="sm"></pdx-icon></pdx-button>
      <pdx-button aria-label="Copy" @click="act('Copy')"><pdx-icon name="copy" size="sm"></pdx-icon></pdx-button>
      <pdx-button aria-label="Paste" @click="act('Paste')"><pdx-icon name="clipboard" size="sm"></pdx-icon></pdx-button>
    </pdx-button-group>
  </div>
  <div class="comp-body pdx-txt-small pdx-ink-muted">
    Last action: {{ last || 'none' }}. Formatting and alignment, which select, are a
    <code>&lt;pdx-toggle-group&gt;</code>.
  </div>
</div>
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Split Action</h3>
  <p class="pdx-txt-small pdx-ink-muted">Primary action + secondary options grouped together.</p>
  <div class="comp-actions">
    <pdx-button-group>
      <pdx-button variant="primary"><pdx-icon name="download" size="sm"></pdx-icon> Download</pdx-button>
      <pdx-button variant="primary" aria-label="More options"><pdx-icon name="chevron-down" size="sm"></pdx-icon></pdx-button>
    </pdx-button-group>
  </div>
</div>
```

