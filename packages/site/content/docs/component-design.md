---
title: Component Design
description: "How to cut an app into components: where a component's edge goes, who owns each piece of state, how logic is shared, what an API looks like, where loading, effects and styles go — and the anti-patterns, with how to recognise each."
order: 13.7
---

# Component Design

The other pages say what each piece of PDX does. This one says how to put them together so an app
stays readable as it grows: where one component ends and the next begins, who owns a piece of state,
when logic becomes a [composable](/docs/composables), and which mechanism two components use to talk
([Component Communication](/docs/provide-inject)).

The rules draw on the published guidance of React, Vue, Angular, Svelte and Lit, restated for PDX's
own mechanisms. Each has an id (`CD-B1` …), the same one the PDX skill uses and the one a review
comment can name. The "before" excerpts come from the PDX showcase application.

The rules a tool can decide from one file run on every compile and on `pdx check` — a write to a
`$derived`, a document query that reaches past the component. The ones that are questions for a
reviewer — a file that holds several pieces, a colour written as a value, logic copied across pages —
run with **`pdx check --design`**: `pdx check` is the gate, `pdx check --design` is the review.
Each finding carries its `category`, `defect` or `design`, in `--json`.

> **Lines are a symptom, not the rule.** None of those frameworks sets a size limit, and a long file
> with one job is fine. What matters is *how many independent things a file does*, and *how many
> files do the same thing*.

## Where a component's edge goes

### CD-B1 — A piece with its own state, its own markup and its own reason to change is a component

Give it a file under `src/`, with `@prop` and `@event` as its API. The tag comes from the file name.
Being used only once does not keep it inline: a panel with signals of its own changes on its own
schedule, so it lives in its own file.

**Recognise it:** section comments that each open with their own `$signal`s.

```js
// before — one file, five pieces (condensed: one line per section)
// ── The rail ──           let side = $signal('expanded'); let menuOpen = $signal(false);
// ── The catalogue ──      let catalogOpen = $signal(false); let catalogQuery = $signal('');
// ── Favourites ──         let pins = $signal(readPins());
// ── The profile menu ──   let profileOpen = $signal(false);
```

**After:** `rail.pdx`, `catalog.pdx`, `profile-menu.pdx`. The parent keeps only what they share,
such as which panel is open for the Escape order, and passes it down. What two pieces both read is
exactly what stays in the parent.

### CD-B2 — A route composes; it does not render the details of what it composes

An `@page` loads what the screen needs, holds what its pieces share, and places them. A route whose
template is a stack of fieldsets or wizard steps, with no component among them, is rendering rather
than composing.

**A form's field groups are sections.** `<pdx-form :form>` wires every `<pdx-form-field
name="x">` and its named control at compile time. A group of fields moved into its own component
keeps that wiring when its script calls [`tryUseForm()`](/docs/forms): the call declares it a section
of the form above it, and the compiler wires its template to that form. The route keeps the form and
what the sections share; each section is a component.

### CD-B3 — Do not extract what has no life of its own

Five lines of markup, used once, with no state and no events: leave them inline. A component per
`div` gets props nobody needed, and the second use then does not fit them. For a group of form fields
the test is behaviour in the markup (a field that appears on a condition), not having a validation
rule: the rules belong to the form's validator.

## Where state lives

### CD-S1 — Each piece of state has one owner, and everything else reads it

| reach | put it in |
|---|---|
| one component | `$signal` |
| a subtree reads it | `provide` a read value |
| a descendant must write it | `provideWritable` |
| the parent gives orders | `createCommands` / `createChannel` |
| unrelated components, or kept across navigation | [`@store`](/docs/store) |
| an event between unrelated components | `createBus` |
| part of what the screen is: a filter, a tab, an id | the URL ([Router](/docs/router)) |

A page may keep a **mirror** of a child's state to render from it, such as a grid's selection kept
as `selectedIds`. Write the mirror only from the owner's events, and change it only through the
owner:

```js
// before: the page's copy is emptied, and the grid keeps every row ticked
function clearSelection() { selectedIds = []; }

// after: ask the owner; its selection event brings the mirror back in step
function clearSelection() { gridEl?.clearSelection(); }
```

### CD-S2 — What can be computed is `$derived`, never stored, and never written

A value made from other values is `const x = $derived(…)`. Never assign into something a `$derived`
returned. If a library element pushes you to do it (it rebuilds when its input changes), that is a
gap in the library to report, not a derived value to patch.

```js
// before: writing into the objects a $derived returned
const settings = profileItems.find(i => i.key === 'settings');
for (const item of settings.children) item.checked = item.key === getScheme();
```

### CD-S3 — A counter that forces a re-read means the source should be a signal

State kept outside PDX, such as `localStorage` or a module variable, gets one reactive owner: a small
module that holds a signal, writes through, and is what everyone reads.

```js
// before: every writer must remember to bump the counter
let recentsVersion = $signal(0);
function readRecents(version) {
  void version;
  return JSON.parse(localStorage.getItem(key) ?? '[]');
}
```

```ts
// after: src/data/recents.ts
import { signal } from '@pdxui/core';

