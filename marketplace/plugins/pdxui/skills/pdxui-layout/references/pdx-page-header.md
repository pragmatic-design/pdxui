### `<pdx-page-header>`

Breadcrumb, title and page actions.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `title` | `title` | string | `''` |  |
| `subtitle` | `subtitle` | string | `''` |  |
| `crumbs` | — | array | `() => []` |  |
| `headingLevel` | `headinglevel` | number | `1` | The title's heading level, 1-6. Default 1; lower it for a header inside a dialog or a section. |

**Events:** `pdx-crumb` → `detail: { key, item }` — Fired on `pdx-crumb`.

**Renders:** roles `list`

**Slot:** `actions` — Commands shown in the header's actions area (e.g. the page's primary action).

**Shapes:** `PageHeaderCrumb { key: string; label: string; href?: string }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Title + breadcrumb + actions** _(from the live demo)_

```html
<pdx-page-header title="Patients" subtitle="1,204 records" heading-level="3" :crumbs="crumbs">
  <pdx-button slot="actions" variant="outline" size="sm">Export</pdx-button>
  <pdx-button slot="actions" variant="primary" size="sm">New patient</pdx-button>
</pdx-page-header>
```

**Title only** _(from the live demo)_

```html
<pdx-page-header title="Dashboard" heading-level="3"></pdx-page-header>
```

