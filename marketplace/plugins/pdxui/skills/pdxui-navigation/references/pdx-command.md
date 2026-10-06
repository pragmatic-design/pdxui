### `<pdx-command>`

A ⌘K command palette.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `open` | `open` | boolean | `false` | Whether it is open. |
| `placeholder` | `placeholder` | string | `''` | The search input's placeholder. Empty: the command.placeholder component string, «Type a command...». |
| `items` | — | array | `[]` | The data items to render. |
| `emptyText` | `emptytext` | string | `''` | The message when nothing matches. Empty: the command.empty component string, «No results found.». |
| `hotkey` | `hotkey` | boolean | `true` | Global keyboard shortcut to open (default: Ctrl+K / Cmd+K) |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `show()` | Shows it. |
| `close()` | Closes it. |
| `toggle()` | Toggles it open/closed. |
| `isOpen` _(read-only)_ | Read-only, via a ref: `el.isOpen`. |
| `openPalette()` | Open the palette, clearing the query and highlighting the first item that is not disabled. |
| `closePalette()` | Close the palette and emit `pdx-close`. |

**Events:** `pdx-close` — Fired when it closes. Does not bubble.; `pdx-open` — Fired when it opens. Does not bubble.; `pdx-select` → `detail: CommandItem` — The chosen item itself, after its own `action` (if any) has run.

**Renders:** roles `combobox` · `dialog` · `group` · `listbox` · `option` · `status`

**Slot:** `item` — Scoped — renders one command. Receives `{ item, active, index }`.

**Shapes:** `CommandItem { id: string; label: string; group?: string; icon?: string; shortcut?: string; action?: () => void; keywords?: string; disabled?: boolean }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Press Ctrl+K (or ⌘+K), or click the button. Type to filter, ↑/↓ to move, Enter to run, Esc to close. Items with a `group` are listed under named groups; "Billing" is `disabled` — listed, skipped by the arrows, never run. A `shortcut` is shown and announced as a key shortcut.

```js
const items = [
  { id: 'dashboard', label: 'Go to Dashboard', group: 'Navigate', icon: 'home' },
  { id: 'team', label: 'Manage Team', group: 'Navigate', icon: 'users' },
  { id: 'settings', label: 'Settings', group: 'Account', icon: 'settings', shortcut: 'Ctrl ,' },
];
```

```html
<pdx-command :open="open" :items="items"
  @pdx-select="onSelect" />
```

**Custom Item and Empty Text** — The `item` slot draws each command from `{ item, active, index }`; the option around it keeps its role, id and highlight. `empty-text` replaces "No results found." — type something no file matches. This one sets `:hotkey="false"`, so Ctrl+K stays with the palette above. _(from the live demo)_

```html
<div class="demo-container">
  <button class="pdx-btn pdx-outline" @click="filesOpen = true">Find a file</button>
  <span class="run-note pdx-txt-small pdx-ink-muted">Opened: <strong>{{ lastFile }}</strong></span>
  <pdx-command
    :open="filesOpen"
    :items="fileItems"
    :hotkey="false"
    placeholder="Find a file…"
    empty-text="No file with that name — check the spelling."
    @pdx-open="filesOpen = true"
    @pdx-close="filesOpen = false"
    @pdx-select="onFile">
    <slot name="item" let:item let:active>
      <span class="file-row"><strong>{{ item.label }}</strong><span class="pdx-txt-small pdx-ink-muted">{{ item.keywords }}</span></span>
    </slot>
  </pdx-command>
</div>
```

