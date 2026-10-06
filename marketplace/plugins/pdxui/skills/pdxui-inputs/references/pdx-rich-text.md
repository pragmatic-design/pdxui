### `<pdx-rich-text>`

A WYSIWYG editor.

**Takes a DataSource:** bind one to `:source`.

**The value follows `output`.** `value` goes in and comes out in the same format:

| `output` | `value` accepts | `value` after an edit, and `pdx-change.detail` |
|---|---|---|
| `'json'` (default) | the document object, or its JSON string | the document object · `detail.doc` |
| `'html'` | an HTML string | the HTML string · `detail.html` |
| `'text'` | a JSON document (plain text in is not parsed) | the plain text · `detail.text` |
| `'all'` | the document object, or its JSON string | the document object · `detail.doc` **and** `detail.html` |

`detail.wordCount` is always there. A `value` set from outside after mount replaces the content
without rebuilding the editor; reading `el.value` after an edit gives the current content, so a
form can bind it like any other input.

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

Other names: `code`, `highlight`, `heading1`–`heading3`, `bulletList`, `orderedList`, `taskList`.
An unknown name is skipped. `toolbarMode="bubble"` replaces the top bar with a floating one over the
selection, with its own fixed set (`bold italic underline strike | link highlight code`).

The toolbar is one tab stop: Tab reaches its first button, ←/→ move between buttons (wrapping),
Home/End jump to the ends, Enter/Space run the button, Tab leaves into the text. Every button's name
is a `rich-text` component string named like the button (`rich-text.bold`, `rich-text.image`, …) —
translate those, not the DOM. The shortcut is appended outside the string: `bold: 'Grassetto'`
reads «Grassetto (Ctrl+B)».

**Use it when** the text carries formatting — headings, lists, links, images — edited in place, or rendered
read-only in the same styling. **Not when** it is plain multi-line text → `pdx-textarea`.

**Pitfalls**
- An HTML string as `value` with the default `output="json"` is not HTML to it: the editor starts EMPTY, and
  only a dev build warns. Set `output="html"`.
- The compiler does not wire it inside `<pdx-form>` by `name`: bind `:value` and `@pdx-change` yourself.
- `source` and `field` are declared and read by nothing: setting them does nothing.
- Only the setters wait for the editor. Before `pdx-ready`, `getJSON()` is `null`, `getHTML()` and `getText()`
  are `''`, and `execCommand()` does nothing.

**Composes with** — nothing sourced: the showcase does not use it.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | — | object | `null` | The current value. |
| `output` | `output` | string | `'json'` | Output format: 'html' or 'json'. |
| `extensions` | — | array | `null` | Editor extensions to enable. |
| `preset` | `preset` | string | `'starter'` | A named toolbar/feature preset. |
| `toolbar` | `toolbar` | string | `'standard'` | A preset ('full', 'standard', 'compact', 'minimal'), button names with '\|' between groups, or 'false' for none. |
| `toolbarMode` | `toolbarmode` | string | `'top'` | Toolbar layout: 'top' (a bar above the text) or 'bubble' (floating over the selection). |
| `placeholder` | `placeholder` | string | `''` | Placeholder text shown while empty. |
| `readonly` | `readonly` | boolean | `false` | Makes the value read-only — visible but not editable. |
| `autofocus` | `autofocus` | boolean | `false` | Focuses the editor on mount. |
| `height` | `height` | string | `'auto'` | Fixed editor height. |
| `minHeight` | `minheight` | string | `'120px'` | Minimum editor height. |
| `maxHeight` | `maxheight` | string | `'none'` | Maximum editor height before scrolling. |
| `source` | — | object | `null` | A DataSource whose record `record-id` names: the editor edits that record's `field`, follows it when the source changes it, and writes each edit back through the source. With all three given, the record is the document and `value` only reflects it. |
| `field` | `field` | string | `''` | The field of the `source` record that holds the document. |
| `recordId` | `recordid` | string | `''` | The id of the `source` record to edit, as pdx-form's `record-id`: `"1"` finds `{ id: 1 }`. |
| `label` | `label` | string | `''` | Accessible name of the editing area. Empty → the `rich-text.label` component string. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `editor` _(read-only)_ | Read-only, via a ref: `el.editor`. |
| `getJSON()` | The document as JSON, or null while the editor is still being built. |
| `getHTML()` | The document as HTML — what a copy to the clipboard carries — or '' before the editor is built. |
| `getText()` | The document as plain text, or '' before the editor is built. |
| `getWordCount()` | How many words the document holds; 0 before the editor is built. |
| `isEmpty` _(read-only)_ | Read-only, via a ref: `el.isEmpty`. |
| `execCommand(name)` | Run one editor command by name, the same ones the toolbar runs. Does nothing before the editor is built. |
| `focus()` | Moves focus to it. |
| `blur()` | Removes focus from it. |
| `setJSON(json)` | Replace the document with this JSON, waiting for the editor when it is not built yet. |
| `setHTML(markup)` | Replace the document with this HTML, waiting for the editor when it is not built yet. |
| `clear()` | Clears the value. |

**Events:** `pdx-blur` — Fired when it loses focus.; `pdx-change` — Fired when the value changes.; `pdx-focus` — Fired when it receives focus.; `pdx-ready` — Fired on `pdx-ready`.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Standard Editor** — Full toolbar with formatting, headings, lists, links. Try Markdown shortcuts: `# ` for headings, `**bold**`, `*italic*`, `&#96;code&#96;`, `- ` for lists. _(from the live demo)_

```html
<div class="demo-area">
  <pdx-rich-text
    toolbar="full"
    placeholder="Start writing..."
    min-height="300px"
    @pdx-change="onDocChange"
  ></pdx-rich-text>
</div>
```

**Bubble Toolbar** — Select text to see the floating toolbar. Ideal for distraction-free writing. _(from the live demo)_

```html
<div class="demo-area">
  <pdx-rich-text
    :toolbar-mode="'bubble'"
    :toolbar="false"
    placeholder="Select text to format..."
    min-height="200px"
  ></pdx-rich-text>
</div>
```

**Compact (Comments)** — Minimal toolbar for comment fields, chat input, etc. _(from the live demo)_

```html
<div class="demo-area">
  <pdx-rich-text
    toolbar="compact"
    :preset="'minimal'"
    placeholder="Write a comment..."
    min-height="80px"
    max-height="200px"
  ></pdx-rich-text>
</div>
```

**Read Only** — Content renderer — same styling, no editing. _(from the live demo)_

```html
<div class="demo-area">
  <pdx-rich-text
    :value="sampleDoc"
    :readonly="true"
    :toolbar="false"
    min-height="auto"
  ></pdx-rich-text>
</div>
```

