**A button that runs a write: `:action`.** Give it a `mutation()` — or anything with `execute(arg?)`
and `pending()` — and what it passes:

```html
<pdx-button :action="save" :action-arg="dto">Save</pdx-button>
```

A click calls `save.execute(dto)`. While `save.pending()` is true the button is busy (`aria-busy`,
the spinner) and refuses clicks, so a double click sends one write — the double-submit guard is the
button's, not something each form wires. `loading` and `disabled` set explicitly still win. A
rejected write stays on `save.error()` for the form to show, is announced as `pdx-action-error`
(`detail: { error }`), and the button is idle again. No `:loading="save.pending()"`, no `:disabled`,
no `@click` to write.
