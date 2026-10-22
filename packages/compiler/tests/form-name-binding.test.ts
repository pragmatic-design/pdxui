// A control bound to a form field by its `name` is a removed form (#128, step 4).
//
// The compiler reports it and no longer wires it; `pdx migrate` writes the control's model binding,
// `::value="f.email"`, from the manifest, and `:field` on `pdx-form-field`. A control with no
// manifest entry or several models is flagged, not rewritten.

import { describe, it, expect } from 'vitest';
import { formNameBinding } from '../src/language/form-name-binding';
import { compile } from '../src/plugin';

const MODELS: Record<string, string[]> = {
    'pdx-input': ['value'], 'pdx-switch': ['checked'], 'pdx-toggle': ['pressed'], 'pdx-checkbox': ['checked', 'indeterminate'],
};
const context = { modelsOf: (tag: string) => (MODELS[tag] ? new Set(MODELS[tag]) : null) };
const fix = (text: string) => (formNameBinding.fix as (t: string, c: typeof context) => string)(text, context);

const page = (template: string, script = '@form f: { email: string { required, email }, accepted: boolean, bold: boolean, customer: { city: string } };\nfunction send() { f.handleSubmit(() => {}); }') =>
    `<template>\n${template}\n</template>\n<script>\n${script}\n</script>\n`;

const FORM = page(`<pdx-form :form="f">
  <pdx-form-field name="email" label="Email"><pdx-input name="email" type="email" /></pdx-form-field>
  <pdx-switch name="accepted" />
  <pdx-toggle name="bold" />
  <pdx-field-group name="customer">
    <pdx-form-field name="city" label="City"><pdx-input name="city" /></pdx-form-field>
  </pdx-field-group>
</pdx-form>`);

describe('form-name-binding', () => {
    it('finds each named control and form field inside <pdx-form :form>', () => {
        expect(formNameBinding.detect(FORM, context).map((f) => f.line)).toEqual([3, 3, 4, 5, 7, 7]);
    });

    it('rewrites each control to its model, and each form field to :field', () => {
        const out = fix(FORM);
        expect(out).toContain('<pdx-form-field :field="f.email" label="Email"><pdx-input name="email" ::value="f.email" type="email" />');
        expect(out).toContain('<pdx-switch name="accepted" ::checked="f.accepted" />');
        expect(out).toContain('<pdx-toggle name="bold" ::pressed="f.bold" />');
        // Inside a field group: the full path, as the compiler wrote it into the DOM.
        expect(out).toContain(`<pdx-form-field :field="f['customer.city']" label="City"><pdx-input name="customer.city" ::value="f['customer.city']" />`);
        expect(formNameBinding.detect(out, context), 'a second run finds something').toEqual([]);
    });

    it('flags a control with several models, naming them, and leaves it as written', () => {
        const text = page('<pdx-form :form="f"><pdx-checkbox name="accepted" /></pdx-form>');
        const [found] = formNameBinding.detect(text, context);
        expect(found.note).toMatch(/2 models \(checked, indeterminate\)/);
        expect(fix(text)).toBe(text);
    });

    it('leaves alone what was not wired: outside a form, a native input, a section, a form with no :form', () => {
        expect(formNameBinding.detect(page('<pdx-input name="email" />'), context)).toEqual([]);
        expect(formNameBinding.detect(page('<pdx-form :form="f"><input name="email" /></pdx-form>'), context)).toEqual([]);
        expect(formNameBinding.detect(page('<pdx-form><pdx-input name="email" /></pdx-form>'), context)).toEqual([]);
        expect(formNameBinding.detect(page('<pdx-input name="email" />', "import { tryUseForm } from '@pdxui/core';\ntryUseForm();"), context)).toEqual([]);
    });

    it('is a removed form the compiler reports, and no longer wires', () => {
        const r = compile(page('<pdx-form :form="f"><pdx-input name="email" /></pdx-form>'), 'f.pdx');
        expect(r.warnings.map((w) => w.code)).toContain('PDX_REMOVED_FORM');
        expect(r.code, 'the control is still wired by its name').not.toContain('ctx.f.email?.onChange(');
    });
});
