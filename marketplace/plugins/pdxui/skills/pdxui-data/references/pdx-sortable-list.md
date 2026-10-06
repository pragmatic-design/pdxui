### `<pdx-sortable-list>`

A list the user can put in another order, by dragging a row's handle or from the keyboard alone.

It emits `pdx-reorder` with the indices and never writes to `items`: the application applies the
move, so the array it owns stays the one source of truth.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | array | `[]` | The data items to render. |
| `idField` | `idfield` | string | `'id'` | How a row is identified. Empty: the row's index. |
| `labelField` | `labelfield` | string | `'label'` | What a row shows without an `item` slot, and what names its handle either way. |
| `axis` | `axis` | string | `'vertical'` | 'vertical' \| 'horizontal' — decides which arrows move, and which way rows shift. |
| `handle` | `handle` | string | `''` | A selector inside the row that the POINTER may grab. Empty: the rendered handle. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |

**Events:** `pdx-reorder` → `detail: { from, to, id }` — Fired on `pdx-reorder`.

**Renders:** roles `list`

**Slot:** `item` — Scoped — renders one row's content. Receives `{ item, index }`. Without it the row shows the item's `label-field`.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Drag a handle, or use the keyboard** — Grab the handle with the pointer, or Tab to it and press Space to lift, the arrows to move, Space to drop, Escape to cancel.

```html
<pdx-sortable-list :items="tasks" @pdx-reorder="onReorder"></pdx-sortable-list>
```

```js
let tasks = $signal([{ id: 1, label: 'Triage' }, …]);

function onReorder(e) {
  const next = tasks.slice();
  next.splice(e.detail.to, 0, ...next.splice(e.detail.from, 1));
  tasks = next;
}
```

**Rows you render yourself** — The `item` slot takes over the row's content. The handle stays the component's, so the keyboard path keeps working whatever you put in the row. _(from the live demo)_

```html
<div class="demo-stack narrow">
  <pdx-sortable-list :items="steps" @pdx-reorder="onStepReorder">
    <slot name="item" let:item let:index>
      <div class="step-row">
        <pdx-badge :value="index + 1"></pdx-badge>
        <div>
          <strong>{{ item.label }}</strong>
          <div class="pdx-txt-small pdx-ink-muted">{{ item.owner }}</div>
        </div>
      </div>
    </slot>
  </pdx-sortable-list>
</div>
```

**Horizontal** — `axis="horizontal"` lays the rows side by side, and the left/right arrows move them. Tab order and the announcements are the same. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-sortable-list axis="horizontal" :items="columns" @pdx-reorder="onColumnReorder"></pdx-sortable-list>
</div>
```

**Disabled** — The handles are dimmed, and neither the pointer nor the keyboard lifts a row. _(from the live demo)_

```html
<div class="demo-stack narrow">
  <pdx-sortable-list disabled :items="tasks"></pdx-sortable-list>
</div>
```

