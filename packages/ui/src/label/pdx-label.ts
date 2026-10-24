// pdx-label — Accessible form label with required/optional indicators.
// Maps to .pdx-field-label, .pdx-field-required, .pdx-field-optional,
// .pdx-field-hint, .pdx-field-description CSS classes.

import { component, html, signal, generatedId } from '@pdxui/core';

/**
 * An accessible form label, with a required or optional indicator, a hint and a description.
 */
component('pdx-label', {
    // The axis forms.css keys by (#627), reflected on the host; each value maps the class that draws
    // the same label on a native <label>. `md` is the base look, which no class adds to.
    variants: {
        /** xs, sm, md (the default), lg or xl: the label's text size. */
        size: { md: '.pdx-field-label-md', xs: '.pdx-field-label-xs', sm: '.pdx-field-label-sm', lg: '.pdx-field-label-lg', xl: '.pdx-field-label-xl' },
    },
    props: {
        for: { type: String, default: '' },
        text: { type: String, default: '' },
        required: { type: Boolean, default: false },
        optional: { type: Boolean, default: false },
        disabled: { type: Boolean, default: false },
        hint: { type: String, default: '' },
        description: { type: String, default: '' },
    },
    setup(ctx) {
        function cssClass(): string {
            let cls = 'pdx-field-label';
            if (ctx.required()) cls += ' pdx-field-required';
            if (ctx.optional()) cls += ' pdx-field-optional';
            if (ctx.disabled()) cls += ' pdx-field-label-disabled';
            return cls;
        }

        // With no `for`, the label ties itself to the control that follows it: rendered as for="" —
        // an empty string is written as an attribute — a label would name nothing. A single control gets `for` (and an id if it has none); a group (a radio or
        // checkbox group) is labelled by the label's id, since `for` would name only its first input.
        // The ids it gives are made up: an agent's selector must not use them (#391).
        const uid = generatedId('pdx-label');
        const autoFor = signal('');
        ctx.frame(() => {
            if (ctx.for()) return;
            const next = ctx.el.nextElementSibling;
            if (!next) return;
            const group = next.matches('[role="radiogroup"], [role="group"]') ? next
                : next.querySelector('[role="radiogroup"], [role="group"]');
            const control = next.matches('input, textarea, select') ? next
                : next.querySelector('input:not([type="hidden"]), textarea, select');
            // A combobox that is no labelable element (pdx-select's trigger is a <div>) cannot be
            // reached by `for` either: it is named by the label's id, like a group.
            const combobox = control ? null
                : next.matches('[role="combobox"]') ? next : next.querySelector('[role="combobox"]');
            const byId = group && (!control || group.contains(control)) ? group : combobox;
            // Slider thumbs are no labelable elements either. A range has two: each is
            // named by the label AND its own name ("Price Minimum"), so the two stay apart.
            const sliders = control || byId ? [] : Array.from(next.matches('[role="slider"]')
                ? [next as HTMLElement] : next.querySelectorAll<HTMLElement>('[role="slider"]'));
            if (sliders.length) {
                const label = ctx.el.querySelector('label');
                if (!label) return;
                if (!label.id) label.id = uid;
                sliders.forEach((thumb, i) => {
                    if (thumb.hasAttribute('aria-labelledby')) return;
                    if (!thumb.id) thumb.id = `${uid}-thumb-${i}`;
                    thumb.setAttribute('aria-labelledby', sliders.length > 1 ? `${label.id} ${thumb.id}` : label.id);
                });
                return;
            }
            if (byId) {
                const label = ctx.el.querySelector('label');
                if (!label) return;
                if (!label.id) label.id = uid;
                if (!byId.hasAttribute('aria-labelledby') && !byId.hasAttribute('aria-label')) {
                    byId.setAttribute('aria-labelledby', label.id);
                }
                return;
            }
            if (!control) return;
            if (!control.id) control.id = `${uid}-control`;
            autoFor.set(control.id);
        });
        /** The label's `for`: the prop, else the control found after it, else no attribute at all. */
        const forValue = (): string | null => (ctx.for() as string) || autoFor() || null;

        return { cssClass, forValue };
    },
    render: (ctx) => html`
        <label :class="${ctx.cssClass}" data-part="root" :for="${ctx.forValue}">
            ${() => ctx.text() || html`<slot></slot>`}
        </label>
        ${() => ctx.description() ? html`<span class="pdx-field-description">${ctx.description}</span>` : ''}
        ${() => ctx.hint() ? html`<span class="pdx-field-hint">${ctx.hint}</span>` : ''}
    `,
});
