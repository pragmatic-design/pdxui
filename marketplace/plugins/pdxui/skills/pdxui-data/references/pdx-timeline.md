### `<pdx-timeline>`

A vertical sequence of events.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | T[] | `[]` | The data items to render. |
| `reverse` | `reverse` | boolean | `false` | Renders items newest-first. |
| `pending` | `pending` | boolean | `false` | Shows a pending node at the end. |
| `pendingLabel` | `pendinglabel` | string | `''` | The pending row's text. Empty: the timeline.pending component string. |
| `clickable` | `clickable` | boolean | `false` | Whether items are clickable. |
| `mode` | `mode` | 'left' \| 'right' \| 'alternate' \| 'horizontal' | `'left'` | Where the events sit: beside the line, on the right of it, both sides in turn, or in a row. |
| `connectorStyle` | `connectorstyle` | 'solid' \| 'dashed' \| 'dotted' | `'solid'` | How the connector between the dots is drawn. |
| `dotAlign` | `dotalign` | 'start' \| 'center' \| 'end' | `'start'` | Where a dot sits against its event's content. |

**Events:** `pdx-click` → `detail: { item: TimelineItem; index: number }` — A clickable event was clicked, or pressed with Enter or Space.

**Slot:** `content` — Renders the content of one entry: a snippet `content(item, index)`, or the scoped slot, which receives `{ item, index, status }` (`status` is `'default'` when unset).

**States:** `:state(pending)` — `pending`: a last row says more is to come.; `:state(clickable)` — `clickable`: each event is a tab stop, and a click or Enter emits `pdx-click`.

**Parts:** `[data-part="list"]` — The `<ol>` of events.; `[data-part="item"]` — One event, an `<li>`.; `[data-part="track"]` — The column of an event's line and dot.; `[data-part="line"]` — The connector, drawn as the axis `connector-style` says.; `[data-part="dot"]` — The event's dot, with its icon when it has one.; `[data-part="content"]` — The event's text, or the `content` snippet.; `[data-part="title"]` — The event's title.; `[data-part="description"]` — The event's description.; `[data-part="date"]` — The event's date.; `[data-part="pending"]` — The pending row, while `pending`.

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
        <pdx-chip size="sm" :variant="{item.status}">
          {item.status}
        </pdx-chip>
      </div>
      <p>{item.description}</p>
      <small>{item.date}</small>
    </pdx-card>
  </slot>
</pdx-timeline>
```

