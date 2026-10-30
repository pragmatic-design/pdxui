### `<pdx-color-picker>`

Choose a color visually.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `format` | `format` | string | `'hex'` | Output format: 'hex', 'rgb' or 'hsl'. |
| `showAlpha` | `showalpha` | boolean | `false` | Shows the opacity (alpha) slider. |
| `presets` | — | array | `() => []` | Preset swatch colours. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `readonly` | `readonly` | boolean | `false` | Makes the value read-only — visible but not editable. |
| `inline` | `inline` | boolean | `false` | Renders the picker inline instead of in a popover. |
| `label` | `label` | string | `''` | Visible label text. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `clearable` | `clearable` | boolean | `false` | Shows a clear button to reset the value. |
| `size` | `size` | 'md' \| 'sm' \| 'lg' | `'md'` | sm, md (the default) or lg: the swatch's size. |
| `value` | `value` | string | `'#000000'` | The current value. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `show()` | Open the popup; open already, or inline, nothing changes. |
| `close()` | Close the popup. |
| `toggle()` | Open the popup when closed, close it when open. |
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |
| `getHex()` | The colour as `#rrggbb`, whatever the format. |
| `getRgb()` | The colour as `{ r, g, b, a }`. |
| `getHsl()` | The colour as `{ h, s, l, a }`. |

**Events:** `open-change` → `detail: { value: boolean }` — The popup opened (`true`) or closed (`false`): its open state, read-only, as an overlay's (#287).; `value-change` → `detail: { value: string }` — Fired when the component writes `value`. Does not bubble.

**Renders:** roles `dialog` · `group` · `slider`

**States:** `:state(open)` — The popup is open.; `:state(disabled)` — `disabled` is set.; `:state(readonly)` — `readonly` is set.

**Parts:** `[data-part="root"]` — The swatch, the button that opens the popup; absent when `inline`.; `[data-part="popup"]` — The panel: a floating `role="dialog"`, or in place when `inline`.; `[data-part="area"]` — The colour area, a two-dimensional `role="slider"`: saturation and brightness.; `[data-part="hue"]` — The hue slider.; `[data-part="alpha"]` — The opacity slider, while `showAlpha`.; `[data-part="input"]` — The text field that reads and writes the colour.; `[data-part="clear"]` — The clear button, while `clearable`.; `[data-part="preset"]` — A preset colour's button.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic — Hex Color Picker** — Default color picker with a swatch trigger. Click the swatch to open the panel.

```html
<pdx-color-picker
  value="#3b82f6"
  @change="onColorChange" />
```

**Inline — Always Visible** — With `inline`, the color panel is always visible — no popup trigger needed.

```html
<pdx-color-picker
  value="#10b981"
  inline
  @change="onInlineChange" />
```

**With Alpha — Opacity Slider** — Enable `show-alpha` to add an opacity slider. The output includes the alpha channel.

```html
<pdx-color-picker
  value="#ef4444"
  show-alpha
  @change="onAlphaChange" />
```

**Presets / Swatches** — Provide a `presets` array to show a clickable color grid for quick selection.

```html
<pdx-color-picker
  :presets="presetColors"
  @change="onPresetChange" />
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

