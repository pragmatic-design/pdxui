---
name: pdxui-screens
description: "Compose a screen that reads as a product, not a demo: grid or cards, what the header and sidebar carry, empty, loading and error states, what never to rebuild by hand. Use when laying out a screen or an app in .pdx, after picking components (pdxui) and the brand (pdxui-theme)."
---

# Designing a screen

`pdxui` answers *which component*. `pdxui-theme` answers *which colour*. Neither answers
**what the screen is**, and that is where a working app stops looking like a product.

An app can pass every acceptance item — on two viewports, in both schemes, with a clean console —
and still show ten defects in five minutes, none of them a component misused. They are composition:
a history of thousands of jobs rendered as cards, a header holding one control, a menu entry that
404s, cards of different heights in one row, and a vehicle card written by hand while `pdx-card`,
`pdx-badge` and `pdx-chip` sit unused.

**Every rule below has a check.** A rule you cannot check is an opinion, and opinions do not belong
in a skill.

---

## 1. Grid or cards

| the domain says | build |
|---|---|
| "thousands of rows", "two years of records", "they search for it" | a **grid** — `pdx-data-grid` |
| a handful, scanned by eye, heterogeneous content | **cards** |
| a queue somebody works through in order | a **list** — `pdx-list` |
| appointments by resource and time of day | a **day agenda** — no component yet; the recipe «Day agenda per resource» in `pdxui/references/recipes.md` |

The number is the tell. If the commission says a collection is large, or that the user *finds* things
in it rather than *browses* them, cards are the wrong shape however good they look: no columns, no
sorting, no column filters, no keyboard row navigation, and a row height that fits four items on a
screen instead of forty.

> **Check:** for every collection the domain describes as large, the rendered DOM contains a grid or
> a table — `document.querySelectorAll('[role="row"]').length > 0`. Zero rows with a paginator above
> a wall of cards is the defect.

⚠️ **A "one definition, three screens" requirement does not mean cards.** An acceptance that asks
for one vehicle card reused in three places is not a reason to put cards in the history too. A grid
column renderer (`cell:`) reuses the same definition; extraction and the right control are
independent decisions.

---

## 2. What you never build by hand

These exist, they are themed, they are accessible, and rebuilding them costs you every theme:

| you were about to write | use |
|---|---|
| `<div class="card">` | `pdx-card` |
| a coloured status pill | `pdx-badge` (semantic) or `pdx-chip` (removable) |
| a title + breadcrumb + actions bar | `pdx-page-header` |
| "nothing here yet" | `pdx-empty-state` |
| a row of buttons over a list | `pdx-toolbar` |
| page numbers | `pdx-pagination` |
| a table | `pdx-data-grid` |

> **Check:** grep the project's own CSS for `.card`, `.badge`, `.chip`, `.tag`, `.pill`, `.toolbar`,
> `.empty`. A rule that defines one of those is a component you re-implemented — and it will not
> follow the theme, will not have the states, and will drift from every other screen.

The golden rule of `pdxui` — *search the catalogue before building* — is the same rule. It
gets skipped here because at this point you are not thinking "which component", you are thinking
"how do I lay this out", and the answer looks like markup.

---

## 3. The chrome carries the app

**Top bar** — at minimum the identity (brand + app name) and the current context. Then, as the app
earns them: global search, global actions, notifications, the user. A top bar holding only a theme
toggle is not minimal, it is unfinished, and it is the first thing that reads as "demo".

**Sidebar** — the sections a person moves between all day. Not every route: the ones that are places.

**Page header** — this screen's title, the path that got here, and the actions that belong to this
screen (not to the app).

> **Check:** the header contains the app identity **and** at least one of {current context, search,
> user}. And: `pdx-page-header` (or an equivalent) is present on every screen that has a title —
> hand-assembling a heading is §2 again.

---

## 4. Every navigation entry lands somewhere usable

