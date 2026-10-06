### `<pdx-select>`

A searchable dropdown select.

**Takes a DataSource:** bind one to `:source`, or place the component inside a [`<pdx-data-source>`](../../pdxui-data/references/pdx-data-source.md), which it injects.

**Every select is a combobox.** The element that takes focus has `role="combobox"`: the trigger, or
the search input when `searchable` puts it in the trigger (the trigger around it then has no role).
It carries `aria-expanded`, `aria-controls` (the listbox) and, while the list is open,
`aria-activedescendant` naming the highlighted option. The open list is `role="listbox"` with
`role="option"` rows. A test finds a select by its name: `getByRole('combobox', { name: 'Country' })`.

**Name it.** The `label` prop names it; so does the label of an enclosing `pdx-form-field`, a
`pdx-label` right before it, or a `<label for>` the select's id. Without one, a searchable select is
an unnamed combobox and a plain one is named by its current value.

**Keyboard.** ↓ / ↑ / Enter / Space open the list on the selected option. Without `searchable`, a
letter moves to the next option that starts with it: on a closed select it picks that option, as a
native `<select>` does.

**Use it when** the value is one (with `multiple`, several) of a known list: static `options` or a
`DataSource`. **Not when** the user may type a value that is not in the list → `pdx-autocomplete`, whose
value is free text; the options are a hierarchy → `pdx-tree-select`; the rows to pick from are a searched,
paged table → `pdx-relation-picker`.

**Pitfalls**
- `pdx-change.detail` changes shape with `multiple`: `{ value, item }` single, `{ values, items }` multiple; a
  clear sends `{ value: null }` or `{ values: [] }`. Read `e.detail.value`, not `e.detail`.
- With `multiple`, `el.value` is the ARRAY. The comma-joined string survives only in the hidden input a native
  form submits, where a value containing a comma cannot round-trip.
- `creatable` makes the typed text both value and label and emits `pdx-create`; storing the new option is yours.
- Over 100 options the list virtualizes by itself.

