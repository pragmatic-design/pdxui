// pdx-form-template — Schema-driven form generator.
// Takes a FormSchema (JSON) and renders a complete form with:
//   - Correct pdx-* controls per field type
//   - Form sections (collapsible fieldsets)
//   - Grid layout (CSS grid with configurable columns)
//   - Conditional visibility (reactive, based on form values)
//   - Validators from schema
//
// Usage:
//   <pdx-form-template :schema="mySchema" />
//   <pdx-form-template :schema="mySchema" :form="existingForm" />

import { component, html, signal, effect, createFormFromSchema, evaluateVisibility, FORM_INTERNALS, required, email, minLength, maxLength, min, max, integer, url, pattern, getFieldTypeTag, registerComponentStrings, getComponentString } from '@pdxui/core';
import type { Form, FormSchema, FormFieldSchema, FormSectionSchema, FormInternals, Validator, ValidatorSchema } from '@pdxui/core';
// Self-contained: a schema can render ANY field control, so register the full form graph here (the
// structural wrappers + every control getFieldTypeTag() can return). Makes @pdxui/ui/form-template
// — and everything composing it (edit-drawer, entity-grid, auto-form) — work outside the barrel.
import '../form/pdx-form';
import '../form-field/pdx-form-field';
import '../form-actions/pdx-form-actions';
import '../field-group/pdx-field-group';
import '../field-list/pdx-field-list';
import '../input/pdx-input';
import '../textarea/pdx-textarea';
import '../password-input/pdx-password-input';
import '../search-input/pdx-search-input';
import '../masked-input/pdx-masked-input';
import '../number-input/pdx-number-input';
import '../date-picker/pdx-date-picker';
import '../select/pdx-select';
import '../autocomplete/pdx-autocomplete';
import '../checkbox/pdx-checkbox';
import '../checkbox-group/pdx-checkbox-group';
import '../radio/pdx-radio';
import '../radio-group/pdx-radio-group';
import '../switch-toggle/pdx-switch';
import '../toggle/pdx-toggle';
import '../segmented/pdx-segmented';
import '../slider/pdx-slider';
import '../rating/pdx-rating';
import '../color-picker/pdx-color-picker';
import '../file-upload/pdx-file-upload';
import '../tag-input/pdx-tag-input';
import '../otp-input/pdx-otp-input';
import '../pin-input/pdx-pin-input';
import { uiString, format, uiAttr} from '../shared/i18n';
// This component's styles live in form.css — written where the
// container is rather than where the component is. Imported explicitly so they travel anyway.
import '@pdxui/design/components/form';

// Register default English strings for form-template (overridable via setComponentStrings)
registerComponentStrings('form-template', {
    'wizard.back': '← Back',
    'wizard.next': 'Next →',
    'wizard.submit': 'Submit',
    'list.add': '+ Add',
    'list.remove': 'Remove',
    // A row's remove button, named after its line, not "×".
    'list.removeLine': 'Remove line {n}',
    // A row control's name: the column header names it by sight only.
    'list.cell': '{label}, line {n}',
    'list.empty': 'No items yet',
});

// ─── Field Type → Component Tag ──────────────────────────────

const TYPE_TAG: Record<string, string> = {
    text: 'pdx-input', email: 'pdx-input', password: 'pdx-password-input',
    url: 'pdx-input', tel: 'pdx-input',
    number: 'pdx-number-input', textarea: 'pdx-textarea',
    // A date is a pdx-date-picker, not the browser's own input through the pdx-input fallback.
    date: 'pdx-date-picker',
    select: 'pdx-select', checkbox: 'pdx-checkbox', switch: 'pdx-switch',
    radio: 'pdx-radio-group', slider: 'pdx-slider', rating: 'pdx-rating',
    color: 'pdx-color-picker', file: 'pdx-file-upload',
    tags: 'pdx-tag-input', segmented: 'pdx-segmented',
    lookup: 'pdx-autocomplete',
};

// Controls that bind to `checked` instead of `value`
const CHECKED_TYPES = new Set(['checkbox', 'switch']);

// ─── Component ───────────────────────────────────────────────

/**
 * Renders a complete form from a FormSchema: each field type gets its control, validators run from
 * the schema and sections become fieldsets.
 *
 * @fires pdx-submit {{ values }} - Bubbles up from the inner `pdx-form` once the values validate; an invalid submit fires nothing and scrolls to the first error.
 * @slot actions - Replaces the default actions (the `pdx-form-actions` shown when `showActions`). Not rendered in the wizard layout, which has its own navigation.
 */
