### `<pdx-bottom-sheet>`

A panel that rises from the bottom.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `open` | `open` | boolean | `false` | Whether it is open. |
| `detents` | — | array | `() => [0.4, 0.85]` | Snap points as fractions of viewport height (0-1). Default: [0.4, 0.85] |
| `initialDetent` | `initialdetent` | number | `0` | Initial detent index. Default: 0 (smallest) |
| `backdrop` | `backdrop` | boolean | `true` | Show the backdrop. With `false` nothing behind the sheet is dimmed, and no backdrop click closes it. |
| `closeOnBackdrop` | `closeonbackdrop` | boolean | `true` | Close on backdrop click. Default: true |
| `closeOnEscape` | `closeonescape` | boolean | `true` | Close on Escape. Default: true |
| `closeOnSwipeDown` | `closeonswipedown` | boolean | `true` | Close on swipe down below minimum detent. Default: true |
| `showHandle` | `showhandle` | boolean | `true` | Show drag handle bar. Default: true |
| `showClose` | `showclose` | boolean | `false` | Show close button. Default: false |
| `label` | `label` | string | `''` | Label for accessibility. |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `show()` | Shows it. |
| `close()` | Closes it. |
| `toggle()` | Toggles it open/closed. |
| `isOpen` _(read-only)_ | Read-only, via a ref: `el.isOpen`. |
| `snapTo(detentIndex)` | Move the sheet to a detent by index, clamped to the detents declared, and emit `pdx-detent-change`. |

**Events:** `pdx-before-close` — Fired on `pdx-before-close`.; `pdx-close` — Fired when it closes. Does not bubble.; `pdx-detent-change` → `detail: { detent, index }` — Fired when the detent changes.

**Renders:** roles `dialog` · `slider`

**Slot:** `header` — Content of the sheet's header, above the body.; `footer` — Content at the bottom of the sheet, below the body (e.g. actions).


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Default detents: 40% and 85% of viewport. Drag the handle or swipe down to dismiss. _(from the live demo)_

```html
<pdx-button variant="outline" @click="openBasic">Open Bottom Sheet</pdx-button>
<pdx-bottom-sheet :open="basicOpen" label="Basic bottom sheet" @pdx-close="closeBasic">
  <span slot="header"><strong>Basic Sheet</strong></span>
  <p>Drag the handle to resize between detent snap points.</p>
  <p class="pdx-txt-small pdx-ink-muted">Swipe down quickly to dismiss, or tap the backdrop.</p>
  <p>This sheet has two detents: <strong>40%</strong> (half) and <strong>85%</strong> (expanded).</p>
  <span slot="footer">
    <pdx-button variant="ghost" size="sm" @click="closeBasic">Cancel</pdx-button>
    <pdx-button variant="primary" size="sm" @click="closeBasic">Done</pdx-button>
  </span>
</pdx-bottom-sheet>
```

**Three Detents** — Three snap points: 25%, 50%, 90%. Apple-style peek → half → full. _(from the live demo)_

```html
<pdx-button variant="outline" @click="openThree">Open 3-Detent Sheet</pdx-button>
<pdx-bottom-sheet :open="threeOpen" :detents="threeDetents" label="Three detent sheet" @pdx-close="closeThree">
  <span slot="header"><strong>Three Detents</strong></span>
  <p>This sheet snaps to <strong>25%</strong>, <strong>50%</strong>, or <strong>90%</strong> of viewport.</p>
  <p>Drag slowly to snap to the nearest detent. Swipe fast to jump to the next one.</p>
  <ul>
    <li><strong>25%</strong> — Peek: just the title and summary</li>
    <li><strong>50%</strong> — Half: comfortable reading</li>
    <li><strong>90%</strong> — Full: maximum content</li>
  </ul>
  <p class="pdx-txt-small pdx-ink-muted">Swipe down past 25% to dismiss entirely.</p>
</pdx-bottom-sheet>
```

**Scrollable Content** — When content overflows, the body scrolls internally. Drag the handle (not the body) to resize. _(from the live demo)_

