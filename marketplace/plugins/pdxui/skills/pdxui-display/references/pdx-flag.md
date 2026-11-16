### `<pdx-flag>`

A country's or region's flag, 4:3, drawn as an image from its own SVG: a page loads the flags it
shows, one small module each, not the set. Named by the region in the page's language, or hidden
from assistive technology when `decorative` (the name is said beside it). A region it has no flag
for draws nothing. The drawings are flag-icons' (MIT), taken by `scripts/gen-flags.mjs`.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `region` | `region` | string | `''` | The region, a two-letter subtag in either case: `IT`, `br`, `EU`. |
| `size` | `size` | string | `'md'` | The height: xs (12), sm (16), md (20), lg (24), xl (32), or a number of pixels. |
| `decorative` | `decorative` | boolean | `false` | Said beside it already: no name, and hidden from assistive technology. |
| `label` | `label` | string | `''` | Its name instead of the region's. |
| `locale` | `locale` | string | `''` | The language of the region's name. Empty: the page's (`lang`), then the browser's. |

**Parts:** `[data-part="root"]` — The image of the flag, `--pdx-flag-size` tall and four thirds of it wide.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Regions** — Each flag is named by its region, in the page's language. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-flag region="IT"></pdx-flag>
  <pdx-flag region="DE"></pdx-flag>
  <pdx-flag region="FR"></pdx-flag>
  <pdx-flag region="ES"></pdx-flag>
  <pdx-flag region="GB"></pdx-flag>
  <pdx-flag region="US"></pdx-flag>
  <pdx-flag region="BR"></pdx-flag>
  <pdx-flag region="JP"></pdx-flag>
  <pdx-flag region="EU"></pdx-flag>
</div>
```

**Sizes** — The size is the height, as for an icon; the width is four thirds of it. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-flag region="IT" size="xs"></pdx-flag>
  <pdx-flag region="IT" size="sm"></pdx-flag>
  <pdx-flag region="IT" size="md"></pdx-flag>
  <pdx-flag region="IT" size="lg"></pdx-flag>
  <pdx-flag region="IT" size="xl"></pdx-flag>
  <pdx-flag region="IT" size="48"></pdx-flag>
</div>
```

**Beside a name** — When the name is written next to it, the flag is `decorative`: a screen reader reads the name once. _(from the live demo)_

```html
<div class="demo-stack">
  <span class="lang"><pdx-flag region="IT" decorative></pdx-flag> Italiano</span>
  <span class="lang"><pdx-flag region="DE" decorative></pdx-flag> Deutsch</span>
  <span class="lang"><pdx-flag region="BR" decorative></pdx-flag> Português (Brasil)</span>
</div>
```

