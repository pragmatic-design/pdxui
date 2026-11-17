**No `target`, unlike `pdx-affix`.** `pdx-scroll-spy` watches the sections with an
`IntersectionObserver` whose root is the viewport (`offset` trims its top edge), so it does not read
which element scrolls; a `target` attribute on it does nothing.

```html
<pdx-scroll-spy link-selector="[data-spy-link]">…</pdx-scroll-spy>
```

A link's `href="#id"` works as the target selector as well as `data-spy-target`, which the prop
table does not say: `updateLinks()` reads `href` first and falls back to `data-spy-target`.
