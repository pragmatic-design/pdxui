# Component design in PDX

How to cut an application into `.pdx` components, where each piece of state lives, how logic is
shared, what a component's API looks like, where effects and data loading go, and where styles go.

These are PDX's own rules. They draw on the official guidance of React, Vue, Angular, Svelte and Lit
(sources at the end), but each one is stated in terms of a PDX mechanism, because a rule an author
cannot act on in a `.pdx` file is not a rule.

Every rule has four parts:

- **Mechanism** — the PDX construct that implements it.
- **Why** — what goes wrong without it.
- **Anti-pattern** — a real excerpt from `packages/showcase`, this repo's demo application, quoted
  line for line with its location, or "none found" and how that was looked for.
- **Check** — how a tool can tell whether the rule holds, or "not measurable" and what a reviewer
  looks for instead. Rules marked *candidate* are the ones a `pdx check` diagnostic can implement.

The rules have ids (`CD-B1` …) so a diagnostic, a review comment and a commit can name them.

An excerpt shows the anti-pattern at the location where it was read in the showcase. Where the
showcase follows the rule today, the rule says how, next to the excerpt.

⚠️ **Line count is a signal, never the rule.** None of the five frameworks' current guides read for
this document gives a size limit (for Angular that is the angular.dev style guide; the legacy
angular.io guide was not read), and a long file with one responsibility is fine. What the rules measure is *how many independent things a
file does*, and *how many files do the same thing*.

---

## 1. Where a component's boundary goes

### CD-B1 — A piece with its own state, its own markup and its own reason to change is a component

- **Mechanism:** a `.pdx` file anywhere under the app's `src/`, with `@prop` / `@event` as its API.
  The tag comes from the file name; nothing is registered by hand. The skill suggests
  `src/components/`; the showcase keeps its components at `src/` root (`asset-picker.pdx`,
  `list-header.pdx`, `record-detail.pdx`), and a family of pieces goes in a folder named for their
  owner (`src/shell/`, as in section 9).
- **Why:** the test is Lit's, the most operational of the five ("its own state… its own template…
  one thing well… a well-defined API"). Usage count alone is not the criterion: a piece used once
  that has its own state is still a component, because its state and its markup change together and
  nothing else changes with them. A section comment that names a piece (`// ── The catalogue`) is
  that piece asking to be a file.
