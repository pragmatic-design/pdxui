// pdx-form-section — Logical section of a form for tab/step/accordion layouts.
// Validates only its own fields (specified by `fields` prop).
// Validation timing is configurable: onLeave, onSubmit, or blocking.

import { component, html, signal, tryUseForm, formField, prop } from '@pdxui/core';
import type { Form } from '@pdxui/core';
// This component's styles live in form.css — written where the
// container is rather than where the component is. Imported explicitly so they travel anyway.
import '@pdxui/design/components/form';

/**
 * Groups related fields of a form under a labelled heading, and can scope validation to its own
 * fields.
 *
 * @cssstate active - `active` (the default): the section is shown; a section that is not active is hidden.
 * @cssstate invalid - The last `validateSection()` found an error in one of its fields.
 *
 * @csspart root - The `<fieldset>`.
 * @csspart legend - The legend, with `label`.
 * @csspart content - The fields.
 */
component('pdx-form-section', {
    props: {
        /** Section name (used for identification). */
        name: prop(''),
        /** Display label for the section header. */
        label: prop(''),
        /** Comma-separated field names that belong to this section. */
        fields: prop(''),
        /** When to validate: 'onLeave' | 'onSubmit' | 'blocking'. Default: 'onSubmit'. */
        validate: prop('onSubmit'),
        /** Whether the section is currently active/visible. */
        active: prop(true),
    },
    // `active` stays a prop: the section never writes it, its parent does. Its conditions are states
    // of the host (#293), which form.css draws; the fieldset carries no class for them.
    states: ['active', 'invalid'],
    parts: ['root', 'legend', 'content'],
    setup(ctx) {
        // Looked up when read, and kept once found: set up before its <pdx-form>, a one-time lookup
        // at setup would never find it. See tryUseForm(from).
        let _form: Form<any> | undefined;
        const currentForm = (): Form<any> | undefined => _form ??= tryUseForm(ctx.el) as Form<any> | undefined;
        const _sectionValid = signal(true);
        const _sectionDirty = signal(false);

        function getFieldNames(): string[] {
            const f = ctx.fields() as string;
            return f ? f.split(',').map(s => s.trim()).filter(Boolean) : [];
        }

        /** Validate only this section's fields. Returns true if all valid. */
        async function validateSection(): Promise<boolean> {
            const form = currentForm();
            if (!form) return true;
            const names = getFieldNames();
            if (names.length === 0) return true;

            // Touch section fields
            for (const name of names) {
                const field = formField(form as Form<any>, name);
                if (field) field.onBlur(); // trigger touched
            }

            await form.validate();
            // Check only section fields
            const errors = form.errors();
            const sectionHasErrors = names.some(n => errors[n]);
            _sectionValid.set(!sectionHasErrors);
            return !sectionHasErrors;
        }

        // Track section dirty state
        ctx.track(() => {
            const form = currentForm();
            if (!form) return;
            const names = getFieldNames();
            const hasDirty = names.some(n => {
                const field = formField(form as Form<any>, n);
                return field?.dirty();
            });
            _sectionDirty.set(hasDirty);
        });

        ctx.track(() => {
            ctx.state('active', !!ctx.active());
            ctx.state('invalid', !_sectionValid());
        });

        return { validateSection, sectionValid: _sectionValid, sectionDirty: _sectionDirty };
    },
    render: (ctx) => html`
        <fieldset class="pdx-form-section" data-part="root" role="group"
                  :aria-label="${ctx.label}">
            ${() => ctx.label() ? html`
                <legend class="pdx-form-section-legend" data-part="legend">${ctx.label}</legend>
            ` : ''}
            <div class="pdx-form-section-content" data-part="content">
                <slot></slot>
            </div>
        </fieldset>
    `,
});
