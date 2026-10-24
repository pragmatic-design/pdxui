// pdx-form — Compound form component with context provider.
// Wraps <form novalidate>, provides Form instance to children via context,
// handles submit + scroll-to-first-error.
//
// Children (<pdx-form-field>, custom inputs) inject the form via useForm().
// The form prop is required — create it with createForm() or @form rune.

import { component, html, provideForm, useFormCoordinator, onDestroy, DEV } from '@pdxui/core';
import type { Form, DataSource, FormCoordinator } from '@pdxui/core';
import { findRecord } from '../shared/find-record';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/form';

/**
 * A form that provides its Form to the controls and form fields inside it and validates them, with
 * save modes and DataSource integration.
 */
component('pdx-form', {
    props: {
        /** The Form instance (from createForm()). Required. */
        form: { type: Object, default: null },
        /** Optional name for nested form registration with parent coordinator. */
        name: { type: String, default: '' },
        /** HTML autocomplete attribute. */
        autocomplete: { type: String, default: 'off' },
        /** Scroll to first error field on failed validation. */
        scrollToError: { type: Boolean, default: true },
        /** CSS class for the inner <form> element. */
        formClass: { type: String, default: '' },
        /** DataSource for auto-load/save. When set, submit saves via DS. */
        source: { type: Object, default: null },
        /** Record ID to load from the DataSource. */
        recordId: { type: String, default: '' },
    },
    setup(ctx) {
        // `form` is read REACTIVELY: schema-driven parents (pdx-form-template)
        // dispose the old Form and swap in a new one when the schema changes. Capturing it once
        // would leave the inner form (context, submit) bound to the disposed instance.
        // `form` below is a mutable closure ref that the provide-track keeps current.
        let form = ctx.form() as Form<any> | null;
        if (!form) {
            if (DEV) console.warn('<pdx-form> requires a "form" prop (from createForm()).');
        }

        // The coordinator a host provides, looked up in the track below rather than once here: set up
        // before its host, the form would never find it and never register. Kept once found.
        let parentCoordinator: FormCoordinator | undefined;
        const formName = ctx.name() as string;
        let providedForm: Form<any> | null = null;
        let registeredForm: Form<any> | null = null;

        // Provide (and re-provide) the form context + coordinator registration whenever the
        // form prop changes, so injecting children always see the live form.
        ctx.track(() => {
            const f = ctx.form() as Form<any> | null;
            form = f;
            if (!f) return;
            if (f !== providedForm) {
                provideForm(f, ctx.el);
                providedForm = f;
            }
            parentCoordinator ??= useFormCoordinator(ctx.el);
            if (parentCoordinator && formName && f !== registeredForm) {
                parentCoordinator.register(formName, f);
                registeredForm = f;
            }
        });

        function scrollToFirstError(): void {
            if (!ctx.scrollToError()) return;
            requestAnimationFrame(() => {
                const errorEl = ctx.el.querySelector('.has-error, [aria-invalid="true"]') as HTMLElement | null;
                if (errorEl) {
                    errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Focus the first input inside the error field
                    const input = errorEl.querySelector('input, textarea, select') as HTMLElement | null;
                    if (input) input.focus();
                }
            });
        }

        // DataSource auto-load: when source + recordId are set, load record into form.
        // The track is ALWAYS registered, not only if source is already present at setup
        // time — otherwise setting it after the mount would never trigger the auto-load.
        ctx.track(() => {
            const f = ctx.form() as Form<any> | null;
            const source = ctx.source() as DataSource<any> | null;
            const id = ctx.recordId() as string;
            if (!f || !source || !id) return;
            // Read to subscribe: getById does not, and a record that arrives later must still load.
            source.data();
            // The id as written, then as a number, on the source's own key — `(r.id ?? r.Id) === id`
            // would never find `{ id: 1 }` for `record-id="1"`.
            const record = findRecord(source, id);
            if (record && !f.dirty()) {
                f.reset(record);
            }
        });

        function onSubmit(e: Event): void {
            e.preventDefault();
            const f = form;
            if (!f) return;

            // Touch all fields to show errors, then validate
            f.validate().then((isValid: boolean) => {
                if (!isValid) {
                    scrollToFirstError();
                    return;
                }

                const values = f.getValues();
                const source = ctx.source() as DataSource<any> | null;

                if (source) {
                    // DataSource auto-save: update record and sync
                    source.update(values);
                    source.sync().then(() => {
                        ctx.emit('pdx-submit', { values, saved: true });
                    }).catch((err: unknown) => {
                        ctx.emit('pdx-submit-error', { error: err });
                    });
                } else {
                    // Standard submit: emit event for parent to handle
                    ctx.emit('pdx-submit', { values });
                }
            });
        }

        function onReset(e: Event): void {
            e.preventDefault();
            if (!form) return;
            // Each control shows its field through its model binding, `::value="f.x"` (#128, #613).
            form.reset();
        }

        function wrapperClass(): string {
            let cls = 'pdx-form';
            const fc = ctx.formClass() as string;
            if (fc) cls += ' ' + fc;
            return cls;
        }

        // Destroyed (not frozen by keepAlive, which does not run onDestroy): leave the coordinator, or
        // its dirty/valid/submitting and submitAll keep counting a form that is off the page. Not a
        // `_cleanup` returned from setup, which nothing calls.
        onDestroy(() => {
            if (parentCoordinator && formName && registeredForm) {
                parentCoordinator.unregister(formName);
                registeredForm = null;
            }
        });

        return {
            onSubmit,
            onReset,
            wrapperClass,
        };
    },
    render: (ctx) => html`
        <form :class="${ctx.wrapperClass}" novalidate
              :autocomplete="${ctx.autocomplete}"
              @submit="${ctx.onSubmit}"
              @reset="${ctx.onReset}">
            <slot></slot>
        </form>
    `,
});