A route that needs a parameter (`/order/:id`) is **not** a menu entry: there is no id to give it, and
the user gets a 404 from a link you put there yourself.

> **Check:** click every entry in the nav; none reaches an error page or an empty screen. This is four
> lines of Playwright, and it catches a 404 that a long acceptance list misses.

If a section has no meaningful landing page, either give it one (a list, a search, a dashboard) or do
not put it in the menu.

---

## 5. The states every screen has

Four, and the happy path with seeded data is only one of them:

- **loading** — while the first request is out. Not a blank screen.
- **empty** — no data yet, or the filter matched nothing. Say which; they need different words.
- **error** — the request failed. Say so; do not render an empty list, which reads as "no results".
- **first use** — empty, but for a new user: the empty state is where you tell them what to do.

> **Check:** each of the four is reachable and asserted. The empty state must be distinguishable from
> the error state in the DOM — same blank list for both is the defect.

⚠️ **A panel that owns its own failure is not a try/catch.** When one source of a screen can fail
while the rest keeps working, the tool is `@try / @catch` in the template — the `retry` comes with
it — or `pdx-error-boundary` around something you did not write. Those catch errors from the
children's EFFECTS too, which your own try/catch around a fetch does not. The recipe is in
[`references/recipes.md`](../pdxui/references/recipes.md).

---

## 6. Repetition has to line up

Items in one row share a height. Spacing comes from the token scale (`--pdx-space-*`), never from
per-component values. Column widths repeat across screens showing the same entity.

> **Check:** the content does not touch the chrome — measure the gap between the navbar's right edge
> and the first text in the main area, and between that text and the viewport edge. Zero on either
> side is the defect: `pdx-app-layout` gives its regions no padding, deliberately, so the app has to.
> Content flush against the sidebar is the most common way this goes wrong.

> **Check:** measure every repeated item in a row — `getBoundingClientRect().height` is one distinct
> value. 168px four times and 200px once is exactly the "arranged a bit anywhere" look.

---

## 7. One primary action per screen

One `pdx-primary` button. Everything else is `secondary`, `outline` or `ghost`. Four primary buttons
means none of them is.

Keep the type scale short: a page title, a section heading, body, and a muted caption. Four levels
are enough for a LOB screen; a fifth is usually a heading that wants to be a section instead.

> **Check:** `document.querySelectorAll('.pdx-primary').length <= 1` per visible screen — a
> destructive confirm inside a dialog is its own screen.

---

## 8. Parts of one object are tabs, not a segmented control

A form split into blocks, a record with its details, history and attachments: those are parts of
**one** object, and moving between them switches panels. That is `pdx-tabs`, and `variant="card"`
when the parts are forms, so each panel sits in a visible container. `pdx-segmented` is a
`radiogroup`: it picks a **value** — a filter, a mode, a unit — and the screen stays the same screen.

```html
<pdx-tabs variant="card" value="vehicle">
  <div class="pdx-tabs" role="tablist">
    <button class="pdx-tab" data-tab="vehicle">Vehicle</button>
    <button class="pdx-tab" data-tab="owner">Owner</button>
  </div>
  <div data-tab-panel="vehicle">…</div>
  <div data-tab-panel="owner">…</div>
</pdx-tabs>
```

