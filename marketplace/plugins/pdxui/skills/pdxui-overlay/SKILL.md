---
name: pdxui-overlay
description: "PDX (@pdxui/ui) overlay and feedback components — dialog, alert-dialog, drawer, edit-drawer, relation-picker, bottom-sheet, popover, tooltip, toast, banner, block-ui — with props and events. Use when showing a dialog, drawer, popover, toast or loading overlay in a .pdx app."
---

# UI · Overlay & feedback

> Dialog, drawer, popover, toast, banner.  (12 components)  ·  catalogue generated from the library's custom-elements manifest.
> Cross-cutting playbook, recipes and gotchas: the **`pdxui`** skill.
> **Names.** Bind a prop by its kebab-case name, `:max-height="620"`, `:empty-title="t"`: the component
> receives the camelCase prop (`maxHeight`). In a `.pdx` template the camelCase form, `:maxHeight`, compiles
> to the same binding. **Attr** is the HTML attribute for a static value — `maxheight`, and `max-height` too.

## Components

Each page has the props, events, slots and API, the notes, and the examples of the component's demo.

- [`<pdx-alert-dialog>`](references/pdx-alert-dialog.md) — A confirm / cancel modal.
- [`<pdx-banner>`](references/pdx-banner.md) — A persistent inline message.
- [`<pdx-block-ui>`](references/pdx-block-ui.md) — Block a region while it’s busy.
- [`<pdx-bottom-sheet>`](references/pdx-bottom-sheet.md) — A panel that rises from the bottom.
- [`<pdx-dialog>`](references/pdx-dialog.md) — A modal window with focus trap.
- [`<pdx-drawer>`](references/pdx-drawer.md) — A panel that slides in from an edge.
- [`<pdx-edit-drawer>`](references/pdx-edit-drawer.md) — A drawer holding a schema-driven form.
- [`<pdx-overlay-outlet>`](references/pdx-overlay-outlet.md) — A mount point for overlays.
- [`<pdx-popover>`](references/pdx-popover.md) — Floating content anchored to a trigger.
- [`<pdx-relation-picker>`](references/pdx-relation-picker.md) — Pick existing rows for a relation.
- [`<pdx-toast>`](references/pdx-toast.md) — Transient, stacked notifications.
- [`<pdx-tooltip>`](references/pdx-tooltip.md) — A hint on hover or focus.
