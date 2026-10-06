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
