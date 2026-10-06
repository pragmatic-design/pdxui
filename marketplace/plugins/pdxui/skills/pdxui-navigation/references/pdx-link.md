### `<pdx-link>`

A link that navigates without a reload and marks itself active.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `to` | `to` | string | — | Reflected to the `to` attribute, so a binding works. |
| `exact` | `exact` | boolean | — | Reflected to the `exact` attribute, so a binding works. |
| `active-class` | `active-class` | string | — | The class added while the link's target is the current route. |
| `prefetch` | `prefetch` | 'never' | — | `never` turns off fetching the route's chunk on hover, focus and pointerdown; otherwise the route's own @prefetch decides. |
| `params` | `params` | string | — | JSON object of route params that fill the pattern in `to`. |


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Link to a route** — These links lead to the site's own pages: try one, then come back.

```html
<pdx-link to="/docs/router">Router guide</pdx-link>
<pdx-link to="/components" exact active-class="is-here">All components</pdx-link>
```

**A route with params** — A pattern in `to` is filled from `params`; bound with `:to`, the path is an expression.

```html
<pdx-link to="/users/:id" params='{"id": "42"}'>Ada</pdx-link>
<pdx-link :to="'/users/' + user.id">{{ user.name }}</pdx-link>
```

**No prefetch** — A link to a heavy route that is rarely followed: its code loads on the click, not on the hover.

```html
<pdx-link to="/reports/archive" prefetch="never">Archive</pdx-link>
```

