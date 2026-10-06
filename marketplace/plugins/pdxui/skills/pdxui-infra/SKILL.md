---
name: pdxui-infra
description: "PDX (@pdxui/ui) infrastructure components — pdx-provide (a DI/context provider) and pdx-error-boundary — with props and events. Use when wiring the plumbing of a .pdx app."
---

# UI · Infrastructure

> Provider, error boundary, plumbing.  (2 components)  ·  catalogue generated from the library's custom-elements manifest.
> Cross-cutting playbook, recipes and gotchas: the **`pdxui`** skill.
> **Names.** Bind a prop by its kebab-case name, `:max-height="620"`, `:empty-title="t"`: the component
> receives the camelCase prop (`maxHeight`). In a `.pdx` template the camelCase form, `:maxHeight`, compiles
> to the same binding. **Attr** is the HTML attribute for a static value — `maxheight`, and `max-height` too.

## Components

Each page has the props, events, slots and API, the notes, and the examples of the component's demo.

- [`<pdx-error-boundary>`](references/pdx-error-boundary.md) — Catch and recover from render errors.
- [`<pdx-provide>`](references/pdx-provide.md) — Provide context to a subtree.
