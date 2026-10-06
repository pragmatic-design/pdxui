// Form Engine — cross-field validation, dirty tracking, nested forms.
// Signal-based form state management for compound <pdx-form> components.
// Integrates with Standard Schema (Zod, Valibot, etc.) via adapter.

import { signal, computed, batch } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────

export interface FieldState<T = unknown> {
    /** Current value. */
    value: T;
    /** Initial value (for dirty check). */
    initialValue: T;
    /** Whether the field has been modified. */
    dirty: boolean;
    /** Whether the field has been focused and blurred. */
    touched: boolean;
    /** Validation errors for this field. */
    errors: string[];
    /** Whether the field is currently being validated (async). */
    validating: boolean;
}

export type ValidationRule<T = unknown> = (value: T, formValues: Record<string, unknown>) => string | null | Promise<string | null>;

export interface FieldOptions<T = unknown> {
    /** Initial value. */
    initialValue: T;
    /** Validation rules. */
    rules?: ValidationRule<T>[];
    /** Validate on change (vs only on submit). Default: true. */
    validateOnChange?: boolean;
    /** Debounce validation in ms. Default: 0. */
    validateDebounceMs?: number;
}

export interface FormState {
    /** All field values as a plain object (reactive). */
    values: ReadonlySignal<Record<string, unknown>>;
    /** Whether any field has been modified (reactive). */
    dirty: ReadonlySignal<boolean>;
    /** Whether all fields are valid (reactive). */
    valid: ReadonlySignal<boolean>;
    /** Whether any async validation is in progress (reactive). */
    validating: ReadonlySignal<boolean>;
    /** All errors keyed by field name (reactive). */
    errors: ReadonlySignal<Record<string, string[]>>;
    /** Whether the form has been submitted at least once. */
    submitted: ReadonlySignal<boolean>;
}

export interface FormEngine {
    /** Form-level state (reactive). */
    state: FormState;

    /** Register a field. Returns field-level API. */
    field<T = unknown>(name: string, options: FieldOptions<T>): FieldAPI<T>;

    /** Get current value of a field. */
    getValue(name: string): unknown;

    /** Set value of a field programmatically. */
    setValue(name: string, value: unknown): void;

    /** Validate all fields. Returns true if valid. */
    validate(): Promise<boolean>;

    /** Reset all fields to initial values. */
    reset(): void;

    /** Reset a specific field. */
    resetField(name: string): void;

    /** Submit: validate then call handler if valid. */
    submit(handler: (values: Record<string, unknown>) => void | Promise<void>): Promise<boolean>;

    /** Get all current values as plain object. */
    getValues(): Record<string, unknown>;

    /** Set multiple values at once. */
    setValues(values: Record<string, unknown>): void;
}

export interface FieldAPI<T = unknown> {
    /** Current value (reactive). */
    value: ReadonlySignal<T>;
    /** Field errors (reactive). */
    errors: ReadonlySignal<string[]>;
    /** Whether dirty (reactive). */
    dirty: ReadonlySignal<boolean>;
    /** Whether touched (reactive). */
    touched: ReadonlySignal<boolean>;
    /** Whether validating (reactive). */
    validating: ReadonlySignal<boolean>;
    /** Set field value. */
    set(value: T): void;
    /** Mark as touched (on blur). */
    touch(): void;
    /** Reset to initial value. */
    reset(): void;
    /** Validate this field only. */
    validate(): Promise<string[]>;
}

// ─── createFormEngine ─────────────────────────────────────────

/**
 * A form built from fields that register THEMSELVES, rather than from a schema declared up front.
 *
 * The difference from {@link createForm}: there the field set is known when the form is created;
 * here each control registers on mount and unregisters on unmount, so the form's shape follows the
 * DOM. That is what a dynamic or generated form needs — `<pdx-auto-form>` builds on this.
 *
 * Per-field state (value, errors, touched, validating) lives with the field; the engine aggregates.
 */