**Composes with** `pdx-form` + `pdx-form-field` (wired by `name`; the field's label names it) · `pdx-data-source`
(injected when the select sits inside one).

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `options` | — | array | `() => []` | The selectable options. |
| `source` | — | object | `null` | DataSource instance — dedicated prop for data-driven select. Takes priority over options. |
| `value` | `value` | string \| null | `null` | The current value. |
| `labelField` | `labelfield` | string | `'label'` | Object field used as the option label. |
| `valueField` | `valuefield` | string | `'value'` | Object field used as the option value. |
| `placeholder` | `placeholder` | string | `''` | Placeholder text shown while empty. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `readonly` | `readonly` | boolean | `false` | Makes the value read-only — visible but not editable. |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `success` | `success` | boolean | `false` | Applies the success state styling. |
| `warning` | `warning` | boolean | `false` | Applies the warning state styling. |
| `clearable` | `clearable` | boolean | `false` | Shows a clear button to reset the value. |
| `searchable` | `searchable` | boolean | `false` | Adds a search box to filter options. |
| `multiple` | `multiple` | boolean | `false` | Allow selecting more than one. |
| `maxTagCount` | `maxtagcount` | number | `-1` | Multi mode: collapse selected tags in the trigger to keep it compact. -1 = unlimited (default, show all chips); 0 = summary only ("N selected"); N>0 = show N chips + a "+K" overflow chip. The dropdown is unaffected. |
| `size` | `size` | 'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl' | `''` | xs, sm, md (the default), lg or xl — the same scale as pdx-input. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `loading` | `loading` | boolean | `false` | Shows a loading / busy state. |
| `groupField` | `groupfield` | string | `''` | Object field used to group options. |
| `label` | `label` | string | `''` | The combobox's accessible name, and its listbox's. Not needed inside a pdx-form-field with a label, after a pdx-label, or with a <label for> the select's id: those name it. |
| `itemTemplate` | — | object | `null` | Custom render for each option: (item: {label, value, _raw}) => string\|Node |
| `selectedTemplate` | — | object | `null` | Custom render for selected value in trigger: (item: {label, value, _raw}) => string\|Node |
| `searchPosition` | `searchposition` | string | `'trigger'` | Where to show search input: 'trigger' (default) or 'dropdown' |
| `creatable` | `creatable` | boolean | `false` | Allow creating new options when search has no match. Emits pdx-create. |
| `createLabel` | `createlabel` | string | `''` | Label template for the create option. Use {query} as placeholder. Empty: the select.create component string, «Create "{query}"» in English. |
| `remote` | `remote` | boolean | `false` | Enable debounced server-side filtering for remote DataSource. |
| `debounce` | `debounce` | number | `200` | Debounce delay in ms for remote search. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `selectedItem` _(read-only)_ | Read-only, via a ref: `el.selectedItem`. |
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |

**Events:** `pdx-change` → `detail: { values, items } | { value, item }` — Fired when the value changes.; `pdx-clear` — Fired when the value is cleared.; `pdx-close` — Fired when it closes. Does not bubble.; `pdx-create` → `detail: { value, label }` — Fired when a new item is created.; `pdx-open` — Fired when it opens. Does not bubble.; `pdx-search` → `detail: { query }` — Fired when a search is performed.

**Renders:** roles `combobox` · `listbox` · `option` · `presentation` · `status`

**Slot:** `item` — Scoped — renders one option in the list. Receives `{ label, value, raw, index }` (`raw` is the original option).; `selected` — Scoped — renders the selected value in the trigger. Receives `{ label, value, raw }`.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Simple string array. Click or keyboard to open.

```html
<pdx-select :options="colors" placeholder="Pick a color..." />
```

```js
const colors = ['Red', 'Green', 'Blue', 'Yellow', 'Purple', 'Orange'];
```

**Sizes** — Matches input sizing: xs, sm, md (default), lg, xl.

```html
<pdx-select :options="colors" size="xs" placeholder="Extra small" />
<pdx-select :options="colors" size="sm" placeholder="Small" />
<pdx-select :options="colors" placeholder="Medium (default)" />
<pdx-select :options="colors" size="lg" placeholder="Large" />
<pdx-select :options="colors" size="xl" placeholder="Extra large" />
```

**States** — Disabled, readonly, error, success, warning.

```html
<pdx-select :options="colors" disabled placeholder="Disabled" />
<pdx-select :options="colors" readonly :value="'Blue'" />
<pdx-select :options="colors" error placeholder="Error state" />
<pdx-select :options="colors" success placeholder="Success state" />
<pdx-select :options="colors" warning placeholder="Warning state" />
```

**Clearable** — Clear button appears on hover when a value is selected.

```html
<pdx-select :options="colors" clearable :value="'Green'" />
```

**Searchable** — Type to filter. The search field is the combobox; without `searchable`, the trigger is, and typing a letter jumps to the next option that starts with it.

```html
<pdx-select :options="fruits" searchable clearable placeholder="Search fruit..." />
```

**Search in Dropdown** — Search input inside the dropdown panel. Use `searchPosition="dropdown"`.

```html
<pdx-select :options="fruits" searchable
  searchPosition="dropdown" clearable
  placeholder="Select fruit..." />
```

**Multiple** — Multi-select with chip tags. Backspace removes last tag.

```html
<pdx-select :options="colors" multiple searchable clearable
  placeholder="Pick colors..." />
```

**Object Data** — Custom labelField and valueField for object arrays.

```html
<pdx-select :options="users" labelField="name" valueField="id"
  searchable clearable placeholder="Select user..." />
```

```js
const users = [
  { id: 1, name: 'Alice Johnson' },
  { id: 2, name: 'Bob Smith' },
  { id: 3, name: 'Charlie Brown' },
];
```

**Grouped** — Options grouped by a field. Group headers are non-interactive.

```html
<pdx-select :options="cities" groupField="country"
  labelField="name" valueField="id"
  searchable placeholder="Select city..." />
```

```js
const cities = [
  { id: 1, name: 'New York', country: 'USA' },
  { id: 4, name: 'London', country: 'UK' },
  { id: 7, name: 'Rome', country: 'Italy' },
];
```

**Large List — 10,000 Items** — Virtual scroll activates automatically for >100 items. Smooth scrolling with binary search.

```html
<pdx-select :options="largeList" searchable clearable
  placeholder="Search 10K items..." />
```

```js
const largeList = Array.from({ length: 10000 }, (_, i) => 'Item ' + (i + 1));
```

**Loading — Remote Simulation** — Uses `delayTransport` to simulate 1s server latency with `autoLoad: false`. Data loads on first open — click to see the spinner, then options appear after 1s.

```js
import { createDataSource, arrayTransport, delayTransport } from '@pdxui/core';

const remoteUserDS = createDataSource({
  transport: delayTransport({
    transport: arrayTransport({ data: users, idField: 'id' }),
    readDelay: 1000,
  }),
  idField: 'id',
});
```

```html
<pdx-select :source="remoteUserDS" labelField="name" valueField="id"
  searchable clearable placeholder="Fetch users (1s delay)..." />
```

**DataSource — `source` prop** — Use the dedicated `:source` prop for DataSource binding. Clearer intent than passing a DataSource via `:options`. Search delegates to `ds.setFilter()`.

```js
import { createDataSource } from '@pdxui/core';

const userDS = createDataSource({
  data: [
    { id: 1, name: 'Alice Johnson', role: 'Lead' },
    { id: 2, name: 'Bob Smith', role: 'Developer' },
    ...
  ],
  idField: 'id',
});
```

```html
<pdx-select :source="userDS" labelField="name" valueField="id"
  searchable clearable placeholder="Search users..." />
```

**Cascading Selects** — Second select filters options based on the first select's value. Uses `$derived` to recompute the filtered array reactively.

```js
let selectedCountry = $signal('');

const filteredCities = $derived(
  cities.filter(c => !selectedCountry || c.country === selectedCountry)
);

function onCountryChange(e) {
  selectedCountry = e.detail.value;
}
```

```html
<pdx-select :options="cascadeCountries" clearable
  @pdx-change="onCountryChange" placeholder="Select country..." />

<pdx-select :options="filteredCities" labelField="name" valueField="id"
  :disabled="!selectedCountry" searchable clearable
  placeholder="Select city..." />
```

**`<pdx-data-source>` — Declarative Provider** — Non-rendering component that creates a DataSource from declarative props. Accepts `:data` (array), `url` (REST), or `:transport` (custom). Exposes `source` property for binding.

```js
// pdx-data-source creates the DataSource declaratively
```

```html
<pdx-data-source :transport="slowTransport" id-field="id"
  :ref="providerRef" />
```

```js
// Pass the ref directly — select auto-extracts the DataSource
```

```html
<pdx-select :source="providerRef"
  labelField="name" valueField="id"
  searchable clearable />
```

```js
// Or pass a DataSource object directly:
```

```html
<pdx-select :source="myDataSource" />
```

```js
// Or with static data (no transport needed):
```

```html
<pdx-data-source :data="users" id-field="id" />
```

```js
// Or with REST URL:
```

```html
<pdx-data-source url="/api/products" :page-size="25" />
```

**Custom Template — Function Prop** — Use `:item-template` and `:selected-template` for rich rendering with avatars, descriptions, icons.

```html
<pdx-select :options="teamMembers"
  labelField="name" valueField="id"
  :item-template="renderTeamItem"
  :selected-template="renderTeamSelected"
  clearable placeholder="Select team member..." />
```

```js
function renderTeamItem(item) {
  const r = item.raw;
  return html`<div class="team-option">
    <span class="team-avatar">${r.initials}</span>
    <div class="team-info">
      <span class="team-name">${item.label}</span>
      <span class="team-role">${r.role}</span>
    </div>
  </div>`;
}
```

**Custom Template — Scoped Slot** — Alternative to function props: use `<slot let:var>` to define templates inline with data from the child. HTML-native syntax.

```html
<pdx-select :options="teamMembers"
  labelField="name" valueField="id"
  clearable placeholder="Select team member...">

  <slot name="item" let:label let:raw>
    <div class="team-option">
      <span class="team-avatar">{{ raw.initials }}</span>
      <div class="team-info">
        <span class="team-name">{{ label }}</span>
        <span class="team-role">{{ raw.role }}</span>
      </div>
    </div>
  </slot>

  <slot name="selected" let:label let:raw>
    <span class="team-selected">
      <span class="team-avatar-sm">{{ raw.initials }}</span> {{ label }}
    </span>
  </slot>

</pdx-select>
```

**Width & Sizing** — Default is 100% width. Use inline styles or CSS classes to control width.

```html
<pdx-select :options="colors" placeholder="100% width (default)" />
<pdx-select :options="colors" style="width: 200px" />
<pdx-select :options="colors" style="width: auto; min-width: 150px; display: inline-block" />
```

**Composition — Registration Form** — Realistic form with multiple selects.

```html
<div class="demo-form">
  <div class="field">
    <pdx-label text="Country"></pdx-label>
    <pdx-select :options="countries" searchable clearable />
  </div>
  <div class="field">
    <pdx-label text="Preferred Languages"></pdx-label>
    <pdx-select :options="languages" multiple searchable clearable />
  </div>
  <div class="field">
    <pdx-label text="Role"></pdx-label>
    <pdx-select :options="roles" />
  </div>
</div>
```

