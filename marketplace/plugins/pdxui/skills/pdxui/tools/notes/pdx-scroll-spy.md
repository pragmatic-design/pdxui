⚠️ **`target` is not optional in an app with `pdx-app-layout`.** Same trap as `pdx-affix`: the
default scroll root is the window, and in that shell the window never scrolls — `pdx-app-layout` is
`overflow: hidden`, `main.pdx-app-main` is `overflow-y: auto`. Without `target=".pdx-app-main"` no
section is ever marked active.

```html
<pdx-scroll-spy target=".pdx-app-main" link-selector="[data-spy-link]">…</pdx-scroll-spy>
```

A link's `href="#id"` works as the target selector as well as `data-spy-target`, which the prop
table does not say: `updateLinks()` reads `href` first and falls back to `data-spy-target`.

Measured in `skill-claims.spec.ts` (case `who-scrolls`).