The catalogue already tells them apart ("Switch between panels" / "A compact set of exclusive
options"), and still the five blocks of a declaration end up behind a segmented control. That gives
three problems: the wrong role for assistive technology, five long labels that overflow at 1440px
into a scrollbar, and no visible container around the panels. `pdx-tabs` defaults to `line`; write
`variant="card"` yourself.

> **Check:** no `[role="radiogroup"]` whose options each reveal a different panel. Select each option
> in turn: if a different region of the page appears for each one, it is tabs in disguise.

---

## 9. A control's change shows beyond the control

Every control in the chrome, such as an operator or tenant switcher, a period picker or a scope
toggle, has a consequence you can see on **every** screen it can be reached from. It can be a filter
that follows it ("my cases"), a command that becomes enabled or disabled, or a line that says what
changed. If on some screen the only thing that changes is the control's own label, then on that screen
it reads as broken, however correct it is.

An operator switcher that changes the transmit explanation on the declaration, while on the list
nothing depends on who you are, reads on the list as "changing user does nothing".

> **Check:** on every screen the control is reachable from, change it and compare the DOM outside the
> control before and after: `main.innerHTML`, or the region the control governs, must differ. Equal is
> the defect.

---

## 10. The route body fills the main area

No `max-width` on a route. Lists, grids, an agenda and dashboards are the screens that want the
width; a cap on the route makes them look boxed in beside the sidebar. A **reading column** — a long
form, a page of text — is capped *inside* the route, and centred, with the layout primitive:

```html
<pdx-container max="md">…a long form…</pdx-container>
```

`max` takes `xs sm md lg xl 2xl full`; `pdx-container` centres itself and adds the side padding.

A `max-width: 1400px` on every route, aligned left, leaves 288px of the main area empty on the right
at 1920px, and the pages look limited in width.

> **Check:** at 1920px, on a list screen, the widest data block (the grid, the agenda) spans at least
> 90% of the main area: `grid.getBoundingClientRect().width / main.clientWidth >= 0.9`. And no rule in
> the project's CSS puts a `max-width` on the element that wraps every route.

---

## 11. The signed-in user is the last thing in the header

In a line-of-business app, identity closes the header's end region: the user's name or avatar, with
the name as its accessible name, and a menu holding the account actions (switch user, sign out).
Utility icons (search, notifications, theme) come **before** it. A switcher placed before the icons,
showing a role or a verb instead of a person, leaves the user unsure who is signed in and what the
control changes.

> **Check:** in the header, the last interactive element in DOM order is the user control, and it is
> also the one furthest along the inline axis (`getBoundingClientRect().right` is the largest in a
> left-to-right layout). Its accessible name contains the signed-in user's name.

---

## 12. Every screen that creates or edits a record guards unsaved work

The form declares `warnUnsaved` — `@form f: S { warnUnsaved }`, or `createForm({ …, warnUnsaved: true })`
— on the **create** screens as well as the edit screens. Leaving with typed, unsaved data then asks,
in-app. A guard written by hand goes on the forms its author thinks of — the edit screen — and the
creation forms drop their input without a word. The
recipe is «Do not leave with unsaved work» in `pdxui/references/recipes.md`.

> **Check:** on every create and edit screen, type into one field and click a sidebar link: the
> confirmation opens, and "Stay" leaves the screen and the typed value where they were. With nothing
> typed, the same link leaves without asking.

---

## The acceptance list this produces

Copy these into the commission's acceptance, because a property nobody measures is a property that
does not survive contact with a deadline:

1. every collection the domain calls large renders as a grid (`[role="row"]` present);
2. the project's CSS defines no `.card` / `.badge` / `.chip` / `.toolbar` / `.empty` of its own;
3. the header carries the identity and at least one of context / search / user;
4. every navigation entry reaches a usable screen;
5. loading, empty, error and first-use are each reachable and distinguishable;
6. repeated items in a row measure one height;
7. at most one primary button is visible at a time;
8. no `radiogroup` whose options each reveal a different panel: parts of one object are `pdx-tabs`;
9. every control in the chrome changes something outside the control on every screen it is reachable from;
10. at 1920px the widest data block of a list screen spans at least 90% of the main area, and no route is capped;
11. the signed-in user is the last interactive element of the header, and its accessible name is the user's name;
12. on every create and edit screen, typing into a field and clicking a sidebar link asks before leaving.

---

## What this skill is not

It is not a second catalogue — components and their props are in `pdxui` and the area skills.
It is not visual design advice: nothing here is about taste, and if a line of it cannot be turned
into a check, it does not belong and should be deleted rather than softened.
