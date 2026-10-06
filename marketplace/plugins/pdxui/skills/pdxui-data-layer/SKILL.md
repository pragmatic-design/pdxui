---
name: pdxui-data-layer
description: "PDX (@pdxui) data and state: @fetch with cache and invalidation, mutations and optimistic writes, HttpClient middleware, offline, files, export, server pushes, long lists, @store, and provide/inject between components. Use when a .pdx app loads, writes or shares data."
---

# PDX · Data layer and shared state

Loading and writing data, and getting state from one component to another. The components that
show data (grid, list, select, chart) are in `pdxui-data` and `pdxui-inputs`; the `DataSource` they
read is `pdx-data-source`'s page in `pdxui-data`, which lists every component that takes one.

## Decide

| You want… | Use | Read |
| --- | --- | --- |
| data from a URL, in a page | `@fetch name: 'GET /url'` → `name.loading/error/data` | [data](references/data.md) |
| it to re-run when state changes | put the signal in the URL: `` `GET /users/${id}` `` | [data](references/data.md) § Reactive params |
| no duplicate requests | `staleTime` + `tags` | [data](references/data.md) § Cache |
| lists to refresh after a write | `mutate(…, { invalidates: [...] })` | [data](references/data.md) § Mutations |
| rows for a grid, a list or a select | `createDataSource(rows)` or `createDataSource({ transport })` | [data](references/data.md) § In practice |
| a socket message to update a row | `applyServerChange`, not `refresh()` | [data](references/data.md) § Live data |
| state shared by many components, or kept across navigation | `@store` | [store](references/store.md) |
| state that depends on where you are in the tree | `provide` / `inject` | [provide-inject](references/provide-inject.md) |
| a parent that gives orders, or two-way talk | `createCommands` · `createChannel` | [provide-inject](references/provide-inject.md) |

## Traps

- **Not everything is a store.** State that lives and dies with a component is a `$signal`; `@store`
  is for what several components share or what must survive navigation. ([store](references/store.md) § Store or signal?)
- **provide/inject is tree-scoped.** A consumer finds the *nearest* provider above it; a key that
  collides resolves silently to the nearer one, so namespace keys (`'cart'`, `'form:ctx'`).
  ([provide-inject](references/provide-inject.md) § Gotchas)
- **Provide during setup, not from a callback.** A provide from an async callback that resolves after
  the children mounted is seen by nobody. (same section)
- **A portal breaks the line.** Portalled content resolves inject where it lands, not where it was
  written. (same section)

## References

Copies of the site's docs pages, regenerated with them: [data](references/data.md) ·
[store](references/store.md) · [provide-inject](references/provide-inject.md).
