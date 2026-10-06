// pdx-pin-input — Masked code input (PIN entry). Same as pdx-otp-input with mask=true.
// Displays dots (●) instead of characters. Use for passwords/PINs.

import { component, html, useFormAssociated } from '@pdxui/core';
import { uiString } from '../shared/i18n';

// PinInput is OtpInput with mask=true and numeric=true defaults
// Import otp-input to ensure it's registered
import '../otp-input/pdx-otp-input';

/**
 * A masked code input for entering a PIN: each cell shows a dot instead of the character typed.
 */
component('pdx-pin-input', {
    formAssociated: true,
    props: {
        length: { type: Number, default: 4 },
        value: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        error: { type: Boolean, default: false },
        size: { type: String, default: '' },
        numeric: { type: Boolean, default: true },
        /** The cells' group name. Empty: the pin-input.label component string, «PIN». */
        label: { type: String, default: '' },
    },
    setup(ctx) {
        // The typed value lives in the inner pdx-otp-input: without the relay,
        // getFormValue would read only the initial prop and the PIN would never
        // reach the form on submit.
        let _current = (ctx.value() as string) ?? '';
        ctx.track(() => { _current = (ctx.value() as string) ?? ''; });
        ctx.el.addEventListener('pdx-change', (e: Event) => {
            const v = (e as CustomEvent).detail?.value;
            if (typeof v === 'string') {
                _current = v;
                (ctx.el as unknown as { value?: string }).value = v;
            }
        });
        ctx.el.addEventListener('pdx-input', (e: Event) => {
            const v = (e as CustomEvent).detail?.value;
            if (typeof v === 'string') _current = v;
        });
        useFormAssociated(ctx, { getFormValue: () => (_current ? _current : null) });

        // Imperative API: focus/blur/clear (delegates to inner pdx-otp-input)
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() {
                const otp = ctx.el.querySelector('pdx-otp-input') as any;
                if (otp && typeof otp.clear === 'function') otp.clear();
                (ctx.el as any).value = '';
                ctx.emit('pdx-input', { value: '' });
            },
        });

        return {};
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
        ></pdx-otp-input>
    `,
});
