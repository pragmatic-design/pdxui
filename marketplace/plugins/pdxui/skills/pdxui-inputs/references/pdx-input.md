### `<pdx-input>`

Text field with sizes, states and addons.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `type` | `type` | 'text' \| 'email' \| 'password' \| 'number' \| 'tel' \| 'url' \| 'search' \| 'date' \| 'time' | `'text'` | Native input type (text, email, password, …). |
| `value` | `value` | string | `''` | The current value. |
| `placeholder` | `placeholder` | string | `''` | Placeholder text shown while empty. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `readonly` | `readonly` | boolean | `false` | Makes the value read-only — visible but not editable. |
| `required` | `required` | boolean | `false` | Marks the field as required. |
| `size` | `size` | 'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl' | `''` | xs, sm, md (the default), lg or xl — the same scale as pdx-button. |
| `error` | `error` | boolean | `false` | Marks the control as invalid. |
| `success` | `success` | boolean | `false` | Applies the success state styling. |
| `warning` | `warning` | boolean | `false` | Applies the warning state styling. |
| `clearable` | `clearable` | boolean | `false` | Shows a clear button to reset the value. |
| `loading` | `loading` | boolean | `false` | Shows a loading / busy state. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `maxlength` | `maxlength` | number | `0` | Maximum number of characters allowed. |
| `showCount` | `showcount` | boolean | `false` | Shows a live character counter. |
| `autofocus` | `autofocus` | boolean | `false` | Focuses the input on mount. |
| `autocomplete` | `autocomplete` | string | `''` | Native autocomplete hint for the browser. |
| `inputmode` | `inputmode` | string | `''` | Virtual-keyboard hint (numeric, email, …). |
| `ariaLabel` | `arialabel` | string | `''` | Accessible name when there is no visible label. |
| `prefix` | `prefix` | string | `''` | Prefix text (e.g. "$", "https://"). For icons use slot. |
| `suffix` | `suffix` | string | `''` | Suffix text (e.g. "kg", ".com"). For icons use slot. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `clear()` | Clears the value. |
| `selectText()` | Select the whole text, so the next keystroke replaces it. Does not focus first. |

**Events:** `pdx-blur` — Fired when it loses focus.; `pdx-change` → `detail: { value }` — Fired when the value changes.; `pdx-clear` — Fired when the value is cleared.; `pdx-focus` — Fired when it receives focus.; `pdx-input` → `detail: { value }` — Fired on each input as the user types.

**Renders:** roles `status`

**Slot:** `prefix` — Content inside the input's frame, before the text (an icon, a unit, a currency sign).; `suffix` — Content inside the input's frame, after the text.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic Input** — Wrapper pattern: border on wrapper, input inside inherits font/color. Click anywhere in wrapper to focus.

```html
<pdx-input placeholder="Enter username..." />
<pdx-input type="email" placeholder="you@example.com" inputmode="email" />
```

**Prefix & Suffix** — Text prefix/suffix via props. Icon prefix/suffix via named slots. Both render inside the border.

```html
<pdx-input prefix="$" placeholder="0.00" inputmode="decimal" />
<pdx-input suffix="kg" placeholder="Weight" />
<pdx-input prefix="https://" suffix=".com" placeholder="domain" />
```

**Clearable** — Clear button appears on hover/focus (desktop) or always (mobile/touch). Fires `pdx-clear` event. Type something to see the button. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-input clearable placeholder="Type and hover to clear..."></pdx-input>
  <pdx-input clearable value="Pre-filled value"></pdx-input>
</div>
```

**Sizes** — 5 sizes matching button sizes for perfect alignment in input groups. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-input size="xs" placeholder="Extra Small (xs)"></pdx-input>
  <pdx-input size="sm" placeholder="Small (sm)"></pdx-input>
  <pdx-input placeholder="Default (md)"></pdx-input>
  <pdx-input size="lg" placeholder="Large (lg)"></pdx-input>
  <pdx-input size="xl" placeholder="Extra Large (xl)"></pdx-input>
</div>
<h3 class="pdx-txt-subheading" style="margin-top:var(--pdx-space-lg)">Size + Button alignment</h3>
<div class="demo-row">
  <pdx-input size="xs" placeholder="Search..." style="flex:1"></pdx-input>
  <pdx-button variant="solid" size="xs">Go</pdx-button>
</div>
<div class="demo-row" style="margin-top:var(--pdx-space-sm)">
  <pdx-input size="sm" placeholder="Search..." style="flex:1"></pdx-input>
  <pdx-button variant="solid" size="sm">Go</pdx-button>
</div>
<div class="demo-row" style="margin-top:var(--pdx-space-sm)">
  <pdx-input placeholder="Search..." style="flex:1"></pdx-input>
  <pdx-button variant="solid">Go</pdx-button>
</div>
<div class="demo-row" style="margin-top:var(--pdx-space-sm)">
  <pdx-input size="lg" placeholder="Search..." style="flex:1"></pdx-input>
  <pdx-button variant="solid" size="lg">Go</pdx-button>
</div>
<div class="demo-row" style="margin-top:var(--pdx-space-sm)">
  <pdx-input size="xl" placeholder="Search..." style="flex:1"></pdx-input>
  <pdx-button variant="solid" size="xl">Go</pdx-button>
</div>
```

