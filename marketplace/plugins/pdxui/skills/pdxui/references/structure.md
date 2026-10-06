# Breaking a screen into pieces

Asked for behaviour, an agent delivers behaviour: routes of 200 lines and more, no `src/components/`
at all, and a header assembled by hand while `pdx-page-header` exists.

The one recipe that says "do not hand-write screens" opens with *"an app with DOZENS of entities"*, so
it does not cover the ordinary case. This page does.

## When to extract, and when not to

The rules are in [`component-design.md`](component-design.md): where a component's edge goes (CD-B1–B3),
who owns each piece of state, how logic is shared, what an API looks like, where loading, effects and
styles go. This page is *where the pieces live* and *what already exists*.

Signals that send you there:
- a route over ~150 lines: look for the seam. There usually is one, and it is usually the list row,
  the toolbar or the form;
- a piece you would describe with "and" ("the header **and** the filters"): two pieces;
- the same markup copied a third time.

## Where the pieces live

```
src/
├── app-shell.pdx          the chrome: layout regions + <pdx-router-outlet>
├── routes/                one @page each — thin: fetch, wire, compose
├── components/            this project's own .pdx pieces
├── lib/                   plain .js/.ts: the backend, the domain, formatting
└── styles/app.css         global CSS (see the warning below)
```

A `.pdx` anywhere under `src/` is registered automatically, and its tag comes from the filename:
`src/components/job-row.pdx` → `<pdx-job-row>`. Nothing to declare, nothing to import — use the tag
and the compiler adds the import.

**Routes stay thin.** A route loads what the screen needs and composes; the pieces know how to render
themselves. When a route has more markup than wiring, the markup wants to be somewhere else.

## Two kinds of piece, and the difference matters

**A component with props and events** — the default. Give it `@prop`s, let it `@event` outwards, and
keep the state in the route. This is what you want most of the time.

```html
<!-- src/components/job-row.pdx -->
<template>
  <div class="job-row" @click="open()">
    <strong>{{ customer }}</strong>
    <pdx-badge :tone="tone()">{{ status }}</pdx-badge>
  </div>
</template>

<script setup>
@prop customer: string = '';
@prop status: string = 'aperto';
@event selected: string;

const tone = $derived(status === 'chiuso' ? 'neutral' : 'primary');
function open() { selected(customer); }
</script>
```

**A markup partial driven by a service** — the exception, not the default (CD-A1): for pieces wired imperatively (a bulk bar over a grid's
selection, an edit fly-out). The partial is pure markup with `data-*` hooks; a plain `.ts` in `lib/`
finds it in `onMount` and wires the behaviour. Use it when a component's own events are awkward to
plumb, not as a default.

⚠️ **A partial's CSS must be GLOBAL.** `<style scoped>` does not cross the route↔partial boundary, and
neither does it reach DOM a component creates at runtime (a data-grid cell built by `cell:`). Put
those classes in `styles/app.css`, imported once.

## What already exists, so you do not build it

Before writing a piece, check whether the library has it. A hand-built page heading is the usual
miss: `pdx-page-header` is one.

| you were about to build | it exists |
|---|---|
| a title + breadcrumb + actions bar | `pdx-page-header` (layout) |
| a bar that appears when rows are selected | `pdx-bulk-actions` (data) |
| a drawer with a form for create/edit | `pdx-edit-drawer` (overlay) |
| a picker over another entity's rows | `pdx-relation-picker` (overlay) |
| a grid wired to CRUD | `pdx-entity-grid` (data) |
| a form for a nested object | `pdx-json-editor` (forms) |

And when the app has many entities that behave alike, stop composing by hand and go to the descriptor
recipe in `recipes.md` — one descriptor per entity, `createCrud` / `createDetail` render the screens.

## The check that tells you whether it worked

Not the line count. **One definition**: the thing shown in three places has one source, and changing
it changes all three. If you have to edit three files to change one label, the extraction did not
happen — whatever the folder structure looks like.
