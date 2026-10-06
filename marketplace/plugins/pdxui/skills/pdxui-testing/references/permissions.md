<!-- Copied from packages/site/content/docs/permissions.md by gen-topics.mjs: edit it there. -->

# Identity & Permissions

Two halves of the same job. **Identity** is who is signed in and what proves it; **permissions** are
what that person may do. PDX ships a piece for each, and one line joins them:

```
login → setTokens() → user → setPermissions(from that user) → hasPermission / @guard → expiry → clear()
```

## Who the user is: `createAuthStore`

The store owns the tokens, the decoded user and the reactive `isAuthenticated` flag. It deliberately
does **not** own your login flow — you run OIDC, or a password POST, or whatever your backend wants,
and hand it the tokens:

```ts
import { createAuthStore } from '@pdxui/core';

export const auth = createAuthStore<{ sub: string; name: string; roles: string[] }>({
  storageKey: 'app.auth',                 // persists across reloads; omit to stay in memory
  decodeUser: (claims) => ({
    sub: claims.sub as string,
    name: claims.name as string,
    roles: (claims.realm_access as { roles: string[] })?.roles ?? [],
  }),
});

// after your own login call returns
auth.setTokens({ access, refresh });
```

`decodeUser` maps the **JWT claims** — the store decodes the access token itself — into your own user
shape. Without it you get the raw claims.

| | |
| --- | --- |
| `auth.user()` | the decoded user, or `null` |
| `auth.isAuthenticated()` | reactive: a non-expired access token is present |
| `auth.getToken()` | the raw access token, or `null` |
| `auth.authFetch(url, init?)` | `fetch` with `Authorization: Bearer …` attached |
| `auth.clear()` | sign out |

Four things worth knowing before you build on it:

- **`storageKey` is a trade, not a default.** With it the session survives a reload; the tokens sit in
  `localStorage`, with the XSS exposure that implies. Without it, every refresh is a new login.
- **`authFetch` only sends the token to trusted origins** — the same origin, plus anything you list in
  `allowedOrigins`. A bearer token appended to a URL that came from data is how a credential ends up
  on someone else's server, so this one is not configurable away by accident.
- **Expiry flips by itself.** A timer armed on the token's `exp` makes `isAuthenticated` go false when
  it lapses, rather than waiting for the next read to notice.
- **Refreshing is yours.** The store *keeps* the refresh token; it never spends it. When
  `isAuthenticated` goes false, call your token endpoint and `setTokens()` again.

For requests, join it to the HTTP client once at startup, instead of reading storage by hand:

```ts
configureClient({
  baseUrl: '/api',
  middleware: [authMiddleware({ getToken: () => auth.getToken() })],
});
```

## Tell PDX who can do what

Call `setPermissions` once at startup with either a flat list of granted permissions, or a function
that decides per key:

```ts
import { setPermissions } from '@pdxui/core';

// Simplest: a static allow-list
setPermissions(['users.read', 'users.write', 'billing.read']);
```

To drive it from the signed-in user, re-run it whenever that user changes — the two are not wired
together for you, and this `effect` is the wire:

```ts
import { effect, setPermissions } from '@pdxui/core';

effect(() => {
  const user = auth.user();
  if (!user) { setPermissions([]); return; }
  setPermissions((key) => user.roles.includes('admin') || user.roles.includes(key));
});
```

Calling `setPermissions` again — on login, on logout, on token refresh — re-runs every active check,
and the UI follows.

## Gate UI: `requirePermission` and `hasPermission`

`hasPermission(key)` returns a **reactive signal** you can read anywhere:

```pdx
@if (canEdit()) {
  <pdx-button @click="save">Save</pdx-button>
}
```
```ts
const canEdit = hasPermission('users.write');
```

`requirePermission(key, then, else?)` renders one subtree or the other — handy in the template via
the compiler, or directly in render code:

```ts
import { requirePermission, html } from '@pdxui/core';

requirePermission('billing.read',
  () => html`<pdx-invoice-list />`,
  () => html`<p class="muted">You don't have access to billing.</p>`,
);
```

## Gate routes: `@guard`

A page can declare the permission it needs, and the router checks it before activating the route:

```pdx
@page '/admin/users';
@guard 'users.read';
```

If the check fails the route isn't entered (configure where it redirects in your router setup).

**Who answers the check.** `<pdx-router-outlet>` registers the bridge to `hasPermission` when it
mounts, so an app that renders the outlet needs no wiring. An app that drives `createRouter()`
itself must call `registerGuardChecker()`, or every guarded route is **denied**: a guard nobody can
evaluate fails closed, never open, and the router warns once naming what to call.

## What survives a reload

The tokens, if you gave the store a `storageKey` — nothing else. On the next load the store reads
them back, decodes the user from the access token again, and arms the expiry timer. **Permissions do
not come back with them**: `setPermissions` is in-memory app state, so the `effect` above has to run
on startup as well, which it does by virtue of being an effect over `auth.user()`.

If the stored token is already past its `exp`, `isAuthenticated` is false from the first read and
`user()` is still the decoded one — check the flag, not the user, before deciding someone is signed
in.

## Gotchas

- **Checks are reactive, not snapshots.** Read `hasPermission(x)()` inside a template/effect and it
  re-evaluates when permissions change. Don't cache the boolean in a plain variable.
- **`setPermissions` is global.** It's app-wide state, not per-component — call it once (and again on
  auth changes), not inside every component.
- Permissions are a **UI affordance**, not security. Always enforce on the server too; the client
  check just decides what to render.
