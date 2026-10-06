// A `@form` field whose value is a LIST of values.
//
// `skills: string[]` must be understood: read as a type of `[\w|'"]+`, the brackets fail it, and the
// field is dropped with PDX_FORM_FIELD_UNPARSED. Then `<pdx-tag-input name="skills">` binds to
// `fields.skills?.onChange(…)` — a field that does not exist — and every tag goes nowhere.
// The same for `pdx-checkbox-group` and a multiple `pdx-select`.
//
// It is a SCALAR field whose value happens to be an array — not `[{ … }]`, which is the rows of a
// `<pdx-field-list>`. The runtime already keeps it whole: `flattenValues` splits only an array of
// objects, and `required` refuses an empty array.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function setup(script: string) {
    return compile(`<template><div></div></template>\n<script setup>\n${script}\n</script>`, 'list.pdx');
}

/** The generated `createForm({ … })` call, as one line. */
const formCall = (code: string) => code.split('\n').find(l => l.includes('createForm(')) ?? '';
const codes = (script: string) => setup(script).warnings.map(w => w.code);

describe('@form with a list-of-values field', () => {
    it('declares it, starting empty', () => {
        const call = formCall(setup('@form p: {\n  name: string,\n  skills: string[]\n};').code);
        expect(call, `emitted: ${call}`).toContain('skills: []');
        expect(call).toContain("name: ''");
    });

    it('and understands it: no PDX_FORM_FIELD_UNPARSED', () => {
        expect(codes('@form p: {\n  skills: string[],\n  scores: number[],\n  flags: boolean[]\n};'))
            .not.toContain('PDX_FORM_FIELD_UNPARSED');
    });

    it('keeps its rules: required means not empty', () => {
        const call = formCall(setup('@form p: {\n  skills: string[] { required }\n};').code);
        expect(call).toContain('skills: [required()]');
    });

    it('control — rows are still a field list', () => {
        // `[{ … }]` is `isArray`, rendered by `<pdx-field-list>`; the new shape must not capture it.
        const call = formCall(setup('@form p: {\n  lines: [{ activity: string }]\n};').code);
        expect(call).toContain('lines: []');
        expect(codes('@form p: {\n  lines: [{ activity: string }]\n};')).not.toContain('PDX_FORM_FIELD_UNPARSED');
    });

    it('control — a malformed list type is still reported', () => {
        expect(codes('@form p: {\n  skills: string[\n};')).toContain('PDX_FORM_FIELD_UNPARSED');
    });
});
