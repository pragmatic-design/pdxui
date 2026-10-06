### `<pdx-checkbox-group>`

A managed set of checkboxes.

**The children are `<pdx-checkbox value="…">`.** The group reads each child's `value`, keeps `value`
as the comma-separated list of the checked ones, and emits one `pdx-change` per click with
`detail: { value: 'a,c', values: ['a', 'c'] }`. A child with no `value` falls back to its `label`;
with neither, the group cannot report it and warns once.

```html
<pdx-checkbox-group :value="signs" @pdx-change="e => signs = e.detail.value">
  <pdx-checkbox value="fever">Febbre</pdx-checkbox>
  <pdx-checkbox value="cough">Tosse</pdx-checkbox>
</pdx-checkbox-group>
```

Listen on the group, not on the children: the children's own `pdx-change` stops at the group, and
the group's `value` always matches what is checked. Classes you put on the group are kept.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | string | `''` | Comma-separated selected values |
| `orientation` | `orientation` | string | `'vertical'` | Layout orientation — horizontal or vertical. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `label` | `label` | string | `''` | Accessible name of the group. Without it, a <pdx-label> right before the group names it. |

**Events:** `pdx-change` → `detail: { value, values }` — Fired when the value changes.

**Renders:** roles `group`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic Group** — Value is comma-separated. A `<pdx-label>` right before the group names it; or give the group a `label`.

```html
<pdx-label text="Interests"></pdx-label>
<pdx-checkbox-group value="code,design"
  @pdx-change="e => interests = e.detail.values.join(', ')">
  <pdx-checkbox label="Coding" value="code"></pdx-checkbox>
  <pdx-checkbox label="Design" value="design"></pdx-checkbox>
</pdx-checkbox-group>
```

```js
// one pdx-change per click: { value: "code,design", values: ["code", "design"] }
```

**Horizontal Orientation** — Use `orientation="horizontal"` for an inline layout. _(from the live demo)_

```html
<div class="demo-stack">
  <div class="pdx-field">
    <pdx-label text="Toppings"></pdx-label>
    <pdx-checkbox-group orientation="horizontal" value="cheese">
      <pdx-checkbox label="Cheese" value="cheese"></pdx-checkbox>
      <pdx-checkbox label="Pepperoni" value="pepperoni"></pdx-checkbox>
      <pdx-checkbox label="Mushrooms" value="mushrooms"></pdx-checkbox>
      <pdx-checkbox label="Olives" value="olives"></pdx-checkbox>
    </pdx-checkbox-group>
  </div>
</div>
```

**Size, Disabled and Error** — Set on the group; every child follows. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-checkbox-group label="Small" size="sm" value="a">
    <pdx-checkbox label="Small A" value="a"></pdx-checkbox>
    <pdx-checkbox label="Small B" value="b"></pdx-checkbox>
  </pdx-checkbox-group>
  <pdx-checkbox-group label="Disabled" disabled value="a">
    <pdx-checkbox label="Disabled A" value="a"></pdx-checkbox>
    <pdx-checkbox label="Disabled B" value="b"></pdx-checkbox>
  </pdx-checkbox-group>
  <div class="pdx-field">
    <pdx-label text="Terms" required></pdx-label>
    <pdx-checkbox-group error>
      <pdx-checkbox label="I accept the terms" value="terms"></pdx-checkbox>
      <pdx-checkbox label="I accept the privacy policy" value="privacy"></pdx-checkbox>
    </pdx-checkbox-group>
    <span class="pdx-field-error">Accept both to continue</span>
  </div>
</div>
```

**Composition** — A notification settings card. _(from the live demo)_

```html
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Notifications</h3>
  <div class="comp-form-single">
    <div class="pdx-field">
      <pdx-label text="Channels" size="sm"></pdx-label>
      <pdx-checkbox-group size="sm" value="email,push">
        <pdx-checkbox label="Email" value="email" description="Daily digest"></pdx-checkbox>
        <pdx-checkbox label="Push" value="push" description="Real-time alerts"></pdx-checkbox>
        <pdx-checkbox label="SMS" value="sms" description="Urgent only"></pdx-checkbox>
      </pdx-checkbox-group>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:var(--pdx-space-sm)">
      <pdx-button variant="ghost" size="sm">Cancel</pdx-button>
      <pdx-button variant="solid" size="sm">Save</pdx-button>
    </div>
  </div>
</div>
```

