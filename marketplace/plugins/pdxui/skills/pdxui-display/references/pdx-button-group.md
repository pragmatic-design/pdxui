### `<pdx-button-group>`

Joined buttons that read as one control.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `mode` | `mode` | string | `'none'` | Selection behaviour: 'none', 'single' or 'multiple'. |
| `orientation` | `orientation` | string | `'horizontal'` | Layout orientation — horizontal or vertical. |
| `variant` | `variant` | string | `''` | Visual variant. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `value` | `value` | string | `''` | The selection. `single`: the checked button's `value`. `multiple`: every pressed button's `value`, joined by `,` — `"bold,italic"`. A button without `value` is identified by its text. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `label` | `label` | string | `''` | The group's accessible name ("Text alignment"), set as `aria-label` on the group. |

**Events:** `pdx-change` → `detail: string` — The detail is the value itself, not an object: the pressed button's `value` in single mode, every pressed value joined by `,` in multiple mode.

**Renders:** roles `group` · `radio` · `radiogroup`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Action Group** — Default mode (`mode="none"`): visual grouping only. No selection logic.

```html
<pdx-button-group>
  <pdx-button variant="secondary">Left</pdx-button>
  <pdx-button variant="secondary">Center</pdx-button>
  <pdx-button variant="secondary">Right</pdx-button>
</pdx-button-group>
```

**Single Toggle (Radio)** — `mode="single"` — only one button selected at a time. It is a radio group: each button is a radio, and the arrow keys move the selection. Name the group with `label`.

```html
<pdx-button-group mode="single" label="Text alignment" :value="alignment" @pdx-change="onAlignment">
  <pdx-button variant="outline" value="left">Left</pdx-button>
  <pdx-button variant="outline" value="center">Center</pdx-button>
  <pdx-button variant="outline" value="right">Right</pdx-button>
</pdx-button-group>
```

**Multiple Toggle** — `mode="multiple"` — multiple buttons can be selected simultaneously: toggle buttons with `aria-pressed`. The value is every pressed value joined by commas, `"bold,italic"`.

```html
<pdx-button-group mode="multiple" label="Formatting" :value="formatting" @pdx-change="onFormatting">
  <pdx-button value="bold"><strong>B</strong></pdx-button>
  <pdx-button value="italic"><em>I</em></pdx-button>
  <pdx-button value="underline"><u>U</u></pdx-button>
</pdx-button-group>
```

**Orientation** — `orientation="vertical"` stacks buttons vertically. _(from the live demo)_

```html
<div class="demo-row align-start">
  <pdx-button-group orientation="vertical">
    <pdx-button variant="outline">Top</pdx-button>
    <pdx-button variant="outline">Middle</pdx-button>
    <pdx-button variant="outline">Bottom</pdx-button>
  </pdx-button-group>
  <pdx-button-group orientation="vertical" mode="single" label="Priority" :value="priority" variant="outline" @pdx-change="onPriority">
    <pdx-button value="high">High</pdx-button>
    <pdx-button value="medium">Medium</pdx-button>
    <pdx-button value="low">Low</pdx-button>
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
    <pdx-button-group mode="multiple" label="Formatting" :value="formatting" variant="ghost" size="sm" @pdx-change="onFormatting">
      <pdx-button value="bold"><strong>B</strong></pdx-button>
      <pdx-button value="italic"><em>I</em></pdx-button>
      <pdx-button value="underline"><u>U</u></pdx-button>
    </pdx-button-group>
    <pdx-button-group mode="single" label="Alignment" :value="alignment" variant="ghost" size="sm" @pdx-change="onAlignment">
      <pdx-button value="left" aria-label="Align left"><pdx-icon name="align-left" size="sm"></pdx-icon></pdx-button>
      <pdx-button value="center" aria-label="Align center"><pdx-icon name="align-center" size="sm"></pdx-icon></pdx-button>
      <pdx-button value="right" aria-label="Align right"><pdx-icon name="align-right" size="sm"></pdx-icon></pdx-button>
    </pdx-button-group>
  </div>
  <div class="comp-body pdx-txt-small pdx-ink-muted">
    Formatting: {{ formatting || 'none' }} | Alignment: {{ alignment || 'none' }}
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

