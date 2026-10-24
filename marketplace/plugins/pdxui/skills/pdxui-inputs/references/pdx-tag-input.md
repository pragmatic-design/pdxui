### `<pdx-tag-input>`

Type to add removable tags.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `placeholder` | `placeholder` | string | `''` | Placeholder text shown while empty. |
| `maxTags` | `maxtags` | number | `0` | Maximum number of tags allowed. |
| `maxLength` | `maxlength` | number | `0` | Maximum length of a single tag. |
| `separator` | `separator` | string | `','` | The separator between items. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `readonly` | `readonly` | boolean | `false` | Makes the value read-only — visible but not editable. |
| `allowDuplicates` | `allowduplicates` | boolean | `false` | Allow the same tag more than once. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `label` | `label` | string | `''` | Visible label text. |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `success` | `success` | boolean | `false` | Applies the success state styling. |
| `warning` | `warning` | boolean | `false` | Applies the warning state styling. |
| `loading` | `loading` | boolean | `false` | Show loading state |
| `value` | — | string[] | `() => []` | The current value. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `addTag(raw)` | Add one tag, trimmed. Returns false and adds nothing when validation refuses it: a duplicate, one over `max`, or one off `pattern`. |
| `removeTag(index)` | Remove the tag at this index and emit `pdx-remove`; an index outside the list does nothing. |
| `clear()` | Clears the value. |
| `getTags()` | A copy of the current tags — mutating it changes nothing. |
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |

**Events:** `draft-change` → `detail: { value: string }` — The text typed into the field, before it becomes a tag.; `pdx-add` → `detail: { tag: string; tags: string[] }` — A tag was added.; `pdx-remove` → `detail: { tag: string; index: number; tags: string[] }` — A tag was removed.; `value-change` → `detail: { value: string[] }` — Fired when the component writes `value`. Does not bubble.

**Renders:** roles `group` · `status`

**Slot:** `tag` — Renders one tag: a snippet `tag(tag, index)`, or the scoped slot, which receives `{ tag, index }`.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Simple tag input. Type a value and press Enter or , to add a tag. Press Backspace on empty input to remove the last tag.

```html
<pdx-tag-input placeholder="Add tags..." @value-change="onChange" />
```

**With Initial Values** — Pre-populated tags via the `:value` binding (array of strings).

```html
<pdx-tag-input :value="['JavaScript', 'TypeScript', 'Rust']" @value-change="onChange" />
```

**Max Tags** — Limited to 5 tags. The input field disappears when the limit is reached.

```html
<pdx-tag-input :max-tags="5" placeholder="Max 5 tags..." />
```

**Custom Separator** — Use `separator=";"` to split tags by semicolon instead of comma. Type values separated by ; to add multiple tags at once.

```html
<pdx-tag-input separator=";" placeholder="Use ; to separate..." />
```

**No Duplicates (Default)** — By default, duplicate tags are rejected. Try adding the same tag twice. Set `allow-duplicates` to override this behavior.

```html
<!-- Duplicates rejected (default) -->
<pdx-tag-input placeholder="Try adding duplicates..." />

<!-- Duplicates allowed -->
<pdx-tag-input allow-duplicates placeholder="Duplicates OK" />
```

**Sizes** — Three sizes: `sm`, default, and `lg`. _(from the live demo)_

```html
<div class="demo-stack">
  <div class="pdx-field">
    <pdx-label text="Small" size="sm"></pdx-label>
    <pdx-tag-input size="sm" :value="sizeTags" placeholder="Small..."></pdx-tag-input>
  </div>
  <div class="pdx-field">
    <pdx-label text="Default"></pdx-label>
    <pdx-tag-input :value="sizeTags" placeholder="Default..."></pdx-tag-input>
  </div>
  <div class="pdx-field">
    <pdx-label text="Large" size="lg"></pdx-label>
    <pdx-tag-input size="lg" :value="sizeTags" placeholder="Large..."></pdx-tag-input>
  </div>
</div>
```

**States** — Disabled, readonly, error, success, and warning states. _(from the live demo)_

```html
<div class="demo-stack">
  <div class="pdx-field">
    <pdx-label text="Disabled" disabled></pdx-label>
    <pdx-tag-input disabled :value="stateTags"></pdx-tag-input>
  </div>
  <div class="pdx-field">
    <pdx-label text="Readonly"></pdx-label>
    <pdx-tag-input readonly :value="stateTags"></pdx-tag-input>
  </div>
  <div class="pdx-field">
    <pdx-label text="Error" required></pdx-label>
    <pdx-tag-input error :value="stateTags" placeholder="Add tags..."></pdx-tag-input>
    <span class="pdx-field-error">At least 3 tags are required</span>
  </div>
  <div class="pdx-field">
    <pdx-label text="Success"></pdx-label>
    <pdx-tag-input success :value="stateTags" placeholder="Add tags..."></pdx-tag-input>
    <span class="pdx-field-success">Tags are valid</span>
  </div>
  <div class="pdx-field">
    <pdx-label text="Warning"></pdx-label>
    <pdx-tag-input warning :value="stateTags" placeholder="Add tags..."></pdx-tag-input>
    <span class="pdx-field-hint" style="color:var(--pdx-color-warning)">Some tags may be deprecated</span>
  </div>
</div>
```

**Paste Support** — Paste comma-separated values (or custom separator) to add multiple tags at once. Try copying `React, Vue, Angular, Svelte` and pasting into the input below.

```html
<!-- Default: comma separator -->
<pdx-tag-input placeholder="Paste comma-separated values..." />

<!-- Custom: semicolon separator for paste -->
<pdx-tag-input separator=";" placeholder="Paste ;-separated values..." />
```

**Slot Template** — Use the `tag` slot to customize tag chip rendering.

```html
<pdx-tag-input :value="tags">
  <slot name="tag" let:tag let:index>
    <span class="tag-colored">$&lbrace;tag&rbrace;</span>
  </slot>
</pdx-tag-input>

.tag-colored {
  padding: 2px 8px;
  border-radius: var(--pdx-radius-sm);
  font-size: var(--pdx-text-xs);
  font-weight: 600;
  background: var(--pdx-color-primary);
  color: var(--pdx-color-primary-text, #fff);
}
```

