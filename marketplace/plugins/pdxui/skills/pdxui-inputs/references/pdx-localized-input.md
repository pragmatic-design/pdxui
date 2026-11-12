### `<pdx-localized-input>`

One text in several languages, a tab each.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `cultures` | — | string[] | `[]` | The cultures to edit, as codes (`en`, `it`, `fr-CA`). The current locale's comes first when it is one of them. |
| `defaultCulture` | `defaultculture` | string | `''` | The culture `required-scope="default"` asks for, and whose text an empty culture shows as its placeholder. Empty: the first culture. |
| `requiredScope` | `requiredscope` | 'all' \| 'default' | `'all'` | all (the default): `required` asks every culture; default: only the default culture. |
| `layout` | `layout` | 'tabs' \| 'stacked' | `'tabs'` | tabs (the default): one culture at a time; stacked: every culture a field. |
| `multiline` | `multiline` | boolean | `false` | A textarea per culture instead of an input. |
| `rows` | `rows` | number | `3` | The textarea's rows, when `multiline`. |
| `label` | `label` | string | `''` | The field's name: the group's, and in each culture's field name. Empty: «Text». |
| `ariaLabel` | `arialabel` | string | `''` | Accessible name when there is no visible label; wins over `label`. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `readonly` | `readonly` | boolean | `false` | Makes the value read-only — visible but not editable. |
| `required` | `required` | boolean | `false` | The form judges it with `required-scope`: every culture, or the default one. |
| `error` | `error` | string | `''` | A custom validity message: the field is invalid while it is set. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `value` | — | LocalizedText \| null | `null` | The text, by culture code. A culture with no entry, or an empty one, is missing; the form submits the JSON. |

**Events:** `value-change` → `detail: { value: LocalizedText | null }` — Fired when the component writes `value`. Does not bubble.

**Renders:** roles `group` · `tab` · `tablist` · `tabpanel`

**States:** `:state(incomplete)` — Some culture has no text.; `:state(invalid)` — `error` is set.; `:state(disabled)` — `disabled` is set.; `:state(readonly)` — `readonly` is set.

**Parts:** `[data-part="root"]` — The field, `role="group"` named by the label.; `[data-part="tabs"]` — The tablist of the cultures.; `[data-part="tab"]` — A culture's tab, named in its own language.; `[data-part="marker"]` — The dot of a culture with no text.; `[data-part="panel"]` — A culture's panel (a tabpanel), or its row when stacked.; `[data-part="field"]` — A culture's input or textarea.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — One text in several cultures. Each culture is a tab named in its own language, the current one first; a dot marks a culture still missing, and an empty culture shows the default one's text as a hint. `::value` holds `{ [culture]: string }`. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-localized-input label="Product name" :cultures="cultures" ::value="name"></pdx-localized-input>
  <pre class="pdx-txt-mono pdx-txt-small">{{ JSON.stringify(name) }}</pre>
</div>
```

**Stacked and multi-line** — `layout="stacked"` shows every culture at once, for side-by-side translation; `multiline` makes each a textarea. Each field carries its culture's `lang` and `dir`: Arabic is written right to left. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-localized-input label="Description" layout="stacked" multiline :cultures="cultures" :value="description"></pdx-localized-input>
</div>
```

**Form Integration** — Form-associated: the form submits the value's JSON under its `name`. `required` asks every culture; with `required-scope="default"` only the default culture. _(from the live demo)_

```html
<div class="demo-stack">
  <form @submit="onSubmit">
    <pdx-form-field label="Title (every culture)" required>
      <pdx-localized-input name="title" required :cultures="cultures"></pdx-localized-input>
    </pdx-form-field>
    <pdx-form-field label="Subtitle (English required)" required>
      <pdx-localized-input name="subtitle" required required-scope="default" default-culture="en" :cultures="cultures"></pdx-localized-input>
    </pdx-form-field>
    <div class="actions">
      <button type="submit" class="pdx-primary">Submit</button>
      <button type="reset" class="pdx-ghost">Reset</button>
    </div>
  </form>
  <pre class="pdx-txt-mono pdx-txt-small">{{ submitted }}</pre>
</div>
```

