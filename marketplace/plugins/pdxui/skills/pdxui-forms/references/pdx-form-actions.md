### `<pdx-form-actions>`

The submit/cancel action bar.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `submitLabel` | `submitlabel` | string | `''` | Submit button label. Uses i18n registry default if not set. |
| `resetLabel` | `resetlabel` | string | `''` | Reset button label. Set to 'none' to hide. Uses i18n registry default if not set. |
| `align` | `align` | string | `'end'` | Alignment: 'start' \| 'center' \| 'end' \| 'between'. Default: 'end'. |
| `showLoading` | `showloading` | boolean | `true` | Show loading spinner on submit button while submitting. |


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Default (Save / Reset)** — End-aligned by default. Inside a form, Save submits and Reset clears.

```html
<pdx-form :form="myForm">
  … fields …
  <pdx-form-actions submit-label="Save" reset-label="Reset" />
</pdx-form>
```

**Alignment** — `align`: `start` · `center` · `end` (default) · `between`. _(from the live demo)_

```html
<div class="demo-stack">
  <div class="demo-container"><pdx-form-actions align="start" submit-label="Save" reset-label="Cancel"></pdx-form-actions></div>
  <div class="demo-container"><pdx-form-actions align="center" submit-label="Save" reset-label="Cancel"></pdx-form-actions></div>
  <div class="demo-container"><pdx-form-actions align="between" submit-label="Save" reset-label="Cancel"></pdx-form-actions></div>
</div>
```

**Submit only** — Set `reset-label="none"` to hide the reset button. _(from the live demo)_

```html
<div class="demo-container">
  <pdx-form-actions submit-label="Continue" reset-label="none"></pdx-form-actions>
</div>
```

**Custom buttons (slot)** — Project your own buttons to replace the defaults entirely. _(from the live demo)_

```html
<div class="demo-container">
  <pdx-form-actions align="between">
    <button class="pdx-btn pdx-ghost pdx-danger">Delete</button>
    <span class="spacer"></span>
    <button class="pdx-btn pdx-outline">Save draft</button>
    <button class="pdx-btn pdx-primary">Publish</button>
  </pdx-form-actions>
</div>
```

