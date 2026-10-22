// `required` lives in the schema (#128, step 5): on a control bound to a form field it is
// PDX_FORM_REQUIRED_IN_MARKUP (warning), and `pdx migrate` lists it without rewriting it.
//
// The field already marks its control required from its validators (part 2); a `required` in the
// markup says it a second time, where validation does not read it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { formRequiredInMarkup } from '../src/language/form-name-binding';

const page = (template: string) => `<template>\n${template}\n</template>\n<script>\n@form f: { email: string, accepted: boolean };\nfunction send() { f.handleSubmit(() => {}); }\n</script>\n`;
const codes = (template: string) => compile(page(template), 'r.pdx').warnings.filter((w) => w.code === 'PDX_FORM_REQUIRED_IN_MARKUP');

describe('PDX_FORM_REQUIRED_IN_MARKUP', () => {
    it('warns on `required` and `:required` on a bound control', () => {
        expect(codes('<pdx-input ::value="f.email" required></pdx-input>')).toHaveLength(1);
        expect(codes('<pdx-checkbox ::checked="f.accepted" :required="true"></pdx-checkbox>')).toHaveLength(1);
        expect(codes(`<input ::value.trim="f['email']" required />`)).toHaveLength(1);
        const [w] = codes('<pdx-input ::value="f.email" required></pdx-input>');
        expect(w.severity).toBe('warn');
        expect(w.message).toMatch(/schema/);
    });

    it('says nothing of a control bound to a signal, an unbound one, or the form field wrapper', () => {
        expect(codes('<input ::value="note" required />')).toEqual([]);
        expect(codes('<pdx-input required></pdx-input>')).toEqual([]);
        expect(codes('<pdx-form-field :field="f.email" required><pdx-input ::value="f.email"></pdx-input></pdx-form-field>')).toEqual([]);
        expect(codes('<pdx-input ::value="f.email" required-label="x"></pdx-input>'), 'an attribute that only starts with the word').toEqual([]);
    });

    it('is flagged by pdx migrate, never rewritten', () => {
        expect(formRequiredInMarkup.fix).toBe('flag');
        expect(formRequiredInMarkup.reportedAs).toBe('PDX_FORM_REQUIRED_IN_MARKUP');
        expect(formRequiredInMarkup.detect(page('<pdx-input ::value="f.email" required></pdx-input>'))).toHaveLength(1);
    });
});