component('pdx-form-template', {
    props: {
        /** FormSchema defining fields, sections, layout. */
        schema: { type: Object, default: null },
        /** Optional pre-existing Form instance. If not provided, one is created from schema. */
        form: { type: Object, default: null },
        /** HTML autocomplete attribute for the generated form. */
        autocomplete: { type: String, default: 'off' },
        /** CSS class applied to the generated form. */
        formClass: { type: String, default: '' },
        /** Show default submit/reset buttons. Override via slot="actions". */
        showActions: { type: Boolean, default: true },
    },
    setup(ctx) {
        // Resolve or create form from schema. An effect + a signal instead of a computed:
        // the factory inside a computed would create a NEW form on every recomputation without
        // ever disposing the previous one (orphaned timers/field arrays).
        const _formSig = signal<Form<Record<string, unknown>> | null>(null);
        const _form = (): Form<Record<string, unknown>> | null => _formSig();
        ctx.track(() => {
            const provided = ctx.form() as Form<Record<string, unknown>> | null;
            const schema = ctx.schema() as FormSchema | null;
            const created = provided ? null : (schema ? createFormFromSchema(schema) : null);
            _formSig.set(provided ?? created);
            // Cleanup (on re-run and on destroy): ONLY the form we created is disposed.
            return () => { created?.dispose(); };
        });

        // Build field visibility map (reactive)
        function isFieldVisible(field: FormFieldSchema): boolean {
            if (!field.visibleWhen) return true;
            const form = _form();
            if (!form) return true;
            return evaluateVisibility(field.visibleWhen, form.getValues());
        }

        // Get layout style — supports per-section override
        function layoutStyle(sectionOverride?: FormSectionSchema | null): string {
            const schema = ctx.schema() as FormSchema | null;
            if (!schema) return '';
            const layout = sectionOverride?.layout ?? schema.layout ?? 'stack';
            const cols = sectionOverride?.columns ?? schema.columns ?? 12;
            if (layout === 'grid') {
                return `display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: var(--pdx-space-md);`;
            }
            if (layout === 'horizontal') {
                return 'display: flex; flex-wrap: wrap; gap: var(--pdx-space-md);';
            }
            return ''; // stack = default vertical
        }

        // Group fields by section
        function getFieldsBySection(): { section: FormSectionSchema | null; fields: FormFieldSchema[] }[] {
            const schema = ctx.schema() as FormSchema | null;
            if (!schema) return [];

            const sections = schema.sections ?? [];
            if (sections.length === 0) {
                return [{ section: null, fields: schema.fields }];
            }

            const groups: { section: FormSectionSchema | null; fields: FormFieldSchema[] }[] = [];
            const sectionMap = new Map<string, FormFieldSchema[]>();
            const unsectioned: FormFieldSchema[] = [];

            for (const s of sections) sectionMap.set(s.name, []);
            for (const f of schema.fields) {
                if (f.section && sectionMap.has(f.section)) {
                    sectionMap.get(f.section)!.push(f);
                } else {
                    unsectioned.push(f);
                }
            }

            if (unsectioned.length > 0) {
                groups.push({ section: null, fields: unsectioned });
            }
            for (const s of sections) {
                const fields = sectionMap.get(s.name) ?? [];
                if (fields.length > 0) groups.push({ section: s, fields });
            }

            return groups;
        }

        // ─── Wizard state ────────────────────────────────────────
        const _wizardStep = signal(0);

        // Expand a step's schema fields to the leaf paths that actually exist in form.fields.
        // A group/list field ('address', 'items') has NO own entry — the form is keyed by leaves
        // ('address.street', 'items.0.qty'), so an `f.name` lookup would silently skip them and
        // the gate would pass with invalid data.
        function stepLeafPaths(fields: FormFieldSchema[], form: Form<Record<string, unknown>>): string[] {
            const keys = Object.keys(form.fields);
            const paths: string[] = [];
            for (const f of fields) {
                if (f.type === 'group' || f.type === 'list') {
                    for (const k of keys) {
                        if (k === f.name || k.startsWith(f.name + '.')) paths.push(k);
                    }
                } else {
                    paths.push(f.name);
                }
            }
            return paths;
        }

        async function wizardNext(): Promise<void> {
            const groups = getFieldsBySection();
            const step = _wizardStep.peek();
            if (step >= groups.length - 1) return;

            const form = _form();
            if (form) {
                const paths = stepLeafPaths(groups[step].fields, form);
                // Touch step fields so their errors become visible.
                for (const p of paths) form.fields[p]?.onBlur();
                // Await validation so ASYNC validators resolve before we read errors — reading
                // field.error() synchronously right after onBlur would miss them.
                await form.validate();
                const hasError = paths.some(p => !!form.fields[p]?.error());
                if (hasError) return; // don't advance if this step has errors
            }
            _wizardStep.set(step + 1);
        }

        function wizardPrev(): void {
            const step = _wizardStep.peek();
            if (step > 0) _wizardStep.set(step - 1);
        }

        function wizardGoTo(step: number): void {
            const groups = getFieldsBySection();
            if (step >= 0 && step < groups.length) _wizardStep.set(step);
        }

        // ─── Imperative rendering ────────────────────────────────
        const _disposeVisibility: (() => void)[] = [];

        ctx.track(() => {
            const schema = ctx.schema() as FormSchema | null;
            const form = _form();
            if (!schema || !form) return;

            const isWizard = schema.layout === 'wizard';
            const currentStep = isWizard ? _wizardStep() : -1;

            // Cleanup previous visibility effects
            for (const d of _disposeVisibility) d();
            _disposeVisibility.length = 0;

            requestAnimationFrame(() => {
                const container = ctx.el.querySelector('.pdx-form-template-content');
                if (!container) return;

                // Clear previous content
                container.innerHTML = '';

                const groups = getFieldsBySection();

                // Wizard: render stepper navigation
                if (isWizard && groups.length > 1) {
                    const stepper = document.createElement('nav');
                    stepper.className = 'pdx-wizard-stepper';
                    stepper.setAttribute('role', 'tablist');
                    uiAttr(stepper, 'aria-label', () => uiString('form-template', 'steps'));

                    for (let si = 0; si < groups.length; si++) {
                        const step = document.createElement('button');
                        step.type = 'button';
                        step.className = 'pdx-wizard-step';
                        step.setAttribute('role', 'tab');
                        step.setAttribute('aria-selected', si === currentStep ? 'true' : 'false');
                        if (si === currentStep) step.classList.add('pdx-wizard-step-active');
                        if (si < currentStep) step.classList.add('pdx-wizard-step-completed');

                        const num = document.createElement('span');
                        num.className = 'pdx-wizard-step-number';
                        num.textContent = si < currentStep ? '✓' : String(si + 1);
                        step.appendChild(num);

                        const label = document.createElement('span');
                        label.className = 'pdx-wizard-step-label';
                        label.textContent = groups[si].section?.label ?? `Step ${si + 1}`;
                        step.appendChild(label);

                        const idx = si;
                        step.addEventListener('click', () => {
                            // Only allow going back or to completed steps
                            if (idx <= currentStep) wizardGoTo(idx);
                        });

                        stepper.appendChild(step);

                        // Add connector between steps
                        if (si < groups.length - 1) {
                            const connector = document.createElement('span');
                            connector.className = 'pdx-wizard-connector';
                            if (si < currentStep) connector.classList.add('pdx-wizard-connector-completed');
                            stepper.appendChild(connector);
                        }
                    }

                    container.appendChild(stepper);
                }

                for (let gi = 0; gi < groups.length; gi++) {
                    const group = groups[gi];

                    // Wizard: only show current step
                    if (isWizard && gi !== currentStep) continue;

                    let sectionEl: HTMLElement;

                    if (group.section && !isWizard) {
                        // Standard section with fieldset
                        const fieldset = document.createElement('fieldset');
                        fieldset.className = 'pdx-form-section';

                        const legend = document.createElement('legend');
                        legend.className = 'pdx-form-section-legend';
                        legend.textContent = group.section.label;

                        if (group.section.collapsible) {
                            fieldset.classList.add('pdx-form-section-collapsible');
                            legend.style.cursor = 'pointer';
                            legend.setAttribute('role', 'button');
                            legend.setAttribute('aria-expanded', group.section.collapsed ? 'false' : 'true');
                            legend.addEventListener('click', () => {
                                const content = fieldset.querySelector('.pdx-form-section-content') as HTMLElement;
                                if (!content) return;
                                const isHidden = content.hidden;
                                content.hidden = !isHidden;
                                legend.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
                                fieldset.classList.toggle('collapsed', !isHidden);
                            });
                        }

                        fieldset.appendChild(legend);

                        const content = document.createElement('div');
                        content.className = 'pdx-form-section-content';
                        content.style.cssText = layoutStyle(group.section);
                        if (group.section.collapsed) {
                            content.hidden = true;
                            fieldset.classList.add('collapsed');
                        }
                        fieldset.appendChild(content);

                        sectionEl = content;
                        container.appendChild(fieldset);
                    } else {
                        // Wizard step content or unsectioned fields
                        sectionEl = document.createElement('div');
                        sectionEl.className = isWizard ? 'pdx-wizard-step-content' : 'pdx-form-template-fields';
                        sectionEl.style.cssText = layoutStyle(group.section);
                        container.appendChild(sectionEl);
                    }

                    const totalCols = group.section?.columns ?? schema.columns ?? 12;
                    for (const field of group.fields) {
                        const fieldWrapper = createFieldElement(field, form, totalCols);
                        sectionEl.appendChild(fieldWrapper);

                        // Reactive visibility
                        if (field.visibleWhen) {
                            const dispose = effect(() => {
                                const visible = isFieldVisible(field);
                                fieldWrapper.hidden = !visible;
                                fieldWrapper.style.display = visible ? '' : 'none';
                            });
                            _disposeVisibility.push(dispose);
                        }
                    }
                }

                // Wizard: add Back/Next/Submit navigation
                if (isWizard && groups.length > 1) {
                    const nav = document.createElement('div');
                    nav.className = 'pdx-wizard-nav';

                    if (currentStep > 0) {
                        const backBtn = document.createElement('button');
                        backBtn.type = 'button';
                        backBtn.className = 'pdx-outline';
                        backBtn.textContent = getComponentString('form-template', 'wizard.back')();
                        backBtn.addEventListener('click', wizardPrev);
                        nav.appendChild(backBtn);
                    } else {
                        // Spacer for alignment
                        nav.appendChild(document.createElement('span'));
                    }

                    if (currentStep < groups.length - 1) {
                        const nextBtn = document.createElement('button');
                        nextBtn.type = 'button';
                        nextBtn.className = 'pdx-primary';
                        nextBtn.textContent = getComponentString('form-template', 'wizard.next')();
                        nextBtn.addEventListener('click', wizardNext);
                        nav.appendChild(nextBtn);
                    } else {
                        // Last step: show Submit
                        const submitBtn = document.createElement('button');
                        submitBtn.type = 'submit';
                        submitBtn.className = 'pdx-primary';
                        submitBtn.textContent = getComponentString('form-template', 'wizard.submit')();
                        nav.appendChild(submitBtn);
                    }

                    container.appendChild(nav);
                }
            });
        });

        // Expose getForm() and wizard API on the element for external access
        (ctx.el as any).getForm = () => _form();
        (ctx.el as any).wizardNext = wizardNext;
        (ctx.el as any).wizardPrev = wizardPrev;
        (ctx.el as any).wizardGoTo = wizardGoTo;

        return { _form, layoutStyle, getFieldsBySection, _wizardStep, wizardNext, wizardPrev, wizardGoTo };
    },
    render: (ctx) => html`
        <pdx-form :form="${() => ctx._form?.() ?? ctx.form()}"
                   :autocomplete="${ctx.autocomplete}"
                   :formClass="${ctx.formClass}">
            <div class="pdx-form-template-content"></div>
            ${() => {
                const schema = ctx.schema() as FormSchema | null;
                const isWizard = schema?.layout === 'wizard';
                // Wizard manages its own navigation — hide default actions
                if (isWizard) return '';
                return html`<slot name="actions">
                    ${() => ctx.showActions() ? html`
                        <pdx-form-actions></pdx-form-actions>
                    ` : ''}
                </slot>`;
            }}
        </pdx-form>
    `,
});

