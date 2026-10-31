### `<pdx-tabs>`

Switch between panels.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `orientation` | `orientation` | string | `'horizontal'` | Orientation: horizontal (default) or vertical |
| `bordered` | `bordered` | boolean | `false` | Add border around entire tabs + panels |
| `mount` | `mount` | string | `'eager'` | Mount strategy: eager (all mounted), lazy (mount on first activate), unmount (destroy on deactivate) |
| `activation` | `activation` | string | `'automatic'` | Activation: automatic (activate on focus) or manual (Enter/Space to activate) |
| `label` | `label` | string | `''` | The tablist's accessible name ("Account settings"). |
| `loading` | `loading` | boolean | `false` | Show loading state |
| `variant` | `variant` | 'line' \| 'card' \| 'pills' | `'line'` | line (the default), card (a bordered container) or pills (rounded buttons). |
| `value` | `value` | string | `''` | The current value. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `select(value)` | Activate a tab by its `data-tab` value, not by its position. |
| `next()` | Advances to the next item. |
| `prev()` | Goes to the previous item. |
| `active` _(read-only)_ | Read-only, via a ref: `el.active`. |

**Events:** `pdx-close` → `detail: { value: string }` — A tab's close button removed it and its panel; the value is the removed tab's. Does not bubble.; `value-change` → `detail: { value: string }` — Fired when the component writes `value`. Does not bubble.

**Renders:** roles `tab` · `tablist` · `tabpanel`

**States:** `:state(loading)` — `loading` is set: the active panel is `aria-busy`.; `:state(bordered)` — `bordered` is set: a border around the strip and the panels.; `:state(overflow)` — The tabs do not fit in one row: the strip keeps one row and scrolls.

**Parts:** `[data-part="list"]` — The strip of tabs, the `role="tablist"` element the author wrote (`.pdx-tabs`).; `[data-part="tab"]` — A tab, an element with `data-tab`.; `[data-part="panel"]` — A panel, an element with `data-tab-panel`.; `[data-part="indicator"]` — The bar under the active tab, which slides to it (not with `variant="pills"`).


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Click or use arrow keys to navigate. Animated indicator slides between tabs.

```html
<pdx-tabs value="overview">
  <div class="pdx-tabs" role="tablist">
    <button class="pdx-tab" data-tab="overview">Overview</button>
    <button class="pdx-tab" data-tab="features">Features</button>
    <button class="pdx-tab" data-tab="pricing">Pricing</button>
  </div>
  <div data-tab-panel="overview">Overview content</div>
  <div data-tab-panel="features">Features content</div>
  <div data-tab-panel="pricing">Pricing content</div>
</pdx-tabs>
```

**Bordered** — Add `bordered` prop to any variant for a container border around tabs + panels.

```html
<pdx-tabs value="tab1" bordered>
  <div class="pdx-tabs" role="tablist">
    <button class="pdx-tab" data-tab="tab1">Dashboard</button>
    <button class="pdx-tab" data-tab="tab2">Analytics</button>
  </div>
  <div data-tab-panel="tab1">Dashboard content</div>
  <div data-tab-panel="tab2">Analytics content</div>
</pdx-tabs>
```

**Card Variant** — Bordered container with inset tab bar. For widgets and dashboard panels.

```html
<pdx-tabs value="revenue" variant="card">
  <div class="pdx-tabs" role="tablist">
    <button class="pdx-tab" data-tab="revenue">Revenue</button>
    <button class="pdx-tab" data-tab="customers">Customers</button>
  </div>
  <div data-tab-panel="revenue">$12,450</div>
  <div data-tab-panel="customers">1,234</div>
</pdx-tabs>
```

**Pills Variant** — Segmented/pill style. No underline indicator. Good for filters and view modes.

```html
<pdx-tabs value="all" variant="pills">
  <div class="pdx-tabs" role="tablist">
    <button class="pdx-tab" data-tab="all">All</button>
    <button class="pdx-tab" data-tab="active">Active</button>
    <button class="pdx-tab" data-tab="completed">Completed</button>
  </div>
  <div data-tab-panel="all">All items</div>
  <div data-tab-panel="active">Active items</div>
</pdx-tabs>
```

**With Icons** — Locked — requires admin access.

```html
<pdx-tabs value="profile">
  <div class="pdx-tabs" role="tablist">
    <button class="pdx-tab" data-tab="profile">
      <pdx-icon name="user" size="sm"></pdx-icon>
      <span>Profile</span>
    </button>
    <button class="pdx-tab" data-tab="settings">
      <pdx-icon name="settings" size="sm"></pdx-icon>
      <span>Settings</span>
    </button>
    <button class="pdx-tab" data-tab="security" disabled>
      <pdx-icon name="lock" size="sm"></pdx-icon>
      <span>Security</span>
    </button>
  </div>
  <div data-tab-panel="profile">Profile content</div>
  <div data-tab-panel="settings">Settings content</div>
</pdx-tabs>
```

**Closable Tabs** — Close button appears on hover. Emits `pdx-close` with tab value.

```html
<pdx-tabs value="file1">
  <div class="pdx-tabs" role="tablist">
    <button class="pdx-tab" data-tab="file1">
      index.ts <span data-tab-close role="button" aria-label="Close">&times;</span>
    </button>
    <button class="pdx-tab" data-tab="file2">
      app.pdx <span data-tab-close role="button" aria-label="Close">&times;</span>
    </button>
  </div>
  <div data-tab-panel="file1">File content</div>
  <div data-tab-panel="file2">File content</div>
</pdx-tabs>
```

**Vertical** — Use `orientation="vertical"`. Arrow Up/Down for keyboard nav. Indicator slides vertically.

```html
<pdx-tabs value="general" orientation="vertical">
  <div class="pdx-tabs" role="tablist">
    <button class="pdx-tab" data-tab="general">General</button>
    <button class="pdx-tab" data-tab="appearance">Appearance</button>
  </div>
  <div data-tab-panel="general">General settings</div>
  <div data-tab-panel="appearance">Appearance settings</div>
</pdx-tabs>

<!-- Vertical + Bordered -->
<pdx-tabs value="account" orientation="vertical" bordered>
  <div class="pdx-tabs" role="tablist">
    <button class="pdx-tab" data-tab="account">Account</button>
    <button class="pdx-tab" data-tab="billing">Billing</button>
  </div>
  <div data-tab-panel="account">Account content</div>
  <div data-tab-panel="billing">Billing content</div>
</pdx-tabs>
```

