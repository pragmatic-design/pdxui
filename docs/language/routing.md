# Routing

The declarations that make a component a page and describe its route: the path, who may enter, the
data it loads first, the frame it renders in, how it arrives, the other paths that lead to it, the
URL values it reads, and what it writes into the document head. Each is a line of the script
([script.md](script.md)) that starts with its keyword, and each is read by the script analyzer on
that line alone, unless the section says it reads a block. A route declaration does nothing on a
component without a `@page` (or an `@route { path }`): the route fields are emitted only with the
registration that `@page` produces. The head declarations (`@title`, `@meta` with a name, `@head`)
work on any component.

The registration is the same in both modes of the build: the page module registers its route when it
is imported, and the plugin scans every `.pdx` that has an `@page` line with the same analyzer and
emits the route table (`virtual:pdx-routes`), which the router reads — installed through the router's
seam in a build, handed over from `index.html` in dev — so a route is known before its page is
downloaded.

```ebnf
Path        ::= "'/" [^']* "'" | '"/' [^"]* '"'
Digits      ::= [0-9]+
```

A `Path` is a `StringLiteral` that starts with `/`. A segment `:name` is a param, `:name(c)` a param
with a constraint `c`, one of `string`, `number`, `uuid`, `slug`. The value is one non-empty
segment, and each constraint narrows it:

| Constraint | Matches |
|---|---|
| `string` | any segment (the same as no constraint) |
| `number` | digits, `[0-9]+` |
| `uuid` | `8-4-4-4-12` hexadecimal digits, either case |
| `slug` | lowercase letters and digits in words joined by single hyphens, `[a-z0-9]+(?:-[a-z0-9]+)*` |

## Declaring a page

### @page

#### Syntax

```ebnf
PageDecl     ::= "@page" S StringLiteral ( S? "," S? StringLiteral )* ( S? PageOptions )? S? ";"?
PageOptions  ::= "{" S? PageOption ( S? "," S? PageOption )* S? "}"
PageOption   ::= "keepAlive" ( S? ":" S? ( "true" | "false" | Digits ) )?
               | "preload" ( S? ":" S? ( "true" | "false" ) )?
               | "prefetch" S? ":" S? StringLiteral
               | "label" S? ":" S? ( StringLiteral | Identifier | "$t(" S? StringLiteral S? ")" )
```

The analyzer's form: `@page '/users/:id';`. The options block may span lines.

#### Semantics

`@page` makes the component a route. After `component(…)` the module emits
`__pdx_pushRoute({path, tag, …})`, which adds the route to `globalThis.__pdx_routes` (replacing an
entry with the same path), with the fields the other declarations of this page add. A page is its own
chunk: the route carries `lazy:true` and `file:'./name.pdx'`, and the outlet imports it the first
time the route is shown. Every path after the first is registered as a further route to the same tag,
with every field of the first and the param constraints of its own path. A page whose template renders a `<pdx-router-outlet>` element
gets `hasOutlet:true`: the routes below its path render inside it. The options block:

- `keepAlive` freezes the page when it is left instead of destroying it; `keepAlive: 60000` destroys
  the frozen page after that many milliseconds. A keep-alive page re-applies its `@title` in
  `onShow`.
