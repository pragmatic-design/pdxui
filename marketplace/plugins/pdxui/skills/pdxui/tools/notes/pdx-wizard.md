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
