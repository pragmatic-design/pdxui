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

_No demo section shows `<pdx-flag>` yet: the entry above is all there is._

