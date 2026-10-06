### `<pdx-drawer>`

A panel that slides in from an edge.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `open` | `open` | boolean | `false` | Whether it is open. |
| `position` | `position` | 'left' \| 'right' \| 'top' \| 'bottom' | `'right'` | Position: left, right (default), top, bottom |
| `size` | `size` | string | `'md'` | Size: sm (280px), md (380px), lg (520px), or ANY custom CSS width (e.g. "640px"). Open-ended on purpose → NOT declared as a closed enum. |
| `mode` | `mode` | 'overlay' \| 'push' | `'overlay'` | Mode: overlay (default) or push (shifts page content) |
| `closeOnBackdrop` | `closeonbackdrop` | boolean | `true` | Close on backdrop click |
| `closeOnEscape` | `closeonescape` | boolean | `true` | Close on Escape |
| `showClose` | `showclose` | boolean | `true` | Show close button in header |
| `resizable` | `resizable` | boolean | `false` | Show resize handle on edge |
| `label` | `label` | string | `''` | Label for screen readers |
| `loading` | `loading` | boolean | `false` | Show loading state |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `show()` | Shows it. |
| `close()` | Closes it. |
| `toggle()` | Toggles it open/closed. |
| `isOpen` _(read-only)_ | Read-only, via a ref: `el.isOpen`. |

**Events:** `pdx-before-close` — Fired on `pdx-before-close`.; `pdx-close` — Fired when it closes. Does not bubble.

**Renders:** roles `dialog`

**Slot:** `header` — Title area at the top of the panel, beside the close button.; `footer` — Action area at the bottom of the panel (e.g. Save / Cancel).


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Positions** — 4 positions: left, right (default), top, bottom. Click to open, Escape or backdrop to close. _(from the live demo)_

```html
<div class="btn-row">
  <pdx-button variant="outline" @click="openDrawer('right')">Right</pdx-button>
  <pdx-button variant="outline" @click="openDrawer('left')">Left</pdx-button>
  <pdx-button variant="outline" @click="openDrawer('top')">Top</pdx-button>
  <pdx-button variant="outline" @click="openDrawer('bottom')">Bottom</pdx-button>
</div>
<pdx-drawer :open="drawerOpen" :position="drawerPos" label="Demo drawer" @pdx-close="closeDrawer">
  <span slot="header">Drawer — {{ drawerPos }}</span>
  <p>This drawer slides in from the <strong>{{ drawerPos }}</strong>.</p>
  <p class="pdx-txt-small pdx-ink-muted">Press Escape or click the backdrop to close. On mobile, swipe to dismiss.</p>
  <pdx-form-field label="Name" size="sm">
    <pdx-input placeholder="Enter your name"></pdx-input>
  </pdx-form-field>
  <span slot="footer">
    <pdx-button variant="ghost" size="sm" @click="closeDrawer">Cancel</pdx-button>
    <pdx-button variant="primary" size="sm" @click="closeDrawer">Save</pdx-button>
  </span>
</pdx-drawer>
```

**Sizes** — sm (280px), md (380px), lg (520px), or custom CSS value. _(from the live demo)_

```html
<div class="btn-row">
  <pdx-button variant="outline" size="sm" @click="openSized('sm')">Small</pdx-button>
  <pdx-button variant="outline" size="sm" @click="openSized('md')">Medium</pdx-button>
  <pdx-button variant="outline" size="sm" @click="openSized('lg')">Large</pdx-button>
</div>
<pdx-drawer :open="sizedOpen" :size="sizedSize" label="Sized drawer" @pdx-close="closeSized">
  <span slot="header">Size: {{ sizedSize }}</span>
  <p>This drawer is <strong>{{ sizedSize }}</strong> width.</p>
  <span slot="footer">
    <pdx-button variant="primary" size="sm" @click="closeSized">Close</pdx-button>
  </span>
</pdx-drawer>
```

**Form Drawer** — Real-world example: settings form in a drawer with header, body (scrollable), and footer actions. _(from the live demo)_

```html
<pdx-button variant="primary" @click="openForm">Edit Profile</pdx-button>
<pdx-drawer :open="formOpen" size="md" label="Edit Profile" @pdx-close="closeForm">
  <span slot="header">
    <pdx-icon name="user" size="sm"></pdx-icon> Edit Profile
  </span>
  <div class="form-stack">
    <pdx-form-field label="Full Name" size="sm">
      <pdx-input value="Alessandro Saiani" placeholder="Full name"></pdx-input>
    </pdx-form-field>
    <pdx-form-field label="Email" size="sm">
      <pdx-input type="email" value="alex@pragmatic.dev"></pdx-input>
    </pdx-form-field>
    <pdx-form-field label="Bio" size="sm">
      <pdx-textarea placeholder="Tell us about yourself" rows="3"></pdx-textarea>
    </pdx-form-field>
    <pdx-form-field label="Role" size="sm">
      <pdx-input value="Lead Architect" placeholder="Your role"></pdx-input>
    </pdx-form-field>
    <pdx-form-field label="Notifications" size="sm">
      <pdx-switch label="Email notifications" checked></pdx-switch>
    </pdx-form-field>
  </div>
  <span slot="footer">
    <pdx-button variant="ghost" size="sm" @click="closeForm">Cancel</pdx-button>
    <pdx-button variant="primary" size="sm" @click="closeForm">Save Changes</pdx-button>
  </span>
</pdx-drawer>
```

