// A text field's commit, when no typing produced it (#479).
//
// A text field's model event, `value-change`, is live: it fires on every write. The commit, on blur or
// Enter, is the inner input's native `change`, which bubbles to the host (owner's decision on #479). The
// browser fires it only for what the user typed; a value the component writes itself — a stepper, the
// clear button — commits with no `change` at all. This dispatches it from the inner field, as a native
// number input does for its spin buttons, so `@change` and `::value.lazy` hear every commit.

/** Dispatch the native `change` a commit makes, from the inner field, bubbling to the host. */
export function dispatchCommit(field: Element | null): void {
    field?.dispatchEvent(new Event('change', { bubbles: true }));
}
