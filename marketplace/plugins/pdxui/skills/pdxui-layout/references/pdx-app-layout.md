### `<pdx-app-layout>`

App shell: header, left/right sidebars, footer, and everything else as the main area.

**Composition — the part you cannot guess from the props.** Children are placed by `data-region`, and
there are exactly **four** names:

```html
<pdx-app-layout>
  <header data-region="header">…</header>   <!-- gets .pdx-app-header, role=banner        -->
  <nav    data-region="navbar">…</nav>      <!-- the LEFT sidebar; .pdx-app-navbar          -->
  <aside  data-region="aside">…</aside>     <!-- the RIGHT sidebar; .pdx-app-aside          -->
  <footer data-region="footer">…</footer>   <!-- .pdx-app-footer, role=contentinfo          -->
  <div>your page</div>                      <!-- NO data-region → wrapped in <main class="pdx-app-main"> -->
</pdx-app-layout>
```

⚠️ **There is no `content` region, and no `sidebar`.** The main area is whatever carries no
`data-region` at all; the left sidebar is `navbar`. A child with a `data-region` the layout does not
know gets neither treatment — it is skipped by the four and skipped by the `main` wrap, so it drops
out of the grid **silently**: no class, no `grid-area`, no warning.

`:class` on a region is safe: the layout adds its class with `classList.add`, so both survive.

**Who scrolls: `main.pdx-app-main`, never the window.** The shell is `overflow: hidden` and the main
region is `overflow-y: auto`, so `<html>` and `<body>` do not scroll at all — measured at 800px tall
with 4074px of content: `main` has a `clientHeight` of 748 and a `scrollHeight` of 4074, and the page
`scrollHeight === clientHeight`. Three consequences:

- `pdx-affix` and `pdx-scroll-spy` default to the window, where nothing ever happens here. Give them
  `target=".pdx-app-main"`.
- every `position: sticky` inside the page resolves against that container, not the viewport.
- a test or a script that does `window.scrollTo(...)` moves **nothing**. Set `main.pdx-app-main`
  `scrollTop` instead.

Measured by `responsive/tests/integration/ui-components/skill-claims.spec.ts` (case `who-scrolls`),
so the day the shell stops owning the scroll this note fails with it.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `headerHeight` | `headerheight` | string | `'52px'` | Header height (CSS value). Empty = no header. |
| `footerHeight` | `footerheight` | string | `''` | Footer height (CSS value). Empty = no footer. |
| `navbarWidth` | `navbarwidth` | string | `'260px'` | Navbar (left sidebar) width (CSS value) |
| `navbarCollapsedWidth` | `navbarcollapsedwidth` | string | `'60px'` | Navbar collapsed width for mini mode. A non-zero rail keeps icon-only nav visible when collapsed (set to '0px' explicitly for a fully-hidden navbar). |
| `navbarCollapsed` | `navbarcollapsed` | boolean | `false` | Navbar collapsed state |
| `navbarBreakpoint` | `navbarbreakpoint` | number | `768` | Breakpoint (px) below which navbar auto-collapses to overlay |
| `asideWidth` | `asidewidth` | string | `''` | Aside (right sidebar) width. Empty = no aside. |
| `navbarFullHeight` | `navbarfullheight` | boolean | `false` | Full-height navbar: the left sidebar spans header+main+footer (logo lives in the navbar), and the header only sits above main. Default false = header spans full width. |
| `withBorder` | `withborder` | boolean | `true` | Show border between regions |
| `transitionDuration` | `transitionduration` | number | `200` | Transition duration (ms) |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `toggleNavbar()` | Open or close the navbar: the mobile drawer under the breakpoint, the `navbar-collapsed` prop above it. |
| `openNavbar()` | Open the navbar, on either side of the breakpoint. |
| `closeNavbar()` | Close the navbar, on either side of the breakpoint. |

**Renders:** roles `banner` · `complementary` · `contentinfo` · `navigation`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Full Layout** — Header + navbar + main + aside + footer. The hamburger collapses the navbar to its icon rail by binding `:navbarCollapsed`; it says what it controls and whether the navigation is expanded.

```html
<pdx-app-layout headerheight="44px" navbarwidth="160px"
  asidewidth="120px" footerheight="36px" :navbarCollapsed="!navOpen">
  <div data-region="header">
    <button type="button" aria-label="Toggle navigation" aria-controls="app-nav"
      :aria-expanded="navOpen ? 'true' : 'false'" @click="navOpen = !navOpen">☰</button>
    My App
  </div>
  <div data-region="navbar" id="app-nav">
    <button type="button" :aria-current="page === 'Dashboard' ? 'page' : null"
      @click="page = 'Dashboard'">Dashboard</button>
    …
  </div>
  <div>Main content (no slot = main)</div>
  <div data-region="aside">Right panel</div>
  <div data-region="footer">Footer</div>
</pdx-app-layout>
```

**Header + Navbar Only** — Most common pattern. No aside, no footer. _(from the live demo)_

```html
<div class="demo-shell">
  <pdx-app-layout headerheight="44px" navbarwidth="200px">
    <div data-region="header" class="shell-header">
      <pdx-icon name="package" size="16"></pdx-icon>
      <strong>Dashboard</strong>
      <span class="shell-spacer"></span>
      <pdx-icon name="bell" size="16"></pdx-icon>
      <pdx-icon name="user" size="16"></pdx-icon>
    </div>
    <div data-region="navbar" class="shell-nav">
      <button type="button" class="shell-nav-item" :aria-current="page2 === 'Overview' ? 'page' : null" @click="page2 = 'Overview'"><pdx-icon name="home" size="14"></pdx-icon> Overview</button>
      <button type="button" class="shell-nav-item" :aria-current="page2 === 'Analytics' ? 'page' : null" @click="page2 = 'Analytics'"><pdx-icon name="bar-chart" size="14"></pdx-icon> Analytics</button>
      <button type="button" class="shell-nav-item" :aria-current="page2 === 'Projects' ? 'page' : null" @click="page2 = 'Projects'"><pdx-icon name="folder" size="14"></pdx-icon> Projects</button>
      <button type="button" class="shell-nav-item" :aria-current="page2 === 'Team' ? 'page' : null" @click="page2 = 'Team'"><pdx-icon name="users" size="14"></pdx-icon> Team</button>
      <button type="button" class="shell-nav-item" :aria-current="page2 === 'Settings' ? 'page' : null" @click="page2 = 'Settings'"><pdx-icon name="settings" size="14"></pdx-icon> Settings</button>
    </div>
    <div class="shell-main">
      <h3>{{ page2 }}</h3>
      <p class="pdx-txt-small pdx-ink-muted">Welcome back. Here's your dashboard.</p>
    </div>
  </pdx-app-layout>
</div>
```

**Without Border** — No borders between regions. _(from the live demo)_

```html
<div class="demo-shell">
  <pdx-app-layout headerheight="44px" navbarwidth="180px" :withBorder="false">
    <div data-region="header" class="shell-header" style="background:var(--pdx-color-primary);color:var(--pdx-color-primary-text)">
      <strong>Branded App</strong>
    </div>
    <div data-region="navbar" class="shell-nav">
      <button type="button" class="shell-nav-item" :aria-current="page3 === 'Home' ? 'page' : null" @click="page3 = 'Home'">Home</button>
      <button type="button" class="shell-nav-item" :aria-current="page3 === 'About' ? 'page' : null" @click="page3 = 'About'">About</button>
    </div>
    <div class="shell-main">
    </div>
  </pdx-app-layout>
</div>
```

