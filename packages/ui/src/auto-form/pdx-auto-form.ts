// pdx-auto-form — JSON-driven form that accepts FieldDefinition[] or FormSchema.
// Wraps pdx-form-template with DataSource integration for load/save.

import { component, html, isDataSource, createFormFromSchema } from '@pdxui/core';
import type { DataSource, FormSchema, Form } from '@pdxui/core';
import { toFormFields } from '@pdxui/core';
import type { FieldDefinition } from '@pdxui/core';
import { uiString } from '../shared/i18n';
import { findRecord } from '../shared/find-record';
import '../button/pdx-button'; // rendered by this component, and registered by nobody else
import '../form-template/pdx-form-template'; // rendered by this component, and registered by nobody else

/**
 * A form generated from field definitions or a form schema, so the same JSON that drives a data grid
 * also produces its edit form.
 */
component('pdx-auto-form', {
    props: {
        /** Field definitions (FieldDefinition[]). Converted to FormSchema internally. */
        fields: { type: Array, default: null },
        /** FormSchema JSON (alternative to fields). */
        schema: { type: Object, default: null },
        /** DataSource for auto-load/save. */
        source: { type: Object, default: null },
        /** Record ID to load from DataSource. */
        recordId: { type: String, default: '' },
        /** Form layout. */
        layout: { type: String, default: 'stack' },
        /** Grid columns (when layout='grid'). */
        columns: { type: Number, default: 12 },
        /** Show submit/reset buttons. */
        showActions: { type: Boolean, default: true },
        /** Submit button label. Empty: the auto-form.submit component string, «Save». */
        submitLabel: { type: String, default: '' },
        /** Reset button label. Empty: the auto-form.reset component string, «Reset». */
        resetLabel: { type: String, default: '' },
    },
    setup(ctx) {
        let _built = false;
        let _formEl: HTMLElement | null = null;
        let _form: Form<Record<string, unknown>> | null = null;
        let _submitBtn: HTMLElement | null = null;
        let _resetBtn: HTMLElement | null = null;

        /** The prop when set, else the component string — which a locale can reach. */
        const submitText = (): string => (ctx.submitLabel() as string) || uiString('auto-form', 'submit');
        const resetText = (): string => (ctx.resetLabel() as string) || uiString('auto-form', 'reset');
        ctx.track(() => {
            const submit = submitText();
            const reset = resetText();
            // The `label` prop, not textContent: on a rendered pdx-button that would replace its
            // <button> with bare text, and Save and Reset would lose their role and their tab stop.
            if (_submitBtn) _submitBtn.setAttribute('label', submit);
            if (_resetBtn) _resetBtn.setAttribute('label', reset);
        });

        /** Build FormSchema from fields or use provided schema. */
        function resolveSchema(): FormSchema | null {
            const fields = ctx.fields() as FieldDefinition[] | null;
            if (fields && fields.length) {
                return {
                    fields: toFormFields(fields),
                    layout: ((ctx.layout() as string) || 'stack') as 'stack' | 'grid' | 'horizontal',
                    columns: (ctx.columns() as number) || 12,
                };
            }
            const schema = ctx.schema() as FormSchema | null;
            if (schema) return schema;
            return null;
        }

        /** Load record from DataSource if available. */
        function loadRecord(): Record<string, unknown> | null {
            const src = ctx.source();
            const id = ctx.recordId() as string;
            if (!src || !isDataSource(src) || !id) return null;
            return findRecord(src as DataSource<Record<string, unknown>>, id) ?? null;
        }

        function buildForm(): void {
            if (!_formEl) return;
            _formEl.innerHTML = '';

            const schema = resolveSchema();
            if (!schema) return;

            // Create form
            _form?.dispose();
            _form = createFormFromSchema(schema);

            // Load initial values from DataSource
            const record = loadRecord();
            if (record) {
                _form.reset(record);
            }

            // Create pdx-form-template
            // Every prop is set BEFORE the element is attached, as pdx-edit-drawer does:
            // set a frame after the append, the template's <pdx-form> would set up with no form and
            // every instance would print `<pdx-form> requires a "form" prop`.
            const tmpl = document.createElement('pdx-form-template') as any;
            tmpl.form = _form;
            tmpl.showActions = false; // we render our own
            tmpl.schema = schema;
            _formEl.appendChild(tmpl);

            // Action buttons
            if (ctx.showActions()) {
                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.gap = 'var(--pdx-space-sm)';
                actions.style.justifyContent = 'flex-end';
                actions.style.marginTop = 'var(--pdx-space-lg)';

                const resetBtn = document.createElement('pdx-button') as any;
                resetBtn.setAttribute('variant', 'ghost');
                resetBtn.setAttribute('label', resetText());
                _resetBtn = resetBtn;
                resetBtn.addEventListener('click', () => {
                    const record = loadRecord();
                    _form?.reset(record ?? undefined);
                });

                const submitBtn = document.createElement('pdx-button') as any;
                submitBtn.setAttribute('variant', 'primary');
                submitBtn.setAttribute('label', submitText());
                _submitBtn = submitBtn;
                submitBtn.addEventListener('click', async () => {
                    if (!_form) return;
                    const isValid = await _form.validate();
                    if (!isValid) return;

                    const values = _form.getValues();
                    const src = ctx.source();

                    if (src && isDataSource(src)) {
                        const ds = src as DataSource<Record<string, unknown>>;
                        const id = ctx.recordId() as string;
                        if (id) {
                            const existing = findRecord(ds, id);
                            if (existing) {
                                ds.update({ ...existing, ...values } as any);
                            }
                        } else {
                            ds.add(values as any);
                        }
                        ds.sync();
                    }

                    ctx.emit('pdx-submit', { values, valid: true });
                });

                actions.appendChild(resetBtn);
                actions.appendChild(submitBtn);
                _formEl.appendChild(actions);
            }
        }

        ctx.track(() => {
            void ctx.fields();
            void ctx.schema();
            void ctx.source();
            void ctx.recordId();
            void ctx.layout();
            void ctx.columns();
            void ctx.showActions();

            if (!_built) {
                _built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    _formEl = document.createElement('div');
                    _formEl.className = 'pdx-auto-form';
                    ctx.el.appendChild(_formEl);
                    buildForm();
                });
                return;
            }

            requestAnimationFrame(() => buildForm());
        });

        // get form() stays live (exposeOnElement copies the accessor descriptor) — _form is
        // assigned later in buildForm().
        ctx.expose({
            get form() { return _form; },
            /** The form values now, undefined while the form is not built. */
            getValues() { return _form?.getValues(); },
            reset(values?: Record<string, unknown>) { _form?.reset(values); },
            validate() { return _form?.validate(); },
        });

        return {};
    },
    render: () => html``,
});
