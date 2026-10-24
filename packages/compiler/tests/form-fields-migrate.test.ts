// `pdx migrate` and a form's fields as members (#128, step 1).
//
// `f.fields.email` is a removed form: the compiler reports it, `pdx migrate` rewrites it to `f.email`
// (a dotted name in brackets), only on the names the file declares as a form. A field named like a
// member of the form is flagged, never renamed: its name is also the server's.

import { describe, it, expect } from 'vitest';
import { formFieldsMember, formFieldsMemberScript, formFieldReserved } from '../src/language/form-fields';
import { compile } from '../src/plugin';

const PAGE = `<script>
@form signup: { email: string { required }, customer: { name: string } };
function send() { signup.handleSubmit(() => {}); }
const first = signup.fields.email.value();
</script>
<template>
  <p>{{ signup.fields.email.error() }}</p>
  <p>{{ signup.fields['customer.name']?.value() }}</p>
  <p>{{ signup.fields?.email.touched() }}</p>
</template>`;

/** The script of PAGE: what the registry hands a `script` entry for a .pdx. */
const SCRIPT = PAGE.slice('<script>\n'.length, PAGE.indexOf('</script>'));

describe('form-fields-member', () => {
    it("finds the template's reads, and the script entry the script's", () => {
        expect(formFieldsMember.detect(PAGE).map((f) => f.line)).toEqual([7, 8, 9]);
        expect(formFieldsMemberScript.detect(SCRIPT).map((f) => f.line)).toEqual([3]);
    });

    it('rewrites each to the member, a dotted name in brackets, the optional chain kept', () => {
        const template = (formFieldsMember.fix as (t: string) => string)(PAGE);
        expect(template).toContain('signup.email.error()');
        expect(template).toContain("signup['customer.name']?.value()");
        expect(template).toContain('signup?.email.touched()');
        expect(template, 'the template entry rewrote the script').toContain('signup.fields.email.value()');
        expect((formFieldsMemberScript.fix as (t: string) => string)(SCRIPT)).toContain('const first = signup.email.value();');
    });

    it('rewrites a module, for a form it creates', () => {
        const ts = "const f = createForm({ initialValues: { a: '' } });\nf.fields.a.onChange('x');\nf?.fields?.['b.c'];\n";
        expect((formFieldsMemberScript.fix as (t: string) => string)(ts))
            .toBe("const f = createForm({ initialValues: { a: '' } });\nf.a.onChange('x');\nf?.['b.c'];\n");
    });

    it("leaves alone a translation key that starts with the form's name", () => {
        // A page whose form is `intake` and whose strings are `intake.fields.*` (#613's showcase step).
        const page = `<template>
  <pdx-form-field :label="$t('intake.fields.requester')"></pdx-form-field>
  <label>{{ $t("intake.fields.customer") }}</label>
  <p>{{ intake.fields.email.error() }}</p>
</template>
<script>
@form intake: IntakeValues from parent;
const help = \`intake.fields.help\`;
</script>`;
        expect(formFieldsMember.detect(page).map((f) => f.line)).toEqual([4]);
        expect(formFieldsMemberScript.detect(page.slice(page.indexOf('<script>'))).map((f) => f.line)).toEqual([]);
    });

    it('leaves alone the fields of what is not a form', () => {
        const ts = 'const grid = createGrid();\ngrid.fields.map((x) => x);\nschema.fields[0];\n';
        expect(formFieldsMemberScript.detect(ts)).toEqual([]);
    });

    it('is a removed form the compiler reports', () => {
        const codes = compile(PAGE, 'signup.pdx').warnings.map((w) => w.code);
        expect(codes).toContain('PDX_REMOVED_FORM');
    });
});

describe('form-field-reserved', () => {
    it('flags a field named like a member, naming it, and rewrites nothing', () => {
        const script = '@form f: { email: string, reset: boolean, state: { code: string } };';
        expect(formFieldReserved.detect(script)).toEqual([
            { line: 1, found: '@form f: reset', note: '`reset` is the form\'s own `f.reset`.' },
        ]);
        expect(formFieldReserved.fix).toBe('flag');
        expect(formFieldReserved.reportedAs).toBe('PDX_FORM_FIELD_RESERVED');
    });
});
