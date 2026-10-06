### `<pdx-scroll-area>`

A styled, custom scrollbar region.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `type` | `type` | string | `'auto'` | Scrollbar visibility: auto (show on scroll+hover), always, hover (show on hover only), never |
| `axis` | `axis` | string | `'vertical'` | Axis: vertical (default), horizontal, both |
| `scrollHideDelay` | `scrollhidedelay` | number | `1200` | Auto-hide delay in ms (0 = never hide). Used when type=auto |
| `maxHeight` | `maxheight` | string | `''` | Max height (CSS value). Enables scroll when content overflows |
| `height` | `height` | string | `''` | Height (CSS value) |
| `label` | `label` | string | `''` | Names the scrollable area ("Release notes") and makes it a region landmark. Empty: no landmark — the area stays focusable (tabindex 0) so the keyboard can scroll it. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `scrollArea: { scrollTo(opts), scrollBy(opts), scrollIntoView(el, opts), getViewport(), recalculate() }` _(read-only)_ | Helpers over the inner viewport, reached as `el.scrollArea.scrollTo(…)`: the host is not the element that scrolls, so the natives would act on the wrong box (which is also why they are namespaced here rather than flattened onto the host). |

**Events:** `pdx-scroll` → `detail: { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth }` — Fired on `pdx-scroll`.

**Renders:** roles `region`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Vertical (Default)** — Scroll the content below. Overlay scrollbar appears on scroll/hover.

```html
<pdx-scroll-area maxheight="250px" type="auto">
  <div>...long content...</div>
</pdx-scroll-area>
```

**Always Visible** — Scrollbar always visible, never auto-hides. _(from the live demo)_

```html
<div class="demo-container">
  <pdx-scroll-area maxheight="200px" type="always">
    <div class="scroll-content">
      <p>Content with always-visible scrollbar. The scrollbar stays visible at all times, providing a consistent visual indicator of scroll position.</p>
      <p>This is useful for panels where the user should always know there is more content below.</p>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.</p>
      <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat.</p>
      <p>Sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium.</p>
      <p>Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione.</p>
      <p>At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores.</p>
      <p>Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae.</p>
    </div>
  </pdx-scroll-area>
</div>
```

**Horizontal** _(from the live demo)_

```html
<div class="demo-container">
  <pdx-scroll-area axis="horizontal" height="100px">
    <div class="scroll-horizontal">
      <div class="scroll-card">Card 1</div>
      <div class="scroll-card">Card 2</div>
      <div class="scroll-card">Card 3</div>
      <div class="scroll-card">Card 4</div>
      <div class="scroll-card">Card 5</div>
      <div class="scroll-card">Card 6</div>
      <div class="scroll-card">Card 7</div>
      <div class="scroll-card">Card 8</div>
      <div class="scroll-card">Card 9</div>
      <div class="scroll-card">Card 10</div>
      <div class="scroll-card">Card 11</div>
      <div class="scroll-card">Card 12</div>
      <div class="scroll-card">Card 13</div>
      <div class="scroll-card">Card 14</div>
      <div class="scroll-card">Card 15</div>
    </div>
  </pdx-scroll-area>
</div>
```

**Both Axes** _(from the live demo)_

```html
<div class="demo-container">
  <pdx-scroll-area axis="both" maxheight="200px">
    <div class="scroll-both">
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th>Status</th><th>Location</th><th>Phone</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>Alice Johnson</td><td>alice@example.com</td><td>Engineering</td><td>Senior Dev</td><td>Active</td><td>New York</td><td>+1-555-0101</td></tr>
          <tr><td>2</td><td>Bob Smith</td><td>bob@example.com</td><td>Design</td><td>Lead Designer</td><td>Active</td><td>San Francisco</td><td>+1-555-0102</td></tr>
          <tr><td>3</td><td>Carol White</td><td>carol@example.com</td><td>Marketing</td><td>Manager</td><td>On Leave</td><td>Chicago</td><td>+1-555-0103</td></tr>
          <tr><td>4</td><td>David Brown</td><td>david@example.com</td><td>Sales</td><td>VP Sales</td><td>Active</td><td>Austin</td><td>+1-555-0104</td></tr>
          <tr><td>5</td><td>Eve Davis</td><td>eve@example.com</td><td>Engineering</td><td>DevOps</td><td>Active</td><td>Seattle</td><td>+1-555-0105</td></tr>
          <tr><td>6</td><td>Frank Miller</td><td>frank@example.com</td><td>HR</td><td>Director</td><td>Active</td><td>Boston</td><td>+1-555-0106</td></tr>
        </tbody>
      </table>
    </div>
  </pdx-scroll-area>
</div>
```

