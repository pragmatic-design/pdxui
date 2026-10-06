### `<pdx-inline-edit>`

Click text to edit it in place.

**`type="number"` and `type="currency"` keep the decimals the display can show.** The editor keeps
`precision` decimals: by default the currency's own (2 for EUR, 0 for JPY) or, for a plain number,
up to 3 — 29.5 edited to «30.2» saves 30.2. Set `precision` to fix it (`precision="0"` saves whole
numbers). The number editor shows the value with that many decimals while you edit («29.500»).

```html
<pdx-inline-edit type="number" :value="weight" @pdx-change="e => weight = e.detail.value"></pdx-inline-edit>
<pdx-inline-edit type="currency" currency="EUR" precision="2" :value="price"></pdx-inline-edit>
```

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `type` | `type` | string | `'text'` | Data type — determines which editor to show |
| `value` | — | object | `null` | Current value |
| `options` | — | array | `[]` | Options for select/multiselect: [{ value, label }] |
| `placeholder` | `placeholder` | string | `''` | Placeholder when value is empty |
| `editOn` | `editon` | string | `'click'` | When to enter edit mode: 'click' \| 'dblclick' \| 'icon' |
| `saveOn` | `saveon` | string | `'blur'` | When to save: 'blur' (auto-save on blur/Enter) \| 'action' (confirm/cancel buttons) |
| `disabled` | `disabled` | boolean | `false` | Disabled |
| `readonly` | `readonly` | boolean | `false` | Readonly |
| `size` | `size` | string | `''` | Component size |
| `currency` | `currency` | string | `'EUR'` | Currency code for type=currency (default: 'EUR') |
| `precision` | `precision` | number | `-1` | Decimals kept by the number and currency editors. -1: the currency's own (2 for EUR, 0 for JPY), or what the number display shows (3). |
| `locale` | `locale` | string | `''` | Locale for formatting. Empty: the page's language (`lang`), then the browser's. |
| `name` | `name` | string | `''` | Form field name |
| `showIcon` | `showicon` | boolean | `true` | Show edit icon on hover |
| `label` | `label` | string | `''` | The field's name, for the editor's accessible name. Empty: the inline-edit.edit component string, «Edit {value}». |

**Events:** `pdx-cancel` — Fired when cancelled.; `pdx-change` → `detail: { value }` — Fired when the value changes.

**Renders:** roles `button`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Text** — Click to edit. Enter saves, Escape cancels, and both put focus back on the value. Tab or a click elsewhere saves too. _(from the live demo)_

```html
<div class="demo-row">
  <span class="demo-label">Name:</span>
  <pdx-inline-edit type="text" :value="'John Doe'"></pdx-inline-edit>
</div>
<div class="demo-row">
  <span class="demo-label">Email:</span>
  <pdx-inline-edit type="text" :value="'john@example.com'"></pdx-inline-edit>
</div>
<div class="demo-row">
  <span class="demo-label">Empty:</span>
  <pdx-inline-edit type="text" placeholder="Click to add name..."></pdx-inline-edit>
</div>
```

**Number & Currency** _(from the live demo)_

```html
<div class="demo-row">
  <span class="demo-label">Quantity:</span>
  <pdx-inline-edit type="number" :value="42"></pdx-inline-edit>
</div>
<div class="demo-row">
  <span class="demo-label">Price:</span>
  <pdx-inline-edit type="currency" :value="1234.50" currency="EUR"></pdx-inline-edit>
</div>
<div class="demo-row">
  <span class="demo-label">USD Price:</span>
  <pdx-inline-edit type="currency" :value="99.99" currency="USD"></pdx-inline-edit>
</div>
```

**Date & DateTime** _(from the live demo)_

```html
<div class="demo-row">
  <span class="demo-label">Birthday:</span>
  <pdx-inline-edit type="date" :value="'1990-05-15'"></pdx-inline-edit>
</div>
<div class="demo-row">
  <span class="demo-label">Appointment:</span>
  <pdx-inline-edit type="datetime" :value="'2026-04-08T14:30'"></pdx-inline-edit>
</div>
```

