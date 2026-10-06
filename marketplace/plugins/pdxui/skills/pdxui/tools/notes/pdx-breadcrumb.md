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
