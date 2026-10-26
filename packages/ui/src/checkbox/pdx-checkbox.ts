// pdx-checkbox — Custom checkbox with label, description, indeterminate, tristate, sizes.
// Maps to .pdx-checkbox CSS class from design system (forms.css).
// tristate=true: click cycles unchecked → checked → indeterminate → unchecked.

import { component, html, model } from '@pdxui/core';
// A container rule in form.css (`.has-warning .pdx-checkbox`) styles this element, and it owns
// no stylesheet of its own, so nothing else would carry it.
import '@pdxui/design/components/form';

/**
 * A checkbox with a label and a description, which can be indeterminate or, as a tristate, cycle
 * through unchecked, checked and indeterminate.
 *
 * @csspart root - The native checkbox, the box drawn; the size variants key by it.
 * @csspart label - The `label` text, when set.
 * @csspart description - The `description` text, when set.
 *
 * @cssstate checked - It is checked.
 * @cssstate indeterminate - It is indeterminate; the box is aria-checked="mixed".
 * @cssstate invalid - `error` is set; the box is aria-invalid.
 * @cssstate disabled - `disabled` is set.
 *
 * @alphaevent pdx-change
 * @alphadetail checked $event.detail.value
 * @alphadetail value $event.currentTarget.value
 * @alphadetail indeterminate $event.currentTarget.indeterminate
 * @alphadetail state ($event.currentTarget.indeterminate ? null : $event.detail.value)
 */
component('pdx-checkbox', {
    // A click writes them (#480): `checked-change`, and in a tristate `indeterminate-change` too.
    // `checked` is what a form submits, as a native checkbox: `value`, or `on`, when checked (#135).
    models: {
        checked: model(false, { form: true }),
        indeterminate: model(false),
    },
    // On the host as custom states (#132); the box and its label carry no state class.
    states: ['checked', 'indeterminate', 'invalid', 'disabled'],
    parts: ['root', 'label', 'description'],
    // The axes its stylesheet keys by (#629), reflected on the host; each value maps the class that
    // draws the same look on native markup. `md` is the base size, which no class adds to.
    variants: {
        /** sm, md (the default) or lg: the box's size. */
        size: { md: '.pdx-checkbox-md', sm: '.pdx-checkbox-sm', lg: '.pdx-checkbox-lg' },
    },
    props: {
        disabled: { type: Boolean, default: false },
        /** Enable 3-state cycle: unchecked → checked → indeterminate → unchecked */
        tristate: { type: Boolean, default: false },
        label: { type: String, default: '' },
        description: { type: String, default: '' },
        value: { type: String, default: '' },
        name: { type: String, default: '' },
        error: { type: Boolean, default: false },
        required: { type: Boolean, default: false },
        labelPosition: { type: String, default: 'right' },
    },
    setup(ctx) {
        // Tristate cycle: unchecked(0) → checked(1) → indeterminate(2) → unchecked(0)
        // state: 0=unchecked, 1=checked, 2=indeterminate
        let tristatePhase = 0;

        ctx.track(() => {
            ctx.state('checked', !!ctx.checked());
            ctx.state('indeterminate', !!ctx.indeterminate());
            ctx.state('invalid', !!ctx.error());
            ctx.state('disabled', !!ctx.disabled());
        });

        // `checked` and `indeterminate` are the live state, and models: a click writes them, and each
        // write dispatches its event. `indeterminate` first, so a `checked-change` listener reading the
        // element sees both.

        function onChange(e: Event) {
            if (ctx.disabled()) return;
            const input = e.target as HTMLInputElement;

            if (ctx.tristate()) {
                e.preventDefault();
                tristatePhase = (tristatePhase + 1) % 3;
                const isChecked = tristatePhase === 1;
                const isIndeterminate = tristatePhase === 2;
                input.checked = isChecked;
                input.indeterminate = isIndeterminate;
                ctx.indeterminate.set(isIndeterminate);
                ctx.checked.set(isChecked);
            } else {
                // A click settles an indeterminate box, as it does a native one.
                ctx.indeterminate.set(false);
                ctx.checked.set(input.checked);
            }
        }

        // Sync indeterminate (can only be set via JS, not HTML attribute)
        ctx.track(() => {
            const ind = ctx.indeterminate();
            const chk = ctx.checked();
            requestAnimationFrame(() => {
                const input = ctx.el.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
                if (!input) return;
                input.indeterminate = !!ind;
                // Sync tristate phase from props
                if (ctx.tristate()) {
                    if (ind) tristatePhase = 2;
                    else if (chk) tristatePhase = 1;
                    else tristatePhase = 0;
                }
            });
        });

        function wrapClass(): string {
            let cls = 'pdx-checkbox-wrap';
            if (ctx.labelPosition() === 'left') cls += ' pdx-checkbox-label-left';
            return cls;
        }

        return { onChange, wrapClass };
    },
    // The host is the one submitter, under its name (#133); an inner checkbox carrying the name too
    // would send the value a second time. Written after `setup`, so its type is read.
    host: { ':name': (ctx) => ctx.name() || null },
    render: (ctx) => html`
        <label :class="${ctx.wrapClass}">
            <input
                type="checkbox"
                class="pdx-checkbox"
                data-part="root"
                :checked="${ctx.checked}"
                :disabled="${ctx.disabled}"
                :required="${ctx.required}"
                :value="${ctx.value}"
                :aria-invalid="${() => ctx.error() ? 'true' : null}"
                :aria-required="${() => ctx.required() ? 'true' : null}"
                :aria-checked="${() => ctx.indeterminate() ? 'mixed' : null}"
                @change="${ctx.onChange}"
            />
            ${() => (ctx.label() || ctx.description()) ? html`<span class="pdx-checkbox-content">
                ${() => ctx.label() ? html`<span class="pdx-checkbox-label" data-part="label">${ctx.label}</span>` : html`<slot></slot>`}
                ${() => ctx.description() ? html`<span class="pdx-checkbox-desc" data-part="description">${ctx.description}</span>` : ''}
            </span>` : html`<slot></slot>`}
        </label>
    `,
});