// ─── DOM Field Builder ────────────────────────────────────────

// Types that should default to full-width in grid layout
const FULL_WIDTH_TYPES = new Set(['textarea', 'switch', 'checkbox', 'file', 'tags', 'custom']);

function createFieldElement(field: FormFieldSchema, form: Form<Record<string, unknown>>, totalColumns = 12, pathPrefix = ''): HTMLElement {
    const fieldPath = pathPrefix ? `${pathPrefix}.${field.name}` : field.name;

    // ─── Nested group: render <pdx-field-group> with child fields
    if (field.type === 'group' && field.fields) {
        return createGroupElement(field, form, totalColumns, fieldPath);
    }

    // ─── Array list: render <pdx-field-list> with add/remove
    if (field.type === 'list' && field.itemFields) {
        return createListElement(field, form, totalColumns, fieldPath);
    }

    // ─── Regular field
    const wrapper = document.createElement('pdx-form-field');
    wrapper.setAttribute('name', fieldPath);
    if (field.label) wrapper.setAttribute('label', field.label);
    if (field.required) wrapper.setAttribute('required', '');
    if (field.disabled) wrapper.setAttribute('disabled', '');
    if (field.hint) wrapper.setAttribute('hint', field.hint);
    if (field.description) wrapper.setAttribute('description', field.description);

    // Grid column span: explicit size > type default > full width
    const size = field.size ?? (FULL_WIDTH_TYPES.has(field.type) ? totalColumns : totalColumns);
    wrapper.style.gridColumn = `span ${size}`;

    // Multi-value select/lookup → pdx-select (chips); value is an array.
    const isMulti = !!field.multiple && (field.type === 'select' || field.type === 'lookup');
    // Resolve tag: built-in map → custom registry → fallback to pdx-input
    const tag = isMulti ? 'pdx-select' : (TYPE_TAG[field.type] || getFieldTypeTag(field.type) || 'pdx-input');
    const control = document.createElement(tag);
    control.setAttribute('name', fieldPath);
    if (isMulti) {
        control.setAttribute('multiple', '');
        if (field.type === 'lookup') control.setAttribute('searchable', '');
    }

    // Set type for pdx-input variants
    if (tag === 'pdx-input' && field.type !== 'text') {
        control.setAttribute('type', field.type);
    }
    // A form's date can be typed as well as picked: a data-entry form is filled from the keyboard,
    // and a calendar alone makes a birth date forty years back a hundred clicks.
    if (tag === 'pdx-date-picker') control.setAttribute('editable', '');

    if (field.placeholder) control.setAttribute('placeholder', field.placeholder);
    if (field.disabled) control.setAttribute('disabled', '');
    if (field.readonly) control.setAttribute('readonly', '');
    if (field.required) control.setAttribute('required', '');

    // Checkbox/switch: label goes on the control, not the form-field wrapper
    if (CHECKED_TYPES.has(field.type) && field.label) {
        control.setAttribute('label', field.label);
        wrapper.setAttribute('label', '');  // clear form-field label to avoid duplication
    }

    // The options, under the name each control reads: pdx-autocomplete — a single-value lookup — reads
    // `suggestions`; select, radio group and segmented read `options`. Handed `options`, the lookup
    // would get an expando it never reads, and list nothing; static options are handed to it too.
    const setOptions = (items: unknown[]): void => {
        if (tag === 'pdx-autocomplete') (control as unknown as { suggestions: unknown[] }).suggestions = items;
        else (control as unknown as { options: unknown[] }).options = items;
    };

    // Options for select/radio/segmented, and the single-value lookup
    if (field.options && (tag === 'pdx-select' || tag === 'pdx-radio-group' || tag === 'pdx-segmented' || tag === 'pdx-autocomplete')) {
        setOptions(field.options);
    }

    // Server-side / dynamic options for select & lookup (pdx-select / pdx-autocomplete).
    const isOptionControl = tag === 'pdx-select' || tag === 'pdx-autocomplete';
    if (isOptionControl) {
        if (field.labelField) (control as any).labelField = field.labelField;
        if (field.valueField) (control as any).valueField = field.valueField;
        if (field.source) {
            (control as any).source = field.source;        // DataSource object → property
            control.setAttribute('remote', '');
            control.setAttribute('searchable', '');
        }
        if (field.optionsSource) {
            control.setAttribute('searchable', '');
            const loader = field.optionsSource;
            const toOpts = (items: { label: string; value: unknown }[]) => items.map(o => ({ label: o.label, value: o.value }));
            loader('').then(items => setOptions(toOpts(items)));
            let t: ReturnType<typeof setTimeout> | null = null;
            const onQuery = (e: Event) => {
                const q = (e as CustomEvent).detail?.query ?? (e as CustomEvent).detail?.value ?? '';
                if (t) clearTimeout(t);
                t = setTimeout(() => loader(q).then(items => setOptions(toOpts(items))), 200);
            };
            control.addEventListener('pdx-search', onQuery); // pdx-select
            control.addEventListener('pdx-input', onQuery);  // pdx-autocomplete
        }
    }

    // Extra props — objects/functions (source, loaders) as PROPERTY, not stringified attribute.
    if (field.props) {
        for (const [key, val] of Object.entries(field.props)) {
            if (val !== null && (typeof val === 'object' || typeof val === 'function')) {
                (control as any)[key] = val;
            } else if (typeof val === 'boolean') {
                if (val) control.setAttribute(key, '');
            } else {
                control.setAttribute(key, String(val));
            }
        }
    }

    // Bind form field value → control (use resolved dotted path)
    const formField = form.fields[fieldPath];
    if (formField) {
        const isChecked = CHECKED_TYPES.has(field.type);

        // Set initial value
        const val = formField.value();
        if (isChecked) {
            if (val) control.setAttribute('checked', '');
        } else if (isMulti) {
            (control as any).value = Array.isArray(val) ? val : (val != null && val !== '' ? [val] : []);
        } else if (val !== undefined && val !== null && val !== '') {
            (control as any).value = val;
        }

        // Listen for changes from control → form
        // Text inputs fire pdx-input (per keystroke), others fire pdx-change (on commit)
        const isText = tag === 'pdx-input' || tag === 'pdx-textarea' || tag === 'pdx-password-input'
            || tag === 'pdx-search-input' || tag === 'pdx-masked-input';
        const changeEvent = isText ? 'pdx-input' : 'pdx-change';
        control.addEventListener(changeEvent, ((e: CustomEvent) => {
            if (isChecked) {
                formField.onChange(e.detail?.checked ?? false);
            } else if (isMulti) {
                formField.onChange(e.detail?.values ?? []);
            } else {
                formField.onChange(e.detail?.value ?? (e.target as any)?.value);
            }
        }) as EventListener);

        control.addEventListener('pdx-blur', () => {
            formField.onBlur();
        });

        // Manual error/touched wiring — pdx-form-field context inject doesn't work
        // for imperatively created elements (getCurrentScope() is null).
        // This replicates what the compiler generates for declarative templates.
        effect(() => {
            const err = formField.error();
            if (err) {
                wrapper.setAttribute('error', err);
                wrapper.setAttribute('show-error', '');
            } else {
                wrapper.removeAttribute('error');
                wrapper.removeAttribute('show-error');
            }
        });
        effect(() => {
            const touched = formField.touched();
            if (touched) wrapper.setAttribute('touched', '');
            else wrapper.removeAttribute('touched');
        });
    }

    wrapper.appendChild(control);
    return wrapper;
}

