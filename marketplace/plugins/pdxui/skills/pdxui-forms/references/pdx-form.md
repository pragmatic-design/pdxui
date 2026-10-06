### `<pdx-form>`

Schema-driven form with validation.

**Takes a DataSource:** bind one to `:source`.

**Use it when** you write the form by hand: fields laid out in markup, each `<pdx-form-field name="x">`
holding a control with the same `name`, wired by the compiler. **Not when** the fields come from a schema
or the grid's `FieldDefinition[]` → `pdx-auto-form`; nor to submit several separate forms together — that
is one `<pdx-form name>` each under `createFormCoordinator()` (recipes: *A long form filled in more than one sitting*).

**Pitfalls**
- A named control is wired only in the file that holds `<pdx-form>`, or in a component whose script calls
  `tryUseForm()`. A plain child component's controls stay unbound, silently.
- A section calls `tryUseForm()`, not `useForm()`: a child can set up before its form, and `useForm()` then throws.
- A `<pdx-field-group>` written in the PARENT does not prefix the controls of a section component inside
  it: put the group in the section.
- Inside a group the DOM carries the full path: select `[name="customer.email"]`, not `[name="email"]`.
- With `warnUnsaved`, a save from `@pdx-submit` does not tell the form it succeeded: call `form.reset(saved)`
  before navigating away, or the page asks about work it just saved (recipes: *Do not leave with unsaved work*).
- `:source` + `record-id` does not find a record whose id is a number: pass the id the rows carry.

**Composes with** `pdx-form-field` (error, touched, warning) · `pdx-field-group` (nested `a.b` paths) ·
`pdx-field-list` (repeating rows) · `pdx-form-actions` (the submit bar) · `pdx-wizard` (steps grouped by form).

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `form` | — | object | `null` | The Form instance (from createForm()). Required. |
| `name` | `name` | string | `''` | Optional name for nested form registration with parent coordinator. |
| `autocomplete` | `autocomplete` | string | `'off'` | HTML autocomplete attribute. |
| `scrollToError` | `scrolltoerror` | boolean | `true` | Scroll to first error field on failed validation. |
| `formClass` | `formclass` | string | `''` | CSS class for the inner <form> element. |
| `source` | — | object | `null` | DataSource for auto-load/save. When set, submit saves via DS. |
| `recordId` | `recordid` | string | `''` | Record ID to load from the DataSource. |

**Events:** `pdx-submit` → `detail: { values, saved } | { values }` — Fired when the form is submitted.; `pdx-submit-error` → `detail: { error }` — Fired on `pdx-submit-error`.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**1. Prefill / Update Mode** — Simulates loading existing data (e.g. from API) into a form for editing. Click Load User to prefill, edit, then save.

```js
const prefillForm = createForm({
  initialValues: { name: '', email: '', role: '', department: '', bio: '' },
  validators: { name: [required(...)], email: [required(...), email(...)] },
});

// Load data from API or storage
function loadUser() {
  const data = await fetchUser(42); // or sessionStorage
  prefillForm.reset(data); // fills all fields reactively
}

// Save — form.reset(currentValues) marks new baseline
function savePrefill() {
  await saveUser(prefillForm.getValues());
  prefillForm.reset(prefillForm.getValues());
}
```

**2. Validation i18n** — Switch language to see validation messages change. Uses `setValidationLocale()` with a custom resolver.

```js
const translations = {
  en: { 'validation.required': '{field} is required', ... },
  it: { 'validation.required': '{field} è obbligatorio', ... },
};

function setLang(lang) {
  const dict = translations[lang];
  setValidationLocale((key, params) => {
    const tmpl = dict[key];
    if (!tmpl) return undefined;
    return tmpl.replace(/\{(\w+)\}/g, (_, k) => params?.[k] ?? k);
  });
  form.validate(); // re-run to refresh messages
}

// Validators use i18n keys as messages:
validators: { email: [required('validation.required')] }
```

**3. Tab / Wizard Form** — Multi-step form with per-section validation. Must complete each step before advancing.

```js
let wizardStep = $signal(0);
const wizardForm = createForm({
  initialValues: { username: '', password: '', fullName: '', avatar: '' },
  validators: {
    username: [required(...), minLength(3, ...)],
    password: [required(...), minLength(6, ...)],
    fullName: [required(...)],
  },
});

// Validate current step fields before advancing
const stepFields = [['username', 'password'], ['fullName', 'avatar'], []];
function nextStep() {
  const fields = stepFields[wizardStep];
  let valid = true;
  for (const f of fields) {
    wizardForm.fields[f]?.onBlur();
    if (wizardForm.fields[f]?.error()) valid = false;
  }
  if (valid) wizardStep++;
}

// Template: :style="stepNStyle()" to show/hide panels
```

