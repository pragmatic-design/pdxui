### `<pdx-kanban>`

Columns of cards, moved by pointer, keyboard or menu.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `columns` | — | { key: string; label: string; limit?: number }[] | `[]` | The columns, in order: a `key` its items' column field holds, a `label`, and an optional `limit`. |
| `columnField` | `columnfield` | string | `'status'` | The item field that names its column. |
| `keyField` | `keyfield` | string | `'id'` | The item field that identifies it. |
| `titleField` | `titlefield` | string | `'title'` | The item field a card shows, and the announcements name it by. |
| `label` | `label` | string | `''` | The board's accessible name. Empty: «Board». |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `readonly` | `readonly` | boolean | `false` | The cards are shown and not moved. |
| `items` | — | T[] | `[]` | The cards. The component writes a new array on a move: the item a copy with its column field set. |

**Events:** `before-move` → `detail: { item: T; from: { column: string; index: number }; to: { column: string; index: number } }` — Asked before every move; `preventDefault()` refuses it and the board stays as it was.; `items-change` → `detail: { value: T[] }` — Fired when the component writes `items`. Does not bubble.; `move` → `detail: { item: T; from: { column: string; index: number }; to: { column: string; index: number } }` — A move was made: `items` holds it, and `item` is the moved copy.

**Renders:** roles `group`

**Slot:** `cardContent` — What a card draws; without it, its title.

**States:** `:state(lifted)` — A card is picked up from the keyboard.; `:state(disabled)` — `disabled` is set.; `:state(readonly)` — `readonly` is set.

**Parts:** `[data-part="root"]` — The board, `role="group"` named by `label`.; `[data-part="column"]` — A column; `[data-column]` is its key, `[data-over]` marks one over its limit.; `[data-part="header"]` — A column's title and count.; `[data-part="count"]` — The number of cards, with the limit when the column has one.; `[data-part="list"]` — A column's list of cards, named by its title.; `[data-part="card"]` — A card, the list item the keyboard moves; `[data-key]` is its key.; `[data-part="moveButton"]` — A card's Move menu button.; `[data-part="empty"]` — What an empty column says.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Drag a card by its body, or focus the board and press Space to pick a card up, the arrows to carry it, Space to drop it. The ⋯ menu moves a card with single clicks. `::items` holds the result; Doing has a limit of 2. _(from the live demo)_

```html
<pdx-kanban label="Sprint board" :columns="columns" ::items="tasks" @move="onMove"></pdx-kanban>
<p class="pdx-txt-small pdx-ink-muted">{{ last }}</p>
```

**Refusing a move** — `before-move` is asked first, whichever way the card moves. Here a card reaches Done only from Review: `preventDefault()` refuses the rest, the board stays as it was, and the refusal is announced. _(from the live demo)_

```html
<pdx-kanban label="Workflow" :columns="columns" ::items="tasks" @before-move="onBeforeMove"></pdx-kanban>
<p class="pdx-txt-small pdx-ink-muted">{{ refused }}</p>
```

**Custom cards** — A `cardContent` snippet draws each card; the board keeps the moving, the menu and the announcements. `key-field`, `column-field` and `title-field` name the item's fields. _(from the live demo)_

```html
<pdx-kanban label="Support tickets" :columns="columns" ::items="tickets" key-field="ref" column-field="stage" title-field="subject">
  @snippet cardContent(ticket) {
    <div class="ticket">
      <span class="pdx-txt-small pdx-ink-muted">{{ ticket.ref }}</span>
      <span class="pdx-txt-body">{{ ticket.subject }}</span>
      <pdx-badge :variant="ticket.priority === 'high' ? 'danger' : 'muted'">{{ ticket.priority }}</pdx-badge>
    </div>
  }
</pdx-kanban>
```

**States** _(from the live demo)_

```html
<div class="demo-stack">
  <span class="pdx-txt-small pdx-ink-muted">Readonly — shown, not moved</span>
  <pdx-kanban label="Readonly board" readonly :columns="columns" :items="tasks"></pdx-kanban>
  <span class="pdx-txt-small pdx-ink-muted">Disabled</span>
  <pdx-kanban label="Disabled board" disabled :columns="columns" :items="tasks"></pdx-kanban>
</div>
```

