### `<pdx-toggle>`

A pressable on/off button.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `pressed` | `pressed` | boolean | `false` | Whether the toggle is pressed/on. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `value` | `value` | string | `''` | The current value. |
| `variant` | `variant` | string | `'outline'` | Visual variant. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `ariaLabel` | `arialabel` | string | `''` | The toggle's name when its content does not say it ("B" is Bold), forwarded to the inner `<button>`: `aria-label` on the host has no role to name. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |

**Events:** `pdx-change`; `pdx-pressed-change` → `detail: { pressed }` — Fired when the pressed changes.; `pressedchange` → `detail: { pressed }` — Fired on `pressedchange`.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Standalone Toggle** — Click to toggle on/off.

```html
<!-- aria-label names it by what it does: "B" alone is read as the letter -->
<pdx-toggle :pressed="bold" @pressedchange="onBold" aria-label="Bold"><strong>B</strong></pdx-toggle>
<pdx-toggle :pressed="italic" @pressedchange="onItalic" aria-label="Italic"><em>I</em></pdx-toggle>
```

**Toggle Group — Multiple** — Multiple toggles can be active simultaneously. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-toggle-group type="multiple" :value="formatting" @valuechange="onFormatting" label="Formatting">
    <pdx-toggle value="bold" aria-label="Bold"><strong>B</strong></pdx-toggle>
    <pdx-toggle value="italic" aria-label="Italic"><em>I</em></pdx-toggle>
    <pdx-toggle value="underline" aria-label="Underline"><u>U</u></pdx-toggle>
    <pdx-toggle value="strike" aria-label="Strikethrough"><s>S</s></pdx-toggle>
  </pdx-toggle-group>
</div>
```

**Toggle Group — Single** — Only one can be active (exclusive). _(from the live demo)_

```html
<div class="demo-row">
  <pdx-toggle-group type="single" :value="align" @valuechange="onAlign" label="Alignment">
    <pdx-toggle value="left">Left</pdx-toggle>
    <pdx-toggle value="center">Center</pdx-toggle>
    <pdx-toggle value="right">Right</pdx-toggle>
    <pdx-toggle value="justify">Justify</pdx-toggle>
  </pdx-toggle-group>
</div>
```

**Variants** _(from the live demo)_

```html
<div class="demo-stack">
  <div>
    <span class="pdx-txt-small pdx-ink-muted">Outline:</span>
    <pdx-toggle-group type="single" value="a" variant="outline">
      <pdx-toggle value="a">A</pdx-toggle><pdx-toggle value="b">B</pdx-toggle><pdx-toggle value="c">C</pdx-toggle>
    </pdx-toggle-group>
  </div>
  <div>
    <span class="pdx-txt-small pdx-ink-muted">Ghost:</span>
    <pdx-toggle-group type="single" value="a" variant="ghost">
      <pdx-toggle value="a">A</pdx-toggle><pdx-toggle value="b">B</pdx-toggle><pdx-toggle value="c">C</pdx-toggle>
    </pdx-toggle-group>
  </div>
  <div>
    <span class="pdx-txt-small pdx-ink-muted">Solid:</span>
    <pdx-toggle-group type="single" value="a" variant="solid">
      <pdx-toggle value="a">A</pdx-toggle><pdx-toggle value="b">B</pdx-toggle><pdx-toggle value="c">C</pdx-toggle>
    </pdx-toggle-group>
  </div>
</div>
```

**Disabled** _(from the live demo)_

```html
<div class="demo-row">
  <pdx-toggle-group type="single" value="a" disabled>
    <pdx-toggle value="a">A</pdx-toggle><pdx-toggle value="b">B</pdx-toggle>
  </pdx-toggle-group>
</div>
```

