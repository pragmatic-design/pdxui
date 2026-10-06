### `<pdx-wizard>`

A guided multi-step flow.

**Use it when** a hand-written flow is split into steps: `[data-wizard-step]` panels, one component per step
if you like, grouped under one or more forms. **Not when** the steps are sections of one schema-driven form →
`pdx-form-template` with `layout: 'wizard'`, which validates each step before advancing on its own.

**Pitfalls**
- The wizard validates nothing. `linear` only stops a jump past the furthest step visited, and `complete()`
  does not advance, validate or close anything; a step blocks by `preventDefault()` on `pdx-before-change`.
- That handler must be synchronous: the wizard reads `defaultPrevented` right after dispatching, so an
  `async` handler blocks nothing.
- `form.validate()` is async and covers the whole form, so it is no use per step: touch the step's fields with
  `onBlur()` and read their `error()`.
- Listen with `.self`: `<pdx-input>` also emits a bubbling `pdx-change`, and without it a keystroke becomes the
  step.
- Steps are discovered once, in the first frame: a panel added later (behind an `@if`) is not a step.
- Setting `:value` moves the step without `pdx-before-change`: right for restoring a draft, a bypass otherwise.

**Composes with** `pdx-form` (steps grouped by form) · `createFormCoordinator()` (one Save over several forms)
· `pdx-field-list` (rows inside a step).

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | number | `0` | Current step (0-based index) |
| `linear` | `linear` | boolean | `true` | Sequential navigation — can't skip ahead |
| `orientation` | `orientation` | string | `'horizontal'` | Stepper orientation |
| `size` | `size` | string | `'md'` | Step number circle size |
| `hideNav` | `hidenav` | boolean | `false` | Hide the auto-generated navigation footer |
| `hideStepper` | `hidestepper` | boolean | `false` | Hide the stepper header |
| `disabled` | `disabled` | boolean | `false` | Disabled state — no interaction |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `goTo(targetIndex)` | Go to a step by index. Returns false, and moves nothing, when the step is not reachable yet or a `pdx-before-change` listener cancels. |
| `goNext()` | The next step, through the same guards as `goTo`; false at the last one. |
| `goPrev()` | The previous step, through the same guards as `goTo`; false at the first one. |
| `complete()` | Emit `pdx-complete` for the step in view. It does not advance, validate or close anything. |
| `next()` | Advances to the next item. |
| `prev()` | Goes to the previous item. |
| `goto(step)` | `goTo` under its all-lowercase spelling. |
| `step` _(read-only)_ | Read-only, via a ref: `el.step`. |

**Events:** `pdx-before-change` — Fired when the before changes.; `pdx-change` → `detail: { value, previous }` — Fired when the value changes.; `pdx-complete` → `detail: { value }` — Fired on `pdx-complete`.

**Renders:** roles `navigation` · `status` · `tab` · `tablist` · `tabpanel`

**Shapes:** `StepMeta { index: number; label: string; description: string; icon: string; el: HTMLElement }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic Wizard** — Linear navigation: must complete steps in order. Click Next to advance.

```html
<pdx-wizard>
  <div data-wizard-step data-label="Account">...</div>
  <div data-wizard-step data-label="Profile" data-description="Personal details">...</div>
  <div data-wizard-step data-label="Review">...</div>
</pdx-wizard>
```

**Free Navigation** — With `linear="false"`, users can jump to any step. _(from the live demo)_

```html
<div class="demo-box">
  <pdx-wizard :linear="false">
    <div data-wizard-step data-label="General">
      <p class="pdx-txt-body">General settings go here. Jump to any step using the stepper above.</p>
    </div>
    <div data-wizard-step data-label="Notifications">
      <p class="pdx-txt-body">Notification preferences. You can freely navigate between all steps.</p>
    </div>
    <div data-wizard-step data-label="Privacy">
      <p class="pdx-txt-body">Privacy and data sharing options.</p>
    </div>
    <div data-wizard-step data-label="Advanced">
      <p class="pdx-txt-body">Advanced configuration for power users.</p>
    </div>
  </pdx-wizard>
