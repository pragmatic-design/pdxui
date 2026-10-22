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
import { required as requiredRule } from './validators';
import { resolveValidationMessage } from './validation-i18n';
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

/** Whether a required model holds nothing: core's `required()` rule, and `false` as a native checkbox. */
function missingMessage(value: unknown): string | undefined {
    if (value === false) return resolveValidationMessage(requiredRule()(null));
    return resolveValidationMessage(requiredRule()(value));
}

/** What the element gives `wireFormModel`: the parts of PdxElement and its context the wiring uses. */
export interface FormModelHost {
    tag: string;
    model: string;
    /** The model's signal as the component writes it: a write dispatches its change event. */
    signal: Signal<unknown>;
    /** The other props' signals, by name: `value` (a boolean model's checked value), `required`, `error`, `disabled`. */
    props: Record<string, Signal<unknown> | undefined>;
    /** The `name` attribute, live. */
    name: () => string | null;
    track: (fn: () => void) => void;
    setFormValue: (value: FormValue, state?: string | null) => void;
    setValidity: (flags: ValidityStateFlags, message?: string) => void;
    setDisabled: (disabled: boolean) => void;
}

/** The form lifecycle callbacks of one instance, which the element's own callbacks call. */
export interface FormModelCallbacks {
    reset(): void;
    disabled(disabled: boolean): void;
    restore(state: unknown): void;
}

/** Wire one instance's model to its form: value, validity, and the lifecycle callbacks. */
export function wireFormModel(host: FormModelHost): FormModelCallbacks {
    const initial = host.signal.peek();
    let warned = false;

    host.track(() => {
        const value = host.signal();
        const checked = host.props.value?.();
        const entry = toFormValue(value, host.name(), typeof checked === 'string' && checked !== '' ? checked : 'on');
        if (isUnsupportedFormValue(entry)) {
            if (DEV && !warned) {
                warned = true;
                console.warn(`[pdx] <${host.tag}>'s model '${host.model}' is declared { form }, but its value has no form serialization (strings, numbers, booleans, arrays, files and null do). It is not submitted.`);
            }
            host.setFormValue(null);
            return;
        }
        host.setFormValue(entry, stateOf(value));
    });

    host.track(() => {
        const value = host.signal();
        const error = host.props.error?.();
        const required = host.props.required?.() === true;
        if (typeof error === 'string' && error !== '') { host.setValidity({ customError: true }, error); return; }
        const missing = required ? missingMessage(value) : undefined;
        if (missing) host.setValidity({ valueMissing: true }, missing);
        else host.setValidity({});
    });

    return {
        reset: () => host.signal.set(initial),
        disabled: (disabled) => host.setDisabled(disabled),
        // The browser hands back the state this element saved, which `stateOf` wrote as JSON.
        restore: (state) => {
            if (typeof state === 'string') host.signal.set(JSON.parse(state));
        },
    };
}
