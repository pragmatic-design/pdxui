### `<pdx-mention>`

Type @ to mention people.

**Takes a DataSource:** bind one to `:source`.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | string | `''` | Current text value (clean text, no markup) |
| `trigger` | `trigger` | string | `'@'` | Trigger character(s) — comma-separated for multiple (default: '@') |
| `items` | — | array | `[]` | Static suggestions array |
| `source` | — | object | `null` | DataSource or raw array for remote search |
| `labelField` | `labelfield` | string | `'label'` | Field for display label |
| `valueField` | `valuefield` | string | `'value'` | Field for value/id |
| `descriptionField` | `descriptionfield` | string | `''` | Field for description (optional) |
| `minLength` | `minlength` | number | `0` | Minimum chars after trigger before searching (default: 0) |
| `debounce` | `debounce` | number | `300` | Debounce delay in ms for remote search (default: 300) |
| `maxItems` | `maxitems` | number | `10` | Max suggestions to show |
| `rows` | `rows` | number | `3` | Textarea rows |
| `placeholder` | `placeholder` | string | `''` | Placeholder text |
| `label` | `label` | string | `''` | The field's accessible name (aria-label on the textarea). A field needs one: give `label`, or put a visible label next to it. Without either, the placeholder stands in. |
| `disabled` | `disabled` | boolean | `false` | Disabled |
| `readonly` | `readonly` | boolean | `false` | Readonly |
| `name` | `name` | string | `''` | Form field name |

**Events:** `pdx-change` → `detail: { value, mentions, markup }` — Fired when the value changes.; `pdx-input` → `detail: { value, mentions, markup }` — Fired on each input as the user types.; `pdx-select` → `detail: { item, trigger, query }` — Fired when an item is selected.

**Renders:** roles `listbox` · `option` · `status`

**Slot:** `suggestion` — Scoped — renders one suggestion. Receives `{ item, index, active }`.

**Shapes:** `MentionItem { value: string; label: string; description?: string }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic @Mention** — Type `@` followed by a name to see suggestions. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-mention
    :items="users"
    label="Comment"
    placeholder="Type @ to mention a user..."
    :rows="4"
  ></pdx-mention>
</div>
```

**Multiple Triggers** — Use `@` for users and `#` for tags. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-mention
    trigger="@, #"
    :items="usersAndTags"
    label="Post"
    placeholder="Type @ for users, # for tags..."
    :rows="4"
  ></pdx-mention>
</div>
```

**With Descriptions** — Show extra info (role, email) next to each suggestion. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-mention
    :items="richUsers"
    descriptionfield="role"
    label="Assign to"
    placeholder="Type @ to mention..."
    :rows="4"
  ></pdx-mention>
</div>
```

**DataSource Integration** — Connect to a DataSource for server-side search. Debounce 300ms, loading state. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-mention
    :source="remoteSource"
    :debounce="300"
    :minLength="1"
    label="Search mention"
    placeholder="Type @ to search users remotely..."
    :rows="4"
  ></pdx-mention>
</div>
```

**Disabled & Readonly** _(from the live demo)_

```html
<div class="demo-stack">
  <div class="demo-labeled">
    <span class="pdx-txt-small pdx-ink-muted">Disabled</span>
    <pdx-mention disabled value="Hello @Alice, this is disabled" :items="users"></pdx-mention>
  </div>
  <div class="demo-labeled">
    <span class="pdx-txt-small pdx-ink-muted">Readonly</span>
    <pdx-mention readonly value="Hello @Bob, this is readonly" :items="users"></pdx-mention>
  </div>
</div>
```

**Slot Template** — Use the `suggestion` slot to customize suggestion items in the dropdown (e.g., avatars, badges). The slot receives scope data for each suggestion.

```html
<pdx-mention :items="users">
  <slot name="suggestion" let:item let:index let:active>
    <div class="mention-custom">
      <span class="avatar">$&lbrace;item.label.charAt(0)&rbrace;</span>
      <span>$&lbrace;item.label&rbrace;</span>
    </div>
  </slot>
</pdx-mention>

.mention-custom {
  display: flex; align-items: center; gap: 8px;
}
.mention-custom .avatar {
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--pdx-color-primary);
  color: #fff; font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
```

