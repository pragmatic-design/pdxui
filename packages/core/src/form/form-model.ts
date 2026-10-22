// A model declared `{ form }` (#135): the component takes part in a native <form> through its model.
//
//   @model value: string = '' { form };                 // a .pdx
//   models: { value: model<string>('', { form: true }) } // a descriptor
//
// `component()` makes such a component form-associated and calls `wireFormModel` once its props exist.
// The model's value is the form's value — `toFormValue` is the serialization — and the form's lifecycle
// writes the model back: a reset to the value it mounted with, a restored state to the value saved
// with it. The component's `required` and `error` props, when it declares them, are its validity, and
// its `disabled` prop follows a disabled fieldset.

import type { Signal } from '../utils/types';
import { DEV } from '../utils/env';

/** What `ElementInternals.setFormValue` takes. */
export type FormValue = FormData | string | File | null;

/** The marker for a value the serialization has no rule for. */
const UNSUPPORTED = Symbol('pdx:form-value-unsupported');

/**
 * A model's value as the form submits it:
 * - a string as is, a number as its string;
 * - a boolean as a native checkbox does: `checkedValue` (the component's `value`, or `'on'`) when
 *   true, no entry when false;
 * - an array as one entry per item under `name` (a native multi-select), Files as files; no name, no entry;
 * - a File as the file; `null` or `undefined` as no entry.
 * Anything else (a plain object, a Date) has no rule, and is {@link UNSUPPORTED}.
 */
export function toFormValue(value: unknown, name: string | null, checkedValue: string): FormValue | typeof UNSUPPORTED {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? checkedValue : null;
    if (typeof File !== 'undefined' && value instanceof File) return value;
    if (Array.isArray(value)) {
        if (!name) return null;
        const data = new FormData();
        for (const item of value) {
            if (item === null || item === undefined) continue;
            data.append(name, typeof File !== 'undefined' && item instanceof File ? item : String(item));
        }
        return data;
    }
    return UNSUPPORTED;
}

/** Whether {@link toFormValue} had no rule for the value. */
export function isUnsupportedFormValue(v: FormValue | typeof UNSUPPORTED): v is typeof UNSUPPORTED {
    return v === UNSUPPORTED;
}

/** A value JSON writes and reads back as itself. */
function isPlain(v: unknown): boolean {
    return v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
}

/**
 * The state saved with the value, for `formStateRestoreCallback`: its JSON when JSON gives it back as
 * it was (a plain value, or an array of them), and nothing otherwise — files are not restored.
 */
function stateOf(value: unknown): string | null {
    if (isPlain(value) || (Array.isArray(value) && value.every(isPlain))) return JSON.stringify(value);
    return null;
}

/** Whether a required model holds nothing, as a native required control judges it. */
function isMissing(value: unknown): boolean {
    return value === null || value === undefined || value === '' || value === false
        || (Array.isArray(value) && value.length === 0);
}

/**
 * The message a native required control shows, in the browser's language: a text input's, or a
 * checkbox's for a boolean model. Read from an element made once, not translated here.
 */
const nativeMissing: Partial<Record<'text' | 'checkbox', string>> = {};
function missingMessage(value: unknown): string {
    const kind = typeof value === 'boolean' ? 'checkbox' : 'text';
    if (nativeMissing[kind] === undefined) {
        const probe = document.createElement('input');
        probe.type = kind;
        probe.required = true;
        // A DOM with no constraint validation (happy-dom) gives '': setValidity refuses an empty
        // message with a flag set, so the browser's English text stands in.
        nativeMissing[kind] = probe.validationMessage || 'Please fill out this field.';
    }
    return nativeMissing[kind]!;
}

/** The parts of the element the wiring uses: its live attributes and its form API. */
export interface FormModelElement {
    attr(name: string): Signal<string | null>;
    setFormValue(value: FormValue, state?: string | null): void;
    setValidity(flags?: ValidityStateFlags, message?: string): void;
}

/** The form lifecycle callbacks of one instance, which the element's own callbacks call. */
export interface FormModelCallbacks {
    reset(): void;
    disabled(disabled: boolean): void;
    restore(state: unknown): void;
}

/**
 * Wire one instance's model to its form: value, validity, and the lifecycle callbacks. `ctx` is the
 * component's context once its props are signals; `model` the model declared `{ form }`; `props` the
 * names the component declares, of which `value` (a boolean model's checked value), `required`,
 * `error` and `disabled` are read when present. Lives here, not in `component()`, so an app with no
 * form model carries none of it (#135).
 */
export function wireFormModel(
    el: FormModelElement, track: (fn: () => void) => void, ctx: Record<string, unknown>,
    model: string, props: readonly string[], tag: string,
): FormModelCallbacks {
    const declared = (n: string): Signal<unknown> | undefined =>
        n !== model && props.includes(n) ? ctx[n] as Signal<unknown> : undefined;
    const signal = ctx[model] as Signal<unknown>;
    const checkedValue = declared('value');
    const errorProp = declared('error');
    const requiredProp = declared('required');
    const name = el.attr('name');
    const initial = signal.peek();
    let warned = false;

    track(() => {
        const value = signal();
        const checked = checkedValue?.();
        const entry = toFormValue(value, name(), typeof checked === 'string' && checked !== '' ? checked : 'on');
        if (isUnsupportedFormValue(entry)) {
            if (DEV && !warned) {
                warned = true;
                console.warn(`[pdx] <${tag}>'s model '${model}' is declared { form }, but its value has no form serialization (strings, numbers, booleans, arrays, files and null do). It is not submitted.`);
            }
            el.setFormValue(null);
            return;
        }
        el.setFormValue(entry, stateOf(value));
    });

    track(() => {
        const value = signal();
        const error = errorProp?.();
        const required = requiredProp?.() === true;
        if (typeof error === 'string' && error !== '') { el.setValidity({ customError: true }, error); return; }
        if (required && isMissing(value)) el.setValidity({ valueMissing: true }, missingMessage(value));
        else el.setValidity({});
    });

    return {
        reset: () => signal.set(initial),
        disabled: (disabled) => {
            if (props.includes('disabled')) (el as unknown as { disabled: boolean }).disabled = disabled;
        },
        // The browser hands back the state this element saved, which `stateOf` wrote as JSON.
        restore: (state) => {
            if (typeof state === 'string') signal.set(JSON.parse(state));
        },
    };
}
