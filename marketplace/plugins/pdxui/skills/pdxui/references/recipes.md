# UI recipes (the common screens)

Patterns proved on the screens of a LOB app. The service-desk showcase in `packages/showcase` uses them on real screens.
Always read [gotchas.md](gotchas.md) and the [catalogue](README.md) too.

## App shell (header + sidebar + content + footer)
The component: **`pdx-app-layout`** (its regions come from `data-region="header|navbar|aside|footer"`, and everything else is main).
- Collapsing to a mini rail: `navbar-collapsed` plus `navbar-collapsed-width`. Responsively: `navbar-breakpoint` (below it →
  a drawer overlay). The variants: `navbar-full-height` (a sidebar that swallows the header) against a full-width header.
- Toggling the mobile drawer: the imperative API, `document.querySelector('pdx-app-layout').__appLayout.toggleNavbar()`.
- The nav: **`pdx-nav-menu`** (`:items` is `{key,label,icon,href,disabled,badge,children}`, plus `active-key` and `@pdx-select`).
- Keep the developer tools (the theme and scheme switchers) OUTSIDE the layout: a `position:fixed` gear opening a `pdx-drawer`.
- `:class` on a `data-region` is fine — it merges with the class the layout adds (measured). ⚠️ But the region NAMES are a closed set of four: anything else drops out of the layout in
  silence. The canonical example: `Pragmatic.Design.Builder/golden/app/src/app.pdx`.

## A list or grid (no page scroll, virtualised)
The component: **`pdx-data-grid`**, with either `:data` (an array, auto-wrapped in a DataSource) or `:source` (a pdx DataSource).
- **Fill the viewport without scrolling the page**: `fill-height` plus `virtual-scroll` plus a host with `flex:1; min-height:0`
  inside a full-height column. Only the body scrolls, and it is virtualised.
- FLEX columns → set a **`minWidth`** per column (≥120 when it is filterable). For anything richer than text use
  **`cell:`**, not `format:` — the type marks `format` `@deprecated` («a function that returns HTML is sanitized but
  fragile and not generator-friendly»). The typed renderers, all exported from `@pdxui/core`:
  **`badge()` `status()` `currency()` `dateCell()` `link()` `booleanIcon()` `actions()` `rowMenu()`** — the grid builds
  the DOM with `textContent`, no `innerHTML`. A plain string formatter is still fine for simple text.
- **A row's OWN actions**: `actions()` draws a button per entry — right for one or two, wrong for four, because at
  390px a row of four icon buttons is the whole width of the phone. Past two, `rowMenu({ items })` draws ONE trigger
  that opens the grid's menu (arrows, type-ahead, Escape back to the trigger). Its items carry what a row of buttons
  cannot say: `href: (row) => '…'` makes the entry a real `<a>` (middle-clickable, copyable, announced as a link
  — `window.open` in a handler is none of those), and `disabled: (row) => …` + `disabledReason` leaves a refused
  action on screen, `aria-disabled`, with its reason reachable, instead of making it vanish.
- Filters: `filter-mode="row"` (a dedicated row) | `filter-mode="header"` (a funnel in the header, no row) |
  a **`pdx-filter-builder`** above it (chip-based, with `:fields` and `:source`). Paging: `:source=createDataSource({pageSize})`
  (without virtualisation) → and a `pdx-pagination` footer.
- Multiple selection: `selection="multiple"` → the `pdx-selection-change {selected:ids,count}` event. Give the
  source `selection: {mode:'multiple'}` and `ds.selectedCount()` / `ds.selectedItems()` follow the ticks too, with
  cross-page select-all and optional persistence; without it the source stays empty by design. The bulk-action bar:
  build it yourself (sticky at the bottom), driven imperatively from the handler (see the reactivity gotchas). The API:
  `el.clearSelection()` and `el.getSelectedIds()` — FLAT on the element (there is no `__dataGrid`; measured).
- The canonical examples: `Pragmatic.Design.Builder/golden/app/src/routes/patients.pdx` (plus `patients-paged/header/builder.pdx`).
- **A reusable structure (DRY, the shape the generator emits)**: THIN screens that wire up a
  **descriptor plus services**, rather than copied logic:
  - `data/<entity>.entity.ts` is the descriptor (`title`, `idField`, `crumbs`, `newDefaults`, `data()`, `columns()`, `formSchema`, `filterFields`).
  - `src/lib/` holds the services, wired automatically in `onMount`: `entity-source`, `edit-flyout` (the edit overlay), `bulk-bar`,
    and `auto-page-size` (density-aware paging). They drive the DOM imperatively, but NOT because a custom-event handler
    cannot set a signal — it can (measured). New code does not need the imperative shape.
  - `src/components/` holds the `.pdx` partials, **pure markup** with `data-*` hooks (`list-header`, `entity-edit-flyout`,
    `bulk-bar`), wired by the services. The shared CSS lives in `styles/app.css` (global, so it reaches the partials).
  - A new `.pdx` component is picked up by the dev server on its own (it rescans and reloads, and
    says so). No restart.

## Dashboard
KPIs go in a **`pdx-card`** (a large value, a muted label, a coloured trend and an icon pill) or in a **`pdx-statistic`**.
Charts: **`pdx-chart`** (`type` of line, bar or doughnut, plus `:data`, `x-field`, `y-field` and `series-names`). For a dual-axis combo:
`series-config` (a JSON string carrying `field`, `type` and `yAxisIndex`) plus `y-axis-right-name` and `y-right-format`.
The activity table: a `pdx-data-grid` using `format` for the status badges. The canonical example: `Pragmatic.Design.Builder/golden/app/src/routes/home.pdx`.

## Auth / login
An uncontrolled form (no `:value`), with submit-on-Enter through `@keydown`. A per-route guard (`requireAuth()`), and the chrome conditioned on the
route rather than on the authentication. The credential fields: `autocomplete="username"` and `current-password`. The canonical example: `routes/login.pdx`.

