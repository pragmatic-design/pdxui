### `<pdx-navbar>`

A top navigation bar.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `brand` | `brand` | string | `''` | Brand text |
| `brandIcon` | `brandicon` | string | `''` | Brand icon name |
| `items` | — | array | `[]` | Navigation items |
| `sticky` | `sticky` | boolean | `false` | Sticky |
| `compact` | `compact` | boolean | `false` | Compact height |
| `label` | `label` | string | `''` | The navigation landmark's name. Empty: the navbar.mainNav component string, «Main navigation». Give each navbar on a page its own: a sub-nav, a footer nav. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `toggleMobile()` | Open or close the mobile menu, moving focus into it when it opens. |

**Events:** `pdx-select` → `detail: { key, item }` — Fired when an item is selected.

**Renders:** roles `banner` · `navigation`

**Shapes:** `NavbarItem { key: string; label: string; href?: string; icon?: string; active?: boolean }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Enterprise Header** — Search, a notification bell with its unread count, and a user menu. The navbar collapses on its own width: narrow the window, or put it in a narrow column, and the links move behind the menu button. Escape closes that menu.

```html
<pdx-navbar brand="Enterprise" brandicon="zap" :items="appNavItems" @pdx-select="onNav">
  <div class="pdx-input-wrap">
    <pdx-icon name="search" size="16"></pdx-icon>
    <input class="pdx-input" type="text" placeholder="Search..." aria-label="Search" />
  </div>
  <button class="pdx-navbar-icon-btn" aria-label="Notifications, 3 unread">
    <pdx-icon name="bell" size="18"></pdx-icon>
    <span class="pdx-navbar-badge" aria-hidden="true">3</span>
  </button>
  <pdx-dropdown-menu :items="userMenuItems" variant="ghost" size="sm" icon="user" label="John Doe">
  </pdx-dropdown-menu>
</pdx-navbar>
```

**Basic Navbar** — Brand + navigation links only. No actions area.

```html
<pdx-navbar brand="Pragmatic" brandicon="package" :items="navItems" @pdx-select="onNav">
</pdx-navbar>
```

**Nav with Dropdown** — A nav item can trigger a dropdown for sub-pages.

```html
<div class="pdx-navbar">
  <div class="pdx-navbar-bar">
    <div class="pdx-navbar-brand">
      <pdx-icon name="globe" size="22"></pdx-icon>
      <strong>SaaS App</strong>
    </div>
    <nav class="pdx-navbar-nav">
      <a class="pdx-navbar-link active" href="#">Home</a>
      <pdx-dropdown-menu label="Products" :items="productSubmenu" variant="ghost" size="sm"></pdx-dropdown-menu>
      <a class="pdx-navbar-link" href="#">Pricing</a>
    </nav>
    <div class="pdx-navbar-spacer"></div>
    <div class="pdx-navbar-actions">
      <button class="pdx-btn pdx-primary pdx-btn-sm">Get Started</button>
    </div>
  </div>
</div>
```

**Compact (48px)** — Denser toolbar for internal tools.

```html
<pdx-navbar brand="DevTools" brandicon="terminal" :items="simpleNav" compact>
  <button class="pdx-navbar-icon-btn" aria-label="Settings">
    <pdx-icon name="settings" size="16"></pdx-icon>
  </button>
</pdx-navbar>
```

**Responsive Preview** — Drag the right edge to resize. Below ~500px: hamburger appears, nav links hide, drawer toggles on click. _(from the live demo)_

```html
<div class="responsive-frame" id="resp-frame" :ref="respFrame">
  <div class="resp-navbar-wrap">
    <div class="pdx-navbar-bar">
      <div class="pdx-navbar-brand">
        <pdx-icon name="package" size="20"></pdx-icon>
        <strong>App</strong>
      </div>
      <button class="pdx-navbar-hamburger" id="resp-hamburger" :ref="respHamburger" style="display: none" @click="toggleResp">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>
      </button>
      <nav class="pdx-navbar-nav" id="resp-nav" :ref="respNav" role="navigation">
        <a class="pdx-navbar-link active" href="#">Dashboard</a>
        <a class="pdx-navbar-link" href="#">Projects</a>
        <a class="pdx-navbar-link" href="#">Team</a>
        <a class="pdx-navbar-link" href="#">Settings</a>
      </nav>
      <div class="pdx-navbar-spacer"></div>
      <div class="pdx-navbar-actions">
        <button class="pdx-navbar-icon-btn"><pdx-icon name="bell" size="18"></pdx-icon></button>
        <span class="pdx-navbar-user"><span class="pdx-navbar-user-avatar">A</span></span>
      </div>
    </div>
    <div class="pdx-navbar-drawer" id="resp-drawer" :ref="respDrawer">
      <a class="pdx-navbar-link active" href="#">Dashboard</a>
      <a class="pdx-navbar-link" href="#">Projects</a>
      <a class="pdx-navbar-link" href="#">Team</a>
      <a class="pdx-navbar-link" href="#">Settings</a>
    </div>
  </div>
  <div class="resp-content">
    <p class="pdx-ink-muted pdx-txt-small">Main content area. Drag the right edge of this frame to see responsive behavior.</p>
    <p class="pdx-txt-mono pdx-txt-small" id="resp-width-display">{{ respWidth }}</p>
  </div>
</div>
```

