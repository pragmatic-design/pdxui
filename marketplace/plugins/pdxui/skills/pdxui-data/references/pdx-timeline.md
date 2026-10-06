### `<pdx-timeline>`

A vertical sequence of events.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | array | `[]` | The data items to render. |
| `mode` | `mode` | string | `'left'` | Alignment: 'left', 'right' or 'alternate'. |
| `reverse` | `reverse` | boolean | `false` | Renders items newest-first. |
| `pending` | `pending` | boolean | `false` | Shows a pending node at the end. |
| `pendingLabel` | `pendinglabel` | string | `''` | The pending row's text. Empty: the timeline.pending component string. |
| `clickable` | `clickable` | boolean | `false` | Whether items are clickable. |
| `connectorStyle` | `connectorstyle` | string | `'solid'` | Line style between nodes (solid, dashed, …). |
| `dotAlign` | `dotalign` | string | `'start'` | Dot vertical alignment relative to content: 'start' \| 'center' \| 'end' |

**Events:** `pdx-click` → `detail: { item, index }` — Fired on `pdx-click`.

**Slot:** `content` — Scoped — renders the content of one entry. Receives `{ item, index, status }` (`status` is `'default'` when unset).

**Shapes:** `TimelineItem { title: string; description?: string; date?: string; icon?: string; color?: string; status?: 'default' | 'success' | 'warning' | 'error' | 'info'; statusLabel?: string }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Simple order tracking timeline (left mode, default).

```html
<pdx-timeline :items="events"></pdx-timeline>
```

```js
// events = [
//   { title: 'Order Placed', date: 'Apr 1, 2026' },
//   { title: 'Payment Confirmed', date: 'Apr 1, 2026' },
//   { title: 'Shipped', date: 'Apr 3, 2026' },
//   { title: 'Out for Delivery', date: 'Apr 5, 2026' },
//   { title: 'Delivered', date: 'Apr 5, 2026' },
// ]
```

**With Icons & Status** — Items with status colors and icons.

```js
// status: 'success' | 'warning' | 'error' | 'info'
// icon: any Pragmatic icon name
{ title: 'Build Passed', status: 'success', icon: 'check-circle' }
{ title: 'Review Pending', status: 'warning', icon: 'clock' }
{ title: 'Deploy Failed', status: 'error', icon: 'x-circle' }
```

**Alternate Mode** — Odd items left, even items right. Good for project milestones. _(from the live demo)_

```html
<div class="demo-container demo-container-wide">
  <pdx-timeline :items="statusEvents" mode="alternate"></pdx-timeline>
</div>
```

**Horizontal** — Horizontal layout for step-like flows. _(from the live demo)_

```html
<div class="demo-container demo-container-wide">
  <pdx-timeline :items="horizontalEvents" mode="horizontal"></pdx-timeline>
</div>
```

**Clickable** — Click an event to see the detail. _(from the live demo)_

```html
<div class="demo-container">
  <pdx-timeline :items="basicEvents" clickable @pdx-click="onTimelineClick"></pdx-timeline>
</div>
<div class="event-log pdx-txt-mono pdx-txt-small" id="timeline-log">{{ timelineLog }}</div>
```

**Pending** — Shows a pulsing dot at the end to indicate an ongoing process. _(from the live demo)_

```html
<div class="demo-container">
  <pdx-timeline :items="pendingEvents" pending pending-label="Awaiting delivery..."></pdx-timeline>
</div>
```

**Dashed Connector** — Connector style can be solid, dashed, or dotted. _(from the live demo)_

```html
<div class="demo-container">
  <pdx-timeline :items="basicEvents" connector-style="dashed"></pdx-timeline>
</div>
```

**Slot Template** — Use the `content` slot with PDX components for rich timeline entries.

```html
<!-- PDX components inside a scoped slot -->
<pdx-timeline :items="events">
  <slot name="content" let:item let:index>
    <pdx-card variant="outline" compact>
      <div class="header">
        <strong>{item.title}</strong>
        <pdx-chip size="xs" :variant="{item.status}">
          {item.status}
        </pdx-chip>
      </div>
      <p>{item.description}</p>
      <small>{item.date}</small>
    </pdx-card>
  </slot>
</pdx-timeline>
```

