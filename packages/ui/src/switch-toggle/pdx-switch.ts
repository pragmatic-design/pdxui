// pdx-switch — Toggle switch with label, description, loading, sizes.
// Maps to .pdx-toggle CSS class from design system (forms.css).
// Uses role="switch" for proper a11y semantics.

import { component, html, model } from '@pdxui/core';
import { uiString } from '../shared/i18n';

/**
 * A toggle switch (role="switch") the user turns on and off, with a label, a description and a
 * loading state.
 *
 * @csspart root - The native checkbox with role="switch", the track drawn; the size variants key by it.
 * @csspart label - The `label` text, when set.
 * @csspart description - The `description` text, when set.
 *
 * @cssstate checked - It is on.
 * @cssstate invalid - `error` is set; the switch is aria-invalid.
 * @cssstate disabled - `disabled` is set.
 * @cssstate loading - `loading` is set; the switch is aria-busy and takes no toggle.
 *
 * @alphaevent pdx-change
 * @alphadetail checked $event.detail.value
 * @alphadetail value $event.currentTarget.value
 */
component('pdx-switch', {
    // A toggle writes it (#480), and the write dispatches `checked-change`.
    models: { checked: model(false, { form: true }) },
    // On the host as custom states (#132); the track and its label carry no state class.
    states: ['checked', 'invalid', 'disabled', 'loading'],
    parts: ['root', 'label', 'description'],
    // The axes its stylesheet keys by (#629), reflected on the host; each value maps the class that
    // draws the same look on native markup. `md` is the base size, which no class adds to.
    variants: {
        /** sm, md (the default) or lg: the track's size. */
        size: { md: '.pdx-toggle-md', sm: '.pdx-toggle-sm', lg: '.pdx-toggle-lg' },
    },
    props: {
        disabled: { type: Boolean, default: false },
        loading: { type: Boolean, default: false },
        label: { type: String, default: '' },
        description: { type: String, default: '' },
        /** Accessible name when there is no visible label (forwarded to the inner input) */
        ariaLabel: { type: String, default: '' },
        labelPosition: { type: String, default: 'right' },
        error: { type: Boolean, default: false },
        name: { type: String, default: '' },
        value: { type: String, default: '' },
    },
    setup(ctx) {
        // `checked` is the live state and the model: a toggle writes it, and the write dispatches its event.

        ctx.track(() => {
            ctx.state('checked', !!ctx.checked());
            ctx.state('invalid', !!ctx.error());
            ctx.state('disabled', !!ctx.disabled());
            ctx.state('loading', !!ctx.loading());
        });

        function onChange(e: Event) {
            if (ctx.disabled() || ctx.loading()) return;
            ctx.checked.set((e.target as HTMLInputElement).checked);
        }

        function wrapClass(): string {
            let cls = 'pdx-switch-wrap';
            if (ctx.labelPosition() === 'left') cls += ' pdx-switch-label-left';
            return cls;
        }

        // Imperative API: focus/blur/clear
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() {
                const inp = ctx.el.querySelector('input') as HTMLInputElement | null;
                if (inp) inp.checked = false;
                ctx.checked.set(false);
            },
        });

        return { onChange, wrapClass };
    },
    // The host is the one submitter, under its name (#133); an inner checkbox carrying the name too
    // would send the value a second time. Written after `setup`, so its type is read.
    host: { ':name': (ctx) => ctx.name() || null },
    render: (ctx) => html`
        <label :class="${ctx.wrapClass}">
            <input
                type="checkbox"
                class="pdx-toggle"
                data-part="root"
                role="switch"
                :checked="${ctx.checked}"
                :disabled="${() => ctx.disabled() || ctx.loading()}"
                :aria-checked="${() => String(!!ctx.checked())}"
                :aria-invalid="${() => ctx.error() ? 'true' : null}"
                :aria-busy="${() => ctx.loading() ? 'true' : null}"
                :aria-label="${() => (ctx.ariaLabel() as string) || (ctx.label() ? null : uiString('switch', 'label'))}"
                @change="${ctx.onChange}"
            />
            ${() => (ctx.label() || ctx.description()) ? html`<span class="pdx-switch-content">
                ${() => ctx.label() ? html`<span class="pdx-switch-label" data-part="label">${ctx.label}</span>` : html`<slot></slot>`}
                ${() => ctx.description() ? html`<span class="pdx-switch-desc" data-part="description">${ctx.description}</span>` : ''}
            </span>` : html`<slot></slot>`}
        </label>
    `,
});
