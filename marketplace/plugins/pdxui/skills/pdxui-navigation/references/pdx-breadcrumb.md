### `<pdx-breadcrumb>`

Show the path to here.

⚠️ **A crumb with only a `label` is inert.** It renders, it looks right, and clicking it does nothing —
no error, nothing in the console. Give each item one of the two:

```js
// either an href — the component sets it on the <a> and the browser navigates
const crumbs = [{ key: 'home', label: 'Vulcano', href: '/' }, { key: 'plan', label: 'Piano' }];

// or listen for the event, which carries the item
<pdx-breadcrumb :items="crumbs" @pdx-select="(e) => go(e.detail.item)"></pdx-breadcrumb>
```

The last crumb is the current page: it renders as a `<span>`, not a link, and needs neither.

**Which one to pick.** With an `href` the crumb is a real `<a>`: middle-click, open in a new tab and
copy-the-address all work, and the browser navigates without you. Without one it is a `<button>` —
focusable and announced correctly, but only your handler moves the app. Prefer `href` for anything
that is a real URL; use the event for a crumb that changes state without a route.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | array | `[]` | The data items to render. |
| `separator` | `separator` | string | `''` | The separator between items. |
| `maxItems` | `maxitems` | number | `0` | Collapse to this many items with an ellipsis. |

**Events:** `pdx-select` → `detail: { key, item }` — Fired when an item is selected.

**Renders:** roles `list`

**Slot:** `item` — Scoped — renders one crumb. Receives `{ item, index, isFirst, isLast }`.

**Shapes:** `BreadcrumbItem { key: string; label: string; href?: string; icon?: string }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic**

```html
<pdx-breadcrumb :items="items"></pdx-breadcrumb>
```

```js
// items = [
//   { key: 'home', label: 'Home', href: '#' },
//   { key: 'products', label: 'Products', href: '#' },
//   { key: 'phones', label: 'Smartphones' },
// ]
```

**With Icons**

```html
<pdx-breadcrumb :items="items"></pdx-breadcrumb>
```

```js
// { key: 'home', label: 'Home', icon: 'home', href: '#' }
```

**Custom Separator**

```html
<pdx-breadcrumb :items="items" separator="&gt;"></pdx-breadcrumb>
<pdx-breadcrumb :items="items" separator="&rsaquo;"></pdx-breadcrumb>
<pdx-breadcrumb :items="items" separator="&rarr;"></pdx-breadcrumb>
```

**Overflow Collapse** — Long paths collapse to ellipsis. Click … to expand.

```html
<pdx-breadcrumb :items="longItems" :maxItems="3"></pdx-breadcrumb>
```

**Slot Template** — Use the `item` slot to customize how each breadcrumb item is rendered.

```html
<pdx-breadcrumb :items="items">
  <slot name="item" let:item let:isLast>
    <span class="crumb-custom">
      $&lbrace;isLast ? item.label : item.label + ' &rarr;'&rbrace;
    </span>
  </slot>
</pdx-breadcrumb>

.crumb-custom {
  font-weight: 600;
  color: var(--pdx-color-primary);
}
```