export function createRecents(key: string) {
  const list = signal<string[]>(JSON.parse(localStorage.getItem(key) ?? '[]'));
  function note(entry: string) {
    const next = [entry, ...list().filter(k => k !== entry)].slice(0, 8);
    localStorage.setItem(key, JSON.stringify(next));
    list.set(next);
  }
  return { list, note };
}
```

## How logic is reused

### CD-L1 — Logic repeated across pages is a composable; logic *with its markup* is a component

A composable is a plain function in a `.ts` file, called in `<script setup>`. It returns signals, or
an object of signals and methods:
- `use*` when it attaches to something that already exists;
- `create*` when it makes a thing the caller owns.

Lifecycle hooks inside it (`onMount`, `onDestroy`, `onBeforeLeave`) bind to the component that called
it. Call it synchronously during setup, since outside setup the hooks throw. A `.ts` file uses
`signal()` and `computed()`; the runes need a `.pdx.ts` file.

**Recognise it:** the same function names in two pages, or a comment such as "the same five moves as
the other list's". A copy fails both ways at once:
- a fix made in one place does not reach the other, like the Clear above;
- a defect travels with the copy, like an undo that restores only `rows[0]` after a multi-row delete,
  in both lists.

Repetition is the strong signal, not the only one. A whole concern with state of its own and no
markup, such as a per-field save queue with its saving / saved / refused state, is a composable even
when one page uses it, if it is what makes that page long.

When the repeated thing includes markup, it is a component instead. Look at `pdx-entity-grid` before
writing either.

### CD-L2 — A framework feature is not rebuilt in an app

Before you write a mechanism, look for it. If it exists but does not fit, the gap is the
framework's: report it, and do not fork the behaviour into the page.

| you were about to hand-build | it exists |
|---|---|
| "leave with unsaved changes?" | `@form x: Schema { warnUnsaved }` on the form ([Forms](/docs/forms)); `onBeforeNavigate` with `getDialogQueue()` for a guard that is not about a form |
| a button that opens a menu: open, ArrowDown, outside click, Escape, focus return | `<pdx-dropdown-menu>` |
| a floating panel anchored to a trigger | `<pdx-popover>` |
| a modal side drawer below a breakpoint | `<pdx-app-layout>`, `<pdx-drawer>` |
| a grid with New, an edit drawer, delete and bulk actions | `<pdx-entity-grid>` |

**Recognise it:**
- a `resolve` kept in a variable for a button to call later;
- a document `pointerdown` listener that closes your own popover;
- the same CSS rule reaching into a library element in several pages.

## A component's API

### CD-A1 — Data goes in through `@prop`, changes come out through `@event`

The parent owns the value and listens. A component that reaches out, into `document` or into its
parent's element, cannot be reused and cannot be read on its own. Reach your own elements with a
`:ref`, never with `document.querySelector` or `getElementById`:

```js
// before
const first = document.querySelector('[data-test="catalog"] .pdx-nav-item');

// after, inside catalog.pdx:  <a :ref="firstEl" …>
let firstEl = $signal(null);
```

### CD-A2 — A component does not write its own props, except as the user's input

A prop the component edits is a two-way value: it emits the new value, and the parent writes it
back. A prop used as a starting value is copied into a `$signal` named `initial…` or `default…`.

### CD-A3 — An imperative method is for a command, not for state

`@expose` things that are verbs: `focus`, `open`, `clear`, `scrollTo`
([Imperative Methods](/docs/imperative-methods)). Reading or setting data goes through props and
events. `gridEl.clearSelection()` is the right kind: a command given to the owner.

### CD-A4 — Names say what happens, not what was clicked

Name a handler for its effect: `archiveSelected`, `discardAndClose`. An `on<Event>` bridge is fine
when its body only turns the event into one named action. It becomes the smell when it *is* the
action, or several actions: an `onBulkAction` that branches on seven keys hides seven actions.

## Loading and effects

### CD-D1 — Data a screen needs is loaded at the route, by declaration

Load in the `@page` file, with `@fetch`, `@loader` or a `DataSource` ([Data](/docs/data)). The pieces
get what they render as props, or from the owner the route provides.

**Recognise it:** two files fetching the same URL, such as a parent route and its section each
loading the same list. That makes two requests, and two copies that can disagree.

**Allowed:** a component that *owns* its options, such as a picker that pages and filters its own
rows.

### CD-D2 — `$watch` and `effect` synchronise with the outside; they never compute state

A value made from other values is `$derived`. `$watch` writes to what PDX does not own, such as
storage, the URL, the title or a third-party widget. It also reacts to something that has no event of
its own, such as a pushed update or a route change. An effect whose only job is to set a signal is a
derivation that runs one tick late. See [Reactivity](/docs/reactivity).

### CD-D3 — A document-level listener is registered on mount and removed on destroy

```js
onMount(() => {
  const onDown = (e) => { /* … */ };
  document.addEventListener('pointerdown', onDown);
  onDestroy(() => document.removeEventListener('pointerdown', onDown));
});
```

See [Lifecycle](/docs/lifecycle).

## Styles

### CD-C1 — A component's styles live in its own `<style scoped>`; the app's globals are few and named

When a component is split, its styles go with its markup. The shell and the layout keep only what
several pieces read: the rhythm tokens, and the breakpoints that move several regions at once.

### CD-C2 — A page does not style a library component's internals

Style a library element through its props, its variants and its documented `--pdx-*` properties
([Theming](/docs/theming)). An internal class such as `.pdx-dg-row` or `.pdx-nav-item` is not an API:
it can be renamed, and every page that reached it breaks without a sound. When several pages need the
same override, the element needs a prop.

```css
/* before: repeated in six list pages */
.page .pdx-dg-row { cursor: pointer; }
```

### CD-C3 — Tokens, never values

Use `var(--pdx-space-*)`, `var(--pdx-color-*)` and `var(--pdx-radius-*)`. Never a hex colour, a
`white`, or a spacing in px where a token exists. The spacing scale is named (`2xs` … `3xl`), never
numbered.

## Did it work?

For each piece you extracted, answer:
- Does it have state, events or a reason to change of its own (CD-B1)?
- Is each piece of state written in one place (CD-S1)?
- Does each thing shown in several places have one source (CD-L1)?

If changing one behaviour still means editing three files, the extraction did not happen, whatever
the folder structure looks like.