## CRUD and forms (proved in the golden app)
- A data-driven form from `FieldDefinition[]` → `toFormFields(fields)` → a `FormSchema` (the same definition that drives
  the grid columns and the filter builder: "one piece of JSON for the grid, the form and the filters"). enum→a select (with `options`), number→a
  number-input, date→an input[type=date]. Sections: **`pdx-fieldset`** when you want a visible heading (`legend` + `description`) — `pdx-form-section` renders NO title, its props are `name/label/fields/validate/active` and it is for wizard-style grouping. Multi-step: `pdx-wizard`.
- **An edit fly-out from the list** (canonically `Pragmatic.Design.Builder/golden/app/src/routes/patients.pdx`): an **overlay** — `.patients-page`
  is `position:relative; overflow:hidden` and contains `.main-col` (the page head plus the grid, full width), an `.edit-backdrop`
  (`position:absolute; inset:0`) and the `.edit-panel` (`position:absolute; top:0; right:0; bottom:0; width:420px;
  transform:translateX(100%)`). The grid **stays full width** behind it; the panel slides over it from the right
  (anchored to the topbar, which is the top of the content) with a backdrop. An `.editing` class on the page opens the panel and the backdrop
  together (`.patients-page.editing .edit-panel{transform:translateX(0)}` and `.edit-backdrop{opacity:1;pointer-events:auto}`).
  Open it on `@pdx-row-click` (whose detail is `{row,index,id}`); close it on the backdrop's `@click`. (Not the *push* variant — a flex row
  with a panel that steals space: with a wide table the grid gets squashed.) ⚠️ Drive the opening and the populating through the **DOM imperatively**
  (the golden app does; a signal set from a custom event does update the template — measured). The form is **rebuilt on every
  opening** (`createFormFromSchema` → `form.reset(row)` → a `pdx-form-template` around that form): form-template's value
  binding happens at build time and is not reactive (see the gotchas). To save: `form.getValues()` → `ds.update` plus `ds.sync`.
