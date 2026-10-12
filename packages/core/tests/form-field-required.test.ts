// A field knows it is required when its validators say so.
//
// `required()` returned a plain function, indistinguishable from any other validator, so nothing
// downstream could tell a required field from an optional one: `<pdx-form-field>` marked a control
// `aria-required` only when its markup said `required`, and a field the SCHEMA required was announced
// as optional until an error appeared (#249).

import { describe, it, expect } from 'vitest';
import { createForm, required, minLength, email, isRequiredValidator, FORM_INTERNALS } from '../src/index';
import type { FormInternals } from '../src/index';

describe('FormField.required', () => {
    it('is true for a field whose validators include required()', () => {
        const form = createForm({
            initialValues: { email: '', name: '' },
            validators: { email: [required(), email()], name: [minLength(2)] },
        });
        expect(form.fields.email.required).toBe(true);
        expect(form.fields.name.required, 'a validator that is not required() does not make a field required').toBe(false);
    });

    it('is false for a field with no validators at all', () => {
        const form = createForm({ initialValues: { note: '' } });
        expect(form.fields.note.required).toBe(false);
    });

    it('is true for a field added later with required()', () => {
        const form = createForm({ initialValues: { items: [] as string[] } });
        const internals = (form as unknown as { [FORM_INTERNALS]: FormInternals })[FORM_INTERNALS];
        internals.addField('items.0.title', '', [required()]);
        // A hand-written check that rejects an empty value is not `required()`, and does not count.
        internals.addField('items.0.note', '', [(v: unknown) => (v ? undefined : 'Write something')]);
        const fields = form.fields as unknown as Record<string, { required: boolean }>;
        expect(fields['items.0.title'].required).toBe(true);
        expect(fields['items.0.note'].required).toBe(false);
    });

    it('reads the validators when asked, not when the field was built', () => {
        // A field that exists from `initialValues` and gets its validators from `addField` afterwards
        // — the rows a field list was handed at the start.
        const form = createForm({ initialValues: { 'row.title': '' } as Record<string, unknown> });
        const fields = form.fields as unknown as Record<string, { required: boolean }>;
        expect(fields['row.title'].required).toBe(false);
        const internals = (form as unknown as { [FORM_INTERNALS]: FormInternals })[FORM_INTERNALS];
        internals.addField('row.title', '', [required()]);
        expect(fields['row.title'].required).toBe(true);
    });
});

describe('isRequiredValidator', () => {
    it('recognises required() with and without a message, and nothing else', () => {
        expect(isRequiredValidator(required())).toBe(true);
        expect(isRequiredValidator(required('Fill it in'))).toBe(true);
        expect(isRequiredValidator(minLength(1))).toBe(false);
        expect(isRequiredValidator((v: unknown) => (v ? undefined : 'Required'))).toBe(false);
    });
});
