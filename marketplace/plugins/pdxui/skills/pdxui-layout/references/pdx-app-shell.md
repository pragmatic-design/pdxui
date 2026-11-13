### `<pdx-app-shell>`

An application's chrome, drawn from a navigation model: a rail of the reader's own entries — home,
favourites, recents — and a catalogue of every entry the app has, grouped and searchable, beside
it. Entries the reader has no permission for are not drawn. A choice goes through the router when
one runs. Below 600px the rail is a modal drawer opened from the bar.

The app fills three slots: `brand` (the rail's head), `bar` (the top bar: title, search, the
profile menu) and `foot` (the rail's foot: environment, version); the page goes in the default slot.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | AppShellGroup[] | `[]` | The catalogue: every entry of the app, in groups. Entries with a `permission` the reader lacks are not drawn. |
| `home` | — | AppShellEntry \| null | `null` | The first entry of the rail, always there and never a favourite: the app's home, usually. |
| `defaultFavourites` | — | string[] | `[]` | The favourites of a first visit, by entry key: a rail is not empty the first time. |
| `recents` | `recents` | number | `5` | How many recents the rail shows; 0 shows none. |
| `user` | `user` | string | `''` | Whose recents: each person keeps their own. Empty is a guest. |
| `storageKey` | `storagekey` | string | `'pdx-app-shell'` | The prefix of what the shell keeps in localStorage: the rail's state, the favourites, the recents. |
| `label` | `label` | string | `''` | The navigation's accessible name. Empty: «Main navigation». |
| `collapsed` | `collapsed` | boolean | `false` | Whether the rail shows icons only. Kept across visits when the reader toggles it. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `openCatalog()` | Open the catalogue on an empty search, and put the focus in the search. |
| `closeCatalog()` | Close it and give the focus back to «All», which opened it. |
| `openMenu()` | Open the drawer (below 600px) and put the focus in it. |
| `closeMenu()` | Close the drawer. |

**Events:** `before-navigate` → `detail: { key: string; href: string }` — An entry was chosen, before the shell follows it. Cancelable: `preventDefault()` keeps the shell from navigating — for an entry the app opens its own way, or a demo that stays on its page.; `collapsed-change` → `detail: { value: boolean }` — Fired when the component writes `collapsed`. Does not bubble.

**Renders:** roles `dialog`

**Slot:** `bar`; `brand`; `foot`

**States:** `:state(collapsed)` — The rail shows icons only.; `:state(drawer)` — The drawer is open (below 600px).; `:state(catalog)` — The catalogue is open.

**Parts:** `[data-part="root"]` — The shell: the rail, the catalogue and the frame, `data-side` collapsed or expanded.; `[data-part="rail"]` — The navigation rail, a `pdx-sidebar`: 80px collapsed, 300px expanded.; `[data-part="brand"]` — The rail's head, holding the `brand` slot.; `[data-part="railNav"]` — The rail's `pdx-nav-menu`: home, favourites, recents.; `[data-part="pin"]` — The pin beside an entry, `aria-pressed` when it is a favourite.; `[data-part="allButton"]` — Opens the catalogue.; `[data-part="foot"]` — The rail's foot, holding the `foot` slot.; `[data-part="catalog"]` — The catalogue, a non-modal `role="dialog"` beside the rail.; `[data-part="search"]` — The catalogue's search field.; `[data-part="closeButton"]` — Closes the catalogue.; `[data-part="empty"]` — Said when the search matches no entry.; `[data-part="catalogNav"]` — The catalogue's `pdx-nav-menu`.; `[data-part="frame"]` — The bar and the page; inert while the drawer is open.; `[data-part="railToggle"]` — Collapses and expands the rail.; `[data-part="bar"]` — The top bar, holding the `bar` slot.; `[data-part="menuButton"]` — Opens the drawer below 600px.; `[data-part="main"]` — The page, the default slot.

**Shapes:** `AppShellEntry { key: string; label: string; href: string; icon?: string; badge?: string | number; permission?: string; exact?: boolean }` · `AppShellGroup { key: string; label: string; items: AppShellEntry[] }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — A navigation model, drawn: the rail holds Dashboard, the favourites (Tickets on a first visit) and the lists opened lately; All opens every entry, searchable, with a pin beside each. Billing needs a permission this page does not grant, so it is not drawn. Here `before-navigate` is refused, so a choice stays on this page.

```js
const items = [
  { key: 'work', label: 'Work', items: [
    { key: 'tickets', label: 'Tickets', href: '/tickets', icon: 'list', badge: 12 },
    { key: 'billing', label: 'Billing', href: '/billing', icon: 'credit-card', permission: 'billing.read' },
  ] },
];
```

```html
<pdx-app-shell :items="items" :home="home" :default-favourites="['tickets']">
  <strong slot="brand">PDX</strong>
  <span slot="bar">Service desk</span>
  <pdx-router-outlet></pdx-router-outlet>
</pdx-app-shell>
```

**Collapsed rail** — 80px of icons; a group opens as a flyout. The handle on the rail's edge toggles it, and the shell keeps the choice for the next visit. `::collapsed` binds it. Below 600px the rail becomes a drawer opened from the bar.

```html
<pdx-app-shell :items="items" ::collapsed="collapsed">…</pdx-app-shell>
```

**The bar: title and profile menu** — The bar is the app's: a title, a search, and the profile menu with the scheme, the density or the sign-out. The shell draws none of them; it places what the `bar` slot holds.

```html
<pdx-app-shell :items="items">
  <div slot="bar">
    <span>Tickets</span>
    <pdx-dropdown-menu label="Ada Lovelace" icon="user" :items="profileItems" @pdx-select="onProfile"></pdx-dropdown-menu>
  </div>
  …
</pdx-app-shell>
```

