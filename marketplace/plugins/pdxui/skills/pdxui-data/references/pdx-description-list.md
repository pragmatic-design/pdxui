### `<pdx-description-list>`

Key/value pairs, neatly aligned.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | array | `null` | The data items to render. |
| `columns` | `columns` | number | `1` | Number of key/value columns to lay out. |
| `layout` | `layout` | string | `'horizontal'` | Layout: 'horizontal' (label beside value) or 'vertical'. |
| `bordered` | `bordered` | boolean | `false` | Adds a border. |
| `striped` | `striped` | boolean | `false` | Alternates row backgrounds. |
| `size` | `size` | string | `'md'` | Size of the control (e.g. sm, md, lg). |
| `labelWidth` | `labelwidth` | string | `'auto'` | Fixed width for the label column. |
| `colon` | `colon` | boolean | `true` | Appends a colon after each label. |
| `renderValue` | — | object | `null` | Render function for a value. |

**Slot:** `value` — Scoped — renders the value of one entry. Receives `{ item, label, value, index }`.

**Shapes:** `DescriptionListItem { label: string; value: string | HTMLElement; span?: number; icon?: string }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Default horizontal layout with colon after labels.

```js
const items = [
  { label: 'Name', value: 'John Doe' },
  { label: 'Email', value: 'john.doe@example.com' },
  { label: 'Phone', value: '+1 (555) 123-4567' },
  { label: 'Role', value: 'Administrator' },
];
```

```html
<pdx-description-list :items="items">
</pdx-description-list>
```

**Horizontal Layout (Fixed Label Width)** — Label and value on the same row. Fixed label width for alignment.

```html
<pdx-description-list :items="items"
  layout="horizontal" label-width="120px">
</pdx-description-list>
```

**Vertical Layout** — Label on top, value below. Good for long values.

```html
<pdx-description-list :items="items"
  layout="vertical">
</pdx-description-list>
```

**Multi-Column** — 2-column grid. Description spans both columns.

```js
const items = [
  { label: 'Name', value: 'Ergonomic Keyboard' },
  { label: 'SKU', value: 'KB-ERG-2026' },
  { label: 'Price', value: '$149.99' },
  { label: 'Weight', value: '1.2 kg' },
  // span: 2 takes both columns
  { label: 'Description', value: 'Split mechanical...', span: 2 },
];
```

```html
<pdx-description-list :items="items"
  :columns="2" label-width="100px">
</pdx-description-list>
```

**Bordered** — Border around container and between items.

```html
<pdx-description-list :items="items"
  :bordered="true" label-width="120px">
</pdx-description-list>
```

**Bordered + Striped** — Alternating row colors for easier scanning.

```html
<pdx-description-list :items="items"
  :bordered="true" :striped="true">
</pdx-description-list>
```

**With Icons** — Items with icons next to labels.

```js
const items = [
  { label: 'Name', value: 'Jane Smith', icon: 'user' },
  { label: 'Email', value: 'jane@example.com', icon: 'mail' },
  { label: 'Phone', value: '+1 555-987-6543', icon: 'phone' },
];
```

**Custom Value Rendering** — Use `render-value` callback to render badges, links, or custom HTML for each value.

```js
const items = [
  { label: 'Status', value: 'Active', type: 'badge' },
  { label: 'Website', value: 'https://example.com', type: 'link' },
  { label: 'Tags', value: 'admin,editor', type: 'tags' },
];

function renderValue(item) {
  if (item.type === 'badge') {
    const span = document.createElement('span');
    span.className = 'pdx-badge pdx-badge-success';
    span.textContent = item.value;
    return span;
  }
  if (item.type === 'link') {
    const a = document.createElement('a');
    a.href = sanitizeUrl(item.value) || '#'; // block javascript:/data: (good practice, in demos too)
    a.textContent = item.value;
    return a;
  }
  if (item.type === 'tags') {
    const div = document.createElement('div');
    item.value.split(',').forEach(t => {
      const chip = document.createElement('pdx-chip');
      chip.setAttribute('label', t.trim());
      chip.setAttribute('size', 'sm');
      div.appendChild(chip);
    });
    return div;
  }
  return null; // fallback to default string render
}
```

```html
<pdx-description-list :items="items"
  :render-value="renderValue">
</pdx-description-list>
```

**Sizes** — Small, medium (default), and large. _(from the live demo)_

```html
<div class="demo-stack">
  <div>
    <span class="pdx-txt-small pdx-ink-muted">sm</span>
    <div class="demo-container">
      <pdx-description-list :items="sizeItems" :bordered="true" size="sm" label-width="80px"></pdx-description-list>
    </div>
  </div>
  <div>
    <span class="pdx-txt-small pdx-ink-muted">md</span>
    <div class="demo-container">
      <pdx-description-list :items="sizeItems" :bordered="true" size="md" label-width="80px"></pdx-description-list>
    </div>
  </div>
  <div>
    <span class="pdx-txt-small pdx-ink-muted">lg</span>
    <div class="demo-container">
      <pdx-description-list :items="sizeItems" :bordered="true" size="lg" label-width="80px"></pdx-description-list>
    </div>
  </div>
</div>
```

**Slot Template** — Use the `value` slot to customize how each value is rendered. Priority: slot > renderValue > default.

```html
<pdx-description-list :items="items" :columns="2" :bordered="true" label-width="100px">
  <slot name="value" let:item let:index>
    <span class="dl-custom-value">$&lbrace;item.value&rbrace;</span>
  </slot>
</pdx-description-list>

.dl-custom-value {
  color: var(--pdx-color-primary);
  font-weight: 600;
}
```

