// pdx-form-section — Logical section of a form for tab/step/accordion layouts.
// Validates only its own fields (specified by `fields` prop).
// Validation timing is configurable: onLeave, onSubmit, or blocking.

import { component, html, signal, tryUseForm } from '@pdxui/core';
import type { Form } from '@pdxui/core';
// This component's styles live in form.css — written where the
// container is rather than where the component is. Imported explicitly so they travel anyway.
import '@pdxui/design/components/form';

/**
 * Groups related fields of a form under a labelled heading, and can scope validation to its own
 * fields.
 */
component('pdx-form-section', {
    props: {
        /** Section name (used for identification). */
        name: { type: String, default: '' },
        /** Display label for the section header. */
        label: { type: String, default: '' },
        /** Comma-separated field names that belong to this section. */
        fields: { type: String, default: '' },
        /** When to validate: 'onLeave' | 'onSubmit' | 'blocking'. Default: 'onSubmit'. */
        validate: { type: String, default: 'onSubmit' },
        /** Whether the section is currently active/visible. */
        active: { type: Boolean, default: true },
    },
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
                const field = (form as Form<any>).fields[name];
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
                const field = (form as Form<any>).fields[n];
                return field?.dirty();
            });
            _sectionDirty.set(hasDirty);
        });

        function wrapClass(): string {
            let cls = 'pdx-form-section';
            if (!ctx.active()) cls += ' pdx-form-section-hidden';
            if (!_sectionValid()) cls += ' pdx-form-section-invalid';
            return cls;
        }

        return { validateSection, sectionValid: _sectionValid, sectionDirty: _sectionDirty, wrapClass };
    },
    render: (ctx) => html`
        <fieldset :class="${ctx.wrapClass}" role="group"
                  :aria-label="${ctx.label}">
            ${() => ctx.label() ? html`
                <legend class="pdx-form-section-legend">${ctx.label}</legend>
            ` : ''}
            <div class="pdx-form-section-content">
                <slot></slot>
            </div>
        </fieldset>
    `,
});