// ─── Nested Group Renderer ──────────────────────────────────

function createGroupElement(
    field: FormFieldSchema,
    form: Form<Record<string, unknown>>,
    totalColumns: number,
    fieldPath: string,
): HTMLElement {
    // When a group is inside a section with the same name, the section already
    // shows the legend — skip the group's own fieldset to avoid duplication.
    // Detect: if field.section === field.name, render as plain div.
    const skipFieldset = !!field.section;

    const wrapper = skipFieldset
        ? document.createElement('div')
        : document.createElement('fieldset');
    wrapper.className = 'pdx-field-group';
    if (!skipFieldset) {
        wrapper.setAttribute('role', 'group');
        if (field.label) wrapper.setAttribute('aria-label', field.label);
    }

    // Grid span
    const size = field.size ?? totalColumns;
    wrapper.style.gridColumn = `span ${size}`;

    // Only show legend when not inside a section (avoids double label)
    if (!skipFieldset && field.label) {
        const legend = document.createElement('legend');
        legend.className = 'pdx-field-group-legend';
        legend.textContent = field.label;
        wrapper.appendChild(legend);
    }

    const content = document.createElement('div');
    content.className = 'pdx-field-group-content';
    content.style.cssText = `display: grid; grid-template-columns: repeat(${totalColumns}, 1fr); gap: var(--pdx-space-md);`;

    // Recursively render child fields with prefixed path
    for (const child of field.fields!) {
        content.appendChild(createFieldElement(child, form, totalColumns, fieldPath));
    }

    wrapper.appendChild(content);
    return wrapper;
}

