// Form-associated mixin — wires a component's value/error signals to ElementInternals.
// Call this in setup() of any form control with formAssociated: true.
//
// What it does:
//   1. Syncs the component's value → internals.setFormValue() (FormData participation)
//   2. Syncs the component's error → internals.setValidity() (constraint validation API)
//   3. Returns helpers for the component to use
//
// Prerequisites:
//   - component() must be called with { formAssociated: true }
//   - PdxElement base class already handles attachInternals() in constructor

import type { ComponentContextBase } from '../component/component';

export interface FormAssociatedOptions {
    /** Function that returns the current form value as a string (or null). */
    getFormValue: () => string | null;
    /** Optional: function that returns the current error message (for constraint validation). */
    getError?: () => string | undefined;
}

/**
 * Wire a component's value and validation to ElementInternals.
 * Call in setup() after signal initialization.
 *
 * Usage:
 *   component('pdx-input', {
 *       formAssociated: true,
 *       setup(ctx) {
 *           // ... existing setup code ...
 *           useFormAssociated(ctx, {
 *               getFormValue: () => ctx.value() as string ?? null,
 *               getError: () => ctx.error() as string | undefined,
 *           });
 *       },
 *   });
 */
export function useFormAssociated(
    ctx: ComponentContextBase,
    options: FormAssociatedOptions,
): void {
    if (!ctx.setFormValue) return; // Not form-associated, skip silently

    // Sync value → FormData
    ctx.track(() => {
        const val = options.getFormValue();
        ctx.setFormValue!(val);
    });

    // Sync error → constraint validation API
    if (options.getError) {
        ctx.track(() => {
            const err = options.getError!();
            if (err) {
                ctx.setValidity!({ customError: true }, err);
            } else {
                ctx.setValidity!({});
            }
        });
    }
}
