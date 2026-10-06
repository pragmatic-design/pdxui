### `<pdx-alert-dialog>`

A confirm / cancel modal.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `open` | `open` | boolean | `false` | Whether it is open. |
| `title` | `title` | string | `''` | The dialog's title. Empty: the alert-dialog.title component string, «Are you sure?». |
| `message` | `message` | string | `''` | The body message. |
| `variant` | `variant` | string | `'default'` | Visual variant. |
| `confirmLabel` | `confirmlabel` | string | `''` | Label of the confirm button. Empty: the alert-dialog.confirm component string, «Confirm». |
| `cancelLabel` | `cancellabel` | string | `''` | Label of the cancel button. Empty: the alert-dialog.cancel component string, «Cancel». |
| `confirmText` | `confirmtext` | string | `''` | If set, the user must type this text to enable confirm. |
| `confirmDelay` | `confirmdelay` | number | `0` | Seconds the confirm button stays disabled (accidental-click guard). |
| `loading` | `loading` | boolean | `false` | Shows a loading / busy state. |
| `closeOnEscape` | `closeonescape` | boolean | `false` | Close when the Escape key is pressed. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `show()` | Shows it. |
| `close()` | Closes it. |
| `toggle()` | Toggles it open/closed. |
| `isOpen` _(read-only)_ | Read-only, via a ref: `el.isOpen`. |
| `confirm()` | Confirm and close, as the confirm button does. Does nothing while that button is held back — loading, a countdown running, or a confirmation phrase not yet typed. |
| `cancel()` | Close and emit `pdx-cancel`. |

**Events:** `pdx-cancel` — Fired when cancelled.; `pdx-confirm` — Fired when confirmed.

**Renders:** roles `alertdialog`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic Confirm** _(from the live demo)_

```html
<pdx-button variant="outline" @click="openBasic">Delete Item</pdx-button>
<pdx-alert-dialog :open="basicOpen" title="Delete this item?" message="This action cannot be undone. The item will be permanently removed."
    @pdx-confirm="onBasicConfirm" @pdx-cancel="onBasicCancel"></pdx-alert-dialog>
```

**Danger Variant** — Red confirm button for destructive actions. _(from the live demo)_

```html
<pdx-button variant="danger" @click="openDanger">Delete Repository</pdx-button>
<pdx-alert-dialog :open="dangerOpen" variant="danger" title="Delete Repository?" message="All data, issues, and pull requests will be permanently deleted."
    confirmLabel="Delete Forever" @pdx-confirm="onDangerConfirm" @pdx-cancel="onDangerCancel"></pdx-alert-dialog>
```

**Type to Confirm** — User must type the exact text to enable confirm. GitHub delete-repo pattern. _(from the live demo)_

```html
<pdx-button variant="danger" @click="openTypeConfirm">Delete Account</pdx-button>
<pdx-alert-dialog :open="typeOpen" variant="danger" title="Delete your account?" message="This will permanently delete all your data."
    confirmLabel="Delete Account" confirmText="DELETE" @pdx-confirm="onTypeConfirm" @pdx-cancel="onTypeCancel"></pdx-alert-dialog>
```

**Timer-Gated Confirm** — Confirm button disabled for N seconds to prevent accidental clicks. _(from the live demo)_

```html
<pdx-button variant="warning" @click="openTimer">Drop Database</pdx-button>
<pdx-alert-dialog :open="timerOpen" variant="danger" title="Drop database?" message="All tables and data will be destroyed. This cannot be undone."
    confirmLabel="Drop" confirmDelay="5" @pdx-confirm="onTimerConfirm" @pdx-cancel="onTimerCancel"></pdx-alert-dialog>
```