- `preload` (or `preload: true`) keeps the page in the entry chunk: no `lazy`, no `file`.
- `prefetch` is the same field `@prefetch` sets.
- `label` names the route in the breadcrumb that `<pdx-breadcrumb>` builds with no `items`. A string
  is the crumb, and a `:param` in it is replaced by the param's value. An identifier names a function
  of the script, which is moved to module scope (as `@loader`'s is) and registered by reference,
  `label:crumb`; it is called with the route's params. `$t('key')` registers `labelKey:'key'`, which
  the router translates with the route's params.

#### Rules

- A path that does not start with `/` raises `PDX_PAGE_INVALID_PATH`. Every path is checked, an
  `@alias`'s too.
- A param constraint that is not `string`, `number`, `uuid` or `slug` raises
  `PDX_PAGE_INVALID_CONSTRAINT` (a warning: the constraint is not applied); empty parentheses,
  `:id()`, raise `PDX_PAGE_EMPTY_CONSTRAINT`.
- A `label` that names a function the script does not declare raises `PDX_LABEL_NOT_FOUND`; the
  route is registered without a label.
- `prefetch` follows the rules of `@prefetch` (`PDX_PREFETCH_POLICY`).
- An option key other than the four above is ignored, and two `@page` lines leave the last one's
  paths in place: not checked today.
- A `keepAlive` value other than `true`, `false` or digits is ignored. Not checked today.

#### Examples

```pdx
<template>
  <h1>Ticket {{ id }}</h1>
</template>

<script setup>
@page '/tickets/:id(number)', '/t/:id' { keepAlive: 60000, label: crumb };
import { currentParams } from '@pdxui/router';

const id = $derived(currentParams().id);

function crumb(params) {
  return 'Ticket ' + params.id;
}
</script>
```

```pdx
<template>
  <p>Reports</p>
</template>

<script setup>
@page '/reports' { label: 'Reports', preload };
</script>
```

#### Since

alpha

### @route

#### Syntax

```ebnf
RouteDecl   ::= "@route" S? "{" S? RouteField ( S? ( "," | ";" ) S? RouteField )* S? ( "," | ";" )? S? "}" S? ";"?
RouteField  ::= ( "path" | "guard" | "prefetch" | "transition" | "layout" | "scroll" ) S? ":" S? StringLiteral
              | "loader" S? ":" S? Identifier
              | "keepAlive" S? ":" S? ( "true" | Digits )
              | "preload" S? ":" S? "true"
              | ( "search" | "params" | "meta" ) S? ":" S? ObjectLiteral
```

The analyzer's form: `@route { path: '/users', keepAlive: true }`. The block may span lines.

#### Semantics

`@route` writes the route in one block instead of one declaration per line. Each key sets the field
its own declaration sets: `path` is `@page`'s first path, `guard` is `@guard`, `loader` is `@loader`,
`search` is `@search`'s block, `params` is `@params`'s, `meta` is `@meta { … }`'s, and so on. The
registration is the one `@page` emits.

#### Rules

- The path is checked as `@page`'s is (`PDX_PAGE_INVALID_PATH`, `PDX_PAGE_INVALID_CONSTRAINT`,
  `PDX_PAGE_EMPTY_CONSTRAINT`); `prefetch` as `@prefetch`'s (`PDX_PREFETCH_POLICY`); `loader` as
  `@loader`'s (`PDX_LOADER_NOT_FOUND`).
- The fields of `search` and `params` are checked as `@search`'s and `@params`'s are
  (`PDX_ROUTE_FIELD_INVALID`), and declare the same names: each param, and `searchParams`.
- `search`, `params` and `meta` are read to their own closing brace: a nested object is part of them.
- A key other than those above is ignored — `label`, `alias`, `redirect` and `outlet` have no key —
  and a field declared both here and by its own declaration takes the last one read. Not checked
  today.

#### Examples

```pdx
<template>
  <p>Users</p>
</template>

<script setup>
@route { path: '/users', keepAlive: true }
</script>
```

```pdx
<template>
  <p>{{ count }} users</p>
</template>

<script setup>
@route {
  path: '/admin/users',
  guard: 'users.read',
  loader: loadUsers,
  layout: 'admin',
  transition: 'fade'
}
import { currentLoaderData } from '@pdxui/router';

const count = $derived(((currentLoaderData() ?? []) as string[]).length);

async function loadUsers() {
  return [];
}
</script>
```

#### Since

alpha

## Access and data

### @guard

#### Syntax

```ebnf
GuardDecl ::= "@guard" S StringLiteral S? ";"?
```

The analyzer's form: `@guard 'users.read';`.

#### Semantics

`@guard` registers `guard:'users.read'` on the route, and on each further path of `@page`. Before
entering the route the router asks its guard checker for the permission; the checker
`<pdx-router-outlet>` registers answers with `@pdxui/core`'s `hasPermission(name)()`. Guards run
outermost first along a nested route, and a parent that denies stops the child. A denial renders a
403 in the outlet of the denied level, unless the app sets a guard-fail redirect
(`createRouter({ guardFailRedirect })` or `globalThis.__pdx_guard_redirect`). A guard with no checker
registered denies.

#### Rules

- The permission name is not checked against any list: not checked today.
- A second `@guard` replaces the first. Not checked today.

#### Examples

```pdx
<template>
  <p>Administration</p>
</template>

<script setup>
@page '/admin';
@guard 'admin.users';
</script>
```

#### Since

alpha

### @loader

#### Syntax

```ebnf
LoaderDecl ::= "@loader" S Identifier S? ";"?
```

The analyzer's form: `@loader loadUsers;`.

#### Semantics