- The other edit modes (planned): a modal (`pdx-dialog`, or the grid's `edit-mode="dialog"`), and a dedicated page.

## A long form filled in more than one sitting: `<pdx-form :form>`

For a form you write by hand, this is the best path: a form from
`createForm`, a `<pdx-form :form>` around the fields, and in each `<pdx-form-field name="x">` a
control carrying **the same** `name="x"`. The compiler wires the rest (`codegen-form-binding.ts`):
every named control gets its change and blur events routed into `form.fields.x`, and every named
field gets its `error` / `touched` / `warning` from it. You write no `:value`, no `@input`.

**A long form splits into sections, and each section is a component.** The wiring is a
compile-time pass over the HTML of one `.pdx`, and it runs in two places:

- in the file that holds `<pdx-form :form>`, over what is inside it;
- in a file whose script calls **`tryUseForm()`** (or `useForm()`): that call declares "this
  component is a section of the form above me", and its **whole template** is wired to that form.

```pdx
<!-- employee-identity.pdx: a section, used inside the page's <pdx-form> -->
<template>
  <pdx-form-field name="firstName" label="First name"><pdx-input name="firstName" /></pdx-form-field>
  <pdx-form-field name="lastName" label="Last name"><pdx-input name="lastName" /></pdx-form-field>
</template>
<script setup>
import { tryUseForm } from '@pdxui/core';
const form = tryUseForm();   // the declaration; the bindings find the form themselves
</script>
```

You write no `:value`, no `@pdx-input`, no prop to pass the form down: `<pdx-form>` provides it,
and the section's bindings look it up. Measured: two named controls, one beside `<pdx-form>` and
one in a child, typed into both, read `{ "here": "A", "deep": "A" }`.

**`tryUseForm()`, not `useForm()`, for the declaration.** ⚠️ A child can set up BEFORE its
`<pdx-form>` — happy-dom connects children before parents, and a browser does too when the form's
module loads after the fields'. `useForm()` then throws; `tryUseForm()` answers
`undefined`, and the section still works, because the generated bindings do not use your variable:
each one calls `tryUseForm(ctx.el)`, which re-runs the moment a form is provided. The same holds for a
section rendered with no form above it at all — its controls are simply unbound. Your own `form`
variable is what the lookup found at setup, so it can be `undefined`: guard it (`form?.…`) where your
code reads it.

A control is wired only in a file that is inside a form or declares itself a section.
A plain child component that does neither is compiled from another file and is never seen. And
the boundary is the **component**, not the depth — any nesting of ordinary markup
(`<div><fieldset><pdx-input name="x">`) is still that template and is wired.

And when the sections are genuinely separate forms rather than one form
split up, give each `<pdx-form>` a `name` and put a **coordinator** above them
(`createFormCoordinator()`): each registers itself, and the coordinator validates and submits
them together.

Passing `form` down as a prop works, and it is not what the framework offers: `provideForm` /
`useForm` is the designed path, and what `pdx-form` does internally. Without it a long form tends to
stay one file of several hundred lines.
Pinned by `compiler/tests/form-binding-boundary.test.ts` (the form's own file) and
`compiler/tests/form-binding-injected.test.ts` with `ui/tests/unit/form-section-runtime.test.ts` (a
section).

### Rows that repeat: `<pdx-field-list>` or `createFieldArray`

Two mechanisms, no shared implementation, and **they do not compose**. Pick one per field name.

| | `<pdx-field-list name="rooms" :form>` | `createFieldArray` / `form.array('rooms')` |
|---|---|---|
| what it is | a **component**: it draws the rows, the add and remove buttons, and one control per `itemFields` entry | a **primitive**: reactive state, no markup at all |
| where a row lives | dotted paths in the form — `rooms.0.type`, `rooms.1.type` | `{ __id, value }` wrappers in a signal |
| how you address a row | by **index**, and the index moves: removing a row re-indexes every row after it (the form carries each row's value, error, touched and dirty along) | by **`__id`**, which survives a removal, a move and an `update()` |
| what a row can contain | plain controls only — text, email, number, textarea, checkbox, switch. A `select` gets **no options**; anything else becomes a text input | anything you can render |
| writing one field of one row | the form field at that path: `form.fields['rooms.0.type'].onChange(v)` | `rows.update(i, { ...rows.getValues()[i], type: v })` — `update` keeps the `__id`, `replace` does not |

**Choose the component** when the rows are plain fields and you want the table, the dialog mode and the buttons for free. **Choose the primitive** when a row needs a picker, a select with options or a component of its own — then draw it yourself, or keep `pdx-field-list` and put the row in its `row` slot, which receives `{ item, index, fields, remove }`.

⚠️ **Never both on one name.** They are two storages, and `form.getValues()` merges the field arrays back **last**: one call to `form.array('rooms')` on a name a `<pdx-field-list name="rooms">` is managing replaces everything the list has written, with the array's own contents — which it seeded from `initialValues`, not from what you typed. Measured: a field edited through the list reads back as its initial value the moment `form.array()` is called on that name, with nothing in the console.

The comparison is pinned by `packages/ui/tests/unit/repeating-rows-mechanisms.test.ts`, which measures both mechanisms side by side, so this table cannot drift from the code.

`createForm` takes one object:

```ts
createForm({
  initialValues,       // required — every field, with its starting value (nested objects become 'a.b' fields)
  validators?,         // { field: [required(msg?), minLength(n, msg?), min(n, msg?), email(msg?), …] }
  validateOn?,         // 'onBlur' (default) | 'onChange' | 'onSubmit'
  warnings?, asyncValidators?, schema?, saveMode?, source?,
})
// → form.fields.x.{ value(), error(), touched(), dirty(), onChange(v), onBlur() }
//   form.setValues(partial) · form.getValues() · form.reset(values?) · form.validate()
//   form.valid() · form.dirty() · form.handleSubmit(fn)
```

A shipment form whose draft survives closing the tab:

```html recipe:long-form
<template>
  <pdx-form :form="form" @pdx-submit="send">
    <pdx-form-field name="shipper" label="Shipper" required>
      <pdx-input name="shipper"></pdx-input>
    </pdx-form-field>
    <pdx-form-field name="service" label="Service">
      <pdx-select name="service" :options="services"></pdx-select>
    </pdx-form-field>
    <pdx-form-field name="weight" label="Weight (kg)">
      <pdx-number-input name="weight"></pdx-number-input>
    </pdx-form-field>
    <pdx-form-field name="notes" label="Notes">
      <pdx-textarea name="notes"></pdx-textarea>
    </pdx-form-field>
    <pdx-form-actions submitLabel="Send"></pdx-form-actions>
  </pdx-form>
  <button class="pdx-btn pdx-outline save-draft" type="button" @click="saveDraft()">Save draft</button>
  <span class="draft-state pdx-txt-small pdx-ink-muted">{{ savedAt }}</span>
</template>

<script setup>
import { createForm, required, minLength, min } from '@pdxui/core';

const DRAFT_KEY = 'shipment-draft';
const services = [{ value: 'std', label: 'Standard' }, { value: 'exp', label: 'Express' }];
let savedAt = $signal('');

const form = createForm({
  initialValues: { shipper: '', service: 'std', weight: 0, notes: '' },
  validators: {
    shipper: [required('Who is sending it?'), minLength(3, 'At least 3 characters')],
    weight: [min(0.1, 'Weigh it first')],
  },
  validateOn: 'onChange',
});

onMount(() => {
  const draft = localStorage.getItem(DRAFT_KEY);
  if (draft) form.setValues(JSON.parse(draft));
});

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(form.getValues()));
  savedAt = 'Draft saved ' + new Date().toLocaleTimeString();
}
function send(e) { localStorage.removeItem(DRAFT_KEY); console.log('sent', e.detail.values); }
</script>
```

A `<script setup>` needs no rune to work: one with none is compiled like any other.

What that gives you (`packages/ui/tests/unit/recipe-long-form.test.ts` runs this block):
- **`form.setValues(draft)` reaches controls already on screen**, the `pdx-select` included — `pdx-form`
  pushes an outside change into the text inputs, the other controls are bound to the field.
- **The error under the field while typing**, as `role="alert"` with `aria-invalid` on the input.
  With `validateOn: 'onChange'` every keystroke validates, and the field shows the error at once;
  with the default `'onBlur'` it appears on the first blur and then follows every keystroke.
- **The field keeps its node, and so its focus.** The gotcha "a controlled `:value` plus `@input`
  recreates the input" does **not** apply inside `<pdx-form :form>`: text controls get no `:value`.
- `@pdx-submit` fires after `validate()` passes, with `detail.values`; a failed submit scrolls to the
  first error.

Nested data: wrap fields in `<pdx-field-group name="customer">` and a field `name="email"` inside it is
`form.fields['customer.email']`. The compiler writes that full path into the DOM too: the control and
its `pdx-form-field` carry `name="customer.email"`, so that is the selector to use in a test or a
measurement — `[name="customer.email"]`, not `[name="email"]`. Repeated rows: `pdx-field-list` — see
its `itemFields` note for when a row needs its own component.

**Your own validator is a function.** A `Validator` takes the value and returns the message when it
fails, `undefined` when it passes — that is all `required` and `minLength` are. For a regular
expression you need not write one: `pattern(regex, msg)`.

```html
<template>
  <pdx-form :form="form" @pdx-submit="book">
    <pdx-form-field name="chip" label="Microchip">
      <pdx-input name="chip"></pdx-input>
    </pdx-form-field>
    <pdx-form-field name="day" label="Day">
      <pdx-input name="day"></pdx-input>
    </pdx-form-field>
  </pdx-form>
</template>
<script setup>
import { createForm, required, pattern } from '@pdxui/core';

const notSunday = (v) => (v && new Date(v).getDay() === 0 ? 'The clinic is closed on Sunday' : undefined);

const form = createForm({
  initialValues: { chip: '', day: '' },
  validators: {
    chip: [required(), pattern(/^\d{15}$/, 'A microchip number has 15 digits')],
    day: [required(), notSunday],
  },
});
function book(e) { console.log('booked', e.detail.values); }
</script>
```

## Do not leave with unsaved work

**Declare it on the form: `warnUnsaved`.** Every screen that creates or edits a record gets it — the
create screen too, which is the one a hand-written guard forgets. Leaving the page while the form is
dirty — a link, `navigate()`, Back — asks with an in-app dialog; closing or reloading the tab asks too,
in the browser's own words.

```html
<template>
  <pdx-form :form="form" @pdx-submit="save">
    <pdx-form-field name="name" label="Owner" required>
      <pdx-input name="name"></pdx-input>
    </pdx-form-field>
    <pdx-form-actions submitLabel="Save"></pdx-form-actions>
  </pdx-form>
</template>

<script setup>
import { createForm, required } from '@pdxui/core';
import { navigate } from '@pdxui/router';
import { saveOwner } from './lib/owners';

const form = createForm({
  initialValues: { name: '' },
  validators: { name: [required()] },
  warnUnsaved: true,
});

async function save(e) {
  const saved = await saveOwner(e.detail.values);
  form.reset(saved);        // what was saved is the clean state: leaving now does not ask
  navigate('/owners');
}
</script>
```

With a declared form it is one word: `@form owner: OwnerSchema { warnUnsaved }`.

- **Say that you saved.** A save through `form.handleSubmit(fn)` makes the saved values the clean
  state by itself. Saving from `<pdx-form @pdx-submit>` does not know when your request succeeded:
  call `form.reset(saved)` before navigating away, or the page asks about work it has just saved.
- **It guards wherever the form is created in a component on the page** — the page itself, a creation
  dialog, an editor panel. The router asks every component inside the page it leaves.
- **The words are yours.** The dialog reads `form.unsavedTitle`, `form.unsavedMessage`,
  `form.unsavedLeave` and `form.unsavedStay`; override them with `setComponentStrings('form', { … })`
  or `setLocaleStrings`.
- **The address while it asks.** The page is asked where `onBeforeNavigate` is: a link waits for the
  answer with the address unchanged, Back has already moved it and "Stay" puts it back, and neither
  adds a history entry. It asks when the path changes, a parameter of the same route
  included (`/owners/1` → `/owners/2`); a change of the query alone does not ask.

**A guard that is not about a form** — an upload still running, a call in progress — is
`onBeforeNavigate` from `@pdxui/router`, answered from that state, and removed with the page. The
same in-app dialog is `getDialogQueue()` from `@pdxui/core`; `<pdx-overlay-outlet>` draws it, so
the app shell needs one:

```js
const askToLeave = () => getDialogQueue()
  .push({ type: 'confirm', title: 'Upload in progress', message: 'Leave and cancel it?', confirmLabel: 'Leave', cancelLabel: 'Stay' })
  .then(answer => answer === true);
const stop = onBeforeNavigate(() => (uploading() ? askToLeave() : true));
onDestroy(stop);
```

It is asked for every navigation, Back included. A link waits for the answer with the address
unchanged; Back and Forward have already moved it when the hook is asked, and "Stay" puts it back,
with no new entry. `beforeunload`, for the tab being closed, is yours to add
there.

## Day agenda per resource (vets, rooms, technicians)

There is no scheduler component yet (`pdx-scheduler` is on the roadmap, not planned). A day agenda is a
CSS grid: one column per resource with a sticky header, one row per five minutes with a sticky time
column, and each appointment placed by `grid-row: start / span n`.

**Short appointments stay readable.** A 15-minute slot is three rows, so it holds one line at the body
font. Under 30 minutes a block shows **one line**, `time · name`; the rest (animal, reason) is in its
accessible name and in a tooltip on hover or keyboard focus, and the tap opens the appointment. Three
lines stacked in a 32px block under `overflow: hidden` cut the name.

```html
<template>
  <pdx-segmented class="agenda-pick" :options="resourceOptions" :value="shown" @pdx-change="e => shown = e.detail.value"></pdx-segmented>
  <div class="agenda" :style.--agenda-cols="String(resources.length)">
    <div class="agenda-corner"></div>
    @for (resources as r; track r.id) {
      <div class="agenda-res" :class.agenda-hidden="!isShown(r.id)" :style.grid-column="String(col(r.id))">{{ r.name }}</div>
    }
    @for (hours as h; track h) {
      <div class="agenda-time" :style.grid-row="row(h) + ' / span 12'">{{ h }}</div>
    }
    @for (appointments as a; track a.id) {
      <div class="agenda-cell" :class.agenda-hidden="!isShown(a.resource)" :style.grid-column="String(col(a.resource))" :style.grid-row="row(a.start) + ' / span ' + a.minutes / 5">
        <button type="button" class="agenda-appt" :class.agenda-short="a.minutes < 30" :aria-label="label(a)" @click="open(a)">
          <span class="agenda-line">{{ a.start }} · {{ a.patient }}</span>
          @if (a.minutes >= 30) { <span class="agenda-line agenda-more">{{ a.animal }} — {{ a.reason }}</span> }
        </button>
        <pdx-tooltip :text="label(a)"></pdx-tooltip>
      </div>
    }
  </div>
</template>

<script setup>
const resources = [{ id: 'rossi', name: 'Dr. Rossi' }, { id: 'bianchi', name: 'Dr. Bianchi' }];
const hours = ['08:00', '09:00', '10:00', '11:00'];
const DAY_START = 8 * 60;
const appointments = [
  { id: 1, resource: 'rossi', start: '08:00', minutes: 15, patient: 'Fido', animal: 'dog', reason: 'booster vaccine' },
  { id: 2, resource: 'bianchi', start: '08:15', minutes: 60, patient: 'Birba', animal: 'cat', reason: 'post-op check' },
  { id: 3, resource: 'rossi', start: '08:30', minutes: 30, patient: 'Argo', animal: 'dog', reason: 'limping' },
].sort((x, y) => x.start.localeCompare(y.start));   // DOM order = time order = keyboard order

let shown = $signal('rossi');                          // the one resource shown at phone width
const resourceOptions = resources.map(r => ({ value: r.id, label: r.name }));
const minutesOf = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const row = (hhmm) => (minutesOf(hhmm) - DAY_START) / 5 + 2;     // row 1 is the header
const col = (id) => resources.findIndex(r => r.id === id) + 2;   // column 1 is the time
const isShown = (id) => id === shown;
const label = (a) => `${a.start}, ${a.minutes} min: ${a.patient} (${a.animal}), ${a.reason}`;
function open(a) { console.log('open appointment', a.id); }
</script>

<style scoped>
.agenda {
  display: grid;
  grid-template-columns: 4rem repeat(var(--agenda-cols), minmax(10rem, 1fr));
  grid-template-rows: auto;          /* the header row */
  grid-auto-rows: 0.75rem;           /* then one row per 5 minutes: a 15-minute visit is 2.25rem */
  max-height: 70vh;
  overflow: auto;
}
.agenda-corner, .agenda-res { grid-row: 1; position: sticky; top: 0; z-index: 1; background: var(--pdx-color-surface); }
.agenda-corner { grid-column: 1; left: 0; z-index: 2; }
.agenda-res { padding: var(--pdx-space-xs); font-weight: var(--pdx-weight-medium); }
.agenda-time { grid-column: 1; position: sticky; left: 0; background: var(--pdx-color-surface); color: var(--pdx-color-muted); font-size: var(--pdx-text-xs); }
.agenda-cell { display: flex; padding: 1px; min-width: 0; }
.agenda-appt {
  flex: 1; min-width: 0;
  min-height: calc(1lh + 2 * var(--pdx-space-2xs));   /* never less than one readable line */
  display: flex; flex-direction: column; align-items: flex-start; overflow: hidden;
  padding: var(--pdx-space-2xs) var(--pdx-space-xs);
  font: inherit; font-size: var(--pdx-text-sm); line-height: 1.3; text-align: start;
  color: var(--pdx-color-text); background: color-mix(in oklch, var(--pdx-color-primary) 12%, transparent);
  border: 0; border-radius: var(--pdx-radius-sm); cursor: pointer;
}
.agenda-line { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.agenda-more { color: var(--pdx-color-muted); }
.agenda-pick { display: none; }
@media (max-width: 640px) {
  .agenda-pick { display: inline-flex; margin-block-end: var(--pdx-space-sm); }
  .agenda { grid-template-columns: 3.5rem 1fr; }
  .agenda-hidden { display: none; }
  .agenda-res, .agenda-cell { grid-column: 2 !important; }
}
</style>
```

- **Every block is a button** with the whole appointment in its accessible name; the DOM order is
  the time order, so Tab walks the day in order.
- **At phone width one resource at a time**, picked with `pdx-segmented`; the grid keeps its rows.
- `packages/responsive/tests/integration/ui-components/recipe-agenda.spec.ts` measures this block's CSS
  in Chromium: in a 15-minute block the line is as tall as its `line-height` and its text is not cut
  (`scrollHeight <= clientHeight` on the line's own box), and the block stays inside its slot. Measure
  the text's box, not the block's: when a slot is too short the block keeps its height and the
  `overflow: hidden` line shrinks and cuts its own text. CSS that stacks three lines in a short block fails the measure.

## A generic LOB admin: a descriptor → `createCrud` and `createDetail` (canonically `Pragmatic.Design.Builder/profiler/app`)
An app with dozens of entities: **no hand-written per-entity `.pdx` at all**. Two runtimes and two generators.
- **The runtimes** (`src/lib/`): `createCrud(d)` (the list: grid, filter builder and CRUD drawer), and `createDetail(d)` (master-detail:
  a root form plus child tabs), plus `owned-source` (a child grid filtered by its parent) and `crud-page`'s option helpers
  (`dfOpts('TYPE')` for a DynamicField lookup, `enumOpts('Enum')`, `entityOpts('endpoint', r=>label)`).
- **The per-entity descriptor**: `{ endpoint, title, columns, filterFields, formFields:[{k,label,type,opts?,req?}] }`.
  The form types: `text|select|date|number|checkbox|taglist|json`. **A single registry**, `data/entity-forms.ts`
  (`endpoint→formFields`), reused for the create-on-the-fly too (see below).
- **The generators** (`app/tools/`): `gen-route.mjs` (the lists; with `detail:true`, a row click navigates to the detail),
  and `gen-detail.mjs` (master-detail). The routes need a `@page`; the filename is not the path (`tags.pdx` can serve `@page '/'`).
- **The CRUD drawer**: it uses `lib/drawer.ts` (imperative opening through `[data-open]` plus reparenting to body, see the gotchas). The
  Delete button **asks for confirmation** (`confirmDialog`); the saves raise a success or error **toast**.

## Master-detail plus relationship tabs (owned and many-to-many)
`createDetail` renders the root form plus the tabs. There are two kinds of tab:
- **Owned** (children the parent owns, Traveler→Contacts for instance): a child grid plus a full CRUD drawer, with `parentField` as the foreign key to the parent.
- **Many-to-many (joinMode)**: a join entity. The "New" drawer offers a **multi-pick grid** (a `pdx-data-grid selection="multiple"`
  over the target's options → one join POST per selected id) plus a **"Create a new {target}"** toggle (create-on-the-fly:
  it creates the target entity from the registry's form → POSTs the target → POSTs the join). The child grid resolves the **label from the target**
  (on the backend, through a nav-path projection; see the backend skill). The canonical example: `Pragmatic.Design.Builder/profiler/app/src/lib/detail-page.ts`.

## A form-based JSON editor (complex object and list fields)
For the `json` fields (serialised objects and arrays): a "⚙ Form editor" button under the textarea opens a schema-driven modal.
- The schema lives in `data/json-schemas.ts`, per field: `kind: list|object|dict`, with `[{k,label,type}]` (the type being
  text|number|bool|date|time|enum|taglist|object|objectList). The textarea stays the **source of truth** (the save is unchanged);
  the editor rewrites it with the serialised JSON.
- **A recursive renderer**, `{el, read()}` (no DOM queries → repeaters and nesting compose). A plain-DOM modal at body level,
  and wide; **the complex branches (object and objectList) are "Edit…" buttons opening a SUB-modal** (do not crowd the UI). For lists:
  numbered rows, an empty state, and a "＋ Add" at the foot. The canonical example: `Pragmatic.Design.Builder/profiler/app/src/lib/json-editor.ts`.

## An app that is not in English

There are **two layers**, and they are not alternatives. Mixing them up costs an afternoon.

| | what it carries | who writes the keys |
|---|---|---|
| **`$t()`** | YOUR app's strings | you |
| **the component registry** | the defaults inside `@pdxui/ui` and `@pdxui/router` | we do — you only override |

### Your own strings: `$t()`

A first-class i18n system, in `@pdxui/core`. Set it up once, in `main.js`, **before mounting**:

```js
import { initI18n, loadTranslations, $t, setLocale } from '@pdxui/core';
import it from './locales/it.json';

initI18n({ locales: ['it', 'en'], default: 'it', detect: true, persist: true });
loadTranslations('it', it);
```

`detect` reads `navigator.language`; `persist` takes `true` (localStorage), `'session'`, or a function
of your own. `setLocale('en')` switches at runtime and falls back by base language — `en-US` → `en` →
the default.

Then, anywhere:

```js
$t('queue.empty')                          // plain
$t('queue.assignedTo', { name: 'Elena' })  // interpolation
$t('queue.count', { count: n })            // ICU plural: {count, plural, one {…} other {…}}
```

**`$t` reads the locale signal**, so a `$derived` or a template function that calls it re-renders when
the language changes. You do not wire anything.

Dates, numbers and relative times come from the same place, over `Intl`:
**`$n(1234.5)` · `$d(date)` · `$r(-3, 'day')`**. And for right-to-left there is `direction`, `isRTL`,
`inlineStart()` / `inlineEnd()` and `flipPlacement()` — real RTL, not an attribute on `<html>`.

**Lazy dictionaries**, when the app has more than a couple of languages:

```js
createI18nLoader({ mode: 'static', basePath: '/locales' });  // or 'fetch' | 'custom' | 'route'
```

It loads on locale change, by itself.

### The tooling, which is the part usually missing

```
npm i -D @pdxui/cli   once per app: the CLI is a dev dependency, not part of @pdxui/framework
npx pdx i18n extract      scan .pdx/.ts for $t() keys → a translation template
npx pdx i18n types        generate i18n-keys.d.ts — $t() is then type-checked against known keys
npx pdx i18n validate     missing and orphan keys per locale, plus malformed ICU
```

After `pdx i18n types`, `$t('quee.empty')` does not compile. Run it in the same step as the build.

**Where the dictionaries are looked for**: `translations/*.json`, `locales/*.json` and
`public/locales/*.json`, each under the source root and under the project root. Anywhere else, say so:
`pdx i18n validate --dicts "i18n/**/*.json"`. When nothing is found the command prints every place it
tried.

**A composed key is not a key.** `$t('nav.' + key)` and `` $t(`nav.${key}`) `` are read as the PREFIX
`nav.`: it is never reported as missing, and every dictionary entry under it counts as used — so
`--strictOrphans` is usable in an app that translates an enum. If no
entry at all starts with that prefix you get a warning, because at runtime it resolves to the raw key.

**`$t` and the component registry are two different registries**, and this is the mistake the tooling
is best at catching: `$t('router.notFound')` renders the raw key, because `router.notFound` belongs to
the registry below, not to your dictionary. `validate` names it and tells you which call sets it.

### Our components' strings: the registry

Everything `@pdxui/ui` and `@pdxui/router` render goes through one registry, replaced in one
call at start-up:

```js
import { setLocaleStrings } from '@pdxui/core';

setLocaleStrings({
    dialog:     { close: 'Chiudi' },
    pagination: { label: 'Impaginazione', previous: 'Precedente', next: 'Successiva',
                  range: '{from}–{to} di {total}' },
    select:     { search: 'Cerca...', noResults: 'Nessun risultato' },
    router:     { notFound: 'Pagina non trovata', backHome: '← Torna alla home' },
});
```

⚠️ **One argument, not two.** `setLocaleStrings('it', {…})` does not exist: the function takes the map
alone, and a string first argument makes `Object.entries` yield character indices, registering
components called `0` and `1`. Silently.

**Every key, with its English default, is in `references/component-strings.md`**, generated from the
sources. Take the keys from there rather than guessing. There is **one** registry. Most defaults are
written in `node_modules/@pdxui/ui/src/shared/i18n.ts`, while the grid
(`node_modules/@pdxui/ui/src/data-grid/grid-i18n.ts`, ~60 keys), a dozen components and the router
(`node_modules/@pdxui/router/src/outlet.ts`) declare their own. `setLocaleStrings` overrides any of
them the same way; the table's last column says where each default is written.

⚠️ **Install it before the app mounts.** Components read the registry as they build their DOM, and a
string set afterwards does not reach attributes already written. Imports are hoisted: in a module
that imports the components, the body runs after them — and a component already in `index.html` has
rendered by then. So put `setLocaleStrings` in a module of its own and import it **first**.

The English defaults each component registers when it loads do not overwrite what you installed:
defaults and overrides are kept apart, and an override wins whatever the order.

### Do both, even for one language

Not ceremony: it is what makes the second language a file instead of a hunt. Without the registry
an Italian app ships `Close dialog`, `Previous page` and `Page not found` in its accessibility tree;
without `$t` its own strings end up hard-coded into the markup.

## A panel that can fail without taking the screen with it

A dashboard pulls from several sources and one of them is somebody else's service. When it is down,
that panel says so and **everything around it keeps working** — the page does not go blank and the
other panels stay usable.

Two ways, and they are the same machinery.

**In the template**, `@try` / `@catch` — the block directive, which the compiler turns into
`errorBoundary()`:

```html
@try {
  <pdx-wire-feed :source="agencies" />
} @catch (err, retry) {
  <div class="pdx-surface pdx-surface-card" role="alert">
    <p>{{ err.message }}</p>
    <pdx-button variant="outline" @click="retry()">Riprova</pdx-button>
  </div>
}
```

`retry` is handed to you: calling it re-runs the block. That is the "and it can be retried" half, and
it costs nothing extra.

**As a component**, when the boundary wraps something you did not write:

```html
<pdx-error-boundary max-retries="3">
  <pdx-data-heavy-panel />
</pdx-error-boundary>
```

It catches what is thrown while its content is built **and what the children's effects throw
later** — a `$derived` that fails on the fifth signal change, in a child component, or in a branch an
`@if` inside it renders later. A `try/catch` around your own fetch does not, which is the difference
that matters when the failure is in a signal chain rather than in the call you wrote. The nearest
boundary wins, and an error thrown by the fallback itself goes to the next boundary out. Descendants
can read the error state through the context it provides.

Both also catch a child component whose own `setup` or `render` throws while it mounts: the fallback
renders, not the child's inline error.

⚠️ A requirement such as *"the wire-service panel must fail without taking the page down, and offer a
retry"* can pass its acceptance with a hand-written component, a `state` signal and a `try/catch` —
which misses a failure in a signal chain. It is what `pdx-error-boundary` and `@try` are for; the
catalogue finds them only when you already know the name, so look here.

## A mock backend, before there is a backend

**Do not hand-roll one, and do not add MSW.** `@pdxui/core` ships `fakeTransport`: an in-memory
store with a simulated network in front — latency, jitter, a configurable error rate, and a hook to
assert what was asked. It is `arrayTransport` (sort, filter, page, group, CRUD, all client-side) with
the states a real server produces and an in-memory one never does.

The point is that it is a **transport**, so the screen is built against the API it will keep: swap
`fakeTransport` for `restTransport` and no UI code changes.

```js recipe:mock-backend
import { fakeTransport, createDataSource } from '@pdxui/core';

// Seeded and fixed on purpose. A random dataset makes a failing check unreproducible: you see seven
// rows, the reviewer sees four, and neither of you is wrong.
export const seed = [
    { id: 1, name: 'Ada',       city: 'Torino',  amount: 120, active: true },
    { id: 2, name: 'Grace',     city: 'Milano',  amount: 340, active: true },
    { id: 3, name: 'Katherine', city: 'Torino',  amount:  75, active: false },
    { id: 4, name: 'Barbara',   city: 'Roma',    amount: 560, active: true },
    { id: 5, name: 'Margaret',  city: 'Milano',  amount: 210, active: false },
    { id: 6, name: 'Radia',     city: 'Torino',  amount: 430, active: true },
    { id: 7, name: 'Frances',   city: 'Napoli',  amount:  90, active: true },
];

export const transport = (o = {}) => fakeTransport({
    data: o.data ?? seed.map(r => ({ ...r })),   // a copy: the seed stays pristine between runs
    latency: o.latency ?? 250,                   // 0 for tests, 250 to see the loading state
    jitter: o.jitter ?? 0.2,                     // ±20%, so two requests can land out of order
    errorRate: o.errorRate ?? 0,                 // 1 = always fail; 0.1 = one call in ten
    errorMessage: o.errorMessage ?? 'the mock backend refused this one',
});

/**
 * One source for the whole screen: pass it to the grid's `:source`, and to `pdx-filter-builder` and
 * `pdx-pagination` as well. They coordinate through it — a filter changes the total the pager reads,
 * with nothing wired between them.
 */
export function makeSource(o = {}) {
    return createDataSource({
        transport: transport(o),
        pageSize: o.pageSize ?? 10,   // 0 = no paging
    });
}
```

Then, in a page:

```html
<template>
  <pdx-filter-builder :source="rows"></pdx-filter-builder>
  <pdx-data-grid :source="rows" :columns="columns"></pdx-data-grid>
  <pdx-pagination :source="rows"></pdx-pagination>
</template>

<script setup>
import { makeSource } from './lib/mock-backend';
const rows = makeSource({ pageSize: 10 });
const columns = [
    { field: 'name', header: 'Name' },
    { field: 'city', header: 'City' },
    { field: 'amount', header: 'Amount' },
];
onMount(() => rows.refresh());
</script>
```

**`fakeTransport`'s options** (`FakeTransportOptions`):

| option | default | what it does |
|---|---|---|
| `data` | — (required) | the initial rows; pass a copy if the seed must stay pristine |
| `idField` | `'id'` | the field that identifies a row |
| `latency` | `300` | milliseconds per call; `0` = instant, which is what tests want |
| `jitter` | `0.2` | ± that fraction of `latency`, so two requests can land out of order |
| `errorRate` | `0` | probability a call fails: `1` always, `0.1` one in ten |
| `errorMessage` | `[FakeTransport] Simulated <op> error` | the message of the simulated failure |
| `log` | `false` | log every operation to the console |
| `onOperation` | — | `(op) => …` for each call: `{ type, item, timestamp }`, plus `request` on a read and `partial` on a patch |

**The surface you drive it with** (`DataSource`, all reactive reads are signals). The common part:

| | |
|---|---|
| read | `rows.refresh()` · `rows.data()` · `rows.total()` · `rows.isLoading()` · `rows.error()` |
| shape | `rows.setPage(2)` · `rows.setPageSize(25)` · `rows.setSort([{field, dir}])` · `rows.setFilter([{field, operator, value}])` (entries are ANDed; for OR, a `CompositeFilter`) |
| write | `rows.add(item)` · `rows.update(item)` · `rows.patch(id, partial)` · `rows.remove(item)` → then `rows.sync()` |

The whole surface — `CompositeFilter` with an OR example, `getAllIds()` for "export what is
filtered", `distinctValues()`, `loadMore()`, the opt-in selection with `setSelected()`, `getById()` —
is in the `pdxui-data` skill, under `pdx-data-source`.

`remove` takes the **item**, not its id, and `add`/`update`/`remove` only record the change: `sync()`
is what sends it to the transport.

### Exercise the error branch — it is the half nobody mocks

```js
const rows = makeSource({ errorRate: 1 });   // every call fails
await rows.refresh().catch(() => {});
rows.error();     // → Error: the mock backend refused this one
```

A mock that always succeeds guarantees the error path of your grid, form and toasts is never written.
Build the screen once with `errorRate: 1` and once with `latency: 1500` before calling it done.

`errorRate` is random and fixed when the transport is made: it finds the error paths nobody wrote, one
call in ten. It cannot fail **now** and recover **now** — for that, a transport of your own.

### A service that breaks and recovers on command: a transport of your own

A transport is any object with a `read`; that is the whole contract a `DataSource` needs to list
rows. This one keeps the rows in an array and throws while a switch is on. The page's «simulate
failure» control flips it; the next `refresh()` puts the failure in `error()` while the switch is on,
and brings the rows back once it is off:

```js recipe:switchable-transport
import { arrayTransport, createDataSource } from '@pdxui/core';

export const service = { failing: false };   // the «simulate failure» control writes this

export function switchableTransport(rows) {
    const store = arrayTransport({ data: rows });   // sort, filter and paging, done in memory
    return {
        async read(request) {
            if (service.failing) throw new Error('The records service is not answering');
            return store.read(request);             // → { data, total }
        },
    };
}

export const makeRecords = (rows) => createDataSource({ transport: switchableTransport(rows), pageSize: 10 });
```

In the page, the control goes through a function in the script — an import used directly in a
template is not on `ctx`:

```html
<template>
  <label><input type="checkbox" @change="e => setFailing(e.target.checked)"> Simulate failure</label>
  <pdx-data-grid :source="records" :columns="columns"></pdx-data-grid>
</template>
<script setup>
import { service, makeRecords } from './lib/records-service';
const records = makeRecords([{ id: 1, name: 'Fido' }, { id: 2, name: 'Birba' }]);
const columns = [{ field: 'name', header: 'Name' }];
function setFailing(on) { service.failing = on; records.refresh(); }
onMount(() => records.refresh());
</script>
```

**`IDataTransport<T>`** (`packages/core/src/data/transport.ts`) — `read` is required, the rest are
there when the screen writes:

| method | signature | called by |
|---|---|---|
| `read` | `(request: DataRequest) => Promise<{ data: T[], total: number, groups? }>` | `refresh()`, and `getAllIds()` / `distinctValues()` with `pageSize: 0` |
| `create?` | `(item: Partial<T>) => Promise<T>` | `sync()`, for each `add` |
| `update?` | `(item: T) => Promise<T>` | `sync()`, for an edited row when there is no `patch` |
| `patch?` | `(id, partial: Partial<T>) => Promise<T>` | `sync()`, for an edited row: only the changed fields |
| `destroy?` | `(item: T) => Promise<void>` | `sync()`, for each `remove` |
| `batch?` | `(changes: { added, updated, removed }) => Promise<same shape>` | `sync()` — when present, it gets every pending change and the four above are not called |

`DataRequest` is `{ page, pageSize, sort: [{ field, dir }], filter: [{ field, operator, value }], group?, params? }`
— `page` is 1-based, and `total: -1` in the answer means "unknown". Throwing, or rejecting, is how a
transport says the call failed: the `DataSource` puts it in `error()`, and `refresh()` itself still
resolves.

### Assert what the screen actually asked for

```js
const t = fakeTransport({ data: seed, latency: 0, onOperation: op => calls.push(op) });
// calls[0] → { type: 'read', request: { page, pageSize, sort, filter }, timestamp }
await t.getData();   // what the store holds now, after the writes
```

Useful when the question is "did the grid send the filter server-side, or did it filter in the
browser?" — the request the transport received answers it.

## The idiomatic backend grid (Pragmatic `[Query]+[Endpoint]`)
When the backend exposes its grids through `[Query<Entity,Dto>]+[Endpoint]` (see the backend skill), the contract is
**`GET /api/v1/{e}/grid?<flat filters>&<field>Sort=Ascending|Descending&page&pageSize`** → a `PagedResult` of `{items,totalCount}`
(NOT a POST of `{filter:{…}}`). The frontend transport builds the query string from the filters plus `{sortField}Sort` from the grid's sort.
A gradual migration with no big bang: a **dual-mode** `gridFetch(endpoint,f)` helper (the idiomatic GET for the entities in an
`IDIOMATIC_GRIDS` set, the legacy POST for the rest), used by createCrud, owned-source and entityOpts. The canonical example: `Pragmatic.Design.Builder/profiler/app/src/lib/grid-fetch.ts`.