// ─── Array List Renderer ────────────────────────────────────

function createListElement(
    field: FormFieldSchema,
    form: Form<Record<string, unknown>>,
    totalColumns: number,
    fieldPath: string,
): HTMLElement {
    const internals = (form as any)[FORM_INTERNALS] as FormInternals | undefined;
    const itemFields = field.itemFields!;
    const itemDefault = field.itemDefault ?? {};
    const minItems = field.minItems ?? 0;
    const maxItems = field.maxItems ?? 999;

    const wrapper = document.createElement('div');
    wrapper.className = 'pdx-field-list';
    wrapper.style.gridColumn = `span ${field.size ?? totalColumns}`;

    // Count existing items
    function getItemCount(): number {
        if (!internals) return 0;
        const paths = internals.getFieldPaths();
        const prefix = fieldPath + '.';
        let maxIdx = -1;
        for (const p of paths) {
            if (p.startsWith(prefix)) {
                const idx = parseInt(p.slice(prefix.length).split('.')[0], 10);
                if (!isNaN(idx) && idx > maxIdx) maxIdx = idx;
            }
        }
        return maxIdx + 1;
    }

    // Grid template: 1fr per field + 40px for actions button
    const gridCols = itemFields.map(() => '1fr').join(' ') + ' 40px';

    function renderList(): void {
        wrapper.innerHTML = '';
        const count = getItemCount();

        // Header: label + add button, same row
        const header = document.createElement('div');
        header.className = 'pdx-field-list-header';
        header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--pdx-space-sm);';
        // Skip label when inside a section (section legend already shows the title)
        if (field.label && !field.section) {
            const lbl = document.createElement('span');
            lbl.className = 'pdx-field-list-label';
            lbl.style.cssText = 'font-weight: var(--pdx-weight-semibold); font-size: var(--pdx-text-sm);';
            lbl.textContent = field.label;
            header.appendChild(lbl);
        }
        if (count < maxItems) {
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'pdx-outline';
            addBtn.setAttribute('size', 'sm');
            addBtn.textContent = getComponentString('form-template', 'list.add')();
            addBtn.addEventListener('click', () => {
                if (!internals) return;
                const idx = getItemCount();
                for (const f of itemFields) {
                    const validators = buildFieldValidators(f);
                    internals.addField(`${fieldPath}.${idx}.${f.name}`, (itemDefault as any)[f.name] ?? getFieldDefault(f.type), validators);
                }
                renderList();
            });
            header.appendChild(addBtn);
        }
        wrapper.appendChild(header);

        // Column headers — grid row matching data rows
        if (count > 0) {
            const colHeader = document.createElement('div');
            colHeader.className = 'pdx-field-list-columns';
            colHeader.style.cssText = `display: grid; grid-template-columns: ${gridCols}; gap: var(--pdx-space-sm); padding: var(--pdx-space-xs) 0; border-bottom: 2px solid var(--pdx-color-border); margin-bottom: var(--pdx-space-xs);`;
            for (const f of itemFields) {
                const col = document.createElement('span');
                col.style.cssText = 'font-size: var(--pdx-text-xs); font-weight: var(--pdx-weight-semibold); color: var(--pdx-color-muted); text-transform: uppercase; letter-spacing: 0.04em;';
                col.textContent = f.label || f.name;
                colHeader.appendChild(col);
            }
            // Actions column header (empty)
            const actCol = document.createElement('span');
            colHeader.appendChild(actCol);
            wrapper.appendChild(colHeader);
        }

        // Rows — each row is a grid matching column headers
        for (let i = 0; i < count; i++) {
            const row = document.createElement('div');
            row.className = 'pdx-field-list-row';
            row.style.cssText = `display: grid; grid-template-columns: ${gridCols}; gap: var(--pdx-space-sm); align-items: center; padding: var(--pdx-space-xs) 0; border-bottom: 1px solid var(--pdx-color-border);`;

            for (const f of itemFields) {
                const cell = document.createElement('div');
                cell.className = 'pdx-field-list-cell';
                const itemPath = `${fieldPath}.${i}.${f.name}`;

                // Wrap input in pdx-form-field for error display
                const fieldWrapper = document.createElement('pdx-form-field');
                fieldWrapper.setAttribute('name', itemPath);
                // No label in table rows — column header already shows it. That names the cell by
                // sight only: the control is named "{column}, line {n}".
                fieldWrapper.setAttribute('label', '');
                fieldWrapper.setAttribute('a11y-label', format(getComponentString('form-template', 'list.cell')(),
                    { label: f.label || f.name, n: i + 1 }));

                const tag = TYPE_TAG[f.type || 'text'] || getFieldTypeTag(f.type || 'text') || 'pdx-input';
                const input = document.createElement(tag);
                input.setAttribute('name', itemPath);
                if (f.placeholder) input.setAttribute('placeholder', f.placeholder);
                // email/url/tel/etc. map to pdx-input → carry the native input type (same as the
                // top-level path) so list items keep semantics/keyboard/validation, not generic text.
                if (tag === 'pdx-input' && f.type && f.type !== 'text') input.setAttribute('type', f.type);

                const formField = form.fields[itemPath];
                if (formField) {
                    const val = formField.value();
                    if (val !== undefined && val !== null && val !== '') {
                        (input as any).value = val;
                    }
                    const isText = tag === 'pdx-input' || tag === 'pdx-textarea';
                    const evt = isText ? 'pdx-input' : 'pdx-change';
                    input.addEventListener(evt, ((e: CustomEvent) => {
                        formField.onChange(e.detail?.value ?? (e.target as any)?.value);
                    }) as EventListener);
                    input.addEventListener('pdx-blur', () => formField.onBlur());

                    // Manual error wiring for list items (same reason as regular fields)
                    effect(() => {
                        const err = formField.error();
                        if (err) {
                            fieldWrapper.setAttribute('error', err);
                            fieldWrapper.setAttribute('show-error', '');
                        } else {
                            fieldWrapper.removeAttribute('error');
                            fieldWrapper.removeAttribute('show-error');
                        }
                    });
                    effect(() => {
                        if (formField.touched()) fieldWrapper.setAttribute('touched', '');
                        else fieldWrapper.removeAttribute('touched');
                    });
                }

                fieldWrapper.appendChild(input);
                cell.appendChild(fieldWrapper);
                row.appendChild(cell);
            }

            // Remove button
            if (count > minItems) {
                const actCell = document.createElement('div');
                actCell.className = 'pdx-field-list-cell pdx-field-list-cell-actions';
                const rmBtn = document.createElement('button');
                rmBtn.type = 'button';
                rmBtn.className = 'pdx-ghost pdx-danger';
                rmBtn.setAttribute('size', 'sm');
                rmBtn.textContent = '×';
                rmBtn.title = getComponentString('form-template', 'list.remove')();
                rmBtn.setAttribute('aria-label', format(getComponentString('form-template', 'list.removeLine')(), { n: i + 1 }));
                const idx = i;
                rmBtn.addEventListener('click', () => {
                    if (!internals) return;
                    const hadFocus = wrapper.contains(document.activeElement);
                    internals.removeFields(`${fieldPath}.${idx}`);
                    for (let j = idx + 1; j < count; j++) {
                        internals.renameFields(`${fieldPath}.${j}`, `${fieldPath}.${j - 1}`);
                    }
                    renderList();
                    // The list is rebuilt, so the focused button is gone and focus would fall to <body>: it
                    // goes to the first field of the row now in that place, else of the row before,
                    // else to "+ Add".
                    if (hadFocus) focusAfterRemoval(idx);
                });
                actCell.appendChild(rmBtn);
                row.appendChild(actCell);
            }

            wrapper.appendChild(row);
        }

        // Empty state
        if (count === 0) {
            const empty = document.createElement('div');
            empty.className = 'pdx-field-list-empty';
            empty.textContent = getComponentString('form-template', 'list.empty')();
            wrapper.appendChild(empty);
        }
    }

    /** After row `idx` went: the first field of the row now there, of the previous row, or "+ Add". */
    function focusAfterRemoval(idx: number): void {
        const rows = wrapper.querySelectorAll<HTMLElement>('.pdx-field-list-row');
        const row = rows[Math.min(idx, rows.length - 1)];
        const first = row?.querySelector<HTMLElement>('input, textarea, select, button, [tabindex]:not([tabindex="-1"])');
        (first ?? wrapper.querySelector<HTMLElement>('.pdx-field-list-header button'))?.focus();
    }

    renderList();

    // Re-render when field structure changes externally (e.g., form.reset())
    if (internals?.fieldVersion) {
        effect(() => {
            internals.fieldVersion(); // subscribe to changes
            renderList();
        });
    }

    return wrapper;
}

