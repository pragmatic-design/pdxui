// pdx-switch — Toggle switch with label, description, loading, sizes.
// Maps to .pdx-toggle CSS class from design system (forms.css).
// Uses role="switch" for proper a11y semantics.

import { component, html, useFormAssociated } from '@pdxui/core';
import { setOwnProp, reflectNameToHost } from '../shared/own-prop';
import { uiString } from '../shared/i18n';

/**
 * A toggle switch (role="switch") the user turns on and off, with a label, a description and a
 * loading state.
 */
component('pdx-switch', {
    formAssociated: true,
    props: {
        checked: { type: Boolean, default: false },
        disabled: { type: Boolean, default: false },
        loading: { type: Boolean, default: false },
        label: { type: String, default: '' },
        description: { type: String, default: '' },
        /** Accessible name when there is no visible label (forwarded to the inner input) */
        ariaLabel: { type: String, default: '' },
        labelPosition: { type: String, default: 'right' },
        size: { type: String, default: '' },
        error: { type: Boolean, default: false },
        name: { type: String, default: '' },
        value: { type: String, default: '' },
    },
    setup(ctx) {
        // `checked` is the live state: a toggle writes it.

        function onChange(e: Event) {
            if (ctx.disabled() || ctx.loading()) return;
            const input = e.target as HTMLInputElement;
            setOwnProp(ctx.el, 'checked', input.checked);
            ctx.emit('pdx-change', {
                checked: input.checked,
                value: ctx.value() || ctx.label(),
            });
        }

        function toggleClass(): string {
            let cls = 'pdx-toggle';
            const s = ctx.size() as string;
            if (s) cls += ' pdx-toggle-' + s;
            if (ctx.error()) cls += ' pdx-toggle-error';
            if (ctx.loading()) cls += ' pdx-toggle-loading';
            return cls;
        }

        function wrapClass(): string {
            let cls = 'pdx-switch-wrap';
            if (ctx.labelPosition() === 'left') cls += ' pdx-switch-label-left';
            if (ctx.disabled() || ctx.loading()) cls += ' disabled';
            return cls;
        }

        useFormAssociated(ctx, { getFormValue: () => ctx.checked() ? ((ctx.value() as string) || 'on') : null });
        // The host is the one submitter; an inner checkbox carrying the name too would send the value
        // a second time.
        reflectNameToHost(ctx);

        // Imperative API: focus/blur/clear
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() {
                const inp = ctx.el.querySelector('input') as HTMLInputElement | null;
                if (inp) inp.checked = false;
                setOwnProp(ctx.el, 'checked', false);
                ctx.emit('pdx-change', { checked: false, value: (ctx.value() as string) || (ctx.label() as string) });
            },
        });

        return { onChange, toggleClass, wrapClass };
    },
    render: (ctx) => html`
        <label :class="${ctx.wrapClass}">
            <input
                type="checkbox"
                :class="${ctx.toggleClass}"
                role="switch"
                :checked="${ctx.checked}"
                :disabled="${() => ctx.disabled() || ctx.loading()}"
                :aria-checked="${() => String(!!ctx.checked())}"
                :aria-label="${() => (ctx.ariaLabel() as string) || (ctx.label() ? null : uiString('switch', 'label'))}"
                @change="${ctx.onChange}"
            />
            ${() => (ctx.label() || ctx.description()) ? html`<span class="pdx-switch-content">
                ${() => ctx.label() ? html`<span class="pdx-switch-label">${ctx.label}</span>` : html`<slot></slot>`}
                ${() => ctx.description() ? html`<span class="pdx-switch-desc">${ctx.description}</span>` : ''}
            </span>` : html`<slot></slot>`}
        </label>
    `,
});