export function createFormEngine(): FormEngine {
    const _fields = new Map<string, {
        signal: ReturnType<typeof signal<FieldState>>;
        options: FieldOptions;
        debounceTimer?: ReturnType<typeof setTimeout>;
    }>();

    // Signal that tracks field registration — bumped when a field is added.
    // Computed aggregators read this to discover all field signals.
    const _fieldRegistry = signal<Array<{ name: string; sig: ReturnType<typeof signal<FieldState>> }>>([]);

    const _submitted = signal(false);

    // Aggregated form state — reads _fieldRegistry to track all field signals
    const _values = computed(() => {
        const obj: Record<string, unknown> = {};
        for (const entry of _fieldRegistry()) {
            obj[entry.name] = entry.sig().value;
        }
        return obj;
    });

    const _dirty = computed(() => {
        for (const entry of _fieldRegistry()) {
            if (entry.sig().dirty) return true;
        }
        return false;
    });

    const _valid = computed(() => {
        for (const entry of _fieldRegistry()) {
            if (entry.sig().errors.length > 0) return false;
        }
        return true;
    });

    const _validating = computed(() => {
        for (const entry of _fieldRegistry()) {
            if (entry.sig().validating) return true;
        }
        return false;
    });

    const _errors = computed(() => {
        const obj: Record<string, string[]> = {};
        for (const entry of _fieldRegistry()) {
            const errs = entry.sig().errors;
            if (errs.length > 0) obj[entry.name] = errs;
        }
        return obj;
    });

    async function validateField(name: string): Promise<string[]> {
        const f = _fields.get(name);
        if (!f) return [];

        const rules = f.options.rules ?? [];
        if (rules.length === 0) {
            f.signal.set(prev => ({ ...prev, errors: [], validating: false }));
            return [];
        }

        f.signal.set(prev => ({ ...prev, validating: true }));
        const values = _values.peek();
        const fieldValue = f.signal.peek().value;

        const errors: string[] = [];
        for (const rule of rules) {
            const result = await rule(fieldValue, values);
            if (result) errors.push(result);
        }

        // Stale-result guard: if the field value changed while we awaited an async
        // rule, a newer validateField() owns the state — don't overwrite it.
        if (f.signal.peek().value !== fieldValue) return errors;

        f.signal.set(prev => ({ ...prev, errors, validating: false }));
        return errors;
    }

    function field<T = unknown>(name: string, options: FieldOptions<T>): FieldAPI<T> {
        const initial: FieldState<T> = {
            value: options.initialValue,
            initialValue: options.initialValue,
            dirty: false,
            touched: false,
            errors: [],
            validating: false,
        };

        const _signal = signal<FieldState>(initial as FieldState);
        _fields.set(name, { signal: _signal, options: options as FieldOptions });
        _fieldRegistry.set(prev => [...prev, { name, sig: _signal }]);

        const value = computed(() => _signal().value as T);
        const errors = computed(() => _signal().errors);
        const dirty = computed(() => _signal().dirty);
        const touched = computed(() => _signal().touched);
        const validating = computed(() => _signal().validating);

        function set(val: T): void {
            _signal.set(prev => ({
                ...prev,
                value: val,
                dirty: val !== prev.initialValue,
            }));

            // Validate on change
            if (options.validateOnChange !== false) {
                const entry = _fields.get(name)!;
                if (options.validateDebounceMs && options.validateDebounceMs > 0) {
                    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
                    entry.debounceTimer = setTimeout(() => validateField(name), options.validateDebounceMs);
                } else {
                    validateField(name);
                }
            }
        }

        function touch(): void {
            _signal.set(prev => ({ ...prev, touched: true }));
        }

        function reset(): void {
            _signal.set({
                value: options.initialValue,
                initialValue: options.initialValue,
                dirty: false,
                touched: false,
                errors: [],
                validating: false,
            } as FieldState);
        }

        return {
            value,
            errors,
            dirty,
            touched,
            validating,
            set,
            touch,
            reset,
            validate: () => validateField(name),
        };
    }

    function getValue(name: string): unknown {
        return _fields.get(name)?.signal.peek().value;
    }

    function setValue(name: string, value: unknown): void {
        const f = _fields.get(name);
        if (!f) return;
        f.signal.set(prev => ({ ...prev, value, dirty: value !== prev.initialValue }));
    }

    async function validate(): Promise<boolean> {
        const results = await Promise.all(
            Array.from(_fields.keys()).map(name => validateField(name)),
        );
        return results.every(errs => errs.length === 0);
    }

    function reset(): void {
        for (const [, f] of _fields) {
            f.signal.set(prev => ({
                ...prev,
                value: prev.initialValue,
                dirty: false,
                touched: false,
                errors: [],
                validating: false,
            }));
        }
        _submitted.set(false);
    }

    function resetField(name: string): void {
        const f = _fields.get(name);
        if (!f) return;
        f.signal.set(prev => ({
            ...prev,
            value: prev.initialValue,
            dirty: false,
            touched: false,
            errors: [],
            validating: false,
        }));
    }

    async function submit(handler: (values: Record<string, unknown>) => void | Promise<void>): Promise<boolean> {
        _submitted.set(true);
        const isValid = await validate();
        if (!isValid) return false;
        await handler(_values.peek());
        return true;
    }

    function getValues(): Record<string, unknown> {
        return _values.peek();
    }

    function setValues(values: Record<string, unknown>): void {
        batch(() => {
            for (const [name, value] of Object.entries(values)) {
                setValue(name, value);
            }
        });
    }

    return {
        state: {
            values: _values,
            dirty: _dirty,
            valid: _valid,
            validating: _validating,
            errors: _errors,
            submitted: _submitted as ReadonlySignal<boolean>,
        },
        field,
        getValue,
        setValue,
        validate,
        reset,
        resetField,
        submit,
        getValues,
        setValues,
    };
}
