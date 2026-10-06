### `<pdx-badge>`

A small count or status dot on anything.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | string | `''` | The current value. |
| `variant` | `variant` | string | `'primary'` | Visual variant. |
| `max` | `max` | number | `99` | Maximum allowed value. |
| `dot` | `dot` | boolean | `false` | Renders a small dot instead of a count. |
| `pulse` | `pulse` | boolean | `false` | Adds a pulsing animation. |
| `hideZero` | `hidezero` | boolean | `true` | Hides the badge when the value is 0. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |
| `shape` | `shape` | string | `'pill'` | Shape: 'pill' (default, full radius) or 'square' (rounded rectangle). |
| `label` | `label` | string | `''` | What the badge means, read instead of its colour or its bare number: "Online", "3 unread messages". A dot without it is read as its variant ("success indicator"). |

**Renders:** roles `status`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Filled Variants** — 6 semantic color variants. Default style = filled background with contrasting text.

```html
<pdx-badge variant="primary" value="New"></pdx-badge>
<pdx-badge variant="danger" value="Error"></pdx-badge>
<pdx-badge variant="success" value="Active"></pdx-badge>
```

**Outline Variants** — Bordered, transparent background. Use `variant="outline-primary"` etc. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-badge variant="outline" value="Default"></pdx-badge>
  <pdx-badge variant="outline-primary" value="Primary"></pdx-badge>
  <pdx-badge variant="outline-success" value="Active"></pdx-badge>
  <pdx-badge variant="outline-danger" value="Critical"></pdx-badge>
  <pdx-badge variant="outline-warning" value="Warning"></pdx-badge>
</div>
```

**Count Badge** — Numeric `value` with `max` overflow (default 99+). `hideZero` hides at 0.

```html
<pdx-badge variant="danger" value="150"></pdx-badge>       <!-- shows 99+ -->
<pdx-badge variant="danger" value="150" max="999"></pdx-badge>  <!-- shows 150 -->
<pdx-badge variant="primary" value="0"></pdx-badge>        <!-- hidden (hideZero) -->
```

**Sizes** — 3 sizes: sm, default, lg. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-badge variant="primary" value="sm" size="sm"></pdx-badge>
  <pdx-badge variant="primary" value="default"></pdx-badge>
  <pdx-badge variant="primary" value="lg" size="lg"></pdx-badge>
</div>
<div class="demo-row">
  <pdx-badge variant="danger" value="3" size="sm"></pdx-badge>
  <pdx-badge variant="danger" value="42"></pdx-badge>
  <pdx-badge variant="danger" value="99+" size="lg"></pdx-badge>
</div>
```

**Dot Indicator** — `dot` prop renders a small status dot. `pulse` adds animation.

```html
<!-- label: what the dot means. Without it a dot is read as its colour ("success indicator") -->
<pdx-badge dot variant="success" label="Online"></pdx-badge> Online
<pdx-badge dot variant="danger" pulse label="Recording"></pdx-badge> Recording
```

**Overlay (Anchor)** — Wrap with `.pdx-badge-anchor` to position badge on corner of another element.

```html
<span class="pdx-badge-anchor">
  <pdx-button variant="ghost">
    <pdx-icon name="bell"></pdx-icon>
  </pdx-button>
  <pdx-badge variant="danger" value="5"></pdx-badge>
</span>
```

**Interactive Demo** — Click to increment/decrement. Badge uses `aria-live="polite"` — screen readers announce count changes. _(from the live demo)_

```html
<div class="demo-row">
  <span class="pdx-badge-anchor">
    <pdx-button variant="ghost" aria-label="Notifications"><pdx-icon name="bell" size="md"></pdx-icon></pdx-button>
    <pdx-badge variant="danger" :value="notifStr()"></pdx-badge>
  </span>
  <pdx-button variant="outline" size="sm" @click="addNotif">+ Add</pdx-button>
  <pdx-button variant="outline" size="sm" @click="removeNotif">- Remove</pdx-button>
  <pdx-button variant="ghost" size="sm" @click="clearNotif">Clear</pdx-button>
  <span class="pdx-txt-small pdx-ink-muted">Count: {{ notifCount }}</span>
</div>
```

**Composition** — Badges in realistic UI contexts. _(from the live demo)_

```html
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Navigation Sidebar</h3>
  <div class="nav-demo">
    <div class="nav-demo-item">
      <pdx-icon name="home" size="sm"></pdx-icon>
      <span>Dashboard</span>
    </div>
    <div class="nav-demo-item">
      <pdx-icon name="mail" size="sm"></pdx-icon>
      <span>Inbox</span>
      <pdx-badge variant="primary" value="24"></pdx-badge>
    </div>
    <div class="nav-demo-item">
      <pdx-icon name="bell" size="sm"></pdx-icon>
      <span>Notifications</span>
      <pdx-badge variant="danger" value="3"></pdx-badge>
    </div>
    <div class="nav-demo-item">
      <pdx-icon name="settings" size="sm"></pdx-icon>
      <span>Settings</span>
    </div>
  </div>
</div>
<div class="comp-card">
  <h3 class="pdx-txt-subheading">User List with Status</h3>
  <div class="user-list">
    <div class="user-row">
      <span class="pdx-badge-anchor">
        <div class="avatar-placeholder sm">JD</div>
        <pdx-badge label="Online" dot variant="success"></pdx-badge>
      </span>
      <span>Jane Doe</span>
      <pdx-badge variant="success" value="Admin" size="sm"></pdx-badge>
    </div>
    <div class="user-row">
      <span class="pdx-badge-anchor">
        <div class="avatar-placeholder sm">AS</div>
        <pdx-badge label="Away" dot variant="warning"></pdx-badge>
      </span>
      <span>Alex Smith</span>
      <pdx-badge variant="outline-primary" value="Editor" size="sm"></pdx-badge>
    </div>
    <div class="user-row">
      <span class="pdx-badge-anchor">
        <div class="avatar-placeholder sm">MK</div>
        <pdx-badge label="Busy" dot variant="danger"></pdx-badge>
      </span>
      <span>Mary Kim</span>
      <pdx-badge variant="warning" value="Pending" size="sm"></pdx-badge>
    </div>
  </div>
</div>
```

