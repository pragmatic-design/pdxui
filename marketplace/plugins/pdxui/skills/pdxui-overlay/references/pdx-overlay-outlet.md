### `<pdx-overlay-outlet>`

A mount point for overlays.

_No public props._

**Renders:** roles `alertdialog` · `dialog`

**Parts:** `[data-part="root"]` — The element reached as `[data-part="root"]`.; `[data-part="backdrop"]` — The element reached as `[data-part="backdrop"]`.; `[data-part="panel"]` — The element reached as `[data-part="panel"]`.; `[data-part="header"]` — The element reached as `[data-part="header"]`.; `[data-part="title"]` — The element reached as `[data-part="title"]`.; `[data-part="close"]` — The element reached as `[data-part="close"]`.; `[data-part="body"]` — The element reached as `[data-part="body"]`.; `[data-part="message"]` — The element reached as `[data-part="message"]`.; `[data-part="confirm-input"]` — The element reached as `[data-part="confirm-input"]`.; `[data-part="footer"]` — The element reached as `[data-part="footer"]`.; `[data-part="cancel"]` — The element reached as `[data-part="cancel"]`.; `[data-part="confirm"]` — The element reached as `[data-part="confirm"]`.; `[data-part="ok"]` — The element reached as `[data-part="ok"]`.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Confirm** — `await dialog.confirm({…})` resolves `true` on confirm, `false` on cancel or Escape. Focus starts on Cancel, the safe answer.

```js
async function askDelete() {
  const ok = await dialog.confirm({
    title: 'Delete project?',
    message: 'The project and its 12 files will be removed. This cannot be undone.',
    confirmLabel: 'Delete', cancelLabel: 'Keep it', variant: 'danger',
  });
  answer = ok ? 'deleted' : 'kept';
}

// Type the name to enable the button:
dialog.confirm({ title: 'Delete "atlas"?', confirmText: 'atlas', variant: 'danger' });
// The button waits 3 seconds:
dialog.confirm({ title: 'Publish now?', confirmDelay: 3 });
```

**Alert and message dialog** — `dialog.alert()` has one OK button; `dialog.open()` a close button and a `size`. Both resolve when closed.

```js
await dialog.alert({ title: 'Export ready', message: 'report-2026-09.csv has been downloaded.' });
await dialog.open({ title: 'What is new in 2.4', message: '…', size: 'md' });
```

**Stacking** — A dialog opened while another is showing goes on top of it. Escape closes only the top one; the one below gets its focus back. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button @click="stack">Open two, one over the other</pdx-button>
</div>
```