**Validation States** — Error, success, warning — colored border + focus ring. Disabled and readonly. _(from the live demo)_

```html
<div class="demo-stack">
  <div class="pdx-field">
    <pdx-label text="Error state" required></pdx-label>
    <pdx-input error placeholder="Invalid input" value="bad@"></pdx-input>
    <span class="pdx-field-error">Please enter a valid email address</span>
  </div>
  <div class="pdx-field">
    <pdx-label text="Success state"></pdx-label>
    <pdx-input success value="john@example.com"></pdx-input>
    <span class="pdx-field-success">Email is available</span>
  </div>
  <div class="pdx-field">
    <pdx-label text="Warning state"></pdx-label>
    <pdx-input warning value="admin"></pdx-input>
    <span class="pdx-field-hint" style="color:var(--pdx-color-warning)">This username is commonly used</span>
  </div>
  <div class="pdx-field">
    <pdx-label text="Disabled" disabled></pdx-label>
    <pdx-input disabled value="Can't edit this"></pdx-input>
  </div>
  <div class="pdx-field">
    <pdx-label text="Readonly"></pdx-label>
    <pdx-input readonly value="Read-only value — selectable but not editable"></pdx-input>
  </div>
</div>
```

**Loading State** — Spinner in suffix position while validating or fetching. Input remains interactive. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-input loading placeholder="Checking availability..." value="john_doe"></pdx-input>
  <pdx-input loading clearable prefix="@" placeholder="username"></pdx-input>
</div>
```

**Character Count** — `showCount` with optional `maxlength`. Counter turns red when over limit. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-input showCount maxlength="50" placeholder="Max 50 characters..."></pdx-input>
  <pdx-input showCount placeholder="No limit — just counting..."></pdx-input>
</div>
```

**Input Types & Mobile Keyboards** — `type` and `inputmode` control native keyboard on mobile. Use `inputmode` for fine control (e.g. `decimal` shows dot key on iOS). _(from the live demo)_

```html
<div class="demo-fields">
  <div class="pdx-field">
    <pdx-label text="Email" size="sm"></pdx-label>
    <pdx-input type="email" inputmode="email" placeholder="name@example.com"></pdx-input>
  </div>
  <div class="pdx-field">
    <pdx-label text="Phone" size="sm"></pdx-label>
    <pdx-input type="tel" inputmode="tel" placeholder="+1 (555) 000-0000"></pdx-input>
  </div>
  <div class="pdx-field">
    <pdx-label text="URL" size="sm"></pdx-label>
    <pdx-input type="url" inputmode="url" placeholder="https://example.com"></pdx-input>
  </div>
  <div class="pdx-field">
    <pdx-label text="Number (decimal)" size="sm"></pdx-label>
    <pdx-input inputmode="decimal" placeholder="0.00"></pdx-input>
  </div>
</div>
```

**Composition** — Inputs in a realistic form context. _(from the live demo)_

```html
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Contact Form</h3>
  <div class="comp-form">
    <div class="pdx-field">
      <pdx-label text="First Name" required size="sm"></pdx-label>
      <pdx-input size="sm" placeholder="Jane"></pdx-input>
    </div>
    <div class="pdx-field">
      <pdx-label text="Last Name" required size="sm"></pdx-label>
      <pdx-input size="sm" placeholder="Doe"></pdx-input>
    </div>
    <div class="pdx-field full-width">
      <pdx-label text="Email" required size="sm" description="We'll send a confirmation"></pdx-label>
      <pdx-input size="sm" type="email" inputmode="email" placeholder="jane@example.com" clearable></pdx-input>
    </div>
    <div class="pdx-field full-width">
      <pdx-label text="Website" optional size="sm"></pdx-label>
      <pdx-input size="sm" prefix="https://" placeholder="example.com" clearable></pdx-input>
    </div>
    <div class="pdx-field full-width">
      <pdx-label text="Message" required size="sm" hint="Minimum 20 characters"></pdx-label>
      <pdx-input size="sm" placeholder="How can we help?"></pdx-input>
    </div>
  </div>
</div>
```

**Input + Button Composition** — Combining `<pdx-input>` with `<pdx-button>` at matching sizes. _(from the live demo)_

```html
<div class="demo-stack">
  <div class="demo-row">
    <pdx-input size="sm" prefix="$" placeholder="Amount" clearable style="flex:1"></pdx-input>
    <pdx-button variant="solid" size="sm">Pay Now</pdx-button>
  </div>
  <div class="demo-row">
    <pdx-input placeholder="Search products..." clearable style="flex:1"></pdx-input>
    <pdx-button variant="outline" size="md">Search</pdx-button>
  </div>
  <div class="demo-row">
    <pdx-input size="lg" placeholder="Enter coupon code" suffix="%" style="flex:1"></pdx-input>
    <pdx-button variant="solid" size="lg">Apply</pdx-button>
  </div>
</div>
```