**4. Field Arrays (Dynamic Rows)** — Add/remove line items dynamically. Realistic scenario: invoice with products. Uses `createFieldArray()` with stable keyed items.

```js
const lineItems = createFieldArray([
  { product: 'Widget Pro', qty: 2, price: 49.99 },
]);

function addLineItem() {
  lineItems.append({ product: '', qty: 1, price: 0 });
}
function removeLineItem(idx) {
  lineItems.remove(idx);
}

// Reactive total
function total() {
  return lineItems.items().reduce(
    (sum, it) => sum + it.value.qty * it.value.price, 0
  );
}

// API: append, prepend, insert, remove, move, swap
// Each item has stable .__id for keyed rendering
```

**5. Async Validation** — Username availability check with debounce. Simulates an API call (500ms delay).

```js
const form = createForm({
  initialValues: { username: '', email: '' },
  validators: {
    username: [required(...), minLength(3, ...)],
    email: [required(...), email(...)],
  },
  asyncValidators: {
    username: async (val) => {
      await fetch('/api/check-username?q=' + val);
      // Returns error string or undefined
      if (taken) return '"' + val + '" is already taken';
    },
  },
  asyncDebounceMs: 500, // debounce async calls
  validateOn: 'onBlur',
});
```

**6. Cross-Field Validation** — Password confirmation and date range validation — fields that depend on each other.

```js
const form = createForm({
  initialValues: { password: '', confirmPassword: '', startDate: '', endDate: '' },
  validators: {
    password: [required(...), minLength(6, ...)],
    // Cross-field: reads another field's value
    confirmPassword: [required(...), (val) => {
      const pw = form.fields.password?.value();
      return val !== pw ? 'Passwords do not match' : undefined;
    }],
    endDate: [required(...), (val) => {
      const start = form.fields.startDate?.value();
      if (start && val && val <= start)
        return 'End date must be after start date';
    }],
  },
});
```

**7. Nested Forms (Coordinator)** — Parent form with child sub-forms. `FormCoordinator` validates and submits all together.

```js
const coordinator = createFormCoordinator();

const customerForm = createForm({
  initialValues: { name: '', email: '' },
  validators: { name: [required(...)], email: [required(...)] },
});
const shippingForm = createForm({
  initialValues: { address: '', city: '', zip: '' },
  validators: { address: [required(...)], city: [required(...)], zip: [required(...)] },
});

coordinator.register('customer', customerForm);
coordinator.register('shipping', shippingForm);

// Validate + submit all at once
async function submitOrder() {
  const valid = await coordinator.validateAll();
  if (!valid) return;
  const values = coordinator.getValues();
  // values = { customer: {...}, shipping: {...} }
}
```

**1. Order Edit (JSON Schema with Nested DTO)** — 100% generated from JSON. Nested objects (`type: 'group'`), arrays (`type: 'list'`), sections, custom validators (`type: 'custom'`), field descriptions — all declarative. Click Submit to see validation on Customer name/email and the custom "ORD-" check.

```js
const orderSchema = {
  fields: [
    // Custom validator: must start with ORD-
    { name: 'orderNumber', type: 'text', label: 'Order #', required: true, size: 4, section: 'order',
      validators: [{ type: 'custom', validate: v => !String(v).startsWith('ORD-') ? 'Must start with ORD-' : undefined }] },
    { name: 'date', type: 'text', label: 'Date', size: 4, section: 'order', default: '2026-04-07' },
    { name: 'status', type: 'select', label: 'Status', size: 4, section: 'order',
      options: ['Draft', 'Confirmed', 'Shipped', 'Delivered'] },
    // Nested object → type: 'group'
    { name: 'customer', type: 'group', label: 'Customer', section: 'customer', fields: [
      { name: 'name', type: 'text', label: 'Name', required: true, size: 6 },
      { name: 'email', type: 'email', label: 'Email', required: true, size: 6, validators: [{ type: 'email' }] },
      { name: 'phone', type: 'tel', label: 'Phone', size: 6, description: 'Include country code' },
      { name: 'company', type: 'text', label: 'Company', size: 6 },
    ]},
    // Array of objects → type: 'list'
    { name: 'items', type: 'list', label: 'Line Items', section: 'items',
      itemFields: [
        { name: 'product', type: 'text', label: 'Product' },
        { name: 'qty', type: 'number', label: 'Qty' },
        { name: 'price', type: 'number', label: 'Unit Price' },
      ],
      itemDefault: { product: '', qty: 1, price: 0 },
      default: [
        { product: 'Widget Pro', qty: 2, price: 29.99 },
        { product: 'Gadget X', qty: 1, price: 49.99 },
      ],
    },
    // Another nested object
    { name: 'shipping', type: 'group', label: 'Shipping Address', section: 'shipping', fields: [
      { name: 'street', type: 'text', label: 'Street', size: 12 },
      { name: 'city', type: 'text', label: 'City', size: 4 },
      { name: 'state', type: 'text', label: 'State', size: 4 },
      { name: 'zip', type: 'text', label: 'ZIP', size: 4 },
    ]},
    { name: 'notes', type: 'textarea', label: 'Order Notes', section: 'shipping', hint: 'Special instructions' },
  ],
  sections: [
    { name: 'order', label: 'Order Details' },
    { name: 'customer', label: 'Customer' },
    { name: 'items', label: 'Line Items' },
    { name: 'shipping', label: 'Shipping', collapsible: true },
  ],
  layout: 'grid',
  columns: 12,
};
```

