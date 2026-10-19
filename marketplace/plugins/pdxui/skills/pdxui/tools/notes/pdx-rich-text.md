**The value follows `output`.** `value` is the model: it goes in and comes out in the same format,
and every edit writes it and dispatches `value-change` with `{ value }`, so `::value` binds it both
ways.

| `output` | `value` accepts | `value` after an edit |
|---|---|---|
| `'json'` (default) | the document object, or its JSON string | the document object |
| `'html'` | an HTML string | the HTML string |
| `'text'` | a JSON document (plain text in is not parsed) | the plain text |
| `'all'` | the document object, or its JSON string | the document object; `getHTML()` gives the HTML |

The word count is `getWordCount()`. A `value` set from outside after mount replaces the content
without rebuilding the editor.

The imperative API — `getHTML()`, `setHTML(html)`, `getJSON()`, `setJSON(doc)`, `getText()`,
`clear()`, `focus()` — exists from the moment the element is connected, and calls made before the
editor is built are applied when it is. `pdx-ready` fires once the editor exists: calling the API
from its listener is safe.

`label` names the editing area for assistive technology; without it the placeholder is used, then
the translatable `rich-text.label` string.

**The toolbar.** `toolbar` takes a preset or a list of button names, groups separated by `|`
(`toolbar="bold italic | link | undo redo"`); `toolbar="false"` shows none. The presets:

| Preset | Buttons |
|---|---|
| `full` | `bold italic underline strike \| heading list quote codeblock \| link image hr \| undo redo \| source` |
| `standard` (default) | `bold italic underline \| heading list \| link image \| undo redo \| source` |
| `compact` | `bold italic \| link \| undo redo` |
| `minimal` | `bold italic code` |

`heading` and `list` are menu buttons. `heading` opens H1, H2 and H3; `list` opens bullet, ordered
and task. Each item runs its own command, and a choice returns the focus to the text. Other names:
`code`, `highlight`, `heading1`–`heading3`, `bulletList`, `orderedList`, `taskList`, one button
each. An unknown name is skipped. `toolbarMode="bubble"` replaces the top bar with a floating one over the
selection, with its own fixed set (`bold italic underline strike | link highlight code`).

The toolbar is one tab stop: Tab reaches its first button, ←/→ move between buttons (wrapping),
Home/End jump to the ends, Enter/Space run the button, Tab leaves into the text. On a menu button,
Enter, Space or ↓ open the menu on its first item, ↑/↓ move between items, and Escape closes it and
returns the focus to the button. Every button's name
is a `rich-text` component string named like the button (`rich-text.bold`, `rich-text.image`, …) —
translate those, not the DOM. The shortcut is appended outside the string: `bold: 'Grassetto'`
reads «Grassetto (Ctrl+B)».

**Use it when** the text carries formatting — headings, lists, links, images — edited in place, or rendered
read-only in the same styling. **Not when** it is plain multi-line text → `pdx-textarea`.

**Pitfalls**
- An HTML string as `value` with the default `output="json"` is not HTML to it: the editor starts EMPTY, and
  only a dev build warns. Set `output="html"`.
- The compiler does not wire it inside `<pdx-form>` by `name`: bind it yourself, `::value="field"`.
- `source` and `field` are declared and read by nothing: setting them does nothing.
- Only the setters wait for the editor. Before `pdx-ready`, `getJSON()` is `null`, `getHTML()` and `getText()`
  are `''`, and `execCommand()` does nothing.

**Composes with** — nothing sourced: the showcase does not use it.
