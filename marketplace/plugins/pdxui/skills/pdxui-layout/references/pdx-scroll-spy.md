### `<pdx-scroll-spy>`

Highlight the section you’re viewing.

⚠️ **`target` is not optional in an app with `pdx-app-layout`.** Same trap as `pdx-affix`: the
default scroll root is the window, and in that shell the window never scrolls — `pdx-app-layout` is
`overflow: hidden`, `main.pdx-app-main` is `overflow-y: auto`. Without `target=".pdx-app-main"` no
section is ever marked active.

```html
<pdx-scroll-spy target=".pdx-app-main" link-selector="[data-spy-link]">…</pdx-scroll-spy>
```

A link's `href="#id"` works as the target selector as well as `data-spy-target`, which the prop
table does not say: `updateLinks()` reads `href` first and falls back to `data-spy-target`.

Measured in `skill-claims.spec.ts` (case `who-scrolls`).

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

**Events:** `pdx-change` → `detail: { section }` — Fired when the value changes.


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