**2. Declarative Composition (Template)** — Same nested DTO, but composed declaratively in the template with `<pdx-field-group>` and compiler auto-binding. The compiler resolves `name="email"` inside `<pdx-field-group name="customer">` to `form.fields['customer.email']`.

```html
<pdx-form :form="orderForm">
  <pdx-form-field name="orderNumber" label="Order #" required>
    <pdx-input name="orderNumber" />
  </pdx-form-field>

  <pdx-field-group name="customer" label="Customer">
    <pdx-form-field name="name" label="Name" required>
      <pdx-input name="name" />
    </pdx-form-field>
    <!-- compiler resolves to form.fields['customer.name'] -->
  </pdx-field-group>

  <pdx-field-group name="shipping" label="Shipping">
    <pdx-form-field name="street" label="Street">...</pdx-form-field>
    <pdx-form-field name="city" label="City">...</pdx-form-field>
  </pdx-field-group>
</pdx-form>
```

```js
// createForm accepts nested initialValues:
const orderForm = createForm({
  initialValues: {
    orderNumber: 'ORD-042',
    customer: { name: 'Jane', email: 'jane@test.com' },
    shipping: { street: '', city: '', zip: '' },
  },
  validators: {
    'customer.name': [required()],  // dotted path validators
    'customer.email': [required(), email()],
  },
});
```

**3. Wizard Layout** — `layout: 'wizard'` turns sections into steps with automatic navigation. Each step validates before advancing. Click a completed step to go back. _(from the live demo)_

```html
<div class="demo-block">
  <pdx-form-template :schema="wizardSchema"></pdx-form-template>
</div>
```

**4. Display Modes** — Field groups and lists support `display="panel"` (collapsible) and `display="dialog"` (edit in modal). Below: panel groups with collapsible sections. _(from the live demo)_

```html
<div class="demo-block">
  <pdx-form :form="displayForm">
    <pdx-form-field name="name" label="Full Name" required>
      <pdx-input name="name"></pdx-input>
    </pdx-form-field>
    <pdx-field-group name="address" label="Address" display="panel">
      <div class="form-grid-3">
        <pdx-form-field name="street" label="Street">
          <pdx-input name="street"></pdx-input>
        </pdx-form-field>
        <pdx-form-field name="city" label="City">
          <pdx-input name="city"></pdx-input>
        </pdx-form-field>
        <pdx-form-field name="zip" label="ZIP">
          <pdx-input name="zip"></pdx-input>
        </pdx-form-field>
      </div>
    </pdx-field-group>
    <pdx-field-group name="billing" label="Billing Info" display="panel" collapsed>
      <div class="form-grid">
        <pdx-form-field name="card" label="Card Number">
          <pdx-input name="card" placeholder="**** **** **** ****"></pdx-input>
        </pdx-form-field>
        <pdx-form-field name="expiry" label="Expiry">
          <pdx-input name="expiry" placeholder="MM/YY"></pdx-input>
        </pdx-form-field>
      </div>
    </pdx-field-group>
  </pdx-form>
</div>
```

**1. Basic Form (Compiler Auto-Binding)** — Just add `name="field"` to controls inside `<pdx-form>`. The compiler generates value binding, onChange, and onBlur automatically.

