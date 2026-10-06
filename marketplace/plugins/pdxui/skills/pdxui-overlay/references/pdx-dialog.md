### `<pdx-dialog>`

A modal window with focus trap.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `open` | `open` | boolean | `false` | Whether it is open. |
| `title` | `title` | string | `''` | The dialog heading. |
| `size` | `size` | 'sm' \| 'md' \| 'lg' \| 'xl' \| 'full' | `'md'` | Size of the control (e.g. sm, md, lg). |
| `closeOnBackdrop` | `closeonbackdrop` | boolean | `true` | Close when the backdrop is clicked. |
| `closeOnEscape` | `closeonescape` | boolean | `true` | Close when the Escape key is pressed. |
| `showClose` | `showclose` | boolean | `true` | Shows the close (×) button. |
| `initialfocus` | `initialfocus` | string | `''` | Selector of the element to focus on open. |
| `preventClose` | `preventclose` | boolean | `false` | Blocks all dismiss paths (must close programmatically). |
| `loading` | `loading` | boolean | `false` | Show loading state |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `show()` | Shows it. |
| `close()` | Closes it. |
| `toggle()` | Toggles it open/closed. |
| `isOpen` _(read-only)_ | Read-only, via a ref: `el.isOpen`. |

**Events:** `pdx-before-close` — Fired (cancelable) before closing; call preventDefault() to block it.; `pdx-close` — Fired after the dialog closes. Does not bubble.

**Renders:** roles `dialog`

**Slot:** `footer` — Action area at the bottom (e.g. Confirm/Cancel); hidden automatically when empty.


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Simple informational dialog with title and close button.

```html
<pdx-button variant="primary" @click="openBasic">Open Dialog</pdx-button>

<pdx-dialog :open="basicOpen" title="Welcome" @pdx-close="closeBasic">
  <p>Dialog body content here.</p>
</pdx-dialog>
```

**Sizes** — 5 sizes: sm (360px), md (480px, default), lg (640px), xl (800px), full.

```html
<pdx-dialog :open="sizeOpen" title="Dialog" size="sm" @pdx-close="close">
  <p>Content</p>
</pdx-dialog>

<!-- size: sm (360px) | md (480px) | lg (640px) | xl (800px) | full -->
```

**With Footer Actions** — Footer slot for action buttons — confirm/cancel pattern.

```html
<pdx-dialog :open="footerOpen" title="Edit Profile" size="md" @pdx-close="closeFooter">
  <div class="form-fields">
    <label>Full Name</label>
    <input type="text" class="pdx-input" value="Jane Smith" />
  </div>
  <span slot="footer">
    <pdx-button variant="ghost" @click="closeFooter">Cancel</pdx-button>
    <pdx-button variant="primary" @click="closeFooter">Save Changes</pdx-button>
  </span>
</pdx-dialog>
```

**Scrollable Content** — Long content scrolls within the body — header and footer stay fixed. Scroll shadows appear at edges.

```html
<pdx-dialog :open="scrollOpen" title="Terms of Service" size="md" @pdx-close="closeScroll">
  <div class="long-content">
    <h3>1. Acceptance of Terms</h3>
    <p>Long scrollable content...</p>
  </div>
  <span slot="footer">
    <pdx-button variant="ghost" @click="closeScroll">Decline</pdx-button>
    <pdx-button variant="primary" @click="closeScroll">I Agree</pdx-button>
  </span>
</pdx-dialog>
```

**Prevent Close** — Use `prevent-close` to intercept close attempts. Useful for unsaved changes confirmation.

```html
<pdx-dialog :open="preventOpen" title="Edit Document" size="md"
  prevent-close @pdx-before-close="onBeforeClose" @pdx-close="closePrevent">
  <p>Try closing — you'll be asked in the page first.</p>
  <span slot="footer">
    <pdx-button variant="ghost" @click="closePrevent">Discard</pdx-button>
    <pdx-button variant="primary" @click="closePrevent">Save &amp; Close</pdx-button>
  </span>
</pdx-dialog>
<!-- once, in the app shell: it draws dialog.confirm() -->
<pdx-overlay-outlet></pdx-overlay-outlet>
```

```js
import { dialog } from '@pdxui/ui/dialog';

// prevent-close blocks Escape, the backdrop and ✕; this hears the attempt.
async function onBeforeClose() {
  const leave = await dialog.confirm({
    title: 'Discard changes?', message: 'Leave without saving them?',
    confirmLabel: 'Leave', cancelLabel: 'Stay', variant: 'danger',
  });
  if (leave) preventOpen = false;
}
```

**No Close Button** — Hide close button with `show-close="false"`. User must use footer actions.

```html
<pdx-dialog :open="noCloseOpen" title="Session Expired" size="sm"
  :show-close="false" :close-on-backdrop="false" :close-on-escape="false">
  <p>Your session has expired. Please log in again.</p>
  <span slot="footer">
    <pdx-button variant="primary" @click="closeNoClose">Log In</pdx-button>
  </span>
</pdx-dialog>
```

**Nested Dialogs** — Dialogs stack via overlayStack — each gets a higher z-index. Escape closes only the topmost.

```html
<pdx-dialog :open="nested1Open" title="First Dialog" size="lg" @pdx-close="closeNested1">
  <p>First dialog content.</p>
  <pdx-button variant="primary" @click="openNested2">Open Nested</pdx-button>
</pdx-dialog>

<pdx-dialog :open="nested2Open" title="Nested Dialog" size="sm" @pdx-close="closeNested2">
  <p>Nested dialog on top. Escape closes only this one.</p>
</pdx-dialog>
```

**Initial Focus** — Control which element receives focus when the dialog opens via `initial-focus` selector.

```html
<pdx-dialog :open="focusOpen" title="Login" size="sm"
  :initialfocus="'.focus-email'" @pdx-close="closeFocus">
  <input type="text" class="pdx-input" placeholder="username" />
  <input type="email" class="pdx-input focus-email" placeholder="email" />
  <span slot="footer">
    <pdx-button variant="ghost" @click="closeFocus">Cancel</pdx-button>
    <pdx-button variant="primary" @click="closeFocus">Login</pdx-button>
  </span>
</pdx-dialog>
```

**Declarative + Programmatic Mix** — A declarative `<pdx-dialog>` with a programmatic `dialog.confirm()` on top. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-button variant="outline" size="sm" @click="openDeclarative">Open Dialog</pdx-button>
</div>
<pdx-dialog :open="declOpen" title="Declarative Dialog" size="md">
  <p style="margin:0 0 var(--pdx-space-md)">This dialog is opened via <code>:open</code> binding.</p>
  <p style="margin:0">Click below to open a programmatic confirm on top of this dialog.</p>
  <span slot="footer">
    <pdx-button variant="danger" size="sm" @click="onNestedConfirm">Delete (Programmatic)</pdx-button>
    <pdx-button variant="ghost" size="sm" @click="closeDeclarative">Close</pdx-button>
  </span>
</pdx-dialog>
```

