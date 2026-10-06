### `<pdx-input-group>`

Inputs joined with addons and buttons.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic Input + Button** — Input and button joined seamlessly. Borders overlap, radius only on ends.

```html
<pdx-input-group>
  <pdx-input placeholder="Search..."></pdx-input>
  <pdx-button variant="solid">Search</pdx-button>
</pdx-input-group>
```

**With Addons** — Static text addons using `.pdx-input-addon`. Addons are non-interactive labels (domain prefix, currency, etc.).

```html
<pdx-input-group>
  <span class="pdx-input-addon">https://</span>
  <pdx-input placeholder="your-domain"></pdx-input>
  <span class="pdx-input-addon">.com</span>
</pdx-input-group>
```

**Size Propagation** — Set `size` on the group — it propagates to all children. Input and button heights match perfectly. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-input-group size="xs">
    <pdx-input placeholder="Extra Small group"></pdx-input>
    <pdx-button variant="solid">Go</pdx-button>
  </pdx-input-group>
  <pdx-input-group size="sm">
    <pdx-input placeholder="Small group"></pdx-input>
    <pdx-button variant="solid">Go</pdx-button>
  </pdx-input-group>
  <pdx-input-group>
    <pdx-input placeholder="Default group"></pdx-input>
    <pdx-button variant="solid">Go</pdx-button>
  </pdx-input-group>
  <pdx-input-group size="lg">
    <pdx-input placeholder="Large group"></pdx-input>
    <pdx-button variant="solid">Go</pdx-button>
  </pdx-input-group>
  <pdx-input-group size="xl">
    <pdx-input placeholder="Extra Large group"></pdx-input>
    <pdx-button variant="solid">Go</pdx-button>
  </pdx-input-group>
</div>
```

**Multiple Buttons** — Input with multiple action buttons. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-input-group>
    <pdx-input placeholder="File path..." clearable></pdx-input>
    <pdx-button variant="outline">Browse</pdx-button>
    <pdx-button variant="solid">Upload</pdx-button>
  </pdx-input-group>
  <pdx-input-group size="sm">
    <span class="pdx-input-addon">Filter:</span>
    <pdx-input placeholder="Search items..."></pdx-input>
    <pdx-button variant="outline">Clear</pdx-button>
    <pdx-button variant="solid">Apply</pdx-button>
  </pdx-input-group>
</div>
```

**Disabled Group** — Set `disabled` on the group — propagates to all children. _(from the live demo)_

```html
<div class="demo-stack">
  <pdx-input-group disabled>
    <pdx-input placeholder="Disabled group" value="Can't edit"></pdx-input>
    <pdx-button variant="solid">Go</pdx-button>
  </pdx-input-group>
</div>
```

**Composition** — Input groups in realistic form contexts. _(from the live demo)_

```html
<div class="comp-card">
  <h3 class="pdx-txt-subheading">URL Builder</h3>
  <div class="pdx-field">
    <pdx-label text="Website URL" required size="sm"></pdx-label>
    <pdx-input-group size="sm">
      <span class="pdx-input-addon">https://</span>
      <pdx-input placeholder="example"></pdx-input>
      <span class="pdx-input-addon">.com</span>
      <pdx-button variant="outline">Verify</pdx-button>
    </pdx-input-group>
  </div>
</div>
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Coupon Code</h3>
  <div class="pdx-field">
    <pdx-label text="Discount Code" optional size="sm"></pdx-label>
    <pdx-input-group size="sm">
      <pdx-input placeholder="Enter code..." clearable></pdx-input>
      <pdx-button variant="solid">Apply</pdx-button>
    </pdx-input-group>
    <span class="pdx-field-hint">Enter a valid coupon code for a discount</span>
  </div>
</div>
```

