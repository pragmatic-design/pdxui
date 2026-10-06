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
 * A form that binds the named controls inside it and validates them, with save modes and DataSource
 * integration.
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
        // would leave the inner form (context, submit, DOM-sync) bound to the disposed instance.
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
            form.reset();
            // DOM sync handled by the reactive track() above
        }

        function wrapperClass(): string {
            let cls = 'pdx-form';
            const fc = ctx.formClass() as string;
            if (fc) cls += ' ' + fc;
            return cls;
        }

        // Reactive DOM sync — when form field values change externally
        // (e.g. reset(newValues), programmatic set), sync to DOM.
        // Text inputs don't have reactive :value binding, so we push manually.
        ctx.track(() => {
            const f = ctx.form() as Form<any> | null;
            if (!f) return;
            // Read all field values to create reactive subscriptions
            const values: Record<string, unknown> = {};
            for (const [name, field] of Object.entries(f.fields)) {
                values[name] = (field as any).value();
            }
            requestAnimationFrame(() => {
                syncDomValues(ctx.el, values);
            });
        });

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

// ─── DOM Sync Helper ─────────────────────────────────────────

/** The form control an element belongs to. A native input found by name, or as the first input in
 *  a pdx-form-field, may be the private inner input of a pdx component (a pdx-input whose `name`
 *  came as a property, which leaves no attribute on its host): the component that owns it is the
 *  nearest form-associated custom element. A native input in a plain container is its own control. */
function owningControl(el: HTMLElement, root: HTMLElement): HTMLElement {
    for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
        if (a.localName.includes('-') && (a.constructor as { formAssociated?: boolean }).formAssociated) return a;
    }
    return el;
}

/** Push form field values to the controls that show them — by `name`, dotted paths included
 *  (e.g. 'customer.name'), inside a pdx-form-field wrapper or anywhere in the form.
 *
 *  A pdx component gets its HOST property set, never its inner DOM. Writing into the
 *  first native input inside it would leave the component's own state — its `checked`/`value`, what
 *  its events carry and what a native form submits for it — at the old value: a pdx-checkbox
 *  would show a tick and say unchecked, a pdx-radio-group would keep its value, and the first
 *  radio's input would have its `value` replaced, because a radio would take the text branch. */
function syncDomValues(root: HTMLElement, values: Record<string, unknown>): void {
    for (const [name, val] of Object.entries(values)) {
        // Escape dots in CSS selector (name="customer.name" needs customer\.name)
        const escaped = CSS.escape(name);
        const wrapper = root.querySelector(`pdx-form-field[name="${escaped}"]`) as HTMLElement | null;
        const found = (wrapper
            ? wrapper.querySelector('[name], input, textarea, select')
            : root.querySelector(`[name="${escaped}"]`)) as HTMLElement | null;
        if (!found) continue;
        const control = owningControl(found, root);
        // Never under the user's hands: a control they are in keeps what they typed.
        if (control.contains(document.activeElement)) continue;

        if (control.localName.includes('-')) {
            const host = control as HTMLElement & Record<string, unknown>;
            // Through the host's setter, as a parent binding would: the prop signal updates.
            if (typeof host.checked === 'boolean') {
                if (host.checked !== !!val) host.checked = !!val;
            } else if (host.value !== val) {
                host.value = val;
            }
            continue;
        }

        const input = control as HTMLInputElement;
        if (input.type === 'checkbox') {
            input.checked = !!val;
        } else if (input.type === 'radio') {
            // A radio is chosen by its value; its value is never rewritten.
            for (const r of Array.from(root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${escaped}"]`))) {
                r.checked = r.value === String(val ?? '');
            }
        } else {
            const strVal = val != null ? String(val) : '';
            if (input.value !== strVal) input.value = strVal;
        }
    }
}
