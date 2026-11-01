### `<pdx-page-header>`

Breadcrumb, title and page actions.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `title` | `title` | string | `''` |  |
| `subtitle` | `subtitle` | string | `''` |  |
| `crumbs` | — | array | `() => []` |  |
| `headingLevel` | `headinglevel` | number | `1` | The title's heading level, 1-6. Default 1; lower it for a header inside a dialog or a section. |

**Events:** `pdx-crumb` → `detail: { key: string; item: PageHeaderCrumb }` — A crumb with a link was chosen: its `key` and the crumb.

**Renders:** roles `list`

**Slot:** `actions` — Commands shown in the header's actions area (e.g. the page's primary action).

**Parts:** `[data-part="root"]` — The `<header>`.; `[data-part="breadcrumb"]` — The `<nav>` of the crumbs, when there are any.; `[data-part="title"]` — The title, the heading `heading-level` names.; `[data-part="subtitle"]` — The line under the title, when there is one.; `[data-part="actions"]` — The area the `actions` slot lands in.

**Shapes:** `PageHeaderCrumb { key: string; label: string; href?: string }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Title, breadcrumb and actions** — The trail above the title, the subtitle under it, the `actions` slot at the end of the row. A crumb without an `href` is a button that announces `pdx-crumb`; the last is the page you are on.

```html
<pdx-page-header title="Patients" subtitle="1,204 records" :crumbs="crumbs" @pdx-crumb="onCrumb">
  <pdx-button slot="actions" variant="outline">Export</pdx-button>
  <pdx-button slot="actions" variant="primary">New patient</pdx-button>
</pdx-page-header>
```

**Title only** — No crumbs, no breadcrumb: the header is its title.

```html
<pdx-page-header title="Dashboard"></pdx-page-header>
```