```js
@form basicForm: {
  name: string { required },
  email: string { required, email },
  bio?: string,
  notifications: boolean
}

// Validates, moves `state` through submitting → success, and rebases the form.
const saveBasic = basicForm.handleSubmit(async (values) => { await api.saveProfile(values); });
```

```html
<pdx-form :form="basicForm" @pdx-submit="saveBasic">
  <pdx-form-field name="name" label="Full Name" required>
    <pdx-input name="name"></pdx-input>
  </pdx-form-field>
  <!-- compiler generates :value, @pdx-change, @pdx-blur -->
</pdx-form>
```

**2. Nested DTO (Field Groups)** — `<pdx-field-group name="customer">` scopes child fields to a nested object. Field `name="email"` inside the group becomes `form.fields['customer.email']`.

```js
@form nestedForm: {
  orderNumber: string { required },
  customer: {
    name: string { required },
    email: string { required, email }
  },
  shipping: {
    street?: string,
    city?: string,
    zip?: string
  }
}
```

```html
<pdx-form :form="nestedForm">
  <pdx-form-field name="orderNumber" label="Order Number" required>
    <pdx-input name="orderNumber" />
  </pdx-form-field>

  <pdx-field-group name="customer" label="Customer">
    <pdx-form-field name="name" label="Name" required>
      <pdx-input name="name" />
    </pdx-form-field>
    <!-- compiler resolves to form.fields['customer.name'] -->
  </pdx-field-group>

  <pdx-field-group name="shipping" label="Shipping">
    ...
  </pdx-field-group>
</pdx-form>
```

**3. Validation Modes** — `validateOn` controls when validation runs: `onBlur` (default), `onChange`, or `onSubmit`.

```js
const blurForm = createForm({
  initialValues: { email: '' },
  validators: { email: [required('...'), email('...')] },
  validateOn: 'onBlur',  // default — validates after field loses focus
});

const changeForm = createForm({ ..., validateOn: 'onChange' }); // validates on every keystroke
const submitForm = createForm({ ..., validateOn: 'onSubmit' }); // validates only on form submit
```

**4. Warning Rules (Non-Blocking)** — Warnings are yellow hints that don't block submission. Useful for "are you sure?" patterns.

```js
const form = createForm({
  initialValues: { price: 0 },
  validators: { price: [required('...'), min(1, '...')] },
  warnings: {
    price: [(v) => v > 1000 ? 'Price seems high' : undefined],
  },
});
// Warnings are non-blocking: form.valid() stays true even with warnings
```

**5. Programmatic Form (Code API)** — Create forms entirely in code with `createForm()`. Full control over fields, validation, and save behavior.

```js
import { createForm, required, email, minLength } from '@pdxui/core';

const form = createForm({
  initialValues: { username: '', age: 0, role: '', agree: false },
  validators: {
    username: [required('Username is required'), minLength(3, 'Min 3 chars')],
  },
  validateOn: 'onBlur',
});
```

**6. DataSource Integration (SessionStorage)** — Form bound to a DataSource that persists to `sessionStorage`. Changes are saved on submit and survive page refresh.

```js
const dsForm = createForm({
  initialValues: loadFromStorage(), // load from sessionStorage
  validators: { companyName: [required('...')] },
});
```

```html
<pdx-form :form="dsForm" @pdx-submit="saveDsForm">
  <pdx-form-field name="companyName" label="Company Name" required>
    <pdx-input name="companyName"></pdx-input>
  </pdx-form-field>
  <pdx-form-actions submitLabel="Save to Storage" />
</pdx-form>
```

**7. Form Template (JSON Schema)** — `<pdx-form-template>` generates an entire form from a JSON schema. Fields, types, validation, layout — all declarative. _(from the live demo)_

```html
<div class="demo-block">
  <pdx-form-template :schema="contactSchema"></pdx-form-template>
</div>
<details class="source-block">
  <summary>Schema (JSON)</summary>
  <pre class="pdx-txt-mono"><code :textContent="schemaJsonText()"></code></pre>
</details>
```

**8. All Control Types in Form** — Every pdx-* control works with compiler auto-binding inside a form.

```html
<pdx-form :form="allTypesForm">
  <pdx-form-field name="text" label="Text Input">
    <pdx-input name="text"></pdx-input>
  </pdx-form-field>
  <pdx-form-field name="slider" label="Slider">
    <pdx-slider name="slider" :min="0" :max="100"></pdx-slider>
  </pdx-form-field>
  <!-- Every pdx-* control with name="x" is auto-wired by the compiler -->
  <pdx-form-actions submitLabel="Submit All" />
</pdx-form>
```

