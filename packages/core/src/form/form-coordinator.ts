// FormCoordinator — orchestrates nested forms with independent DataSources.
// A parent form provides a coordinator; child forms register themselves.
// The coordinator aggregates dirty/valid/submitting state and coordinates submit.

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';
import type { Form } from './form';

// Heterogeneous form collection: each child form has a different value type, so
// the coordinator erases it. `Form<unknown>` would reject Form<SpecificDto> under
// generic invariance — `any` is the correct erasure here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyForm = Form<any>;

/** Each registered form's values under its name: a form's values are always a record. */
export type CoordinatedValues = Record<string, Record<string, unknown>>;

export interface FormCoordinator {
    /** Register a child form by name. */
    register(name: string, form: AnyForm): void;
    /** Unregister a child form. */
    unregister(name: string): void;
    /** Validate all registered child forms. Returns true if all valid. */
    validateAll(): Promise<boolean>;
    /** Submit all child forms. Validates first, then calls handler with aggregated values. */
    submitAll(handler?: (values: CoordinatedValues) => Promise<void> | void): Promise<boolean>;
    /** Whether any child form is dirty (reactive). */
    readonly dirty: ReadonlySignal<boolean>;
    /** Whether all child forms are valid (reactive). */
    readonly valid: ReadonlySignal<boolean>;
    /** Whether any child form is submitting (reactive). */
    readonly submitting: ReadonlySignal<boolean>;
    /** Registered child forms (reactive). */
    readonly forms: ReadonlySignal<ReadonlyMap<string, AnyForm>>;
    /** Get aggregated values from all child forms. */
    getValues(): CoordinatedValues;
}

/**
 * Aggregates several independent forms into one: validate all, submit all, and one dirty/valid/
 * submitting flag over the lot.
 *
 * For a screen made of sections that each own a form — a wizard step, a master-detail page — where
 * the Save button must reflect all of them and submitting must not start unless every one is valid.
 * `submitAll` validates FIRST and stops on failure, so a half-saved screen is not reachable through
 * it.
 *
 * A parent provides the coordinator, children register themselves; unregistering on unmount is the
 * child's job, or a removed section keeps the button disabled forever.
 */
export function createFormCoordinator(): FormCoordinator {
    const _forms = new Map<string, AnyForm>();
    // Bump counter to trigger re-evaluation of computed signals
    const _version = signal(0);

    function register(name: string, form: AnyForm): void {
        _forms.set(name, form);
        _version.set(v => v + 1);
    }

    function unregister(name: string): void {
        _forms.delete(name);
        _version.set(v => v + 1);
    }

    const dirty = computed(() => {
        _version(); // subscribe to changes
        for (const [, form] of _forms) {
            if (form.dirty()) return true;
        }
        return false;
    });

    const valid = computed(() => {
        _version();
        for (const [, form] of _forms) {
            if (!form.valid()) return false;
        }
        return true;
    });

    const submitting = computed(() => {
        _version();
        for (const [, form] of _forms) {
            if (form.submitting()) return true;
        }
        return false;
    });

    const forms = computed(() => {
        _version();
        return new Map(_forms) as ReadonlyMap<string, AnyForm>;
    });

    async function validateAll(): Promise<boolean> {
        const results = await Promise.all(
            Array.from(_forms.values()).map(f => f.validate()),
        );
        return results.every(Boolean);
    }

    async function submitAll(
        handler?: (values: CoordinatedValues) => Promise<void> | void,
    ): Promise<boolean> {
        const isValid = await validateAll();
        if (!isValid) return false;

        if (handler) {
            await handler(getValues());
        }
        return true;
    }

    function getValues(): CoordinatedValues {
        const result: CoordinatedValues = {};
        for (const [name, form] of _forms) {
            result[name] = form.getValues();
        }
        return result;
    }

    return {
        register,
        unregister,
        validateAll,
        submitAll,
        dirty,
        valid,
        submitting,
        forms,
        getValues,
    };
}
