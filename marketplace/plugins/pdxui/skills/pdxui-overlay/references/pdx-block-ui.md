### `<pdx-block-ui>`

Block a region while it’s busy.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `blocked` | `blocked` | boolean | `false` | Whether the UI is blocked (shows overlay + spinner) |
| `message` | `message` | string | `''` | Custom message shown below spinner |
| `variant` | `variant` | string | `'spinner'` | Spinner variant: spinner (default), skeleton, none |
| `fullscreen` | `fullscreen` | boolean | `false` | Cover the viewport, not the element, and make the rest of the document inert. |
| `delay` | `delay` | number | `300` | Ms before the overlay is drawn. The input is blocked from the start either way. |
| `minDuration` | `minduration` | number | `200` | Ms the overlay stays drawn once it is, however soon the block ends. |

**Events:** `pdx-block` — Fired on `pdx-block`.; `pdx-unblock` — Fired on `pdx-unblock`.

**Renders:** roles `status`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Toggle the blocked state. Content underneath is non-interactive while blocked.

```html
<pdx-block-ui :blocked="isLoading">
  <div class="panel">
    <p>Content here...</p>
    <button>Save</button>
  </div>
</pdx-block-ui>
```

**With Message** — A custom message is shown below the spinner. _(from the live demo)_

```html
<div class="demo-wrap">
  <pdx-block-ui blocked message="Saving changes...">
    <div class="demo-panel">
      <h3>Form Panel</h3>
    </div>
  </pdx-block-ui>
</div>
```

**Simulated Fetch** — Click "Load Data" to block for 2 seconds, then unblock. _(from the live demo)_

```html
<div class="demo-actions">
  <button class="pdx-btn pdx-outline pdx-btn-xs" @click="simulateFetch">Load Data</button>
</div>
<div class="demo-wrap">
  <pdx-block-ui :blocked="fetchLoading" id="fetch-block">
    <div class="demo-panel">
      <div class="pdx-txt-small" id="fetch-content">{{ fetchContent }}</div>
    </div>
  </pdx-block-ui>
</div>
```

**Delay and minimum duration** — The input is blocked at once; the overlay is drawn only after `delay` (300 ms), then kept for at least `min-duration` (200 ms). A quick save never flashes a spinner, and a slow one does not blink. _(from the live demo)_

```html
<div class="demo-actions">
  <button class="pdx-btn pdx-outline pdx-btn-xs" @click="save(120)">Save in 120 ms</button>
  <button class="pdx-btn pdx-outline pdx-btn-xs" @click="save(350)">Save in 350 ms</button>
</div>
<div class="demo-wrap">
  <pdx-block-ui :blocked="saving" message="Saving…">
    <div class="demo-panel">
      <p class="pdx-txt-small pdx-ink-muted">The first button blocks for less than the delay: nothing is drawn. The second is drawn at 300 ms and stays until 500.</p>
    </div>
  </pdx-block-ui>
</div>
```

**Fullscreen** — `fullscreen` covers the viewport, not the element, and makes the rest of the page inert — the rail, the bar, every button.

```html
<pdx-block-ui :blocked="publishing" fullscreen message="Publishing…"></pdx-block-ui>
```

