// FormPdxElement — the base of a form-associated component (#1246): its ElementInternals and the
// platform's form API on them. A component that is not form-associated extends PdxElement and carries
// none of it, as a native element that is not a form control has no `form`, `labels` or validity.

import { PdxElement } from './element';
import type { FormModelCallbacks } from '../form/form-model';

/**
 * An empty NodeList of labels, the platform's own type: what `labels` is for an element no label can
 * name. Made from a detached fragment, once, when first asked for.
 */
let noLabels: NodeListOf<HTMLLabelElement> | null = null;
function emptyLabels(): NodeListOf<HTMLLabelElement> {
    return noLabels ??= document.createDocumentFragment().querySelectorAll('label');
}

/** Base class of a form-associated component: `defineComponent` gives it to one with a form model. */
export abstract class FormPdxElement extends PdxElement {
    /** ElementInternals instance, attached by the constructor; null where the browser has none. */
    _internals: ElementInternals | null = typeof this.attachInternals === 'function' ? this.attachInternals() : null;

    /** Set the form value for this component. */
    setFormValue(value: FormData | string | File | null, state?: string | File | FormData | null): void {
        this._internals?.setFormValue(value, state ?? undefined);
    }

    /** Set the form validity for this component. */
    setValidity(flags?: ValidityStateFlags, message?: string, anchor?: HTMLElement): void {
        if (!this._internals) return;
        if (!flags || Object.keys(flags).length === 0) {
            this._internals.setValidity({});
        } else {
            this._internals.setValidity(flags, message, anchor);
        }
    }

    /** Get the form this component belongs to. */
    get form(): HTMLFormElement | null { return this._internals?.form ?? null; }

    /**
     * A component may declare a `form` PROP. Its accessor is installed when it is defined; before an
     * element is upgraded, this getter alone would make `el.form = x` throw ("only a getter"). The value
     * is kept as an own property, which the prop accessor picks up when the element mounts.
     */
    set form(value: unknown) {
        Object.defineProperty(this, 'form', { value, writable: true, configurable: true, enumerable: true });
    }

    /**
     * The labels that name this element (#987): the `<label for>` pointing at its id and a `<label>`
     * wrapping it, read from its ElementInternals, live as the platform keeps them. A component names its
     * inner control after them — a `.pdx` writes `self.labels` with `@host self;` — with no query on the
     * document. Empty, and not live, for one no label can name, with no id and in no label: read it again
     * after giving it one.
     */
    get labels(): NodeListOf<HTMLLabelElement> {
        // A label names an element by its `for` matching the element's id, or by holding it (HTML,
        // "labeled control"): with neither, none can, and the platform's list is not asked for.
        // Asking costs a walk of the document after each change to it, which a hundred mounts in a
        // row pay a hundred times (scenario-pilot-mount.spec.ts measured the select at 2× main).
        if (!this._internals || (!this.id && !this.closest('label'))) return emptyLabels();
        return this._internals.labels as NodeListOf<HTMLLabelElement>;
    }

    /** A component may declare a `labels` prop: the same as `form`, kept as an own property. */
    set labels(value: unknown) {
        Object.defineProperty(this, 'labels', { value, writable: true, configurable: true, enumerable: true });
    }

    /** Get the validation message. */
    get validationMessage(): string { return this._internals?.validationMessage ?? ''; }

    /** Get the validity state. */
    get validity(): ValidityState { return this._internals?.validity ?? ({} as ValidityState); }

    /** Check validity (triggers browser UI). */
    checkValidity(): boolean { return this._internals?.checkValidity() ?? true; }

    /** Report validity (shows browser validation bubble). */
    reportValidity(): boolean { return this._internals?.reportValidity() ?? true; }

    /** The form lifecycle of a model declared `{ form }` (#135), once the component's mount has wired it. */
    _formModel: FormModelCallbacks | null = null;

    /** Called when the parent form resets: the form model goes back to its default. */
    formResetCallback(): void { this._formModel?.reset(); }

    /** Called when the parent fieldset or form is disabled or enabled. */
    formDisabledCallback(disabled: boolean): void { this._formModel?.disabled(disabled); }

    /** Called when form state is restored (back/forward navigation, autofill). */
    formStateRestoreCallback(state: string | File | FormData | null, _mode?: 'restore' | 'autocomplete'): void {
        this._formModel?.restore(state);
    }
}
