// pdx-form — Compound form component with context provider.
// Wraps <form novalidate>, provides Form instance to children via context,
// handles submit + scroll-to-first-error.
//
// Children (<pdx-form-field>, custom inputs) inject the form via useForm().
// The form prop is required — create it with createForm() or @form rune.

import { component, html, provideForm, useFormCoordinator, onDestroy, DEV, signal, event, prop } from '@pdxui/core';
import type { Form, DataSource, FormCoordinator } from '@pdxui/core';
import { findRecord } from '../shared/find-record';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/form';

/**
 * A form that provides its Form to the controls and form fields inside it and validates them, with
 * save modes and DataSource integration.
 *
 * @cssstate dirty - A value differs from the one the form started from (or was last reset to).
 * @cssstate valid - The form's `valid()`: no field has an error among the validations run so far.
 * @cssstate invalid - Its last submit was refused, and an error is still there.
 * @cssstate submitting - A submit is running (`form.handleSubmit`).
 *
 * @csspart root - The native `<form>`.
 */
component('pdx-form', {
    props: {
        /** The Form instance (from createForm()). Required. */
        form: prop<Record<string, unknown> | null>(null),
        /** Optional name for nested form registration with parent coordinator. */
        name: prop(''),
        /** HTML autocomplete attribute. */
        autocomplete: prop('off'),
        /** Scroll to first error field on failed validation. */
        scrollToError: prop(true),
        /** CSS class for the inner <form> element. */
        formClass: prop(''),
        /** DataSource for auto-load/save. When set, submit saves via DS. */
        source: prop<Record<string, unknown> | null>(null),
        /** Record ID to load from the DataSource. */
        recordId: prop(''),
    },
    // Declared (#138): they stay on the host, which the parent listens on.
    events: {
        /** A submit passed validation: the values, and `saved` when a `source` stored them. */
        'pdx-submit': event<{ values: Record<string, unknown>; saved?: boolean }>(),
        /** The `source` refused the save. */
        'pdx-submit-error': event<{ error: unknown }>(),
    },
    // What its form is (#293), which an agent's page card reads.
    states: ['dirty', 'valid', 'invalid', 'submitting'],
    parts: ['root'],
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

        // A refused submit makes the form invalid while it has an error; a passing submit, or a reset,
        // clears it. Its fields are touched from then on, so an error that comes back is shown.
        const refused = signal(false);
        ctx.track(() => {
            const f = ctx.form() as Form<any> | null;
            const valid = !!f?.valid();
            ctx.state('dirty', !!f?.dirty());
            ctx.state('valid', valid);
            ctx.state('invalid', refused() && !valid);
            ctx.state('submitting', !!f?.submitting());
        });

        function scrollToFirstError(): void {
            if (!ctx.scrollToError()) return;
            requestAnimationFrame(() => {
                // The first control in error: a field marks it aria-invalid (A2). A field in error is a
                // state of its host since #293, no class on its wrapper.
                const errorEl = ctx.el.querySelector<HTMLElement>('[aria-invalid="true"]');
                if (errorEl) {
                    errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // The control itself, or the first input of a group marked in error (a radio group).
                    const input = errorEl.matches('input, textarea, select, [tabindex]')
                        ? errorEl
                        : errorEl.querySelector<HTMLElement>('input, textarea, select');
                    input?.focus();
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
                refused.set(!isValid);
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
            refused.set(false);
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
        <form :class="${ctx.wrapperClass}" data-part="root" novalidate
              :autocomplete="${ctx.autocomplete}"
              @submit="${ctx.onSubmit}"
              @reset="${ctx.onReset}">
            <slot></slot>
        </form>
    `,
});
