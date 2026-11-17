### `<pdx-scroll-spy>`

Highlight the section you’re viewing.

**No `target`, unlike `pdx-affix`.** `pdx-scroll-spy` watches the sections with an
`IntersectionObserver` whose root is the viewport (`offset` trims its top edge), so it does not read
which element scrolls; a `target` attribute on it does nothing.

```html
<pdx-scroll-spy link-selector="[data-spy-link]">…</pdx-scroll-spy>
```

A link's `href="#id"` works as the target selector as well as `data-spy-target`, which the prop
table does not say: `updateLinks()` reads `href` first and falls back to `data-spy-target`.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `sectionSelector` | `sectionselector` | string | `'[data-section]'` | CSS selector for sections to observe |
| `linkSelector` | `linkselector` | string | `'[data-spy-link]'` | CSS selector for nav links to highlight |
| `offset` | `offset` | number | `100` | Offset from top for activation threshold (px) |
| `smoothScroll` | `smoothscroll` | boolean | `true` | Smooth scroll to section on link click |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `getActiveSection()` | The id of the section marked active, or '' before the first measurement. |

**Events:** `section-change` → `detail: { value: string }` — The section in view changed: its `data-section`, or its id.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Live Demo** — Scroll the content below. The nav links highlight automatically.

```html
<pdx-scroll-spy>
  <nav>
    <a data-spy-link data-spy-target="intro">Intro</a>
    <a data-spy-link data-spy-target="usage">Usage</a>
  </nav>
  <div data-section="intro" id="intro">...</div>
  <div data-section="usage" id="usage">...</div>
</pdx-scroll-spy>
```

