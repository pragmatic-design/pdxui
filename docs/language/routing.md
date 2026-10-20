# Routing

The declarations that make a component a page and describe its route: the path, who may enter, the
data it loads first, the frame it renders in, how it arrives, the other paths that lead to it, the
URL values it reads, and what it writes into the document head. Each is a line of the script
([script.md](script.md)) that starts with its keyword, and each is read by the script analyzer on
that line alone, unless the section says it reads a block. A route declaration does nothing on a
component without a `@page`: the route fields are emitted only with the registration that `@page`
produces. The head declarations (`@title`, `@meta`) work on any component.

`@page` is the one home of every route field (#277): its further paths and its options carry what
`@route { … }`, `@alias`, `@prefetch`, the script's `@transition` and `@meta { … }` carried in the
alpha, and `@head { … }` is `@title` and `@meta`. Those six are removed forms, `PDX_REMOVED_FORM`,
and `pdx migrate` rewrites each ([overview.md](overview.md#removed-forms-and-browser-targets)).

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
               | "prefetch" S? ":" S? ( "'hover'" | "'eager'" | "'viewport'" | "'never'" )
               | "label" S? ":" S? ( StringLiteral | Identifier | "$t(" S? StringLiteral S? ")" )
               | "transition" S? ":" S? StringLiteral
               | "meta" S? ":" S? ObjectLiteral
ObjectLiteral ::= /* a JSON value written as a JavaScript object literal: unquoted keys, single quotes, trailing commas */
```

The analyzer's form: `@page '/users', '/people' { prefetch: 'hover', transition: 'fade', meta: { requiresAuth: true } };`.
The options block may span lines, and `meta` is read to its own closing brace.

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
- `prefetch` registers `prefetch:'eager'` on the route: when `<pdx-link>` fetches the route's chunk
  before a click. `hover`, the router's default, fetches it on hover, focus and pointerdown of a link
  to it; `eager` as soon as a link to it is on the page; `viewport` once a link to it scrolls into
  view; `never` not before the navigation. Under `hover` and `viewport` the route's loader starts too
  (see `@loader`).
- `transition` registers `transition:'fade'` on the route. The outlet applies it between the page
  that leaves and the page that enters, through `@pdxui/core`'s enter and exit classes. The presets
  are `fade` (`fade-in`/`fade-out`), `slide-left`, `slide-right`, `slide-up`, `slide-down`, `scale`
  (`scale-in`/`scale-out`) and `collapse`; `none` is no transition, and any other name is used as both
  the enter and the exit class. The block modifier `@transition` of `@if` and `@for` is another
  construct, in [template.md](template.md).
- `meta` is the route's own data: parsed at build time into JSON and registered as
  `meta:{"requiresAuth":true}`; `currentMeta()` from `@pdxui/router` returns it while the route is
  matched. Nothing of it reaches the document.
- `label` names the route in the breadcrumb that `<pdx-breadcrumb>` builds with no `items`. A string
  is the crumb, and a `:param` in it is replaced by the param's value. An identifier names a function
  of the script, which is moved to module scope (as `@loader`'s is) and registered by reference,
  `label:crumb`; it is called with the route's params. `$t('key')` registers `labelKey:'key'`, which
  the router translates with the route's params.

#### Rules

- A path that does not start with `/` raises `PDX_PAGE_INVALID_PATH`. Every path is checked.
- A param constraint that is not `string`, `number`, `uuid` or `slug` raises
  `PDX_PAGE_INVALID_CONSTRAINT` (a warning: the constraint is not applied); empty parentheses,
  `:id()`, raise `PDX_PAGE_EMPTY_CONSTRAINT`.
- A `label` that names a function the script does not declare raises `PDX_LABEL_NOT_FOUND`; the
  route is registered without a label.
- A `prefetch` policy that is none of the four raises `PDX_PREFETCH_POLICY`.
- An option other than the six above raises `PDX_PAGE_UNKNOWN_OPTION`: a guard, a loader or a layout
  is a declaration of its own.
- Two `@page` lines leave the last one's paths in place: not checked today.
- A `keepAlive` value other than `true`, `false` or digits is ignored, and a `meta` that is not a JSON
  value once its keys are quoted — a function, a variable — is dropped. Not checked today.
- The `transition` name is not checked against the presets: not checked today.

#### Examples

```pdx
<template>
  <h1>Ticket {{ id }}</h1>
</template>

<script>
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

<script>
@page '/reports' { label: 'Reports', preload };
</script>
```

```pdx
<template>
  <p>Users</p>
</template>

<script>
@page '/users', '/people' { prefetch: 'hover', transition: 'fade', meta: { requiresAuth: true } };
</script>
```

#### Since

alpha; `transition` and `meta` as options, beta (#277)

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

<script>
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

<script>
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

<script>
@page '/admin/roles';
@layout 'admin';
</script>
```

```pdx
<template>
  <p>Sign in</p>
</template>

<script>
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

<script>
@page '/inbox';
@outlet 'sidebar' -> 'pdx-inbox-filters';
@outlet 'toolbar' -> 'pdx-inbox-actions';
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

<script>
@page '/checkout';
@scroll 'top';
</script>
```

#### Since

alpha

## Other paths

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

<script>
@page '/account';
@redirect '/profile' -> '/account';
@redirect '/settings' -> '/account';
</script>
```

```pdx
<template>
  <p>Moved</p>
</template>

<script>
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
carries `paramTypes:{id:"number"}`, and the setup reads the params the main `<pdx-router-outlet>`
provides under the router's `RouteParams` token (#495), imported for it,
`const __routeParams = inject(RouteParams, ctx.el, null) ?? (() => ({}))` — empty outside an outlet — and declares
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

<script>
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

<script>
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

<script>
</script>
```

#### Since

beta (#149)

### navigate, navigate.url, and typed routes

#### Syntax

```ebnf
NavigateCall ::= "navigate" "(" Path ( "," Expression ( "," Expression )? )? ")"
               | "navigate.url" "(" Expression ( "," Expression )? ")"
```

A call from `@pdxui/router`, imported where it is used. `<pdx-link to="…" :params="…">` is the same
call, made on a click.

#### Semantics

`navigate(pattern, params, state)` fills the pattern's `:param` placeholders from `params`, each
value URL-encoded, and navigates there; `state` travels with the history entry, not in the URL.
`navigate.url(url, state)` navigates to a concrete URL, query and hash included. Both refuse a target
outside the origin.

The build, and the dev server whenever a page is saved or added, write `.pdx/routes.d.ts` under the
app's root from the scanned `@page` patterns (#150). It augments `@pdxui/router`'s `RouteRegistry`
with one key per pattern, written without its constraints (`/users/:id`), and that pattern's params
typed from them: `:id(number)` is a `number`; every other constraint, and no constraint, a `string`.
With the file in the program — the editor and `pdx check --types` read it, and a `.ts` module reads
it when the app's tsconfig includes `.pdx` — the calls are typed:

- the path of `navigate()` is one of the keys, and its params are required when the pattern has any;
- a concrete URL is `navigate.url()`: `navigate('/users/42')` is a type error;
- `<pdx-link>` with a literal `to` is checked as `navigate(to, params)`; a computed `:to` is a URL,
  which nothing types.

Without the file every path is a string and every param a string or a number, as before.
`<pdx-link :params="{ id: u.id }">` points at the filled URL: its `href`, its click and its active
state.

#### Rules

- A pattern with a `*` has no key: a URL into it goes through `navigate.url()`.
- The file is generated: it is rewritten when a route changes, and belongs in `.gitignore`.
- `pdx migrate` rewrites `navigate('<literal>')` to `navigate.url('<literal>')` when the literal is
  not one of the project's patterns, and flags a call whose path is not a literal, or a URL passed
  with more arguments. A file that declares a `navigate` of its own is left alone.

#### Examples

```pdx
<template>
  <pdx-link to="/users/:id" :params="{ id: user.id }">{{ user.name }}</pdx-link>
  <button @click="openNext()">Next</button>
</template>

<script>
import { navigate } from '@pdxui/router';
const user = { id: 41, name: 'Ada' };
function openNext() { navigate('/users/:id', { id: user.id + 1 }); }
function openSearch(q: string) { navigate.url(`/search?q=${encodeURIComponent(q)}`); }
</script>
```

#### Since

beta (#150)

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

<script>
@title 'Dashboard';
</script>
```

```pdx
<template>
  <input :value="person" @input="e => person = e.target.value" />
</template>

<script>
let person = $signal('Ada');
@title `Profile of ${person}`;
</script>
```

#### Since

alpha

### @meta

#### Syntax

```ebnf
MetaDecl ::= "@meta" S ( "property" S )? [A-Za-z0-9_:-]+ S? ":" S? StringLiteral S? ";"?
```

The analyzer's form: `@meta description: 'text';`. The property form is
`@meta property og:title: 'text';`.

#### Semantics

`@meta` writes a tag to the document head: `@meta description: 'text'` compiles to
`useHead({ meta: [{ name: "description", content: "text" }] })` and the `property` form to
`{ property: "og:title", content: … }`; all the `@meta` lines of a script go into one `useHead` call.
Route data, which the alpha also wrote with this keyword (`@meta { … }`), is `@page`'s `meta` option.

#### Rules

- `@meta { … }` is a removed form, `PDX_REMOVED_FORM`: `pdx migrate` moves the block into `@page`'s
  `meta` option.
- A `@meta` content is a static string. Not checked today.

#### Examples

```pdx
<template>
  <p>Account</p>
</template>

<script>
@meta description: 'Control panel for your account.';
@meta property og:title: 'Account';
</script>
```

#### Since

alpha; head tags only, beta (#277)
