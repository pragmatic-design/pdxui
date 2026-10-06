// A `@form` field declared as a nested object produces fields.
//
// Without that, it produces NOTHING, and says nothing:
//
//     @form intake: { requester: string { required }, address: { street: string, city: string } }
//     → createForm({ initialValues: { requester: '' }, … })
//
// `address` is simply absent. `parseFieldDecl` matches `name: type { rules }` with the type as
// `[\w|'"]+`, and a nested object opens a brace where the type should be, so without a branch of
// its own the declaration matches nothing and is dropped. There is a branch for an array of
// objects (`[{ … }]`) and one for an object.
//
// What the author would see: the controls render, the characters appear as they type, and nothing
// arrives. The compiler binds each one to `intake.fields['address.street']?.onChange(…)` — the
// optional chaining is right for a template and fatal here, because the field does not exist and
// the call is skipped. `<pdx-field-group name="address">`, the component built for this, depends on
// it the same way. And `docs/forms.md` documents the shape as supported: nested initial
// values are "FLATTENED into dotted paths".
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function setup(script: string) {
    return compile(`<template><div></div></template>\n<script setup>\n${script}\n</script>`, 'nested.pdx');
}

/** The generated `createForm({ … })` call, as one line. */
const formCall = (code: string) => code.split('\n').find(l => l.includes('createForm(')) ?? '';

describe('@form with a nested object field', () => {
    const NESTED = `@form intake: {
  requester: string { required },
  address: { street: string { required }, city: string }
};`;

    it('declares the nested initial values', () => {
        // Nested and not pre-flattened: `createForm` flattens `initialValues` itself
        // (`flattenValues`, recursive), and the nested shape is what `getValues()` returns.
        const call = formCall(setup(NESTED).code);
        expect(call, `emitted: ${call}`).toContain('address:');
        expect(call).toContain("street: ''");
        expect(call).toContain("city: ''");
    });

    it('keeps the rules, at the dotted path the field will have', () => {
        // A form's validators are keyed by the flattened name, so a rule on a nested field has
        // to be written as the path. Emitting it as `street` would put it on a field that does
        // not exist — the same silence, one level down.
        const call = formCall(setup(NESTED).code);
        expect(call).toContain("'address.street': [required()]");
    });

    it('and the flat fields beside it are untouched', () => {
        const call = formCall(setup(NESTED).code);
        expect(call).toContain("requester: ''");
        expect(call).toContain('requester: [required()]');
    });

    it('and a type other than string keeps its default', () => {
        const call = formCall(setup('@form x: {\n  size: { width: number, deep: boolean }\n};').code);
        expect(call).toContain('width: 0');
        expect(call).toContain('deep: false');
    });

    it('and an array of objects still compiles as it did', () => {
        // The control: the array branch works, and the object branch must not
        // capture `lines: [{ … }]` — it opens a bracket, not a brace.
        const call = formCall(setup('@form x: {\n  lines: [{ activity: string, hours: number }]\n};').code);
        expect(call).toContain('lines: []');
    });

    it('and a plain flat form is byte-for-byte what it was', () => {
        const call = formCall(setup('@form x: {\n  a: string { required },\n  b: number\n};').code);
        expect(call).toContain("initialValues: { a: '', b: 0 }");
    });
});

describe('a @form declaration the parser does not understand', () => {
    // The shape of the defect rather than its instance: whatever the next unsupported form turns
    // out to be, it must not vanish. A declaration that matches nothing and is simply skipped
    // produces no field, no diagnostic, and controls that swallow everything typed into them.
    const codes = (script: string) => setup(script).warnings.map(w => w.code);

    it('says so, and names it', () => {
        const r = setup('@form x: {\n  a: string,\n  weird: <<nonsense>>\n};');
        expect(r.warnings.map(w => w.code)).toContain('PDX_FORM_FIELD_UNPARSED');
        expect(r.warnings.find(w => w.code === 'PDX_FORM_FIELD_UNPARSED')?.message).toContain('weird');
    });

    it('and says nothing about the shapes it does understand', () => {
        // The control, and it is the whole risk of this check: a false positive on a legal
        // declaration is worse than the silence it replaces.
        expect(codes('@form x: {\n  a: string { required },\n  b: number,\n  c?: string,\n'
            + '  obj: { s: string },\n  rows: [{ q: number }]\n};')).not.toContain('PDX_FORM_FIELD_UNPARSED');
    });
});
