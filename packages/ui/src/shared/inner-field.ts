// The text fields whose inner native <input> or <textarea> is what a form submits (#135): it keeps
// `name` and its form ownership, which autofill and password managers read. The host declares its
// model `{ form: true }` for the form's lifecycle — a reset writes the model back to the value it
// mounted with, a disabled fieldset sets `disabled` — and submits nothing of its own, or the text
// would go twice.

/** The parts of a text field's context this reads. */
interface TextFieldContext {
    el: HTMLElement;
    value: { peek(): unknown };
    formValue?(get: () => unknown): void;
}

/**
 * Let the inner field submit, and reset with the host. A native reset puts a field back to its
 * default value, which a property binding never sets: the default is the value the component
 * mounted with, so the field's own reset and the host's model agree, read in the same task.
 */
export function submitThroughInnerField(ctx: TextFieldContext): void {
    ctx.formValue?.(() => null);
    const mounted = ctx.value.peek();
    requestAnimationFrame(() => {
        const field = ctx.el.querySelector<HTMLInputElement | HTMLTextAreaElement>('input.pdx-input, textarea.pdx-input');
        if (field) field.defaultValue = mounted === null || mounted === undefined ? '' : String(mounted);
    });
}
