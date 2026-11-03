### `<pdx-field-group>`

Group related fields together.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `name` | `name` | string | `''` | Group name — maps to a nested object key in the form data. |
| `label` | `label` | string | `''` | Optional label rendered as a fieldset legend. |
| `display` | `display` | string | `'inline'` | Display mode: inline (default), dialog, panel. A mode renders its own markup, each with its fixed class, so it is no variant axis; what changes within one, collapsed, is a state. |
| `collapsed` | `collapsed` | boolean | `false` | Whether a panel is collapsed (display="panel" only). |

**Events:** `collapsed-change` → `detail: { value: boolean }` — Fired when the component writes `collapsed`. Does not bubble.

**Renders:** roles `group`

**States:** `:state(collapsed)` — `collapsed`: a panel shows its legend line only.

**Parts:** `[data-part="root"]` — The `<fieldset>`, or the dialog mode's wrapper.; `[data-part="legend"]` — The `<legend>`, with `label` or in panel mode.; `[data-part="toggle"]` — The panel's disclosure button, in its legend.; `[data-part="content"]` — The box that holds the fields, inline and in panel mode.; `[data-part="trigger"]` — The dialog mode's button that opens the dialog.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**A nested object** — The form validates `onChange`: clear the customer's email, or type a wrong one, and the error appears under the field as you type — on the nested path `customer.email`.

```html
<pdx-form :form="orderForm" @pdx-submit="submitOrder">
  <pdx-form-field :field="orderForm.reference" label="Order reference" required>
    <pdx-input name="reference" ::value="orderForm.reference"></pdx-input>
  </pdx-form-field>
  <pdx-field-group name="customer" label="Customer">
    <pdx-form-field :field="orderForm['customer.name']" label="Name" required>
      <pdx-input name="customer.name" ::value="orderForm['customer.name']"></pdx-input>
    </pdx-form-field>
    <pdx-form-field :field="orderForm['customer.email']" label="Email" required>
      <pdx-input name="customer.email" ::value="orderForm['customer.email']" type="email"></pdx-input>
    </pdx-form-field>
  </pdx-field-group>
  <pdx-form-actions submitLabel="Place order"></pdx-form-actions>
</pdx-form>
```

```js
const orderForm = createForm({
  initialValues: { reference: 'ORD-1042', customer: { name: 'Ada Lovelace', email: 'ada@example.com' } },
  validators: {
    reference: [required()],
    'customer.name': [required()],
    'customer.email': [required(), email()],
  },
  validateOn: 'onChange',
});
```

**Groups inside groups** — A group inside a group adds its name to the path: `city` inside `address` inside `customer` is `customer.address.city`. _(from the live demo)_

```html
<div class="demo-split">
  <pdx-form :form="nestedForm">
    <pdx-field-group name="customer" label="Customer">
      <div class="form-stack">
        <pdx-form-field :field="nestedForm['customer.name']" label="Name">
          <pdx-input name="customer.name" ::value="nestedForm['customer.name']"></pdx-input>
        </pdx-form-field>
        <pdx-field-group name="address" label="Address">
          <div class="form-grid-2">
            <pdx-form-field :field="nestedForm['customer.address.street']" label="Street">
              <pdx-input name="customer.address.street" ::value="nestedForm['customer.address.street']"></pdx-input>
            </pdx-form-field>
            <pdx-form-field :field="nestedForm['customer.address.city']" label="City">
              <pdx-input name="customer.address.city" ::value="nestedForm['customer.address.city']"></pdx-input>
            </pdx-form-field>
          </div>
        </pdx-field-group>
      </div>
    </pdx-field-group>
  </pdx-form>
  <div class="values">
    <span class="pdx-txt-small pdx-weight-semibold">getValues()</span>
    <pre class="pdx-txt-mono values-json">{{ valuesJson(nestedForm) }}</pre>
  </div>
</div>
```

**Display modes** — `display="inline"` (default) is a fieldset with its legend. `panel` folds away on a click on its legend — `collapsed` starts it closed. `dialog` shows a button that opens the fields in a dialog. The fields stay in the form whichever way they are shown.

```html
<pdx-field-group name="contact" label="Contact" display="panel">…</pdx-field-group>
<pdx-field-group name="billing" label="Billing" display="panel" collapsed>…</pdx-field-group>
<pdx-field-group name="emergency" label="Emergency contact" display="dialog">…</pdx-field-group>
```

