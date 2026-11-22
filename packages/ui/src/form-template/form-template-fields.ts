// pdx-form-template's field builder: the control each schema field gets, and a group's fields; a list
// field is form-template-list.ts's. Module-level, beside the component (#1210): its .pdx renders the
// form and calls createFieldElement once per field.

import { effect, getFieldTypeTag, formField } from '@pdxui/core';
import type { Form, FormFieldSchema } from '@pdxui/core';
import { onControlValue } from '../shared/model-event';
import { TYPE_TAG, CHECKED_TYPES } from './form-template-controls';
import { createListElement } from './form-template-list';

// ─── DOM Field Builder ────────────────────────────────────────

// Types that should default to full-width in grid layout
const FULL_WIDTH_TYPES = new Set(['textarea', 'switch', 'checkbox', 'file', 'tags', 'custom']);

/** The element of one schema field: its control in a field, a group, or a list of rows. */
export function createFieldElement(field: FormFieldSchema, form: Form<Record<string, unknown>>, totalColumns = 12, pathPrefix = ''): HTMLElement {
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
            control.addEventListener('query-change', onQuery);  // pdx-autocomplete (#481)
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
    const boundField = formField(form, fieldPath);
    if (boundField) {
        const isChecked = CHECKED_TYPES.has(field.type);

        // Set initial value
        const val = boundField.value();
        if (isChecked) {
            if (val) control.setAttribute('checked', '');
        } else if (isMulti) {
            (control as any).value = Array.isArray(val) ? val : (val != null && val !== '' ? [val] : []);
        } else if (val !== undefined && val !== null && val !== '') {
            (control as any).value = val;
        }

        // Listen for changes from control → form: the control's model event, whose detail is the
        // value (#125), or, for a control with no model yet, its alpha event — text inputs fire
        // pdx-input (per keystroke), others pdx-change (on commit).
        const isText = tag === 'pdx-input' || tag === 'pdx-textarea' || tag === 'pdx-password-input'
            || tag === 'pdx-search-input' || tag === 'pdx-masked-input';
        const changeEvent = isText ? 'pdx-input' : 'pdx-change';
        onControlValue(control, changeEvent, (e) => {
            if (isChecked) return e.detail?.checked ?? false;
            if (isMulti) return e.detail?.values ?? [];
            return e.detail?.value ?? (e.target as any)?.value;
        }, (value) => boundField.onChange(value));

        control.addEventListener('pdx-blur', () => {
            boundField.onBlur();
        });

        // Manual error/touched wiring — pdx-form-field context inject doesn't work
        // for imperatively created elements (getCurrentScope() is null).
        // This replicates what the compiler generates for declarative templates.
        effect(() => {
            const err = boundField.error();
            if (err) {
                wrapper.setAttribute('error', err);
                wrapper.setAttribute('show-error', '');
            } else {
                wrapper.removeAttribute('error');
                wrapper.removeAttribute('show-error');
            }
        });
        effect(() => {
            const touched = boundField.touched();
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
