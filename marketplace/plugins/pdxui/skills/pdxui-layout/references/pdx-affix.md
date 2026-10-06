### `<pdx-affix>`

Pin an element while scrolling.

⚠️ **`target` is not optional in an app with `pdx-app-layout`.** The default scroll root is the
window, and in that shell the window never scrolls: `pdx-app-layout` is `overflow: hidden` and
`main.pdx-app-main` is `overflow-y: auto`. Without `target=".pdx-app-main"` the affix watches a
scroll that does not happen and never sticks — with no error and nothing in the console.

```html
<pdx-affix target=".pdx-app-main" :offset="16">…</pdx-affix>
```

Measured in `skill-claims.spec.ts` (case `who-scrolls`).

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `offsetTop` | `offsettop` | number | `0` | Offset from top when affixed (px) |
| `offsetBottom` | `offsetbottom` | number | `-1` | Offset from bottom when affixed (px) |
| `target` | `target` | string | `''` | Target scroll container selector (default: window) |

**Events:** `pdx-change` → `detail: { affixed }` — Fired when the value changes.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Live Demo** — Scroll the box below. The toolbar sticks to the top of the scroll container, and `pdx-change` says so.

```html
<div class="scroll-container" id="affix-container">
  …
  <pdx-affix :offsetTop="0" target="#affix-container"
    @pdx-change="e => affixed = e.detail.affixed">
    <div class="sticky-bar">Sticky Toolbar</div>
  </pdx-affix>
  …
</div>
```

