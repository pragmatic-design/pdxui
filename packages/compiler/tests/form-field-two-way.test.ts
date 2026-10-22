// `::<model>="f.x"` binds a control to a form field through its model (#128, step 2).
//
// The compiler hands the field itself to core's two-way binding, as it hands a signal: the field,
// not its value, so the binding can write it, touch it and read its error.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const page = (template: string) => `<script>
@form f: { email: string { required, email }, accepted: boolean, address: { city: string } };
function send() { f.handleSubmit(() => {}); }
</script>
<template>${template}</template>`;

describe('a two-way binding to a form field', () => {
    it('hands the field to the binding, not its value', () => {
        const { code } = compile(page('<input ::value="f.email" />'), 'a.pdx');
        expect(code).toMatch(/bindTwoWay\([^,]+, 'value', ctx\.f\.email\)/);
    });

    it('reaches a nested field by its dotted name', () => {
        const { code } = compile(page(`<input ::value="f['address.city']" />`), 'a.pdx');
        expect(code).toMatch(/bindTwoWay\([^,]+, 'value', ctx\.f\['address\.city'\]\)/);
    });

    it('is not wired a second time by the implicit name= binding of its <pdx-form>', () => {
        const { code } = compile(page('<pdx-form :form="f"><pdx-input name="email" ::value="f.email"></pdx-input></pdx-form>'), 'a.pdx');
        expect(code).toMatch(/bindTwoWay\([^,]+, 'value', ctx\.f\.email\)/);
        expect(code, 'the implicit wiring wrote the field too').not.toContain('ctx.f.email?.onChange(');
        expect(code).not.toContain('ctx.f.email?.onBlur()');
    });

    it('keeps the modifiers', () => {
        const { code } = compile(page('<input ::value.trim="f.email" />'), 'a.pdx');
        expect(code).toMatch(/bindTwoWay\([^,]+, 'value\.trim', ctx\.f\.email\)/);
    });
});
