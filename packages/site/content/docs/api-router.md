---
title: Router API
description: "Creating the router, navigation, the current route with its params, query and loader data, guards, the outlet, links and prefetching."
order: 24
parent: api
---

# Router API

Creating the router, navigation, the current route with its params, query and loader data, guards, the outlet, links and prefetching. 27 exports, from `@pdxui/router`.

Part of the [API reference](/docs/api), generated from the source by `packages/site/scripts/gen-api.mjs`.

## `configureRouter`

```ts
import { configureRouter } from '@pdxui/router';

function configureRouter(options?: RouterOptions): void
```

Options the routes cannot carry: a base path, extra redirects, where a denied guard goes.

Merged into the running router. A base path that changes while it is running re-resolves the
current URL, which until then was matched with the old prefix.

## `createRouter`

```ts
import { createRouter } from '@pdxui/router';

function createRouter(routes: RouteConfig[], options?: string | RouterOptions): void
```

Create the router from route configs, and start it: listen for navigations and resolve the URL
the page was opened at.

The matcher is built here, once, from `routes` — `compileMatcher` — so a navigation does no
parsing. A static route is tried before any dynamic one, and among dynamic routes the declared
order holds: matching `/customers/:id` first would let it catch `/customers/import`.

@param routes - Array of route configurations
@param options - Router options or basePath string (backward compat)

## `createRouterFromTable`

```ts
import { createRouterFromTable } from '@pdxui/router';

function createRouterFromTable(table: RouteTable, options?: RouterOptions): void
```

Install a build's route table and start the router on it — what an app with no
`<pdx-router-outlet>` calls. The outlet does the same from `routeTable()`.

## `currentLoaderData`

```ts
import { currentLoaderData } from '@pdxui/router';

const currentLoaderData: ReadonlySignal<unknown>
```

Data returned by the MATCHED route's @loader function. For a parent's, see {@link loaderData}.

## `currentLoaderState`

```ts
import { currentLoaderState } from '@pdxui/router';

const currentLoaderState: ReadonlySignal<LoaderState>
```

Loader execution state of the matched route: idle → pending → success/error.

## `currentMeta`

```ts
import { currentMeta } from '@pdxui/router';

const currentMeta: ReadonlySignal<Record<string, unknown> | undefined>
```

## `currentNavError`

```ts
import { currentNavError } from '@pdxui/router';

const currentNavError: ReadonlySignal<'403' | '404' | null>
```

Last navigation error kind: '403' (guard denied, no redirect), '404' (no match),
or null (last navigation resolved a route). The outlet reads this to pick which
error page to render when currentRoute() is null.

## `currentParams`

```ts
import { currentParams } from '@pdxui/router';

const currentParams: ReadonlySignal<Record<string, string>>
```

## `currentPath`

```ts
import { currentPath } from '@pdxui/router';

const currentPath: ReadonlySignal<string>
```

## `currentQuery`

```ts
import { currentQuery } from '@pdxui/router';

const currentQuery: ReadonlySignal<Record<string, string>>
```

## `currentRoute`

```ts
import { currentRoute } from '@pdxui/router';

const currentRoute: ReadonlySignal<ResolvedRoute | null>
```

## `currentSearch`

```ts
import { currentSearch } from '@pdxui/router';

const currentSearch: ReadonlySignal<string>
```

Raw query string of the current route, including the leading '?' (or '' when none).

## `currentState`

```ts
import { currentState } from '@pdxui/router';

const currentState: ReadonlySignal<Record<string, unknown> | undefined>
```

Navigation state — ephemeral data passed via navigate(), not in the URL.

## `destroyRouter`

```ts
import { destroyRouter } from '@pdxui/router';

function destroyRouter(): void
```

Tear down the active router: removes the popstate/navigation listener.
Call on app teardown or before re-creating the router (HMR). Idempotent.

## `loaderData`

```ts
import { loaderData } from '@pdxui/router';

function loaderData(routePath: string): unknown
```

What a specific level's @loader returned, by its route pattern — `loaderData('/tickets/:id')`.

This is how a child reads its parent's data: the parent loaded the ticket, the child loads one
intervention, and moving between interventions leaves the ticket alone. Reactive: read it in a
computed or a template and it updates when that level reloads.

`undefined` when the level declared no loader, has not loaded yet, failed, or is not in the
current chain at all — a page cannot read the data of a branch it has left.

## `loaderState`

```ts
import { loaderState } from '@pdxui/router';

function loaderState(routePath: string): LoaderState
```

The same, for the state. 'idle' for a level that is not loading and has nothing.

## `navigate`

```ts
import { navigate } from '@pdxui/router';

function navigate(path: string, params?: Record<string, string>, state?: Record<string, unknown>): void
```

Navigate programmatically.
@param path — route path (can include :param placeholders)
@param params — URL path params to replace :param segments
@param state — ephemeral navigation state (not in URL, accessible via currentState)

## `navigation`

```ts
import { navigation } from '@pdxui/router';

const navigation: {
    readonly pending: ReadonlySignal<boolean>;
    readonly to: ReadonlySignal<string | null>;
}
```

The navigation in progress, for a progress bar or a dimmed page while chunks and data load:
`@if (navigation.pending()) { … }`. Auto-imported in a `.pdx` that reads it.

`pending()` is true from the moment the before-hooks accept a navigation — not while one of them
is still asking "leave this page?" — until its route is published, or it is refused, denied or
abandoned. `to()` is its target, query included, while pending; a newer navigation replaces it.

## `onAfterNavigate`

```ts
import { onAfterNavigate } from '@pdxui/router';

function onAfterNavigate(hook: AfterNavigateHook): () => void
```

## `onBeforeNavigate`

```ts
import { onBeforeNavigate } from '@pdxui/router';

function onBeforeNavigate(hook: BeforeNavigateHook): () => void
```

## `PdxLink`

```ts
import { PdxLink } from '@pdxui/router';

PdxLink
```

## `PdxRouterOutlet`

```ts
import { PdxRouterOutlet } from '@pdxui/router';

PdxRouterOutlet
```

## `prefetchRoute`

```ts
import { prefetchRoute } from '@pdxui/router';

function prefetchRoute(url: string | null | undefined): boolean
```

Queue a fetch of the chunk this URL will need, if there is one and it is wanted.

Returns whether a fetch was QUEUED, which is what a test can assert on; a caller has nothing to
do with the answer. Failure is swallowed on purpose: a prefetch that cannot reach the network is
a click that will load normally, not an error the visitor should be shown — the outlet reports
the real one when the navigation happens.

## `registerGuardChecker`

```ts
import { registerGuardChecker } from '@pdxui/router';

function registerGuardChecker(checker: GuardChecker): void
```

Register a guard checker. Called with the guard name from @guard declarations.

## `routeParams`

```ts
import { routeParams } from '@pdxui/router';

const routeParams
```

Signal for current route params — provided to descendants via Context Protocol.

## `setQuery`

```ts
import { setQuery } from '@pdxui/router';

function setQuery(params: Record<string, string>): void
```

Set the entire query string reactively. Updates URL + signal.

## `setQueryParam`

```ts
import { setQueryParam } from '@pdxui/router';

function setQueryParam(key: string, value: string | null): void
```

Set or remove a single query param. Pass null to remove.
