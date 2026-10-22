// A `@form` field named like a member of the form is PDX_FORM_FIELD_RESERVED (#128, decision 13).
//
// Each field is a member of its form, `f.email` beside `f.valid()`: a field called `reset` would hide
// `f.reset()`, and `createForm` refuses it when the page runs. The compiler says so first, at the
// field. The list it checks is core's own members: `core/tests/form-rule-names.test.ts` holds them.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const pdx = (script: string) => `<script>\n${script}\n</script>\n<template><p>{{ f.valid() }}</p></template>`;
const codes = (src: string) => compile(pdx(src), 'reserved.pdx').warnings.map((w) => w.code);

describe('PDX_FORM_FIELD_RESERVED', () => {
    it.each(['valid', 'errors', 'reset', 'dirty', 'getValues', 'handleSubmit', 'array'])("refuses a field named '%s'", (name) => {
        expect(codes(`@form f: { ${name}: string };`)).toContain('PDX_FORM_FIELD_RESERVED');
    });

    it('names the member in its message', () => {
        const w = compile(pdx('@form f: { reset: boolean };'), 'reserved.pdx').warnings.find((x) => x.code === 'PDX_FORM_FIELD_RESERVED');
        expect(w?.message).toContain("'reset'");
        expect(w?.severity).toBe('error');
    });

    it('leaves a field of another name alone, and an object whose leaves are fields', () => {
        expect(codes('@form f: { email: string, resetPassword: boolean };')).not.toContain('PDX_FORM_FIELD_RESERVED');
        expect(codes('@form f: { state: { code: string } };')).not.toContain('PDX_FORM_FIELD_RESERVED');
    });

    it('refuses an array of a member\'s name: it is a field while it is empty', () => {
        expect(codes('@form f: { errors: [{ code: string }] };')).toContain('PDX_FORM_FIELD_RESERVED');
    });
});
