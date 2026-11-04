// pdx-label — Accessible form label with required/optional indicators.
// Renders a .pdx-field-label with .pdx-field-hint and .pdx-field-description; required, optional and
// disabled are states of the host, which forms.css draws beside the native .pdx-field-required classes.

import { component, html, signal, generatedId, prop } from '@pdxui/core';

/**
 * An accessible form label, with a required or optional indicator, a hint and a description.
 *
 * @cssstate required - `required`: the label carries the required marker (`--pdx-field-required-marker`).
 * @cssstate optional - `optional`: the label says the field is optional.
 * @cssstate disabled - `disabled`: the label is dimmed with its control.
 *
 * @csspart root - The `<label>` itself.
 * @csspart description - The description under the label, with `description`.
 * @csspart hint - The hint under the label, with `hint`.
 */
component('pdx-label', {
    // The axis forms.css keys by (#627), reflected on the host; each value maps the class that draws
    // the same label on a native <label>. `md` is the base look, which no class adds to.
    variants: {
        /** xs, sm, md (the default), lg or xl: the label's text size. */
        size: { md: '.pdx-field-label-md', xs: '.pdx-field-label-xs', sm: '.pdx-field-label-sm', lg: '.pdx-field-label-lg', xl: '.pdx-field-label-xl' },
    },
    props: {
        for: prop(''),
        text: prop(''),
        required: prop(false),
        optional: prop(false),
        disabled: prop(false),
        hint: prop(''),
        description: prop(''),
    },
    // Its conditions are states of the host (#293), which forms.css draws; the <label> keeps only its
    // base class, the one a native label shares.
    states: ['required', 'optional', 'disabled'],
    parts: ['root', 'description', 'hint'],
    setup(ctx) {
        ctx.track(() => {
            ctx.state('required', !!ctx.required());
            ctx.state('optional', !!ctx.optional());
            ctx.state('disabled', !!ctx.disabled());
        });

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

        return { forValue };
    },
    render: (ctx) => html`
        <label class="pdx-field-label" data-part="root" :for="${ctx.forValue}">
            ${() => ctx.text() || html`<slot></slot>`}
        </label>
        ${() => ctx.description() ? html`<span class="pdx-field-description" data-part="description">${ctx.description}</span>` : ''}
        ${() => ctx.hint() ? html`<span class="pdx-field-hint" data-part="hint">${ctx.hint}</span>` : ''}
    `,
});
