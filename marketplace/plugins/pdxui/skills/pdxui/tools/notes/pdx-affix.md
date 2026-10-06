⚠️ **`target` is not optional in an app with `pdx-app-layout`.** The default scroll root is the
window, and in that shell the window never scrolls: `pdx-app-layout` is `overflow: hidden` and
`main.pdx-app-main` is `overflow-y: auto`. Without `target=".pdx-app-main"` the affix watches a
scroll that does not happen and never sticks — with no error and nothing in the console.

```html
<pdx-affix target=".pdx-app-main" :offset="16">…</pdx-affix>
```

Measured in `skill-claims.spec.ts` (case `who-scrolls`).