```html
<pdx-button variant="outline" @click="openScroll">Open Scrollable Sheet</pdx-button>
<pdx-bottom-sheet :open="scrollOpen" :detents="scrollDetents" :initialDetent="1" label="Scrollable content" @pdx-close="closeScroll">
  <span slot="header"><strong>Long Content</strong></span>
  <div>
    <p>This sheet has more content than fits in the viewport. Scroll inside the body area.</p>
    <p>When the body is scrolled to the top, dragging down on the body will resize the sheet instead of scrolling.</p>
    <hr style="margin: 1rem 0; border-color: var(--pdx-color-border);">
    <h3 class="pdx-txt-subtitle">Section 1</h3>
    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.</p>
    <h3 class="pdx-txt-subtitle">Section 2</h3>
    <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident.</p>
    <h3 class="pdx-txt-subtitle">Section 3</h3>
    <p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam.</p>
    <h3 class="pdx-txt-subtitle">Section 4</h3>
    <p>Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione.</p>
    <h3 class="pdx-txt-subtitle">Section 5</h3>
    <p>At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti.</p>
  </div>
</pdx-bottom-sheet>
```

**Close Button** — Optional close button in the header, useful when the handle is hidden. _(from the live demo)_

```html
<pdx-button variant="outline" @click="openClose">Open with Close Button</pdx-button>
<pdx-bottom-sheet :open="closeOpen" showClose label="Sheet with close button" @pdx-close="closeCloseSheet">
  <span slot="header"><strong>With Close Button</strong></span>
  <p>This sheet has both a drag handle and a close button.</p>
  <p>The close button provides an explicit close affordance for mouse/keyboard users.</p>
</pdx-bottom-sheet>
```

**No Handle** — Handle hidden — close via backdrop, Escape, or close button only. Fixed height. _(from the live demo)_

```html
<pdx-button variant="outline" @click="openNoHandle">Open Without Handle</pdx-button>
<pdx-bottom-sheet :open="noHandleOpen" :showHandle="noHandle" showClose :closeOnSwipeDown="noSwipe" label="Fixed sheet" @pdx-close="closeNoHandle">
  <span slot="header"><strong>Fixed Sheet</strong></span>
  <p>No drag handle — this sheet stays at its initial detent.</p>
  <p>Use the close button, backdrop click, or Escape to dismiss.</p>
</pdx-bottom-sheet>
```

**Action Sheet Pattern** — iOS-style action list. Small detent, list of actions, cancel at bottom. _(from the live demo)_

```html
<pdx-button variant="outline" @click="openAction">Show Actions</pdx-button>
<pdx-bottom-sheet :open="actionOpen" :detents="actionDetents" label="Actions" @pdx-close="closeAction">
  <span slot="header"><strong>Choose Action</strong></span>
  <div class="action-list">
    <button class="action-item" @click="pickAction('Share')">
      <span>📤</span> Share
    </button>
    <button class="action-item" @click="pickAction('Copy Link')">
      <span>🔗</span> Copy Link
    </button>
    <button class="action-item" @click="pickAction('Edit')">
      <span>✏️</span> Edit
    </button>
    <button class="action-item danger" @click="pickAction('Delete')">
      <span>🗑️</span> Delete
    </button>
  </div>
  <span slot="footer">
    <pdx-button variant="ghost" @click="closeAction" style="width:100%">Cancel</pdx-button>
  </span>
</pdx-bottom-sheet>
```

**Stacking: Sheet + Dialog** — Open a dialog from within a bottom sheet. overlayStack manages z-index and Escape order. _(from the live demo)_

```html
<pdx-button variant="outline" @click="openNested">Open Sheet → Dialog</pdx-button>
<pdx-bottom-sheet :open="nestedOpen" label="Nested sheet" @pdx-close="closeNested">
  <span slot="header"><strong>Sheet with nested dialog</strong></span>
  <p>Click the button below to open a dialog on top of this sheet.</p>
  <pdx-button variant="primary" size="sm" @click="openNestedDialog">Open Dialog</pdx-button>
  <pdx-dialog :open="nestedDialogOpen" title="Confirm" size="sm" @pdx-close="closeNestedDialog">
    <p>This dialog is stacked above the bottom sheet.</p>
    <p class="pdx-txt-small pdx-ink-muted">Escape closes this dialog first, then the sheet.</p>
    <span slot="footer">
      <pdx-button variant="ghost" size="sm" @click="closeNestedDialog">Cancel</pdx-button>
      <pdx-button variant="primary" size="sm" @click="closeNestedDialog">OK</pdx-button>
    </span>
  </pdx-dialog>
</pdx-bottom-sheet>
```

