### `<pdx-textarea>`

Multi-line text input that can auto-grow.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | string | `''` | The current value. |
| `placeholder` | `placeholder` | string | `''` | Placeholder text shown while empty. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `readonly` | `readonly` | boolean | `false` | Makes the value read-only — visible but not editable. |
| `required` | `required` | boolean | `false` | Marks the field as required. |
| `rows` | `rows` | number | `3` | Initial number of visible text rows. |
| `minRows` | `minrows` | number | `0` | Minimum rows when auto-growing. |
| `maxRows` | `maxrows` | number | `0` | Maximum rows when auto-growing. |
| `maxlength` | `maxlength` | number | `0` | Maximum number of characters allowed. |
| `showCount` | `showcount` | boolean | `false` | Shows a live character counter. |
| `wordCount` | `wordcount` | boolean | `false` | Counts words instead of characters. |
| `resize` | `resize` | string | `'vertical'` | Resize behaviour: 'none', 'vertical', 'auto', …. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `success` | `success` | boolean | `false` | Applies the success state styling. |
| `warning` | `warning` | boolean | `false` | Applies the warning state styling. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `ariaLabel` | `arialabel` | string | `''` | Accessible name when there is no visible label. |
| `loading` | `loading` | boolean | `false` | Show loading state |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |
| `selectText()` | Select the whole text, so the next keystroke replaces it. Does not focus first. |

**Events:** `pdx-blur` — Fired when it loses focus.; `pdx-change` → `detail: { value }` — Fired when the value changes.; `pdx-focus` — Fired when it receives focus.; `pdx-input` → `detail: { value }` — Fired on each input as the user types.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic Textarea** — Default 3 rows with vertical resize handle. Wrapper pattern: border on wrapper.

```html
<pdx-textarea placeholder="Write your message..."></pdx-textarea>
<pdx-textarea placeholder="Additional notes..." rows="5"></pdx-textarea>
```

**Auto-resize** — `minRows` and `maxRows` enable auto-resize. Textarea grows as you type, scrolls when maxRows is reached. Resize handle is disabled in auto mode.

```html
<pdx-textarea minRows="2" maxRows="8" placeholder="Grows automatically"></pdx-textarea>
<pdx-textarea minRows="1" placeholder="No max"></pdx-textarea>
```

**Character & Word Count** — `showCount` for character counter. `wordCount` for word counter. Both can be combined. Counter turns red when over `maxlength`. _(from the live demo)_

```html
<div class="demo-stack">
  <div class="pdx-field">
    <pdx-label text="Bio" description="Max 200 characters"></pdx-label>
    <pdx-textarea placeholder="Tell us about yourself..." showCount maxlength="200" minRows="2" maxRows="6"></pdx-textarea>
  </div>
  <div class="pdx-field">
    <pdx-label text="Essay" description="Word count"></pdx-label>
    <pdx-textarea placeholder="Write your essay..." wordCount minRows="3" maxRows="10"></pdx-textarea>
  </div>
  <div class="pdx-field">
    <pdx-label text="Post" description="Both counters"></pdx-label>
    <pdx-textarea placeholder="Write a post..." showCount wordCount maxlength="500" minRows="2" maxRows="6"></pdx-textarea>
  </div>
</div>
```

**Resize Control** — `resize` prop controls the drag handle: `vertical` (default), `horizontal`, `both`, `none`. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-textarea placeholder="Vertical resize (default)" resize="vertical" rows="2"></pdx-textarea>
  <pdx-textarea placeholder="Both directions" resize="both" rows="2"></pdx-textarea>
  <pdx-textarea placeholder="No resize" resize="none" rows="2"></pdx-textarea>
</div>
```

**Sizes** — Same 5 sizes as input — font size and padding change, not the row count. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-textarea size="xs" placeholder="Extra Small (xs)" rows="2"></pdx-textarea>
  <pdx-textarea size="sm" placeholder="Small (sm)" rows="2"></pdx-textarea>
  <pdx-textarea placeholder="Default (md)" rows="2"></pdx-textarea>
  <pdx-textarea size="lg" placeholder="Large (lg)" rows="2"></pdx-textarea>
  <pdx-textarea size="xl" placeholder="Extra Large (xl)" rows="2"></pdx-textarea>
</div>
```

**Validation States** — Same states as input: error, success, warning, disabled, readonly. _(from the live demo)_

```html
<div class="demo-stack">
  <div class="pdx-field">
    <pdx-label text="Error" required></pdx-label>
    <pdx-textarea error value="This is too short" rows="2"></pdx-textarea>
    <span class="pdx-field-error">Message must be at least 20 characters</span>
  </div>
  <div class="pdx-field">
    <pdx-label text="Success"></pdx-label>
    <pdx-textarea success value="This looks great! Thank you for the detailed message." rows="2"></pdx-textarea>
    <span class="pdx-field-success">Message accepted</span>
  </div>
  <div class="pdx-field">
    <pdx-label text="Disabled" disabled></pdx-label>
    <pdx-textarea disabled value="Can't edit this" rows="2"></pdx-textarea>
  </div>
  <div class="pdx-field">
    <pdx-label text="Readonly"></pdx-label>
    <pdx-textarea readonly value="Read-only content — selectable but not editable. Lorem ipsum dolor sit amet." rows="2"></pdx-textarea>
  </div>
</div>
```

**Composition** — Textarea in a realistic form context. _(from the live demo)_

```html
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Feedback Form</h3>
  <div class="comp-form-single">
    <div class="pdx-field">
      <pdx-label text="Subject" required size="sm"></pdx-label>
      <pdx-input size="sm" placeholder="What is this about?"></pdx-input>
    </div>
    <div class="pdx-field">
      <pdx-label text="Details" required size="sm" description="Be as specific as possible"></pdx-label>
      <pdx-textarea size="sm" placeholder="Describe the issue or suggestion..." showCount wordCount maxlength="1000" minRows="4" maxRows="12"></pdx-textarea>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:var(--pdx-space-sm)">
      <pdx-button variant="ghost" size="sm">Cancel</pdx-button>
      <pdx-button variant="solid" size="sm">Submit Feedback</pdx-button>
    </div>
  </div>
</div>
```

