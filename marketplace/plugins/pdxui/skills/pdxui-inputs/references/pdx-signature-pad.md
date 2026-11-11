### `<pdx-signature-pad>`

Draw or type a signature; the form gets a PNG.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `readonly` | `readonly` | boolean | `false` | Makes the value read-only — visible but not editable. |
| `required` | `required` | boolean | `false` | The form judges it: an empty signature is valueMissing. |
| `error` | `error` | string | `''` | A custom validity message: the field is invalid while it is set. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `label` | `label` | string | `''` | The field's name, for the group and the surface. Empty: «Signature». |
| `ariaLabel` | `arialabel` | string | `''` | Accessible name when there is no visible label; wins over `label`. |
| `placeholder` | `placeholder` | string | `''` | The prompt on the empty surface. Empty: «Sign here». |
| `penWidth` | `penwidth` | number | `2` | The pen's width, in CSS pixels. |
| `minStroke` | `minstroke` | number | `0` | The path length, in CSS pixels, a drawing needs before it counts as signed. 0: any stroke. |
| `value` | `value` | string | `''` | The signature as a PNG data URL; '' when nothing counts as signed. Setting it shows that image. |
| `mode` | `mode` | 'draw' \| 'type' | `'draw'` | draw (the default) or type: how the user signs. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `clear()` | Clear the signature, drawn or typed; the value becomes ''. |
| `undo()` | Take the last stroke off; the value follows. |
| `focus()` | Focus the surface, or the name field in the Type mode. |
| `isEmpty()` | Whether nothing counts as signed. |

**Events:** `mode-change` → `detail: { value: 'draw' | 'type' }` — Fired when the component writes `mode`. Does not bubble.; `value-change` → `detail: { value: string }` — Fired when the component writes `value`. Does not bubble.

**Renders:** roles `group` · `img`

**States:** `:state(empty)` — Nothing counts as signed.; `:state(typing)` — The Type mode is in use.; `:state(disabled)` — `disabled` is set.; `:state(readonly)` — `readonly` is set.; `:state(invalid)` — `error` is set.

**Parts:** `[data-part="root"]` — The field, `role="group"` named by the label.; `[data-part="toolbar"]` — The two ways to sign.; `[data-part="modeButton"]` — The Draw and the Type button, `aria-pressed` on the one in use.; `[data-part="nameInput"]` — The text field of the Type mode.; `[data-part="surface"]` — The paper the signature is drawn on.; `[data-part="pad"]` — The canvas, `role="img"` named by the label and whether it is signed.; `[data-part="guide"]` — The signing line.; `[data-part="prompt"]` — The placeholder shown while nothing is signed.; `[data-part="undoButton"]` — The button that takes the last stroke off.; `[data-part="clearButton"]` — The button that clears the signature.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Draw with the mouse, a pen or a finger. Ctrl+Z takes the last stroke off, Delete clears it; the value is a PNG data URL. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-signature-pad label="Customer signature" ::value="signature"></pdx-signature-pad>
  <p class="pdx-txt-small pdx-ink-muted">{{ signature ? 'Signed — ' + Math.round(signature.length / 1024) + ' KB PNG' : 'Not signed' }}</p>
</div>
```

**Type your name** — The keyboard way to sign: the name is drawn in a script face the package ships, so the image is the same on every system. The face loads only when this mode is used. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-signature-pad label="Signature" mode="type"></pdx-signature-pad>
</div>
```

**Form Integration** — Form-associated: the PNG is submitted under its `name`; `required` makes an empty signature `valueMissing`, and a reset clears it. `min-stroke` asks for a stroke of some length before a tap counts. _(from the live demo)_

```html
<div class="demo-stack">
  <form @submit="onSubmit">
    <pdx-form-field label="Signature" required>
      <pdx-signature-pad name="signature" required min-stroke="40"></pdx-signature-pad>
    </pdx-form-field>
    <div class="actions">
      <button type="submit" class="pdx-primary">Submit</button>
      <button type="reset" class="pdx-ghost">Reset</button>
    </div>
  </form>
  <p class="pdx-txt-small pdx-ink-muted">{{ submitted }}</p>
</div>
```

**States** _(from the live demo)_

```html
<div class="demo-grid">
  <div>
    <span class="pdx-txt-small pdx-ink-muted">Disabled</span>
    <pdx-signature-pad label="Disabled signature" disabled></pdx-signature-pad>
  </div>
  <div>
    <span class="pdx-txt-small pdx-ink-muted">Readonly</span>
    <pdx-signature-pad label="Readonly signature" readonly></pdx-signature-pad>
  </div>
  <div>
    <span class="pdx-txt-small pdx-ink-muted">Error</span>
    <pdx-signature-pad label="Signature in error" error="Sign to accept the terms"></pdx-signature-pad>
  </div>
  <div>
    <span class="pdx-txt-small pdx-ink-muted">Thick pen</span>
    <pdx-signature-pad label="Thick pen" pen-width="5"></pdx-signature-pad>
  </div>
</div>
```

