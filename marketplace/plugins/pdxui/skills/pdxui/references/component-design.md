# Designing components: the rules

Read this before you split a screen, and before you let one grow. It says where a component's edge
goes, who owns each piece of state, how logic is shared, what a component's API looks like, where
loading and effects go, and where styles go. Every rule names the PDX construct that implements it and
how you recognise the rule being broken.

These rules are `docs/PDX-COMPONENT-DESIGN.md` of the framework repository, written for the author at
the keyboard. The rule ids are the same, so a review comment can name one. The "before" excerpts are
real code that broke these rules, from this repository's showcase application.

⚠️ **Lines are a symptom, not the rule.** A 150-line route or a 200-line file is a reason to *look*
(`structure.md`, and "When the file gets long" in `pdxui-language`). What you are looking for is
*how many independent things the file does*, and *how many files do the same thing*.

## 1. Where the edge of a component goes

### CD-B1 — A piece with its own state, its own markup and its own reason to change is a component

Give it a file under `src/` with `@prop` / `@event` as its API. Being used once does not keep it
inline: a panel with its own signals changes on its own, so it lives on its own.

**Recognise it:** section comments that each open with their own `$signal`s.

```js
// before — one file, five pieces, each with its own state (condensed: one line per section)
// ── The rail's two states ──        let side = $signal('expanded'); let menuOpen = $signal(false);
// ── The catalogue ──                let catalogOpen = $signal(false); let catalogQuery = $signal('');
// ── Favourites ──                   let pins = $signal(readPins());
// ── The profile menu ──             let profileOpen = $signal(false);
```

**After:** `rail.pdx`, `catalog.pdx`, `profile-menu.pdx`. The parent keeps only what they *share*
(which panel is open, for the Escape order) and passes it down. What two pieces both read is exactly
what stays in the parent.

### CD-B2 — A route composes; it does not render the details of what it composes

An `@page` file loads what the screen needs, holds what its pieces share, and places them. When a
route's template is a stack of `<fieldset>`s or wizard steps with no component among them, the route
is rendering, not composing.

**Recognise it:** eight `<fieldset class="group">` blocks in one route, beside the loading, the
autosave queue and the leave guard.

**A form's field groups are sections.** Move a group into its own `.pdx` and call `tryUseForm()` in
its script: that declares it a section of the `<pdx-form>` above it, and the compiler wires its named
controls and `<pdx-form-field name>`s to that form, as it does in the form's own file — no `:value`, no
`@pdx-input` (`recipes.md`, "A long form filled in more than one sitting"). The route keeps
the form, the loading and what the sections share; each section is a component.

### CD-B3 — Do not extract what has no life of its own

Five lines of markup, used once, with no state and no events: leave them inline. A component per
`div` adds props nobody needed, and the second use then does not fit them. For a form group the test
is behaviour in the markup (a field that appears on a condition), not having a validation rule: rules
belong to the form's validator.

## 2. Where state lives

### CD-S1 — Each piece of state has one owner, and everything else reads it

| reach | put it in |
|---|---|
| one component | `$signal` |
| a subtree reads it | `provide` a read value (`provide-inject` docs) |
| a descendant must write it | `provideWritable` |
| the parent gives orders | `createCommands` / `createChannel` |
| unrelated components, or kept across navigation | `@store` |
| an *event* between unrelated components | `createBus` |
| part of what the screen is (a filter, a tab, an id) | the URL |

A page may keep a **mirror** of a child's state to render from it: the grid's selection as
`selectedIds`. Write the mirror only from the owner's events. Change it only through the owner.

```js
// before — the copy is emptied, the grid still has every row ticked
function clearSelection() { selectedIds = []; }

// after — ask the owner; it publishes the change back through its event
function clearSelection() { gridEl?.clearSelection(); }
```

### CD-S2 — What can be computed is `$derived`, never stored, and never written

A value from other values is `const x = $derived(…)`. Never assign into what a `$derived` returned.
If a library element forces you to (it rebuilds when its input changes), that is a library gap: file
it, do not patch the derived value.

```js
// before — writing into the objects a $derived returned
const settings = profileItems.find(i => i.key === 'settings');
for (const item of settings.children) item.checked = item.key === getScheme();
```

### CD-S3 — A counter that forces a re-read means the source should be a signal

State kept outside PDX (`localStorage`, a module variable) gets one reactive owner: a small `.ts`
module that holds a `signal`, writes through, and is what everyone reads.

```js
// before — every writer must remember to bump it
let recentsVersion = $signal(0);
function readRecents(version) {
    void version;
    return JSON.parse(localStorage.getItem(key) ?? '[]');
}
```

