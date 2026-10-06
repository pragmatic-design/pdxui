### `<pdx-empty-state>`

A friendly “nothing here yet”.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `icon` | `icon` | string | `'inbox'` | Icon name |
| `title` | `title` | string | `''` | Title text. Empty: the empty-state.title component string, «No data». |
| `description` | `description` | string | `''` | Description text |
| `actionLabel` | `actionlabel` | string | `''` | Action button label (empty = no button) |
| `iconSize` | `iconsize` | number | `48` | Icon size |
| `headingLevel` | `headinglevel` | number | `3` | The title's heading level (1-6). Default 3: an empty state usually sits in a section whose own heading is level 2. |

**Events:** `pdx-action` → `detail: {}` — Fired on `pdx-action`.

**Renders:** roles `heading`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic**

```html
<pdx-empty-state icon="inbox" title="No messages"
  description="Your inbox is empty.">
</pdx-empty-state>
```

**With Action Button** _(from the live demo)_

```html
<div class="demo-container">
  <pdx-empty-state icon="file-plus" title="No documents" description="Get started by creating your first document." action-label="Create Document" @pdx-action="onAction"></pdx-empty-state>
</div>
<div class="event-log pdx-txt-mono pdx-txt-small" id="action-log">{{ actionLog }}</div>
```

**Search — No Results** _(from the live demo)_

```html
<div class="demo-container">
  <pdx-empty-state icon="search" title="No results found" description="Try adjusting your search or filter criteria."></pdx-empty-state>
</div>
```

**Error State** _(from the live demo)_

```html
<div class="demo-container">
  <pdx-empty-state icon="alert-triangle" title="Something went wrong" description="We couldn't load the data. Please try again." action-label="Retry" @pdx-action="onRetry"></pdx-empty-state>
</div>
```

