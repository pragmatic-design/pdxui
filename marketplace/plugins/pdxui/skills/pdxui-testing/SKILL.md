---
name: pdxui-testing
description: "PDX (@pdxui) testing and permissions: mount, queries, tick and events from @pdxui/core/testing, contract tests; who the user is (createAuthStore), setPermissions, gating UI and routes, what survives a reload. Use when testing .pdx components or gating a .pdx app by permission."
---

# PDX · Testing, identity and permissions

Two pages that an app reaches for once it works: how to test its components, and how to decide
what a user may see.

## Decide

| You want… | Use | Read |
| --- | --- | --- |
| a unit test of a component | `mount` → query → act → `await tick()` → assert | [testing](references/testing.md) § The base pattern |
| to find elements the way a user does | `getByRole`, `getByText`, … | [testing](references/testing.md) § Finding things |
| the signed-in user and their tokens | `createAuthStore` | [permissions](references/permissions.md) § Who the user is |
| to hide a button or a section | `requirePermission` · `hasPermission` | [permissions](references/permissions.md) § Gate UI |
| to protect a route | `@guard 'permission'` (`pdxui-routing`) | [permissions](references/permissions.md) § Gate routes |

## Traps

- **`mount` takes markup and is async.** A prop is an attribute in the markup, a non-primitive one is
  set on the element afterwards; forget the `await` and you query a `Promise`.
  ([testing](references/testing.md) § The base pattern)
- **`await tick()` before asserting**: it waits for the reactive flush, and is what separates a
  reliable test from a flaky one. (same section)
- **Permissions do not survive a reload.** Stored tokens do; `setPermissions` is in-memory, so set it
  from an effect over the user, which runs on startup too. ([permissions](references/permissions.md) § What survives a reload)
- **Checks are reactive, and not security.** Read `hasPermission(x)()` in a template or effect, never
  a cached boolean; enforce on the server too. ([permissions](references/permissions.md) § Gotchas)

## References

Copies of the site's docs pages, regenerated with them: [testing](references/testing.md) ·
[permissions](references/permissions.md).