</div>
```

**Vertical Orientation** — Stepper on the left, content on the right. _(from the live demo)_

```html
<div class="demo-box">
  <pdx-wizard orientation="vertical" :linear="false">
    <div data-wizard-step data-label="Upload" data-description="Select your files">
      <h3 class="pdx-txt-body" style="margin-bottom: var(--pdx-space-md)">Upload Files</h3>
      <p class="pdx-txt-body pdx-ink-muted">Drag and drop files or click to browse.</p>
      <div class="upload-placeholder">
        <span style="font-size: 2rem">📁</span>
        <span class="pdx-ink-muted">Drop files here</span>
      </div>
    </div>
    <div data-wizard-step data-label="Configure" data-description="Set import options">
      <h3 class="pdx-txt-body" style="margin-bottom: var(--pdx-space-md)">Import Configuration</h3>
      <div class="form-fields">
        <label class="pdx-label">Delimiter</label>
        <div class="pdx-input-wrap"><input class="pdx-input" value="," /></div>
        <label class="pdx-label">Encoding</label>
        <div class="pdx-input-wrap"><input class="pdx-input" value="UTF-8" /></div>
      </div>
    </div>
    <div data-wizard-step data-label="Map Fields" data-description="Match columns to fields">
      <h3 class="pdx-txt-body" style="margin-bottom: var(--pdx-space-md)">Field Mapping</h3>
      <p class="pdx-txt-body pdx-ink-muted">Map your CSV columns to system fields.</p>
    </div>
    <div data-wizard-step data-label="Import" data-description="Review and run">
      <h3 class="pdx-txt-body" style="margin-bottom: var(--pdx-space-md)">Ready to Import</h3>
      <p class="pdx-txt-body pdx-ink-muted">Click Complete to start the import process.</p>
    </div>
  </pdx-wizard>
</div>
```

**Small Size** — Compact stepper with `size="sm"`. _(from the live demo)_

```html
<div class="demo-box">
  <pdx-wizard size="sm" :linear="false">
    <div data-wizard-step data-label="Step 1">
      <p class="pdx-txt-body">Small wizard step 1 content.</p>
    </div>
    <div data-wizard-step data-label="Step 2">
      <p class="pdx-txt-body">Small wizard step 2 content.</p>
    </div>
    <div data-wizard-step data-label="Step 3">
      <p class="pdx-txt-body">Small wizard step 3 content.</p>
    </div>
  </pdx-wizard>
</div>
```

**Custom Navigation** — Hide the built-in footer with `hide-nav` and provide your own buttons. _(from the live demo)_

```html
<div class="demo-box">
  <pdx-wizard hidenav :linear="false">
    <div data-wizard-step data-label="Design">
      <p class="pdx-txt-body">Step 1: Design your layout. Use the stepper header to navigate.</p>
    </div>
    <div data-wizard-step data-label="Build">
      <p class="pdx-txt-body">Step 2: Build your components.</p>
    </div>
    <div data-wizard-step data-label="Deploy">
      <p class="pdx-txt-body">Step 3: Deploy to production.</p>
    </div>
  </pdx-wizard>
</div>
```

**Disabled** — No interaction when disabled. _(from the live demo)_

```html
<div class="demo-box">
  <pdx-wizard disabled>
    <div data-wizard-step data-label="Locked">
      <p class="pdx-txt-body pdx-ink-muted">This wizard is disabled.</p>
    </div>
    <div data-wizard-step data-label="Step 2">
      <p class="pdx-txt-body">Unreachable.</p>
    </div>
  </pdx-wizard>
</div>
```

**Events** — Listen to `pdx-change` and `pdx-complete`. _(from the live demo)_

```html
<div class="demo-box">
  <pdx-wizard @pdx-change="onStepChange" @pdx-complete="onComplete">
    <div data-wizard-step data-label="First">
      <p class="pdx-txt-body">Navigate and watch the event log below.</p>
    </div>
    <div data-wizard-step data-label="Second">
      <p class="pdx-txt-body">Almost there...</p>
    </div>
    <div data-wizard-step data-label="Done">
      <p class="pdx-txt-body">Click Complete to fire the complete event.</p>
    </div>
  </pdx-wizard>
  <div class="event-log pdx-txt-mono pdx-txt-small" id="wizard-event-log">{{ wizardLog }}</div>
</div>
```

**Custom Icons** — Use `data-icon` to set an icon on the active step circle. _(from the live demo)_

```html
<div class="demo-box">
  <pdx-wizard :linear="false">
    <div data-wizard-step data-label="Cart" data-icon="🛒">
      <p class="pdx-txt-body">Your shopping cart items.</p>
    </div>
    <div data-wizard-step data-label="Shipping" data-icon="📦">
      <p class="pdx-txt-body">Shipping address and method.</p>
    </div>
    <div data-wizard-step data-label="Payment" data-icon="💳">
      <p class="pdx-txt-body">Payment information.</p>
    </div>
    <div data-wizard-step data-label="Confirm" data-icon="✅">
      <p class="pdx-txt-body">Order confirmation.</p>
    </div>
  </pdx-wizard>
</div>
```

