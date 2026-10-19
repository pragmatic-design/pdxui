# Routing

The declarations that make a component a page and describe its route. The router has one
implementation in the beta (#108): the build emits route **data** and the router builds its matcher
once when it loads, so every rule below holds the same in development and in a build. Constructs
marked **Unchanged** keep the alpha semantics of `docs/language/routing.md`.

```ebnf
Path        ::= "'/" [^']* "'" | '"/' [^"]* '"'
PathSegment ::= "/" ( Word | ":" Identifier ( "(" Constraint ")" )? | "*" )
Constraint  ::= "string" | "number" | "uuid" | "slug"
```

A constraint narrows the one non-empty segment a param takes: `string` is any segment, `number`
`[0-9]+`, `uuid` `8-4-4-4-12` hexadecimal digits, and `slug` lowercase words joined by single hyphens,
`[a-z0-9]+(?:-[a-z0-9]+)*` (the table in `docs/language/routing.md`).

## Pages

### @page — alpha → beta

```ebnf
PageDecl ::= "@page" S StringLiteral ( S? "," S? StringLiteral )* ( S? PageOptions )? End
```

Each string must be a `Path` (`PDX_PAGE_INVALID_PATH`, alpha).

`@page` is the **one home of every route field** (decisions.md 1, 2, 7, 8, 19 — landed, #277): its
paths (an alias is a further path), and its options `keepAlive`, `preload`, `prefetch`, `label`,
`transition` (the page transition) and `meta` (route data). A page is its own chunk; loading it and
running its loader start together (#119 — landed, below).

```pdx
<script>
@page '/users', '/people' { prefetch: 'hover', transition: 'fade', meta: { requiresAuth: true } };
</script>
```

The `prefetch` policy `'hover'` or `'viewport'` prefetches the route's **data** too — its loader is
started and its promise kept for the navigation that follows within 10 seconds — and a prefetch never
runs a loader of a route the user may not enter (#119 — landed).

### @guard, @layout, @outlet, @scroll, @redirect — unchanged

Grammars in [grammar.md](grammar.md).

### Removed: @route, @alias, @prefetch, the script @transition

Each restated a field `@page` already has, or used a keyword that means something else in the
template. Each is `PDX_REMOVED_FORM` (landed, #277); `pdx migrate` rewrites
them mechanically — `@route { … }` into the separate declarations and `@page` options,
`@alias 'p'` into a further `@page` path, `@prefetch 'x'` and `@transition 'x'` into `@page`'s
`prefetch` and `transition` options (migration.md).

## Loading data before a page renders

### @loader

#### Syntax

```ebnf
LoaderDecl    ::= "@loader" S Identifier S? ":" S? Identifier ( S? LoaderOptions )? End
LoaderOptions ::= "{" S? "staleTime" S? ":" S? Expression S? "}"
```

#### Semantics

A **named** loader, like `@fetch` (#146): `@loader user: loadUser;` declares `user` with the async
vocabulary ([data.md](data.md)) — `data()`, `error()`, `state()`, `pending()` — and its type inferred
from the function's return type. The function is moved out of the component to its own module, so the
router starts it together with the page's chunk (#119) and it cannot read the component's setup. It is
called with a **context**:

```ts
type LoaderContext<P> = { params: P; query: Record<string, string | string[]>; signal: AbortSignal };
```

`params` is typed and coerced from the path's constraints (`:id(number)` → `{ id: number }`;
unconstrained → `string`); `signal` aborts when a newer navigation supersedes this one. The router
computes the new params before running loaders. Levels run outermost first, since a child's loader may
read its parent's data (`loaderData(parentPath)`).

**Outcomes** (#147). `redirect(to, { replace? })` and `notFound()` from `@pdxui/router` are thrown by a
loader: a redirect navigates to `to` before the current navigation commits (no history entry for the
abandoned target by default); `notFound()` renders the not-found page **of the level**, with the URL
unchanged; any other error renders the level's error page with a retry that re-runs the loader — the
page is no longer mounted as if nothing happened.

**The identity of a loader call.** Everything a loader receives decides its result, so a call is
identified by all of it:

```
LoaderKey ::= routePattern "|" canonicalParams "|" canonicalQuery
```

- `routePattern` is the level's pattern as declared (`/users/:id(number)`), not the URL;
- `canonicalParams` is the level's own params after coercion, keys sorted (`{"id":42}`);
- `canonicalQuery` is the query string's pairs sorted by key, the values of a repeated key kept in
  their URL order, each pair percent-decoded then re-encoded (`a=1&a=2&q=bob`); an absent query and
  `?` are both empty; the fragment is never part of it.

`/search?q=alice` and `/search?q=bob` are therefore two calls. The same key is used by every consumer:
the reuse of a mounted level, `@page`'s `prefetch` (#119), the cache below, and invalidation.

**Reuse of a mounted level** (alpha rule, kept). A level that stays mounted across a navigation — a
layout above the page that changed — and whose key is unchanged is **not** run again, whatever its
`staleTime`. `staleTime` governs a level that is entered again, not one that never left.

**Cache** (#148). `{ staleTime: ms }` keeps a loader's result per key. Entering a level whose key has a
result younger than `staleTime` uses it at once and does not run the loader. Entering a level whose
key has an older result shows that result with `stale()` true while the loader runs again, and
replaces it when the run settles. The default `staleTime` is `0`: a level entered again always runs
its loader, and shows the kept result as stale meanwhile. A prefetched result enters the cache under
the same key. An `@action`'s `invalidate: ['loader:/users/:id']` marks **every** key of that pattern
stale (any params, any query); the next entry runs the loader, and a mounted level whose key was
invalidated runs again at once.

#### Rules

- A name no function of the script declares: `PDX_LOADER_NOT_FOUND` (alpha).
- An option other than `staleTime` is rejected as `@fetch` rejects an unknown option (#148); the code
  name `PDX_LOADER_UNKNOWN_OPTION` is this specification's.
- The anonymous form `@loader fn;` and `currentLoaderData()` / `currentLoaderState()` are language
  changes: `pdx migrate` names the loader after its function, `@loader loadUser;` →
  `@loader loadUser: loadUser;`, and reports the rename (#146).

#### Examples

```pdx
<template>
  @await (user as u) {
    <h1>{{ u.name }}</h1>
  } @loading {
    <p>Loading…</p>
  } @error (err, retry) {
    <p>Could not load the user. <button @click="retry()">Retry</button></p>
  }
</template>

<script>
import { notFound, redirect, type LoaderContext } from '@pdxui/router';
interface User { id: number; name: string }

@page '/users/:id(number)';
@loader user: loadUser { staleTime: 30_000 };

async function loadUser({ params, signal }: LoaderContext<{ id: number }>): Promise<User> {
  const res = await fetch(`/api/users/${params.id}`, { signal });
  if (res.status === 404) throw notFound();
  if (res.status === 401) throw redirect('/login');
  return res.json();
}
</script>
```

#### Since

alpha → beta (#119, #146, #147, #148)

## Reading the URL

### @params

```ebnf
ParamsDecl ::= "@params" S? "{" S? ParamField ( S? "," S? ParamField )* S? "}" End
```

Unchanged in form; in the beta its types come from the same path constraints the loader's `params`
uses, so the route's `paramTypes` has one reader (#146). It stays for components that read params
without a loader.

### @search — unchanged

```ebnf
SearchDecl ::= "@search" S? "{" S? SearchField ( S? "," S? SearchField )* S? "}" End
```

### navigation

`navigation` from `@pdxui/router`, auto-imported in a `.pdx` that reads it (#149 — landed):

- `navigation.pending(): boolean` — true from the start of a navigation until the route is published
  or the navigation is abandoned or rejected. The start is when the before-hooks accept it: while one
  is still asking "leave this page?" nothing loads, and nothing is pending;
- `navigation.to(): string | null` — the target while pending; a newer navigation replaces it.

```pdx
<template>
  @if (navigation.pending()) { <div class="route-progress" role="progressbar"></div> }
  <pdx-router-outlet></pdx-router-outlet>
</template>

<script>
</script>
```

Since: beta (#149).

### Typed routes

The build, and the dev server when routes change, write `.pdx/routes.d.ts` from the scanned routes
(#150): a `RoutePath` union of the patterns and `RouteParams<P>` with each pattern's params typed from
its constraints. `navigate()` is then overloaded on them — `navigate('/users/:id', { id: 42 })` checks,
an unknown path or a wrong param is a type error — and a concrete URL goes through
`navigate.url('/users/42')`, explicitly. `<pdx-link to="/users/:id" :params="{ id: u.id }">` is checked
by the editor with the same types, and `pdx check --types` reads the file. An untyped
`navigate(string)` is a language change (`navigate.url` in beta). Since: beta (#150 — landed).

## The document head

### @title, @meta

```ebnf
TitleDecl ::= "@title" S Expression End
MetaDecl  ::= "@meta" S ( "property" S )? [A-Za-z0-9_:-]+ S? ":" S? StringLiteral End
```

`@title` is unchanged. `@meta` writes **head tags only** (decisions.md 8 — landed, #277): route data,
which alpha registered with `@meta { … }`, is `@page`'s `meta` option. `@head`, which restated
`@title` and `@meta` in one weaker block, is removed (decisions.md 3 — landed, #277); `pdx migrate` splits it.

## Static generation

`pdx build --ssg` renders routes to HTML at build time and replaces the content at mount
([file.md](file.md#static-generation), #160).
