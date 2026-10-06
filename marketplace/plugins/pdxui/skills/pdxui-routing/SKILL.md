---
name: pdxui-routing
description: "PDX (@pdxui/router) routing: @page, params, @guard and where a denial goes, @loader, layouts and nested routes, one chunk per page and prefetching, keep-alive, the query string, navigation hooks, @title/@meta and scroll restoration. Use when a .pdx app has more than one page."
---

# PDX · Routing, head and scroll

A `.pdx` file becomes a page with `@page`. Everything else here is a declaration beside it.

## Decide

| You want… | Declare | Read |
| --- | --- | --- |
| a page | `@page '/path'` | [router](references/router.md) |
| a variable segment | `@page '/x/:id'` + `currentParams()` | [router](references/router.md) § Params |
| to protect it | `@guard 'permission'` | [router](references/router.md) § Protect a page |
| data ready on entry | `@loader fn` | [router](references/router.md) § Data before the page |
| a shared frame | `@layout 'admin'`, or a parent page with a `<pdx-router-outlet>` | [router](references/router.md) § Shared layouts |
| to keep a page's state when leaving | `@page '/x' { keepAlive }` | [router](references/router.md) § Destroy or keep |
| the tab title and meta tags | `@title` · `@meta` · `@head` | [head-scroll](references/head-scroll.md) |
| a page that always enters at the top | `@scroll 'top'` | [head-scroll](references/head-scroll.md) § Per page |

## Traps

- **A denial is not a missing session.** By default a refused route shows a 403 where it happened;
  redirect to a login only when the visitor is not signed in, or an authenticated visitor is sent
  to sign in again and lands on the same denial. ([router](references/router.md) § Where a denial goes)
- **A `@loader` runs before the component exists**: it cannot read props or signals, only the URL.
  ([router](references/router.md) § Data before the page)
- **Destroy is the default, keep-alive the exception**: keep only views that are expensive to rebuild
  or hold user state, or memory accumulates. ([router](references/router.md) § Destroy or keep)
- **`@title 'Profile of ${user.name}'` is literal.** Quotes are taken as they are; a title that
  follows state uses backticks. ([head-scroll](references/head-scroll.md) § Head)
- **`@meta { … }` with braces is route data, not a meta tag.** The `<head>` form is `@meta name: 'content'`.
  (same section)

## References

Copies of the site's docs pages, regenerated with them: [router](references/router.md) ·
[head-scroll](references/head-scroll.md).
