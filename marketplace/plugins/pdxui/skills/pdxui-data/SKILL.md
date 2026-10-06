---
name: pdxui-data
description: "PDX (@pdxui/ui) data components — data-grid, entity-grid (CRUD-wired), bulk-actions, data-source, filter-builder, chart, sparkline, list, sortable-list, tree, statistic, timeline, calendar, empty-state — with props and events. Use when showing records, a grid, a chart or a tree in a .pdx app."
---

# UI · Data display & data-bound

> Grids, charts, lists and data sources.  (17 components)  ·  catalogue generated from the library's custom-elements manifest.
> Cross-cutting playbook, recipes and gotchas: the **`pdxui`** skill.
> **Names.** Bind a prop by its kebab-case name, `:max-height="620"`, `:empty-title="t"`: the component
> receives the camelCase prop (`maxHeight`). In a `.pdx` template the camelCase form, `:maxHeight`, compiles
> to the same binding. **Attr** is the HTML attribute for a static value — `maxheight`, and `max-height` too.

## Components

Each page has the props, events, slots and API, the notes, and the examples of the component's demo.

- [`<pdx-bulk-actions>`](references/pdx-bulk-actions.md) — An action bar for the current selection.
- [`<pdx-calendar>`](references/pdx-calendar.md) — A month calendar surface.
- [`<pdx-chart>`](references/pdx-chart.md) — Charts from your data.
- [`<pdx-data-grid>`](references/pdx-data-grid.md) — Sortable, filterable, virtual data table.
- [`<pdx-data-source>`](references/pdx-data-source.md) — One reactive source of rows for grids, lists, selects, charts and forms.
- [`<pdx-description-list>`](references/pdx-description-list.md) — Key/value pairs, neatly aligned.
- [`<pdx-empty-state>`](references/pdx-empty-state.md) — A friendly “nothing here yet”.
- [`<pdx-entity-grid>`](references/pdx-entity-grid.md) — A CRUD grid: create, edit, delete, bulk.
- [`<pdx-filter-builder>`](references/pdx-filter-builder.md) — Build complex filters visually.
- [`<pdx-infinite-scroll>`](references/pdx-infinite-scroll.md) — Load more as you scroll.
- [`<pdx-list>`](references/pdx-list.md) — Data-driven list with custom rows.
- [`<pdx-relative-time>`](references/pdx-relative-time.md) — Auto-updating “3 days ago”.
- [`<pdx-sortable-list>`](references/pdx-sortable-list.md) — A list the user can put in another order, by dragging a row's handle or from the keyboard alone.

It emits `pdx-reorder` with the indices and never writes to `items`: the application applies the
move, so the array it owns stays the one source of truth.
- [`<pdx-sparkline>`](references/pdx-sparkline.md) — A tiny inline trend chart.
- [`<pdx-statistic>`](references/pdx-statistic.md) — A big number with label and trend.
- [`<pdx-timeline>`](references/pdx-timeline.md) — A vertical sequence of events.
- [`<pdx-tree>`](references/pdx-tree.md) — A hierarchy the user navigates.
