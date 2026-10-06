### `<pdx-router-outlet>`

Where the page the current route matches is rendered.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `name` | `name` | string | — | A named outlet renders the route component its route assigns to that name (`outlets`), beside the main one. |


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**The app shell** — The main outlet, inside the layout every page shares: the navigation stays, the page changes.

```html
<header>
  <pdx-link to="/">Home</pdx-link>
  <pdx-link to="/settings">Settings</pdx-link>
</header>
<main>
  <pdx-router-outlet></pdx-router-outlet>
</main>
```

**A named outlet** — Beside the main one, an outlet with a `name` renders the component its route assigns to that name in `outlets`: a side panel that follows the route.

```html
<main>
  <pdx-router-outlet></pdx-router-outlet>
</main>
<aside>
  <pdx-router-outlet name="details"></pdx-router-outlet>
</aside>
```

