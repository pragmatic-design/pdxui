// pdx-pin-input — Masked code input (PIN entry). Same as pdx-otp-input with mask=true.
// Displays dots (●) instead of characters. Use for passwords/PINs.

import { component, html, model, useFormAssociated } from '@pdxui/core';
import { uiString } from '../shared/i18n';

// PinInput is OtpInput with mask=true and numeric=true defaults
// Import otp-input to ensure it's registered
import '../otp-input/pdx-otp-input';

/**
 * A masked code input for entering a PIN: each cell shows a dot instead of the character typed.
 *
 * @fires pdx-complete {{ value }} - When every cell is filled: the whole PIN.
 * @alphaevent pdx-input
 * @alphadetail value $event.detail.value
 */
component('pdx-pin-input', {
    formAssociated: true,
    // The PIN so far (#125). Each character typed or deleted in the inner pdx-otp-input writes it, and
    // the write dispatches `value-change`.
    models: { value: model<string>('') },
    props: {
        length: { type: Number, default: 4 },
        disabled: { type: Boolean, default: false },
        error: { type: Boolean, default: false },
        size: { type: String, default: '' },
        numeric: { type: Boolean, default: true },
        /** The cells' group name. Empty: the pin-input.label component string, «PIN». */
        label: { type: String, default: '' },
    },
    setup(ctx) {
        // The inner pdx-otp-input's events stay on it (#138): its model's `value-change` is the
        // pin-input's own model, written from it; `pdx-complete` is dispatched again from the host.
        function onInput(e: Event) {
            const v = (e as CustomEvent).detail?.value;
            if (typeof v === 'string') ctx.value.set(v);
        }
        function onComplete(e: Event) { ctx.emit('pdx-complete', (e as CustomEvent).detail); }
        useFormAssociated(ctx, { getFormValue: () => { const v = ctx.value() as string; return v ? v : null; } });

        // Imperative API: focus/blur/clear (delegates to inner pdx-otp-input)
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() {
                const otp = ctx.el.querySelector('pdx-otp-input') as HTMLElement & { clear?: () => void } | null;
                if (otp && typeof otp.clear === 'function') otp.clear();
                ctx.value.set('');
            },
        });

        return { onInput, onComplete };
    },
    render: (ctx) => html`
        <pdx-otp-input
            :length="${ctx.length}"
            :value="${ctx.value}"
            :disabled="${ctx.disabled}"
            :error="${ctx.error}"
            :size="${ctx.size}"
            :numeric="${ctx.numeric}"
            :label="${() => (ctx.label() as string) || uiString('pin-input', 'label')}"
            autocomplete="off"
            mask
            @value-change="${ctx.onInput}"
            @pdx-complete="${ctx.onComplete}"
        ></pdx-otp-input>
    `,
});
