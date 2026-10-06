### `<pdx-edit-drawer>`

A drawer holding a schema-driven form.

**Use it when** one existing record is edited from a `FormSchema`, in a side panel its row opens.
**Not when** the record is new → `pdx-dialog` around `pdx-auto-form` (create in a modal, edit in the page); the fields are hand-written — the drawer builds them only from `schema`.

**Pitfalls**
- It is controlled and never closes itself: Escape, ✕ and the backdrop become `pdx-cancel`, Save validates and
  emits `pdx-save`. You close it by setting `open` to false, in both.
- Ask before discarding with `el.isDirty()`. The panel is re-parented to `<body>`, so a query under the host
  finds no form, and comparing `getValues()` with the record races the last keystroke.
- A new `value` or `schema` while it is open rebuilds the form: hand it a stable object, not a fresh one per
  render, or typed edits vanish.
- `getValues()` is `{}` until the form is built, a frame after opening.
- `busy` only disables the footer while you persist; closing on success is still yours.

**Composes with** `pdx-alert-dialog` (the "discard changes?" question, asked only when `isDirty()`) ·
`pdx-data-grid` (the row that opens it sets `value`) · `pdx-entity-grid` (renders one from its `schema`).

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `open` | `open` | boolean | `false` | Open state (controlled). |
| `schema` | — | object | `null` | FormSchema describing the entity fields. |
| `value` | — | object | `null` | Entity to edit, or null to create a new one. |
| `title` | `title` | string | `''` | Drawer title; defaults to "Edit"/"New" by mode. |
| `position` | `position` | 'left' \| 'right' | `'right'` |  |
| `size` | `size` | string | `'md'` | Forwarded to pdx-drawer — named preset (sm/md/lg) or a custom CSS width. |
| `saveLabel` | `savelabel` | string | `''` | Label of the save button. Empty: the edit-drawer.save component string, «Save». |
| `cancelLabel` | `cancellabel` | string | `''` | Label of the cancel button. Empty: the edit-drawer.cancel component string, «Cancel». |
| `busy` | `busy` | boolean | `false` | Disable the footer buttons while the parent is persisting. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `getValues()` | The form values now, `{}` while the form is not built. |
| `validate()` | Runs validation and returns the result. |
| `isDirty()` | Whether anything in the form was changed since it opened.  A drawer is not a modal — Escape and the ✕ close it, and both are easy to hit by accident — so a host has to ask before discarding, and only when there is something to discard. The host cannot work this out for itself: the panel is re-parented to <body>, so a query under the host finds no form, and comparing `getValues()` with the record races the keystroke that has not reached the form model yet. The form carries this itself. |

**Events:** `pdx-cancel` → `detail: {}` — Fired when cancelled.; `pdx-save` → `detail: { values, mode }` — Fired on `pdx-save`.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Create & Edit** — "New" opens an empty form; "Edit" preloads an entity. Save validates (Name is required) and emits the values.

```html
<pdx-edit-drawer :open="drawerOpen" :schema="schema" :value="editing"
  @pdx-save="onSave" @pdx-cancel="onCancel" />
```

```js
// value = null → create; value = entity → edit
function onSave(e) { persist(e.detail.values); drawerOpen = false; }
```

