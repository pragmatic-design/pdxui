// `PDX_FORM_NO_SUBMIT` does not name correct code when the page hands the form to `<pdx-form>`.
//
// The check asks whether the SCRIPT calls `handleSubmit`. A page that puts its form inside
// `<pdx-form :form="…">` does not, and must not: `pdx-form` validates and emits `pdx-submit`
// itself (`pdx-form.ts:99-119`), so wiring `handleSubmit` as well would validate twice.
//
// A warning that names correct code teaches the reader to ignore warnings, which is the expensive
// failure.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const codesOf = (source: string) =>
    compile(source, 'probe.pdx', [], undefined, {}).warnings.map((w) => w.code);

const SCRIPT = `
<script setup>
@form order: { sku: string { required } }
function onSubmit(e) { console.log(e); }
</script>`;

describe('PDX_FORM_NO_SUBMIT', () => {
    it('the control: a form with no submit path at all is still named', () => {
        const source = `<template>
  <div><input :value="order.fields.sku.value()" /></div>
</template>${SCRIPT}`;
        expect(codesOf(source), 'the check stopped firing altogether').toContain('PDX_FORM_NO_SUBMIT');
    });

    it('a form handed to <pdx-form> is not', () => {
        const source = `<template>
  <pdx-form :form="order" @pdx-submit="onSubmit">
    <pdx-form-field name="sku"><pdx-input name="sku" /></pdx-form-field>
  </pdx-form>
</template>${SCRIPT}`;
        expect(codesOf(source), 'the page was told to wire a submit <pdx-form> already wires')
            .not.toContain('PDX_FORM_NO_SUBMIT');
    });

    it('and the form it names is the one in the element, not any form on the page', () => {
        // Two forms, one of them inside a `<pdx-form>`: the other still needs its handler, and a
        // check that stopped at "there is a pdx-form somewhere" would miss it.
        const source = `<template>
  <pdx-form :form="order"><pdx-input name="sku" /></pdx-form>
  <form><input :value="draft.fields.note.value()" /></form>
</template>
<script setup>
@form order: { sku: string { required } }
@form draft: { note: string }
function onSubmit(e) { console.log(e); }
</script>`;
        const messages = compile(source, 'probe.pdx', [], undefined, {}).warnings
            .filter((w) => w.code === 'PDX_FORM_NO_SUBMIT').map((w) => w.message);
        expect(messages.join(' '), "the form inside <pdx-form> was named").not.toContain("'order'");
        expect(messages.join(' '), "the form with no submit path was not named").toContain("'draft'");
    });
});
