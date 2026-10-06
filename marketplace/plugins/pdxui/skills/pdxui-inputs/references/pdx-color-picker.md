### `<pdx-color-picker>`

Choose a color visually.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | string | `'#000000'` | The current value. |
| `format` | `format` | string | `'hex'` | Output format: 'hex', 'rgb' or 'hsl'. |
| `showAlpha` | `showalpha` | boolean | `false` | Shows the opacity (alpha) slider. |
| `presets` | — | array | `() => []` | Preset swatch colours. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `readonly` | `readonly` | boolean | `false` | Makes the value read-only — visible but not editable. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `inline` | `inline` | boolean | `false` | Renders the picker inline instead of in a popover. |
| `label` | `label` | string | `''` | Visible label text. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `clearable` | `clearable` | boolean | `false` | Shows a clear button to reset the value. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |

**Events:** `pdx-change` → `detail: { value, hex, rgb: { r, g, b, a }, hsl: { h, s, l, a } }` — When a colour is committed.; `pdx-input` → `detail: { value, hex, rgb: { r, g, b, a }, hsl: { h, s, l, a } }` — While dragging; `value` is in the picker's current format.

**Renders:** roles `dialog` · `group` · `slider`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic — Hex Color Picker** — Default color picker with a swatch trigger. Click the swatch to open the panel.

```html
<pdx-color-picker
  value="#3b82f6"
  @pdx-change="onColorChange" />
```

**Inline — Always Visible** — With `inline`, the color panel is always visible — no popup trigger needed.

```html
<pdx-color-picker
  value="#10b981"
  inline
  @pdx-change="onInlineChange" />
```

**With Alpha — Opacity Slider** — Enable `show-alpha` to add an opacity slider. The output includes the alpha channel.

```html
<pdx-color-picker
  value="#ef4444"
  show-alpha
  @pdx-change="onAlphaChange" />
```

**Presets / Swatches** — Provide a `presets` array to show a clickable color grid for quick selection.

```html
<pdx-color-picker
  :presets="presetColors"
  @pdx-change="onPresetChange" />
```

```js
const presetColors = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4',
  '#64748b', '#000000', '#ffffff', '#f5f5f4',
];
```

**Formats — hex / rgb / hsl** — Use the `format` prop to control the output string format.

```html
<pdx-color-picker value="#8b5cf6" format="hex" />
<pdx-color-picker value="#8b5cf6" format="rgb" />
<pdx-color-picker value="#8b5cf6" format="hsl" />
```

**Sizes — sm / default / lg** — Control the swatch trigger size with the `size` prop.

```html
<pdx-color-picker value="#3b82f6" size="sm" />
<pdx-color-picker value="#10b981" />
<pdx-color-picker value="#ef4444" size="lg" />
```

**Disabled & Readonly** — Non-interactive states. `disabled` greys out the swatch; `readonly` shows the color but prevents changes.

```html
<pdx-color-picker value="#64748b" disabled />
<pdx-color-picker value="#8b5cf6" readonly />
```