**Boolean** — Click to toggle. Saves immediately. _(from the live demo)_

```html
<div class="demo-row">
  <span class="demo-label">Active:</span>
  <pdx-inline-edit type="boolean" :value="true"></pdx-inline-edit>
</div>
<div class="demo-row">
  <span class="demo-label">Notifications:</span>
  <pdx-inline-edit type="boolean" :value="false"></pdx-inline-edit>
</div>
```

**Select & MultiSelect** _(from the live demo)_

```html
<div class="demo-row">
  <span class="demo-label">Status:</span>
  <pdx-inline-edit type="select" :value="'active'" :options="statusOptions"></pdx-inline-edit>
</div>
<div class="demo-row">
  <span class="demo-label">Tags:</span>
  <pdx-inline-edit type="multiselect" :value="['frontend', 'design']" :options="tagOptions"></pdx-inline-edit>
</div>
```

**Color & Rating** _(from the live demo)_

```html
<div class="demo-row">
  <span class="demo-label">Brand color:</span>
  <pdx-inline-edit type="color" :value="'#3b82f6'"></pdx-inline-edit>
</div>
<div class="demo-row">
  <span class="demo-label">Score:</span>
  <pdx-inline-edit type="rating" :value="3"></pdx-inline-edit>
</div>
```

**Textarea** — Ctrl+Enter to save, Escape to cancel. _(from the live demo)_

```html
<div class="demo-row">
  <span class="demo-label">Notes:</span>
  <pdx-inline-edit type="textarea" :value="'This is a multi-line note.\nSecond line here.'"></pdx-inline-edit>
</div>
```

**Action Mode** — Explicit save/cancel buttons instead of blur-to-save. _(from the live demo)_

```html
<div class="demo-row">
  <span class="demo-label">Title:</span>
  <pdx-inline-edit type="text" saveon="action" :value="'Project Alpha'"></pdx-inline-edit>
</div>
<div class="demo-row">
  <span class="demo-label">Budget:</span>
  <pdx-inline-edit type="currency" saveon="action" :value="50000" currency="EUR"></pdx-inline-edit>
</div>
```

**Disabled & Readonly** _(from the live demo)_

```html
<div class="demo-row">
  <span class="demo-label">Disabled:</span>
  <pdx-inline-edit disabled type="text" :value="'Cannot edit'"></pdx-inline-edit>
</div>
<div class="demo-row">
  <span class="demo-label">Readonly:</span>
  <pdx-inline-edit readonly type="text" :value="'View only'"></pdx-inline-edit>
</div>
```

**Real-world: Editable Record** — Click any value to edit in-place. _(from the live demo)_

```html
<div class="record-card">
  <div class="record-row">
    <span class="record-label">Name</span>
    <pdx-inline-edit type="text" label="Name" :value="'Alice Johnson'"></pdx-inline-edit>
  </div>
  <div class="record-row">
    <span class="record-label">Role</span>
    <pdx-inline-edit type="select" label="Role" :value="'engineer'" :options="roleOptions"></pdx-inline-edit>
  </div>
  <div class="record-row">
    <span class="record-label">Salary</span>
    <pdx-inline-edit type="currency" label="Salary" :value="85000" currency="EUR"></pdx-inline-edit>
  </div>
  <div class="record-row">
    <span class="record-label">Start date</span>
    <pdx-inline-edit type="date" label="Start date" :value="'2024-03-15'"></pdx-inline-edit>
  </div>
  <div class="record-row">
    <span class="record-label">Active</span>
    <pdx-inline-edit type="boolean" :value="true"></pdx-inline-edit>
  </div>
  <div class="record-row">
    <span class="record-label">Rating</span>
    <pdx-inline-edit type="rating" :value="4"></pdx-inline-edit>
  </div>
</div>
```