function getFieldDefault(type: string): unknown {
    switch (type) {
        case 'checkbox': case 'switch': return false;
        case 'number': case 'slider': case 'rating': return 0;
        default: return '';
    }
}

/** Build validator array from a field schema definition. */
function buildFieldValidators(field: FormFieldSchema): Validator<unknown>[] {
    const result: Validator<unknown>[] = [];
    if (field.required) result.push(required() as Validator<unknown>);
    if (field.validators) {
        for (const v of field.validators) {
            const built = buildSchemaValidator(v);
            if (built) result.push(built);
        }
    }
    return result;
}

function buildSchemaValidator(schema: ValidatorSchema): Validator<unknown> | null {
    const msg = schema.message;
    const p = schema.params ?? {};
    switch (schema.type) {
        case 'required': return required(msg) as Validator<unknown>;
        case 'email': return email(msg) as Validator<unknown>;
        case 'url': return url(msg) as Validator<unknown>;
        case 'integer': return integer(msg) as Validator<unknown>;
        case 'minLength': return minLength(p.min as number ?? 1, msg) as Validator<unknown>;
        case 'maxLength': return maxLength(p.max as number ?? 100, msg) as Validator<unknown>;
        case 'min': return min(p.min as number ?? 0, msg) as Validator<unknown>;
        case 'max': return max(p.max as number ?? 100, msg) as Validator<unknown>;
        case 'pattern': return pattern(new RegExp(p.pattern as string ?? ''), msg) as Validator<unknown>;
        default: return null;
    }
}