- **Anti-pattern:** `src/shell.pdx` (1084 lines) has fifteen section comments: three in the template,
  eight in the script, four in the style. Five of the script's sections hold signals of their own:

  ```js
  // shell.pdx:295, 307            the rail
  let side = $signal(localStorage.getItem(SIDE_KEY) === 'collapsed' ? 'collapsed' : 'expanded');
  let menuOpen = $signal(false);
  // shell.pdx:350, 354            the catalogue
  let catalogOpen = $signal(false);
  let catalogQuery = $signal('');
  // shell.pdx:503                 favourites
  let pins = $signal(readPins());
  // shell.pdx:531                 recents
  let recentsVersion = $signal(0);
  // shell.pdx:610                 the profile menu
  let profileOpen = $signal(false);
  ```

  The other three sections are data and constants (the navigation model, the open groups kept in a
  plain object, the rail's foot).

  The pieces are not fully independent, and the coupling is the design information:
  - Recents reads Favourites' `pins` (`shell.pdx:553`).
  - `onShellClick` / `onShellKey` read both `menuOpen` and `catalogOpen` (`shell.pdx:332-342`), for
    the Escape order.

  That shared part is exactly what stays in the shell when the pieces leave (section 9). The profile
  menu reads no signal of the rail, the catalogue, the favourites or the recents.
- **Check:** *candidate.* Build the graph "function/derived → signals it reads or writes" of one
  `<script setup>`. More than one connected component, each with at least two signals, is more than
  one piece. Run on `shell.pdx` it finds three groups:
  - the profile menu;
  - rail + catalogue, joined by the Escape and outside-click handlers;
  - favourites + recents, joined by `pins`.

  So it is a lower bound, and it points at the shared state that stays in the parent. Links made
  only in the template are outside it. Warning, never an error.

### CD-B2 — A route composes; it does not render the details of what it composes

- **Mechanism:** an `@page` file loads what the screen needs (`@fetch`, `@loader`, a `DataSource`),
  holds the state the screen's pieces share, and composes components and library elements. The
  pieces render themselves. (`structure.md` in the skill: "Routes stay thin.")
- **Why:** a route that also carries the markup of every section is the file that every change to
  the screen touches, and its script mixes loading, orchestration and presentation.
- **Anti-pattern:** `pages/employee-personal.pdx:37-193` renders eight fieldsets inline (identity,
  residence, birth place, document, contacts, emergency, work, consents), each a
  `<fieldset class="group" data-test="group-…">` of `<pdx-form-field>` rows, in the same file as the loading, the per-field save queue, the "refused on
  another tab" logic and the leave guard.
- **A form's field groups are sections.** A `.pdx` whose script calls `tryUseForm()` or
  `useForm()` is a section of the form above it, and its whole template is wired to that form, so a
  group of `<pdx-form-field name>` rows moved into a child keeps its wiring (`recipes.md`, "A long
  form filled in more than one sitting").
- **Check:** *candidate.* A route whose template holds more than N sibling structural blocks
  (`fieldset`, `section`, `[data-wizard-step]`) with no component among them. Template size against
  script size is no signal: both examples here have the larger script. Warning.

### CD-B3 — Do not extract what has no life of its own

- **Mechanism:** leave it inline.
- **Why:** a component per `div` is the opposite failure. It adds props nobody needed, and the
  second use then does not fit them. Vue and React both say to extract when a thing grows, not
  before.
- **Anti-pattern:** not looked for: the showcase's problem is the opposite one. The rule is here so
  that the ones above are not read as "split everything".
- **Check:** not measurable. A reviewer asks: does the extracted piece have state, events or a
  reason to change of its own? If it is five lines of markup used once, it goes back.

---

## 2. Where state lives

### CD-S1 — Each piece of state has one owner, and everything else reads it

- **Mechanism, by reach:**
  - local to one component → `$signal`;
  - shared by a subtree → `provide` a *read* value; `provideWritable` only when a descendant must
    write, and `createCommands` / `createChannel` when the parent gives orders (`provide-inject.md`);
  - shared across unrelated components, or kept across navigation → `@store`; an *event* between
    unrelated components (not state) → `createBus`;
  - part of what the screen *is* (a filter, a tab, a record id) → the URL.
- **Why:** React's "for each unique piece of state, choose the component that owns it" and Vue's
  "keep mutations in the provider" are the same rule. Two copies of one fact disagree sooner or
  later, and the disagreement is a bug nobody wrote.
- **Anti-pattern:** the grid's selection lives in the grid, and `pages/customers.pdx` keeps a
  second copy:

  ```js
  // customers.pdx:192
  function clearSelection() { selectedIds = []; }
  ```

  The page's copy is emptied and the grid's is not. Measured: tick a row, press Clear, the bulk bar
  hides and the row stays ticked. `pages/tickets.pdx` avoids the defect by clearing the owner,
  `gridEl.clearSelection()`.
  A page may keep a *mirror* of a child's state, such as `selectedIds` in `tickets.pdx:442`, to render
  from it. The rule is that the mirror is written only from the owner's events, and changed only
  through the owner (`gridEl.clearSelection()`, which publishes back). Tickets does that, including
  in its live-update handler (`tickets.pdx:848-870`). Customers writes the mirror directly, and that
  is the bug.

  **How the showcase follows it:** both lists keep the mirror in `src/data/list-actions.ts`, which
  clears it through the grid. The contract row is `customers.spec.ts`, "the bar's clear unticks the
  rows it counted", and it fails against the copy quoted above.
- **Check:** partly measurable at runtime, not statically. A contract row per list: "after Clear,
  no row is checked". The static half is a *candidate*, low precision: a signal that is assigned from
  a child's event *and* assigned elsewhere without a call on that child. `customers.pdx:192` matches
  it; `tickets.pdx:519-526` does not.

### CD-S2 — What can be computed is `$derived`, never stored, and never written

- **Mechanism:** `const x = $derived(…)`. A value the reader overrides but that follows its source
  until then is a writable derivation: a `$signal` reset by `$watch` on the source, stated as such.
- **Why:** React, Vue, Angular and Svelte agree. Redundant state contradicts its source, and a
  computed value "should be treated as read-only and never be mutated" (Vue).
- **Anti-pattern:** `src/shell.pdx` writes into the objects its own `$derived` returned:

  ```js
  // shell.pdx:650-653
  function syncSettings() {
      const settings = profileItems.find(i => i.key === 'settings');
      for (const item of settings.children) {
          if (item.radioGroup === 'scheme') item.checked = item.key === (getScheme() === 'dark' ? 'dark' : 'light');
  ```

  The file says why: making `checked` reactive would rebuild the whole menu under the pointer. That
  is a limit of `pdx-menu` (it cannot update one radio without a rebuild), and the workaround is a
  derived value that lies until someone patches it.
  `onProfileCheck` (`shell.pdx:687-692`) writes the same objects the same way.

  **How the showcase follows it:** `pdx-menu` updates a new items array of the same shape in place,
  so `shell/profile-menu.pdx` derives `checked` from `currentScheme` and the density signal
  (`src/preferences.ts`), and nothing writes into the derived items.
- **Check:** *candidate*, and precise. Flag an assignment to a member of a value reached from a
  `$derived`, following locals. In `const s = x.find(…); for (const i of s.children) i.prop = …`,
  both `s` and `i` come from `x`. That tracking is what catches both shell writers. Error-worthy,
  but start as a warning.

### CD-S3 — A counter that forces a re-read means the source should be a signal

- **Mechanism:** state kept outside PDX (`localStorage`, a module variable) gets one reactive owner:
  a small `.ts` module that holds a `signal`, writes through, and is read everywhere. Core's
  `createAuthStore` does this for the session, and `src/auth.ts:42` uses it: the persisted tokens are
  read as signals (`auth.user()`, `auth.isAuthenticated()`). The showcase has no hand-written module
  of this shape yet. `src/preferences.ts` is the opposite: it reads storage on every call, and says so.
- **Why:** a version counter makes a `$derived` depend on "something changed" instead of on the
  value. Every writer must remember to bump it, and one that forgets leaves the screen stale.
- **Anti-pattern:** `src/shell.pdx`, Recents:

  ```js
  // shell.pdx:531
  let recentsVersion = $signal(0);
  // shell.pdx:538-541
  function readRecents(version) {
      void version;
      return JSON.parse(localStorage.getItem(recentsKey()) ?? '[]');
  }
  ```

- **Check:** *candidate.* A parameter read only as `void x`, or a `$signal` whose only writes are
  `x = x + 1` and whose only reads are as an argument that is discarded.

---

## 3. How logic is reused

### CD-L1 — Logic repeated across pages is a composable; logic *with its markup* is a component

- **Mechanism:** a plain `.ts` module exporting a function called in `<script setup>`:
  - it returns signals, or an object of signals and methods. Name it `use*` when it attaches to
    something that already exists (an element, the route, the browser) and `create*` when it makes
    a new thing the caller owns. That is the tendency of core's names (`useDrag`, `useScroll`;
    `createForm`, `createCommands`), not a rule core keeps: `useDrag` returns an object too;
  - lifecycle hooks (`onMount`, `onDestroy`, `onBeforeLeave`, …) inside it bind to the calling
    component. They must run synchronously during setup; outside setup they throw
    (`core/src/component/lifecycle.ts`), which is the check;
  - a module that needs runes (`$signal`) is a `.pdx.ts` file; a plain `.ts` uses `signal()`.

  When the repeated thing includes markup, it is a component (Vue: "composables when reusing pure
  logic, components when reusing both logic and visual layout").
- **Why:** a copy drifts. The copy is where a fix made in one place does not arrive. Repetition is
  the strong signal, not the only one: a whole concern with state and no markup (a per-field save
  queue) is a composable even when one page uses it, if it is what makes that page long. It is the
  logic-side twin of CD-B1, and Vue's guide says the same ("for code organization").
- **Anti-pattern:** `pages/customers.pdx` repeats the tickets list's round-trip: `onSelectionChange`,
  `clearSelection`, `answerRefused`, `clearRefusal`, `openCreate`, `closeCreate`, `onCreate`,
  `openRecord`, `askToClose`, `discardAndClose`, `keepEditing`, `closeDrawer`, `onDrawerSave`,
  `onBulkAction`. Its own comment says so:

  ```js
  // ── The round-trip, which is the same five moves as the ticket's ──
  ```

  A copy fails both ways, and this one shows both:
  - **A fix does not travel.** Tickets clears through the grid (`gridEl.clearSelection()`,
    `tickets.pdx:519-526`); the copy does not (`customers.pdx:192`, measured: the row stays ticked).
  - **A defect does.** An undo after a multi-row removal restores one row: `undone = rows[0]` in
    `tickets.pdx:772` and in `customers.pdx:268`. Measured on customers: 24 → archive 2 → 22 →
    undo → 23. Read in the tickets source, not run there.

  **How the showcase follows it:** the round-trip is written once, in `src/data/list-actions.ts`,
  and the answers (which the board uses too) in `src/data/answer.ts`, so the Clear fix reaches
  customers. The removal and its undo are `removeSelected` in `list-actions.ts`, which puts back
  every row it took. Measured on the copies with two rows: tickets 36 → 34 → undo → 35, and
  customers 24 → 22 → undo → 23.
- **Check:** *candidate*, precise. The same function name with a normalised body in two or more
  files of one app. Report both locations. The showcase must show the tickets/customers pair.

### CD-L2 — A framework feature is not rebuilt in an app

- **Mechanism:** before writing a mechanism, look for it in core and in `@pdxui/ui` (the table
  in `structure.md`, the site's API reference). If it exists but does not fit, the gap is the
  framework's: open the issue, and do not fork the behaviour into the page.
- **Why:** framework rule 1, "if the dev writes boilerplate, it is a framework bug". A hand-built
  copy misses the fixes the library gets.
- **Anti-patterns:**
  - The "leave with unsaved changes?" question is bridged by hand in `intake` and
    `employee-personal`: a `leaveAsked` signal shows an in-page `role="alertdialog"`, `onBeforeLeave`
    returns a Promise whose `resolve` is kept, and the dialog's buttons settle it. When they ask
    differs: intake asks when the wizard is dirty, while employee-personal saves the changed fields and
    asks only when a value was refused (`employee-personal.pdx:433-445`). The bridge is the same, and
    `answerLeave` is identical line for line:

    ```js
    // intake.pdx:440-453
    let resolveLeave = null;

    onBeforeLeave(() => {
      if (submitted || !coordinator.dirty()) return true;
      leaveAsked = true;
      return new Promise(resolve => { resolveLeave = resolve; });
    });

    function answerLeave(discard) {
      leaveAsked = false;
      const resolve = resolveLeave;
      resolveLeave = null;
      if (resolve) resolve(discard);
    }
    ```

    The documented way is the skill's recipe "Do not leave with unsaved work" (`recipes.md`, guarded
    by `router/tests/recipe-leave-unsaved.test.ts`): `@form x: Schema { warnUnsaved }` for a form,
    which both pages have, and `onBeforeNavigate` + `getDialogQueue()` otherwise. The copies do not
    follow it.

    The public API already asks a question in the page's own words without a bridge.
    `getDialogQueue()` is exported by core (`core/src/index.ts:269`). Its `push({ type: 'confirm', … })`
    returns a `Promise<unknown>`, and mapped to a boolean, as `confirmLeave` does with
    `.then(answer => answer === true)` (`core/src/form/confirm-leave.ts:60-67`), it is what
    `onBeforeLeave` takes. It needs something to draw the queue, `<pdx-overlay-outlet>`, which the
    showcase does not mount (grep: 0 matches). Without it the Promise never settles.

    What the pages have that the queue lacks is the placement: an in-page, non-modal question. Core's own
    `guardUnsavedWork`, which also covers `beforeunload`, is reached by `@form … { warnUnsaved }`
    (and `createForm`), with fixed words. The copies drift too: the `role="alertdialog"` in `intake`
    has no accessible name, the one in `employee-personal` has an `aria-label` (read in the source,
    not measured with axe).

    **How the showcase follows it:** there is no bridge, and the question is a modal, not an in-page
    one. Both pages ask through `getDialogQueue()` in their own words, and the shell loads
    `<pdx-overlay-outlet>` the first time the queue holds a dialog. The modal is an `alertdialog` named by its title.
    - Intake does not use `warnUnsaved`, because it is two forms dirty together.
    - employee-personal does not use it either, because it asks only about a refused value.
  - A second leave shape, "save what is still pending before leaving", is repeated in the detail
    pages `asset`, `service` and `site`, in the same form:

    ```js
    // asset.pdx:186-190
    onBeforeLeave(async () => {
      const a = assetById(Number(id));
      if (!a) return true;
      const values = details.getValues();
      for (const name of FIELDS) if (!same(a[name], values[name])) await saveField(name);
    ```

    It belongs with the per-field autosave that `employee-personal` also carries (`createAutosave`,
    section 9). The bodies are not identical: `service.pdx:183-184` converts numbers, and
    `site.pdx:211` compares differently. So the name-based check of CD-L1 does not find this shape.
    Only a reviewer does.

    **How the showcase follows it:** the three pages use `createAutosave`. They leave with its `saveChanged`, and the
    numbers go through its `value` option.
  - The profile menu in `src/shell.pdx` rebuilds, around a `pdx-menu`, what `pdx-dropdown-menu`
    does: open, close, ArrowDown on the trigger, close on focus-out, close on an outside
    `pointerdown`. Its own comment gives two reasons (`shell.pdx:211-214`): `pdx-dropdown-menu`
    builds its trigger from a `label` and an `icon`, and this trigger is an avatar; and it would pull
    `pdx-icon` and the library's string registry into the entry chunk.
  - `src/demo-panel.pdx` hand-builds a popover (the open flag at `:60`, close on focus-out from
    `:108`, a document `pointerdown` in capture at `:118-121`) that `pdx-popover` exists for. It was not checked why it does not use it.
  - `.pdx-dg-row { cursor: pointer; }` is repeated in the styles of six list pages, because the
    grid emits `pdx-row-click` but has no way to say its rows are clickable.
- **Check:** partly. The repeated-name check of CD-L1 finds `answerLeave`. A reviewer finds the rest by
  asking of every document-level listener and every copied CSS rule: "does the library already do
  this?"

---

## 4. A component's API

### CD-A1 — Data goes in through `@prop`, changes come out through `@event`

- **Mechanism:** `@prop name: type = default` and `@event name: payload`. The parent owns the value
  and listens. All five frameworks agree on this, whatever they call it.
- **Why:** a component that reaches up (into `document`, into a parent's element, into a store it
  was not given) cannot be reused, and cannot be read without reading the whole app.
- **Anti-pattern:** `src/shell.pdx` finds the catalogue's own elements through the document
  instead of a `:ref`:

  ```js
  // shell.pdx:362
  requestAnimationFrame(() => document.querySelector('[data-test="catalog-search"]')?.focus());
  // shell.pdx:368
  const first = document.querySelector('[data-test="catalog"] .pdx-nav-item');
  ```

  It selects by a *test id* and by a library's internal class. `src/demo-panel.pdx:83-84` does the
  same for its knobs (`document.querySelectorAll('#demo-panel .knob')`). Once the catalogue is a
  component, those queries become the component's own business.
- **Check:** *candidate*, precise. `document.querySelector` / `getElementById` in a `.pdx` script.
  The project rule already says ":ref pattern for DOM access, never document.getElementById".

### CD-A2 — A component does not write its own props, except as the user's input

- **Mechanism:** a prop that the component edits is a two-way value: it emits the new value (a
  `pdx-change`-style event), and the parent writes it back. A prop used as a starting value is copied
  into a `$signal` and named for that (`initial…`, `default…`).
- **Why:** Lit and Vue in the same words. A component that silently overwrites its input fights its
  parent on the next render.
- **Anti-pattern:** not looked for. Finding it needs each file's `@prop` list set against its
  assignments, which is this rule's check. The library is not surveyed either.
- **Check:** *candidate*, precise. An assignment to a name declared by `@prop` inside the same file.

### CD-A3 — An imperative method is for a command, not for state

- **Mechanism:** `@expose focus, clear` for things that are verbs (focus, scroll to, open, clear).
  Reading or setting state goes through props and events.
- **Why:** React ("refs are an escape hatch… expose only a subset"), Vue ("only when absolutely
  necessary") and Lit ("setting properties… is usually preferable to calling methods") agree. A
  method that sets state hides a second, unreactive channel beside the props.
- **Anti-pattern:** none found. No showcase `.pdx` declares `@expose` (grep). For what
  the rule allows: `gridEl.clearSelection()` in `pages/tickets.pdx:525` is a command on the owner of
  the selection (CD-S1), and it is the right call.
- **Check:** not measurable. A reviewer asks of each `@expose` name: is it a verb?

### CD-A4 — Names say what happens, not what was clicked

- **Mechanism:** handlers are named for their effect (`archiveSelected`, `discardAndClose`), not for
  their trigger (`onClick2`). Events are `pdx-` prefixed in the library, past tense or noun
  (`pdx-change`, `pdx-row-click`), and their detail is written field by field.
- **Why:** Angular's style guide: `saveUserData`, not `handleClick`. A file is read by its function
  names.
- **Anti-pattern:** the showcase does not follow it widely. Handlers named for their trigger:
  - in `shell.pdx`: `onShellClick`, `onShellKey`, `onCatalogSearchKey`, `onTriggerKey`,
    `onProfileFocusOut`, `onNavToggle`;
  - in `tickets.pdx`: `onCreateInput`, `onInlineSubject`, and `onBulkAction`, which dispatches on
    seven keys, so its name hides seven actions.

  An `on<Event>` bridge is acceptable when its body only translates the event into one named action
  (`onNavSelect` → `navigate`). It is the smell when it *is* the action, or several of them.
- **Check:** not measurable beyond naming prefixes. A reviewer reads the list of function names as
  a table of contents.

---

## 5. Effects and data loading

### CD-D1 — Data a screen needs is loaded at the route, by declaration

- **Mechanism:** `@fetch` / `@loader` / a `DataSource` in the `@page` file. Pieces receive what they
  render as props, or read it from the owner the route provides.
- **Why:** SvelteKit's `load` and Angular's resolvers put loading at the route; React tells the parent
  to fetch and pass down. A leaf that fetches for itself makes a waterfall and a second cache.
- **Anti-pattern:** a parent route and its own section route both fetch the same list: two
  requests and two copies that can disagree.

  ```js
  // pages/employee.pdx:142
  void fetch(`/api/attachments?employee=${encodeURIComponent(id)}`).then(r => r.json()).then(list => { documents = list; });
  // pages/employee-documents.pdx:89
  const res = await fetch(`/api/attachments?employee=${encodeURIComponent(id)}`);
  ```

  The exception the rule allows: a component that *owns* its options, such as a picker paging and
  filtering its own rows. `src/asset-picker.pdx:28` creates its own `createDataSource(…)` for
  exactly that, and it is fine. The picker's list is not the screen's data.
- **Check:** *candidate.* Two files of one app that load the same endpoint (the same URL template
  in `fetch`, or the same transport in `createDataSource` / `resource`), where one route contains
  the other. Report both. Warning: a picker over the screen's entity is the allowed case above.

### CD-D2 — `$watch` and `effect` synchronise with the outside; they never compute state

- **Mechanism:** a value from other values is `$derived`. `$watch` is for writing to something PDX
  does not own (storage, the URL, a third-party widget, the document title) or for reacting to an
  event that has no event (a route change).
- **Why:** React ("Effects are an escape hatch"), Angular ("avoid using effects for propagation of
  state changes") and Svelte (`$derived` rather than `$effect`) agree. An effect that sets a signal
  is a derivation that runs one tick late.
- **Anti-pattern:** `src/shell.pdx`, Recents, pairs the effect with the counter of CD-S3:

  ```js
  $watch(currentPath, (path) => noteRecent(path), { immediate: true });
  ```

  `noteRecent` writes storage (legitimate) and bumps `recentsVersion` so a `$derived` re-reads it
  (not legitimate: the signal of CD-S3 removes the need).
- **Check:** *candidate.* A `$watch` / `effect` callback that writes a `$signal` of the same component,
  directly or through a function of the same file it calls. Writes to storage, the URL or the DOM
  are the legitimate half, and are not flagged. The example above is caught through `noteRecent`
  → `recentsVersion`. It is a warning, not precise. Reacting to a pushed event is the allowed case,
  and the check cannot tell it from a derivation: `tickets.pdx:848-870` watches the last live event
  and writes the notice and the selection, which is right.

### CD-D3 — A document-level listener is registered on mount and removed on destroy

- **Mechanism:** `onMount(() => { document.addEventListener(…); onDestroy(() => removeEventListener(…)); })`,
  or `ctx.track` in a library element.
- **Why:** Lit and Vue both say this. A listener that outlives its component leaks and keeps acting
  on a screen that is gone.
- **Anti-pattern:** none found. Every `document`/`window` `addEventListener` in the showcase's `.pdx`
  files has its removal (grep: `app.pdx:81-85`, `demo-panel.pdx:120-121`,
  `shell.pdx:710-711`). That is the pattern.
- **Check:** *candidate*, precise. `addEventListener` on `document` or `window` in a `.pdx` with no
  `removeEventListener` for the same event in an `onDestroy` of the same file.

---

## 6. Styles

### CD-C1 — A component's styles live in its own `<style scoped>`; the app's globals are few and named

- **Mechanism:** `<style scoped>` in each `.pdx`. The app shell and the layout may carry global
  rules (Vue says the same of `App` and layout components). Library components use `.pdx-*` classes
  from `@pdxui/design`, not `scoped` (Vue: libraries prefer a class strategy).
- **Why:** a stylesheet that serves several pieces is changed for one and breaks another.
- **Anti-pattern:** `src/shell.pdx` carries 363 lines of style for the rail, the catalogue, the
  topbar and the profile menu together. When the pieces are split (CD-B1), each takes its own.
- **Check:** *candidate.* A `<style scoped>` whose selectors fall into groups that match the
  connected components of CD-B1 (a selector's class appears only in the markup of one group).

### CD-C2 — A page does not style a library component's internals

- **Mechanism:** a library element is styled through its props, its documented custom properties
  (`--pdx-*`) and its variants. What a page keeps needing becomes a prop.
- **Why:** Angular "strongly discourages" `::ng-deep` (angular.dev, component styling); Lit (styles)
  and Svelte (best practices: custom properties to style child components) theme through custom
  properties. An internal class is not an API: it is renamed without notice, and every page that
  reached it breaks, silently.
- **Anti-pattern:** six list pages repeat the same reach into the grid, as `.page .pdx-dg-row` in
  `assets.pdx:188`, `employees.pdx:113`, `services.pdx:155`, `sites.pdx:100` and as `.list .pdx-dg-row`
  in `customers.pdx:302`, `tickets.pdx:917`:

  ```css
  .page .pdx-dg-row { cursor: pointer; }
  ```

  and `src/shell.pdx` restyles `pdx-nav-menu`'s internals (`.rail-nav .pdx-nav-item`,
  `.pdx-nav-group-trigger > .pdx-nav-chevron`, `.pdx-nav-row:hover > .pdx-nav-item`).

  **How the showcase follows it:** `pdx-data-grid` has `row-clickable`, and the six pages set it
  instead of the rule. The nav menu's half is open: `src/shell.pdx` and `src/shell/catalog.pdx`
  style `pdx-nav-menu`'s internals.
- **Check:** *candidate*, precise. A selector in an app's `<style scoped>` that names a `.pdx-*`
  class the app's own template does not write. The same rule in three files is also reported under
  CD-L1.

### CD-C3 — Tokens, never values

- **Mechanism:** `var(--pdx-space-*)`, `var(--pdx-color-*)`, `var(--pdx-radius-*)`. Never a hex, a
  `white`, or a spacing in px where a token exists. (Project rule, "Dark mode" and "Colour".)
- **Why:** a literal is right in one theme and wrong in twelve.
- **Anti-pattern:** none found. A grep for hex colours, `rgb(`/`rgba(` and `: white` / `: black` over
  `packages/showcase/src/**/*.pdx` returns 0 matches. Spacing literals are not surveyed.
- **Check:** measurable today with a grep for colour literals in `.pdx` styles. A *candidate* for a
  diagnostic.

---

## 7. The anti-patterns, and how each is recognised

| You see | It is | Rule |
|---|---|---|
| section comments that each introduce their own signals | several components in one file | CD-B1 |
| a copy that got a defect but not the fix | logic without one source | CD-L1 |
| two components fetching the same URL | loading in two places | CD-D1 |
| a handler named `onXKey` that does the work itself | a name that hides the action | CD-A4 |
| a route whose template is a stack of fieldsets/steps | a route that renders instead of composing | CD-B2 |
| a page keeps a copy of a child's state (`selectedIds` beside the grid's) | two owners | CD-S1 |
| `item.x = …` on something a `$derived` returned | a derived value written to | CD-S2 |
| a `version` signal read as `void version` | a source that should be a signal | CD-S3 |
| the same function names in two pages, a comment "same as X's" | logic to extract | CD-L1 |
| `onBeforeLeave` + a stored `resolve`, a document `pointerdown` for a menu | a framework feature rebuilt | CD-L2 |
| `document.querySelector` in a component | a component reaching outside itself | CD-A1 |
| a `@prop` assigned inside its own file | a component overwriting its input | CD-A2 |
| an exposed method that sets data | state through a side channel | CD-A3 |
| `fetch` in a leaf component | loading in the wrong place | CD-D1 |
| a `$watch` that only sets signals | a derivation one tick late | CD-D2 |
| `addEventListener` on `document` with no removal | a leak | CD-D3 |
| hundreds of style lines for several pieces | styles not following their component | CD-C1 |
| `.pdx-dg-row`, `.pdx-nav-item` in an app's styles | reaching into a library's internals | CD-C2 |

## 8. What a tool can measure

Precise enough for a diagnostic: CD-S2, CD-L1, CD-A1, CD-A2, CD-D3, CD-C2.
Heuristic, warning only: CD-B1, CD-B2, CD-S3, CD-D1, CD-D2, CD-C1.
Grep today: CD-C3.
Not measurable, review only: CD-B3, CD-A3, CD-A4. CD-S1 is measurable only at runtime, by a contract
row per list.

---

## 9. The four long showcase files

Line counts in the headings are `wc -l` of each file before the cut; each section gives the count
after it. A family of pieces goes in a folder named for its owner
(`src/shell/`, `src/tickets/`, …), plain logic in `src/data/`. Each target names the pieces that
leave and ends with what **stays**. **The default is "stays":** a helper, a constant or a handler
not named here remains in the file it is in today, or goes with the only piece that uses it.

The targets are at the level of pieces, not of every function. Each function is placed during the
cut, and the cut is done when the before/after test counts are equal.

### `src/shell.pdx` — 1084 lines (template 263, script 456, style 363)

- **Diagnosis:**
  - CD-B1: five pieces with state of their own, in one file;
  - CD-C1: one stylesheet for all of them;
  - CD-S2: profile items written after derivation;
  - CD-S3 + CD-D2: Recents' counter;
  - CD-A1: `document.querySelector` for the catalogue (`:362`, `:368`);
  - CD-C2: nav-menu internals;
  - CD-L2: a hand-built menu button, and a hand-built modal drawer (scrim, `inert`, focus);
  - CD-A4: handlers named for their trigger.
- **The cut:** the shell is about 600 lines, from 1084. Five pieces leave it, and the rail stays:
  - Running CD-B1's own graph on the shell shows the rail and the layout are **one** group. The rail
    reads and writes the layout's state:
    - `effectiveSide` sets the sidebar's width and its collapsed menu;
    - the drawer puts the focus on the rail's first entry;
    - `catalogOpen` and "All entities" take the focus back.
  - Splitting it would need commands both ways, and the entry chunk has no room for it. Measured
    after the four extractions: js 356.7/357 KB, blocking 79.9/80 KB.

  What leaves, as built:
  - `nav-model.ts`, `favourites.ts`, `recents.ts`;
  - `catalog.pdx`: `@prop open, favourites`, `@event dismiss, picked`;
  - `topbar.pdx`: `@prop menuOpen`, `@event openmenu`. It gives the focus back to its own ☰ when the
    drawer closes, so it needs no command.
  - `profile-menu.pdx`.

  The full target, of which the rail is not carried out (see above):

  ```
  src/shell/rail.pdx            <pdx-rail>: the nav menu (navItems, railKey, onNavSelect,
                                onNavPrefetch, onNavToggle, groupsOpen persisted), the foot
                                (environment, version); @expose focusAllEntities() for the focus
                                return (a command, CD-A3). NOT DONE: see above
  src/shell/nav-model.ts        CATALOG, DASHBOARD, ALL_LINKS, activeFor(), fold(): data + pure functions
  src/shell/favourites.ts       createFavourites(): pins as a signal, persisted (CD-S3)
  src/shell/recents.ts          createRecents(currentPath, pins): a signal, not a counter (CD-S3, CD-D2)
  src/shell/catalog.pdx         <pdx-catalog>: search, fold, select, its own :ref for the first entry
                                (CD-A1); @event select, @event close
  src/shell/topbar.pdx          <pdx-topbar>: the menu button, the title, the demo panel, the
                                settings gear (openSettings), the profile menu;
                                @expose focusMenuButton()
  src/shell/profile-menu.pdx    <pdx-profile-menu>: items, locale, scheme / density / language,
                                sign-out, the user's name and initials
  ```

  **Stays in `shell.pdx`:**
  - the layout: rail, frame, outlet, scrim, the brand;
  - the layout state, passed down as props (CD-S1): `side`, `menuOpen`, `catalogOpen`;
  - the children's requests to change it: `@event toggle-catalog` from the rail's "All entities",
    `@event open-menu` from the topbar's ☰;
  - the calls to `createFavourites()` and `createRecents(currentPath, pins, user)`. Their result
    goes to the rail (`navItems`, `railKey`) and to the catalogue (`isPinned`, `togglePin`) as
    props. `RECENT_LISTS` moves to `nav-model.ts`;
  - the app's rhythm and dialog tokens on `.app`, including `--app-bar-height`
    (`shell.pdx:737-759`). They are read by four of the new files, so they stay with the layout,
    which is the exception CD-C1 allows;
  - the compact-window and print rules that span several pieces;
  - the opening commands on the children: the catalogue's `@expose open()` (clear the search, focus
    it), and the rail's `@expose focusFirst()` for the drawer, plus the focus returns
    (`focusAllEntities()`, `focusMenuButton()`);
  - the rail handle. It lives in the frame on purpose: the rail clips its own edge
    (`shell.pdx:158-161`);
  - the Escape order and the outside-click rule between drawer and catalogue;
  - the close-on-navigate hook.

  `applyDensity(storedDensity())` at start-up moves to the app's entry (`app.pdx`): it is not the
  chrome's.
- **Dead rules:** `nav:not(:where(.pdx-nav))` (`shell.pdx:1017-1042`), and the duplicate `.brand`
  and `.session` rules. Those are removed, not moved.
- **Measure before building:** `pdx-app-layout` has an overlay drawer below a breakpoint
  (`ui/src/app-layout/pdx-app-layout.ts:32-33`). Check it against the hand-built modal drawer before
  moving that code (CD-L2).
- **Prerequisites, both in place:**
  - a `trigger` slot on `pdx-dropdown-menu`, with its entry-chunk cost measured. That cost is the
    second reason the hand-built menu's own comment gives (`shell.pdx:211-214`).
  - `pdx-menu` updates a radio in place.

  Without them, the profile menu moves into its own file with its hand-built behaviour unchanged.
  With them, `shell/profile-menu.pdx` is a `pdx-dropdown-menu` whose `trigger` slot holds the
  avatar, and nothing writes into derived items.

### `pages/tickets.pdx` — 941 lines (script 709, 39 functions)

- **Diagnosis:**
  - CD-L1: the list round-trip it shares with customers, and the undo defect it passes on;
  - CD-B2: one route holds the URL filter, create, the drawer, one record's actions, bulk writes
    with partial refusal, the live-update bridge and the demo knobs;
  - CD-A4: `onBulkAction` dispatches seven keys.
- **Target:**

  ```
  src/data/list-actions.ts      createListActions({ source, transport, grid }): selection (cleared
                                on the grid, its owner), open/close with the unsaved question, save,
                                optimistic remove + undo of EVERY row removed, and one write for a
                                selection with a partial answer (applyBulk / undoBulk, the outcome
                                line, the rows as they were)
  src/data/answer.ts            answerRefused + clearRefusal (today in tickets, customers, board),
                                answerReversible / answerVisible (tickets only today)
  src/data/url-filter.ts        queryFilter / writeFilterToUrl (tickets.pdx:262-285), and the
                                active-filter count + clearFilters built on them
  src/data/live-list.ts         the live-update bridge (tickets.pdx:809-870) and the reconnect that
                                re-reads (goOnline, :878-885): a pushed change applied to the source,
                                the notice, the selection mirror kept consistent
  src/tickets/create-dialog.pdx the create modal: its form, the customer typed, the asset picked
                                (tickets.pdx:548-571); @event create with the values
  src/tickets/bulk-actions.ts   the bar's action sets: the bar BECOMES its picker (`picking` swaps
                                the array, tickets.pdx:410-439), so this is data + a dispatch table
                                (status:*, assign:*, close, delete), not a component
  src/tickets/live-demo.ts      the colleague / offline knobs as registerDemo entries
                                (tickets.pdx:888-904): they have no markup, so a module, not a .pdx
  ```

  **Stays in `pages/tickets.pdx`:**
  - the source, the columns and the schema;
  - one record's ticket-specific actions (`duplicateRecord`, `exportRecord`), the inline subject
    edit, the ticket-specific bulk close (`closeSelected`), `canExport`, and `onBulkAction`, reduced
    to the dispatch table of `bulk-actions.ts`;
  - the markup of the live bar and of the bulk outcome line;
  - the demo-panel registration of the refusal knobs (`armRefusal`, `armBulkRefusal`);
  - the composition.

  Measure first whether `pdx-entity-grid` already covers the round-trip. No page uses it.

  **As built:** `pdx-entity-grid` does not cover the round-trip, so the choice is a composable. The
  component:
  - holds an array with an optimistic copy, where these lists read a server-paged DataSource;
  - creates in the edit drawer, where they create in a modal;
  - opens a record from a pencil, not from the row;
  - has no unsaved-changes question, no refusal and no undo.

  Closing that gap would not be a small, generic extension. What is built:
  - `src/data/list-actions.ts` holds what both lists do the same way: the selection mirror cleared on
    the grid, create, open/close with the unsaved question, save, and removal with its undo
    (`removeSelected`).
  - `src/data/answer.ts` holds the three answers, which tickets, customers and the board share.
  - The rest of the target above (`url-filter.ts`, `live-list.ts`, `create-dialog.pdx`,
    `bulk-actions.ts`, `live-demo.ts`) is in place, and the page is 639 lines.

  Two notes from the cut:
  - `live-list.ts` and the create dialog take their words from the page (`$t` is the page's), and
    `bulk-actions.ts` declares the bar's action shape itself: a showcase `.ts` does not resolve
    `@pdxui/ui` types without a build.
  - `createUrlFilter` is called LAST in the page's setup. Called first, a view opened from Settings
    also writes its filter into the address; called last, it does not. Why the order decides is not
    identified.

### `pages/employee-personal.pdx` — 501 lines

- **Diagnosis:**
  - CD-B2: eight fieldsets inline;
  - CD-L2: the hand-built leave bridge;
  - CD-L1: the per-field save, repeated in their own form by `asset`, `service` and `site`:
    `save: onChange`, a debounced save after a change (`core/src/form/form.ts:392-393`, 500 ms by
    default at `:256`), then
    "save what is pending" on the way out;
  - the "refused on another tab" logic, which any tabbed form with rules needs.
- **Target:**

  ```
  src/data/autosave.ts          createAutosave(form, { read, write }): saveField, the queue, the
                                save state (saving / saved / refused), flush on leave. The page's
                                `write` keeps what is the employee's own (a country other than Italy
                                clears the tax code, employee-personal.pdx:404-420)
  src/data/refused-tabs.ts      which tab holds a refused field, and goToRefused()
  src/employee/identity.pdx     the identity group: the tax code, shown and required only for a
                                residence in Italy (it takes the country as a prop)
  ```

  **Stays in `pages/employee-personal.pdx`:**
  - the form and its cross-field rule (`personalRule`, which reads the postcode, the document dates
    and the privacy consent: one validator for the form, not one per group);
  - the option lists (countries, languages, channels, document types);
  - the tabs;
  - the other seven groups, inline (CD-B3);
  - the leave guard (CD-L2).

  A group is extracted when it has behaviour of its own in the markup (a field that appears for a
  condition). Having a rule is not enough, because the rules belong to the form's validator.

  **As built:**
  - `src/data/autosave.ts` (`createAutosave`) holds the queue, the save state and the flush on
    leave. The page passes what is the employee's own: `extra` clears the tax code outside Italy,
    and `after` asks for it once the country is Italy.
  - `src/data/refused-tabs.ts` (`createRefusedTabs`) holds the per-tab counts and `goToFirst`.
  - `src/employee/identity.pdx` is a section of the page's form through `tryUseForm()`,
    and takes `country` as a prop.
  - The route is 399 lines, from 501: the form and its rule, the option lists, the tabs, the
    other seven groups and the leave guard.

  The identity group's markup uses the page's `.group` / `.grid` classes, which reach it
  because a scoped style applies to descendants. The group has no styles of its own.

### `pages/intake.pdx` — 479 lines

- **Diagnosis:**
  - CD-B2: four wizard steps inline;
  - CD-L2: the hand-built leave bridge.

  Intake has no answer helper of its own. Its only `answer*` is `answerLeave`.
- **Target:**

  ```
  src/intake/requester-step.pdx  step 1: requester, email, the customer picker, the asset picker;
                                 @event customer-picked, @event asset-picked
  src/intake/window-step.pdx     step 2: the window, the cross-field rule's message, the mode;
                                 @event mode-change
  src/intake/details-step.pdx    step 3: what the mode asked for, the lines field list, the attachment;
                                 @event attach, @event detach
  src/intake/billing-step.pdx    step 4: the second form, and the one Save for both
  ```

  Steps 1–3 hold named controls of the `intake` form. Each step component calls `tryUseForm()` and is
  wired to that form as a section.

  **Measure before building:** `pdx-wizard` finds its steps with
  `querySelectorAll('[data-wizard-step]')` (`ui/src/wizard/pdx-wizard.ts:77`), and a nested panel is
  the case that can escape it. Each step component must render the `data-wizard-step` element as the
  wizard's direct panel, or the wizard must learn to find panels inside custom elements. Prove that
  first with one step.

  Steps 1–3 edit ONE form (`intake`, declared with its `windowRule`). Step 4 declares nothing: the
  `billing` form stays in the route, with the coordinator that submits both. Each step takes that form and the page values it reads as
  props: the mode, the customer's name and id, the line count, whether it can submit, whether it was
  submitted, the server's error.
  It emits what it picks. The page values are shared across steps, so they are the route's state
  (CD-S1), not any step's.

  **Stays in `pages/intake.pdx`:**
  - the wizard and the step guard (`onBeforeStep`, `stepValid`);
  - the coordinator and the page values above;
  - the draft (`data/draft.ts`, already the right shape: offer, resume, discard);
  - `submitAll`;
  - the refusal knob's demo registration;
  - the leave guard (CD-L2).

  **As built:**
  - The wizard finds a `data-wizard-step` panel rendered inside a step component, so it needs no
    change. Measured with step 1 alone, before the other steps moved: the intake specs give the
    same counts.
  - The events are one lowercase word, as `validate.ts` asks: `customerpicked`, `assetpicked`,
    `modechange`, `attach`, `detach`. Step 4 emits `submit`, and the page answers it with
    `submitAll`.
  - `details-step.pdx` holds the `address` group itself, because a group in the parent does not
    prefix a section's fields. It takes the `intake` form as a prop for `<pdx-field-list>`.
  - The route is 364 lines, from 479.

---

## 10. What the framework gives these rules, and what it lacks

- **An app's own composable.** `composables.md` covers the library's; CD-L1 is the guide to an
  app's own, and the site's component design page carries it.
- **The leave guard is not one call.** A page asks in its own words through `getDialogQueue()`
  (modal). What is missing is one public function that also covers `beforeunload`
  (`guardUnsavedWork` is internal to forms), and an in-page, non-modal form of the question.
- **`pdx-dropdown-menu` takes a custom trigger** through its `trigger` slot, so an avatar needs no
  hand-built menu button.
- **`pdx-menu` updates a new items array of the same shape in place**, so a radio changes without a
  rebuild and nothing has to write into a derived value (CD-S2).
- **`pdx-data-grid` says its rows are clickable** with `row-clickable`, so no page patches the
  cursor.
- **Copied list logic diverges:** the copy in `customers` got a defect and not the fix (CD-L1).
- **A form's compile-time wiring crosses the component boundary:** a group of fields becomes its own
  component through `tryUseForm()`, without hand wiring. A group in the parent does not prefix a
  section's fields.

---

## Sources

Read through a fetch tool that summarises pages, so quotations are close to exact but
not byte-checked. Not read: Lit context, Lit mixins in depth, Angular `linkedSignal` in depth.

- React — https://react.dev/learn/thinking-in-react · https://react.dev/learn/choosing-the-state-structure ·
  https://react.dev/learn/sharing-state-between-components · https://react.dev/learn/passing-data-deeply-with-context ·
  https://react.dev/learn/reusing-logic-with-custom-hooks · https://react.dev/learn/manipulating-the-dom-with-refs ·
  https://react.dev/learn/you-might-not-need-an-effect · https://react.dev/learn/keeping-components-pure
- Vue — https://vuejs.org/style-guide/rules-essential.html · https://vuejs.org/style-guide/rules-strongly-recommended.html ·
  https://vuejs.org/style-guide/rules-use-with-caution.html · https://vuejs.org/guide/scaling-up/state-management.html ·
  https://vuejs.org/guide/components/provide-inject.html · https://vuejs.org/guide/essentials/computed.html ·
  https://vuejs.org/guide/reusability/composables.html · https://vuejs.org/guide/components/props.html ·
  https://vuejs.org/guide/components/events.html · https://vuejs.org/guide/essentials/template-refs.html
- Angular — https://angular.dev/style-guide · https://angular.dev/guide/di · https://angular.dev/guide/signals ·
  https://angular.dev/guide/signals/effect · https://angular.dev/guide/routing/data-resolvers ·
  https://angular.dev/guide/components/inputs · https://angular.dev/guide/components/outputs ·
  https://angular.dev/guide/components/styling
- Svelte — https://svelte.dev/docs/svelte/$state · https://svelte.dev/docs/svelte/best-practices ·
  https://svelte.dev/docs/svelte/$effect · https://svelte.dev/docs/svelte/$bindable · https://svelte.dev/docs/svelte/$props ·
  https://svelte.dev/docs/kit/state-management · https://svelte.dev/docs/kit/load
- Lit — https://lit.dev/docs/composition/component-composition/ · https://lit.dev/docs/composition/controllers/ ·
  https://lit.dev/docs/composition/overview/ · https://lit.dev/docs/components/properties/ ·
  https://lit.dev/docs/components/events/ · https://lit.dev/docs/components/lifecycle/ ·
  https://lit.dev/docs/components/styles/