`@loader` names a function of the script that loads the route's data before the page renders. The
compiler moves its declaration — `function`, `async function`, or a `const`/`let`/`var` assigned to
it — out of `setup(ctx)` to module scope, and registers the function itself, `loader:loadUsers`. The
router calls it with no argument before mounting the page, outermost level first, and does not call
it again while the level's own params are unchanged. The result is `currentLoaderData()` and the
state (`'loading'`, `'done'`, `'error'`) is `currentLoaderState()`; the compiler imports both from
`@pdxui/router` into the module. Because it runs before the component exists, a loader cannot read
the page's props or signals.

The loader also gets a module of its own, `virtual:pdx-loader/<tag>`: its declaration, the script
imports it reads, its types erased. The route table imports that module, and a navigation starts it
together with the chunk of every level of the match; a level is shown when its loader and its chunk
have both settled (#119). A loader that reads a name the script declares beside it — a constant, a
helper, a rune — is not moved: its module exports `null`, and the route table imports the page to
reach it, as before. A link that prefetches its route under the `hover` or `viewport` policy starts
the loader too, once every guard of the route has allowed it; the result is kept for ten seconds
under the route's pattern, its own params and its query in a canonical order, and a navigation with
the same key takes it instead of calling the loader.

#### Rules

- A name no function of the script declares raises `PDX_LOADER_NOT_FOUND` (a warning); the route is
  registered without a loader.
- A loader that throws sets the state to `'error'` and logs it at run time; nothing is checked at
  compile time.

#### Examples

```pdx
<template>
  <p>{{ user?.name }}</p>
</template>

<script setup>
@page '/users/:id';
@loader loadUser;
import { currentLoaderData, currentParams } from '@pdxui/router';

const user = $derived(currentLoaderData() as { name: string } | undefined);

async function loadUser() {
  const res = await fetch('/api/users/' + currentParams().id);
  return res.json();
}
</script>
```

#### Since

alpha

## How the page renders

### @layout

#### Syntax

```ebnf
LayoutDecl ::= "@layout" S StringLiteral S? ";"?
```

The analyzer's form: `@layout 'admin';`.

#### Semantics

`@layout` names the shell the page renders inside. The name is resolved to a tag at build time:
`@layout 'admin'` is `pdx-admin-layout` (the tag of `admin/_layout.pdx`), or `pdx-admin` when the
resolver knows that tag and not the first. The page's module imports the layout's module, and the
route carries the tag, `layouts:['pdx-admin-layout']`; the outlet keeps a layout mounted while the
next route shares it. A page that declares no layout renders in the app's default
(`pdx({ defaultLayout })`) when there is one; `@layout 'none'` renders in none.

#### Rules

- A name that resolves to no component is still registered: the outlet creates an element no module
  defines. Not checked today.

#### Examples

```pdx
<template>
  <p>Roles</p>
</template>

<script setup>
@page '/admin/roles';
@layout 'admin';
</script>
```

```pdx
<template>
  <p>Sign in</p>
</template>

<script setup>
@page '/login';
@layout 'none';
</script>
```

#### Since

alpha

### @outlet

#### Syntax

```ebnf
OutletDecl ::= "@outlet" S ( "'" [A-Za-z0-9_]+ "'" | '"' [A-Za-z0-9_]+ '"' ) S? "->" S? StringLiteral S? ";"?
```

The analyzer's form: `@outlet 'sidebar' -> 'pdx-nav';`.

#### Semantics

`@outlet` fills a named outlet, a region beside the page at the same URL. Each declaration adds
`{name, tag}` to the route's `outlets`. While the route is matched, `<pdx-router-outlet name="sidebar">`
creates a `pdx-nav` element in itself; on a route that assigns it nothing, it empties.

#### Rules

- The outlet name is one word (`\w+`): a name with a hyphen does not match the declaration and raises
  `PDX_UNKNOWN_DECLARATION`.
- The tag is not imported and not checked: the module that defines it must be loaded by the app. Not
  checked today.

#### Examples

```pdx
<template>
  <p>Inbox</p>
</template>

<script setup>
@page '/inbox';
@outlet 'sidebar' -> 'pdx-inbox-filters';
@outlet 'toolbar' -> 'pdx-inbox-actions';
</script>
```

#### Since

alpha

### @transition

#### Syntax

```ebnf
TransitionDecl ::= "@transition" S StringLiteral S? ";"?
```

The analyzer's form: `@transition 'fade';`. This is the page transition, a line of the script; the
block modifier of `@if` and `@for` is in [template.md](template.md).

#### Semantics

`@transition` registers `transition:'fade'` on the route. The outlet applies it between the page
that leaves and the page that enters, through `@pdxui/core`'s enter and exit classes. The presets are
`fade` (`fade-in`/`fade-out`), `slide-left`, `slide-right`, `slide-up`, `slide-down`, `scale`
(`scale-in`/`scale-out`) and `collapse`; `none` is no transition, and any other name is used as both
the enter and the exit class.

#### Rules

- The name is not checked against the presets: not checked today.

#### Examples

```pdx
<template>
  <p>Details</p>
</template>

<script setup>
@page '/details';
@transition 'slide-left';
</script>
```

#### Since

alpha

### @scroll

#### Syntax

```ebnf
ScrollDecl ::= "@scroll" S ( "'top'" | "'preserve'" | '"top"' | '"preserve"' ) S? ";"?
```

The analyzer's form: `@scroll 'top';`.

#### Semantics

`@scroll` registers `scroll:'top'` or `scroll:'preserve'` on the route, which the router passes to
`restoreScrollPosition` after a navigation. By default Back and Forward restore the offset saved for
the path and a new navigation goes to the URL's `#anchor` or the top. `'top'` enters at the top on
Back too; `'preserve'` restores the saved offset on a forward navigation too. An `#anchor` in the URL
wins over both.

#### Rules

- The analyzer reads any string; a value other than `top` or `preserve` behaves as the default. Not
  checked today.

#### Examples

```pdx
<template>
  <p>Checkout</p>
</template>

<script setup>
@page '/checkout';
@scroll 'top';
</script>
```

#### Since

alpha

### @prefetch

#### Syntax

```ebnf
PrefetchDecl ::= "@prefetch" S ( "'hover'" | "'eager'" | "'viewport'" | "'never'" ) S? ";"?
```

The analyzer's form: `@prefetch 'hover';`. Double quotes are read too.

#### Semantics

`@prefetch` registers `prefetch:'eager'` on the route: when `<pdx-link>` fetches the route's chunk
before a click. `hover`, the router's default, fetches it on hover, focus and pointerdown of a link
to it; `eager` as soon as a link to it is on the page; `viewport` once a link to it scrolls into view;
`never` not before the navigation.

#### Rules

- A policy that is none of the four raises `PDX_PREFETCH_POLICY`, from this declaration and from
  `@page`'s `prefetch` option alike.

#### Examples

```pdx
<template>
  <p>Reports</p>
</template>

<script setup>
@page '/reports';
@prefetch 'eager';
</script>
```

#### Since

alpha

## Other paths

### @alias

#### Syntax

```ebnf
AliasDecl ::= "@alias" S StringLiteral S? ";"?
```

The analyzer's form: `@alias '/old-path';`.

#### Semantics

`@alias` adds a path that renders this page, exactly as a further path of `@page` does: the module
emits a second `__pdx_pushRoute({path, tag, guard})` for it, and the scanned route table gets an
entry for it with the page's other fields.

#### Rules

- The alias path is not checked as `@page`'s is: not checked today.

#### Examples

```pdx
<template>
  <p>People</p>
</template>

<script setup>
@page '/users';
@alias '/people';
</script>
```

#### Since

alpha

### @redirect

#### Syntax

```ebnf
RedirectDecl ::= "@redirect" S StringLiteral ( S? "->" S? StringLiteral )? S? ";"?
```

The analyzer's form: `@redirect '/new-path';`.

#### Semantics

The two forms do different things. `@redirect '/from' -> '/to'` adds an entry to the redirect table,
`globalThis.__pdx_redirects.push({from, to})`: a navigation to `/from` is replaced by one to `/to`
before any route is matched. `@redirect '/target'` registers `redirect:'/target'` on this page's own
route, each of its paths: when the route matches, the router writes `/target` to the address bar and navigates there
instead of rendering the page. A redirect to a target outside the origin is refused at run time.

#### Rules

- Neither path is checked: not checked today.

#### Examples

```pdx
<template>
  <p>Account</p>
</template>

<script setup>
@page '/account';
@redirect '/profile' -> '/account';
@redirect '/settings' -> '/account';
</script>
```

```pdx
<template>
  <p>Moved</p>
</template>

<script setup>
@page '/old-home';
@redirect '/new-path';
</script>
```

#### Since

alpha

## URL values

### @params

#### Syntax

```ebnf
ParamsDecl  ::= "@params" S? "{" S? ParamField ( S? "," S? ParamField )* S? "}" S? ";"?
ParamField  ::= Identifier S? ":" S? Identifier
```

The analyzer's form: `@params { id: number }`. The block may span lines.

#### Semantics

`@params` types the route's params and declares each one as a name the page reads. The route
carries `paramTypes:{id:"number"}`, and the setup reads the `routeParams` context the main
`<pdx-router-outlet>` provides, `const __routeParams = inject('routeParams', ctx.el)`, and declares
one computed per field under the field's own name, `const id = computed(() => Number(__routeParams()?.id ?? 0))`,
before the deriveds and the body. A `number` field is coerced with `Number` (`0` when absent), a
`boolean` field is `=== 'true'`, any other type is the string (`''` when absent). It is read like a
`$derived`: `{{ id }}` in the template, `id` in the script (rewritten to `id()`), and it follows a
navigation that changes the param while the page stays mounted.

#### Rules

- A field that is not `name: type` with a bare type name — a type in quotes, `id: 'number'` —
  raises `PDX_ROUTE_FIELD_INVALID` and is dropped.
- A field that names no param of the path is not checked today; it reads as the default.
- The name is the field's: declaring `const id` beside `@params { id }` declares it twice.

#### Examples

```pdx
<template>
  <p>User {{ id }}, next {{ next }}</p>
</template>

<script setup>
@page '/users/:id';
@params { id: number };

const next = $derived(id + 1);
</script>
```

#### Since

alpha

### @search

#### Syntax

```ebnf
SearchDecl  ::= "@search" S "{" S? SearchField ( S? "," S? SearchField )* S? "}" S? ";"?
SearchField ::= Identifier "?"? S? ":" S? ( "string" | "number" | "boolean" ) ( S? "=" S? Expression )?
```

The analyzer's form: `@search { q?: string, page: number = 1 }`. The block may span lines.

#### Semantics

`@search` types the query string. The setup declares
`const searchParams = computed(() => { const __sp = new URLSearchParams(currentSearch()); … })`,
with `currentSearch` imported from `@pdxui/router`, returning one value per field: a `number` is
`Number(…)` of the value or of the default (`0` without one), a `boolean` is `=== 'true'`, a
`string` is the value, else the default, else `''` — or `null` for an optional field with no
default. When a required `number` field reads as `NaN`, it logs a warning and takes its default.
`searchParams` is declared before the script's own statements and read as a `$derived` is, in the
template and in the script alike: `searchParams.page` is `searchParams().page`. The editor types it
as the object of the fields.

#### Rules

- A field that is not `name: type` with `string`, `number` or `boolean` — a type in quotes, a type
  the block does not coerce — raises `PDX_ROUTE_FIELD_INVALID` and is dropped.
- A default is read up to the next comma, and a string default loses its quotes. Not checked today.

#### Examples

```pdx
<template>
  <p>Results for {{ searchParams.q ?? 'everything' }}, page {{ searchParams.page }}</p>
  <a :href="'?page=' + next">Next page</a>
</template>

<script setup>
@page '/search';
@search { q?: string, page: number = 1, archived: boolean };
const next = $derived(searchParams.page + 1);
</script>
```

#### Since

alpha

### navigation

#### Syntax

```ebnf
NavigationRead ::= "navigation" "." ( "pending" | "to" ) "(" ")"
```

A read, in a template expression or in the script — not a declaration.

#### Semantics

`navigation` is the router's navigation state, from `@pdxui/router`. A component that reads it gets
the import written by the compiler, on both render paths; one that does not read it imports nothing.

- `navigation.pending()` is `true` from the moment the before-hooks (`onBeforeNavigate`) accept a
  navigation until its route is published, or it is refused, denied by a guard, or abandoned. While a
  hook is still deciding — a "leave this page?" on screen — nothing loads, and it is `false`.
- `navigation.to()` is the target of the navigation in progress, query included, and `null` when
  none is. A newer navigation replaces the target; the one it replaced no longer changes either value.

Both are signals: a template or a `$derived` that reads them updates with them.

#### Rules

- The name is the router's only where the component neither declares nor imports a `navigation` of
  its own; one it declares is its own, and nothing is imported.
- In a template, an expression that reads it counts; text that mentions the word does not.
- Without the import the name would be the browser's `window.navigation` (the Navigation API), which
  has neither method.

#### Examples

```pdx
<template>
  @if (navigation.pending()) { <div class="route-progress" role="progressbar"></div> }
  <pdx-router-outlet></pdx-router-outlet>
</template>

<script setup>
</script>
```

#### Since

beta (#149)

## The document head

### @title

#### Syntax

```ebnf
TitleDecl ::= "@title" S Expression S? ";"?
```

The analyzer's form: `@title 'Dashboard';`. A single string literal is a static title; any other
expression — a template literal in backticks, a concatenation, a call — is a reactive one.

#### Semantics

A static title compiles to `useHead({ title: 'Dashboard' })`. A reactive one compiles to
`ctx.track(() => { document.title = … })`, with the script's signals rewritten into reads, so the
title follows them. On a page with `keepAlive` the title is written again in `onShow`.

#### Rules

- A title in quotes is literal: `'Profile of ${name}'` is that text, `${…}` included. Not checked
  today.
- A second `@title` replaces the first. Not checked today.

#### Examples

```pdx
<template>
  <p>Dashboard</p>
</template>

<script setup>
@title 'Dashboard';
</script>
```

```pdx
<template>
  <input :value="person" @input="e => person = e.target.value" />
</template>

<script setup>
let person = $signal('Ada');
@title `Profile of ${person}`;
</script>
```

#### Since

alpha

### @meta

#### Syntax

```ebnf
MetaDecl      ::= HeadMeta | RouteMeta
HeadMeta      ::= "@meta" S ( "property" S )? [A-Za-z0-9_:-]+ S? ":" S? StringLiteral S? ";"?
RouteMeta     ::= "@meta" S "{" ObjectLiteral "}" S? ";"?
ObjectLiteral ::= /* a JSON value written as a JavaScript object literal: unquoted keys, single quotes, trailing commas */
```

The analyzer's form: `@meta description: 'text';`. The property form is
`@meta property og:title: 'text';`.

#### Semantics

Two declarations share the keyword. With a name, `@meta` writes a tag to the document head:
`@meta description: 'text'` compiles to `useHead({ meta: [{ name: "description", content: "text" }] })`
and the `property` form to `{ property: "og:title", content: … }`; all the head `@meta` lines of a
script go into one `useHead` call. With braces, `@meta { requiresAuth: true }` is the route's own
data: it is parsed at build time into JSON and registered as `meta:{"requiresAuth":true}`, and
`currentMeta()` from `@pdxui/router` returns it while the route is matched. Nothing of it reaches the
document.

#### Rules

- A route `@meta` may span lines. A block whose text contains `name:` or `property:` is not read as
  one and raises `PDX_UNKNOWN_DECLARATION`.
- A route `@meta` that is not a JSON value once its keys are quoted — a function, a variable — is
  dropped without a diagnostic. Not checked today.
- A head `@meta` content is a static string. Not checked today.

#### Examples

```pdx
<template>
  <p>Account</p>
</template>

<script setup>
@meta description: 'Control panel for your account.';
@meta property og:title: 'Account';
</script>
```

```pdx
<template>
  <p>Billing</p>
</template>

<script setup>
@page '/billing';
@meta { requiresAuth: true, section: 'account' };
</script>
```

#### Since

alpha

### @head

#### Syntax

```ebnf
HeadDecl  ::= "@head" S? "{" S? HeadField ( S? ( "," | ";" ) S? HeadField )* S? ( "," | ";" )? S? "}" S? ";"?
HeadField ::= "title" S? ":" S? StringLiteral
            | "meta" S? ":" S? "[" S? HeadTag ( S? "," S? HeadTag )* S? ","? S? "]"
HeadTag   ::= "{" S? ( "name" | "property" ) S? ":" S? StringLiteral S? "," S? "content" S? ":" S? StringLiteral S? "}"
```

The analyzer's form: `@head { title: 'Products', meta: [{ name: 'description', content: '…' }] }`.
The block may span lines.

#### Semantics

`@head` declares the title and the head tags in one block. It produces what `@title` with a string
and the named `@meta` lines produce: `useHead({ title: 'Products' })` and
`useHead({ meta: [{ name: "description", content: "…" }] })`.

#### Rules

- The title in `@head` is always static: a template literal or an expression is not read. Not
  checked today.
- A tag with no `content`, or with neither `name` nor `property`, is dropped. Not checked today.

#### Examples

```pdx
<template>
  <p>Products</p>
</template>

<script setup>
@head {
  title: 'Products',
  meta: [{ name: 'description', content: 'Everything we sell' }, { property: 'og:title', content: 'Products' }]
}
</script>
```

#### Since

alpha
