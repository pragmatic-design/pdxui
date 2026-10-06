### `<pdx-file-upload>`

Drag-and-drop or browse to upload.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `accept` | `accept` | string | `''` | Accepted file types (the input accept attribute). |
| `multiple` | `multiple` | boolean | `false` | Allow selecting more than one. |
| `maxSize` | `maxsize` | number | `0` | Maximum file size in bytes. |
| `maxFiles` | `maxfiles` | number | `0` | Maximum number of files. |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `label` | `label` | string | `''` | The dropzone's text and name. Empty: the file-upload.drop component string. |
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `auto` | `auto` | boolean | `false` | Upload immediately on selection. |
| `action` | `action` | string | `''` | URL to upload files to. |
| `size` | `size` | string | `''` | Size of the control (e.g. sm, md, lg). |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `addFiles(files)` | Put files through the checks a drop goes through: each refusal emits `pdx-error` and is shown in the list. |
| `removeFile(index)` | Remove the file at this index, aborting its upload when one is running, and move focus off the row it deletes. |
| `uploadAll()` | Start uploading every file still pending; those uploading, done or failed are left alone. |
| `clear()` | Clears the value. |

**Events:** `pdx-error` → `detail: { file, error }` — Fired when an error occurs.; `pdx-progress` → `detail: { file, percent }` — Fired on `pdx-progress`.; `pdx-remove` → `detail: { file, index }` — Fired when an item is removed.; `pdx-select` → `detail: { files }` — Fired when an item is selected.; `pdx-success` → `detail: { file, response }` — Fired on `pdx-success`.; `pdx-upload` → `detail: { file }` — Fired on `pdx-upload`.

**Renders:** roles `button` · `list` · `listitem` · `progressbar` · `status`

**Slot:** `file` — Scoped — renders one file in the list. Receives `{ file, status, progress }`.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Drop files or click the zone to browse. Selected file names shown below.

```html
<pdx-file-upload @pdx-select="onSelect" />
```

```js
function onSelect(e) {
  const names = e.detail.files.map(f => f.name);
  selectedFiles = names.join(', ') || 'None';
}
```

**Image Only** — Accept only images with `accept="image/*"`. Multiple files allowed. Image thumbnails are generated automatically from file previews.

```html
<pdx-file-upload accept="image/*" multiple
  @pdx-select="onImageSelect" />
```

**Size Limit** — Max 2 MB per file. A file over the limit is refused: the component lists it under the zone (and announces it), and emits `pdx-error` for your app to react.

```html
<pdx-file-upload :max-size="2097152"
  @pdx-error="onError" />
```

```js
function onError(e) {
  errorMsg = e.detail.file.name + ': ' + e.detail.error;
}
```

**Max Files** — Limit to 3 files maximum. Files over the limit are listed under the zone as refused, each with a `pdx-error`. Removing a file moves focus to the next file's remove button.

```html
<pdx-file-upload multiple :max-files="3" />
```

**Custom Label** — Custom drop zone text and restricted file types via `accept`.

```html
<pdx-file-upload label="Drop your documents here"
  accept=".pdf,.doc,.docx" />
```

**Sizes** — 3 drop zone sizes: sm, default, lg. _(from the live demo)_

```html
<div class="demo-stack">
  <div class="demo-labeled">
    <span class="pdx-txt-small pdx-ink-muted">Small</span>
    <pdx-file-upload size="sm" label="Small drop zone"></pdx-file-upload>
  </div>
  <div class="demo-labeled">
    <span class="pdx-txt-small pdx-ink-muted">Default</span>
    <pdx-file-upload label="Default drop zone"></pdx-file-upload>
  </div>
  <div class="demo-labeled">
    <span class="pdx-txt-small pdx-ink-muted">Large</span>
    <pdx-file-upload size="lg" label="Large drop zone"></pdx-file-upload>
  </div>
</div>
```

**Disabled** — Non-interactive state. Drop zone is visually muted and ignores clicks and drops.

```html
<pdx-file-upload disabled />
```