```ts
// after — src/data/recents.ts
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

## 3. How logic is reused

### CD-L1 — Logic repeated across pages is a composable; logic *with its markup* is a component

A composable is a plain `.ts` function called in `<script setup>`. It returns signals, or an object of
signals and methods: `use*` when it attaches to something that exists, `create*` when it makes a thing
the caller owns. Lifecycle hooks inside it (`onMount`, `onDestroy`, `onBeforeLeave`) bind to the
calling component, and they must run synchronously during setup: outside setup they throw. In a
`.ts` file use `signal()` / `computed()`; the runes need a `.pdx.ts` file.

**Recognise it:**
- the same function names in two pages;
- a comment such as "the same five moves as the ticket's".

A copy fails both ways at once:
- a fix made in one place does not reach the other (the Clear above);
- a defect travels with the copy (an undo that restores only `rows[0]` after a multi-row delete, in
  both lists).

When the repeated thing includes markup, it is a component instead: check `pdx-entity-grid` and the
table below before writing either.

Repetition is the strong signal, not the only one. A whole concern with state of its own and no markup
(a per-field save queue with its saving/saved/refused state) is a composable even when one page uses
it, if it is what makes that page long. It is the logic-side twin of CD-B1.

### CD-L2 — A framework feature is not rebuilt in an app

Before writing a mechanism, look for it: the area skills, `README.md` of these references,
`recipes.md`. If it exists but does not fit, the gap is the framework's. File it, and do not fork the
behaviour into the page.

| you were about to hand-build | it exists |
|---|---|
| "leave with unsaved changes?" | `@form x: Schema { warnUnsaved }`, or `onBeforeNavigate` + `getDialogQueue()` for a guard that is not a form: `recipes.md`, "Do not leave with unsaved work" |
| a button that opens a menu (open, ArrowDown, outside click, Escape, focus return) | `pdx-dropdown-menu` |
| a floating panel anchored to a trigger | `pdx-popover` |
| a modal side drawer below a breakpoint | `pdx-app-layout`'s overlay sidebar, `pdx-drawer` |
| a grid with New, edit drawer, delete, bulk | `pdx-entity-grid` |

**Recognise it:**
- a `resolve` kept in a variable for a later button to call;
- a document `pointerdown` listener that closes your own popover;
- the same CSS rule reaching into a library element in several pages.

## 4. A component's API

### CD-A1 — Data goes in through `@prop`, changes come out through `@event`

The parent owns the value and listens. A component that reaches out (into `document`, into its
parent's element) cannot be reused and cannot be read alone. Use a `:ref` for your own elements:
never `document.querySelector` or `getElementById`.

```js
// before
const first = document.querySelector('[data-test="catalog"] .pdx-nav-item');
// after — inside catalog.pdx
let firstEl = $signal(null);   // <a :ref="firstEl" …>
```

### CD-A2 — A component does not write its own props, except as the user's input

A prop the component edits is a two-way value: it emits the new value, and the parent writes it back.
A prop used as a starting value is copied into a `$signal`, named `initial…` or `default…`.

### CD-A3 — An imperative method is for a command, not for state

`@expose` things that are verbs (`focus`, `open`, `clear`, `scrollTo`). Reading or setting data goes
through props and events. `gridEl.clearSelection()` is the right kind: a command on the owner.

### CD-A4 — Names say what happens, not what was clicked

Name a handler for its effect: `archiveSelected`, `discardAndClose`. An `on<Event>` bridge is fine
when its body only turns the event into one named action. It is the smell when it *is* the action, or
several of them: one `onBulkAction` that branches on seven keys hides seven actions.

## 5. Loading and effects

### CD-D1 — Data a screen needs is loaded at the route, by declaration

`@fetch` / `@loader` / a `DataSource` in the `@page` file. Pieces get what they render as props, or
from the owner the route provides.

**Recognise it:** two files fetching the same URL, such as a parent route and its section each
loading the same list. That means two requests and two copies that can disagree.

**Allowed:** a component that *owns* its options, such as a picker paging and filtering its own rows.

### CD-D2 — `$watch` and `effect` synchronise with the outside; they never compute state

A value from other values is `$derived`. `$watch` writes to what PDX does not own (storage, the URL,
the title, a third-party widget) or reacts to something that has no event (a pushed update, a route
change). An effect whose job is to set a signal is a derivation running one tick late.

### CD-D3 — A document-level listener is registered on mount and removed on destroy

```js
onMount(() => {
    const onDown = (e) => { /* … */ };
    document.addEventListener('pointerdown', onDown);
    onDestroy(() => document.removeEventListener('pointerdown', onDown));
});
```

## 6. Styles

### CD-C1 — A component's styles live in its own `<style scoped>`; the app's globals are few and named

When you split a component, its styles go with its markup. The shell and the layout keep only what
several pieces read: the rhythm tokens, the breakpoints that move several regions at once.

### CD-C2 — A page does not style a library component's internals

Style a library element through its props, its variants and its documented `--pdx-*` properties. An
internal class (`.pdx-dg-row`, `.pdx-nav-item`) is not an API: it can be renamed, and every page that
reached it breaks silently. If several pages need the same override, the element needs a prop. File it.

```css
/* before — six list pages */
.page .pdx-dg-row { cursor: pointer; }
```

### CD-C3 — Tokens, never values

`var(--pdx-space-*)`, `var(--pdx-color-*)`, `var(--pdx-radius-*)`. Never a hex, a `white`, or a px
spacing where a token exists. The token scale is named (`2xs…3xl`), never numeric (`gotchas.md`).

## The check that tells you it worked

For each piece you extracted, answer:
- Does it have state, events or a reason to change of its own (CD-B1)?
- Is each piece of state written in one place (CD-S1)?
- Does each thing shown in several places have one source (CD-L1)?

If you have to edit three files to change one behaviour, the extraction did not happen, whatever the
folder structure looks like.
