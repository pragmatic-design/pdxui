// `@model … { attribute: string }` (#753): how the attribute is read, apart from the model's type.
//
// A model's declared type decided how its attribute was read. `pdx-select`'s value is a string from
// the attribute and an array in multiple mode: `string` read the attribute right and lied about the
// type, `string | string[] | null` told the truth and read the attribute as JSON. The option says how
// the attribute is read, and the type stays the type. The runtime half — compiled, mounted, read from
// an attribute and set as an array — is packages/ui/tests/unit/model-attribute-runtime.test.ts.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { generateDts } from '../src/compiler/dts-generator';
import { readModelOptions } from '../src/compiler/model-options';

const analyse = (line: string) => analyzeScript(`${line}\n`, 'pick.pdx');
const model = (line: string) => analyse(line).props.find(p => p.name === 'value')!;
const codes = (line: string) => analyse(line).warnings.map(w => w.code);

describe('@model … { attribute }', () => {
    it('reads the attribute as the option says, and keeps the declared type as the type', () => {
        const p = model('@model value: string | string[] | null = null { attribute: string };');
        expect({ tsType: p.tsType, runtimeType: p.runtimeType, default: p.default }).toEqual({ tsType: 'string | string[] | null', runtimeType: 'String', default: 'null' });
    });

    it('takes number, boolean and json too', () => {
        expect(model('@model value: number | null = null { attribute: number };').runtimeType).toBe('Number');
        expect(model('@model value: boolean | null = null { attribute: boolean };').runtimeType).toBe('Boolean');
        expect(model('@model value: string | string[] = [] { attribute: json };').runtimeType).toBe('Object');
    });

    it('sits beside form, in either order, with or without its expression', () => {
        const a = model('@model value: string | string[] | null = null { attribute: string, form };');
        expect([a.runtimeType, a.form]).toEqual(['String', true]);
        const src = '@model value: string | string[] | null = null { form: () => { const s = [a, b]; return s.join(","); }, attribute: string };';
        const b = model(src);
        expect([b.tsType, b.runtimeType, b.form, b.default]).toEqual(['string | string[] | null', 'String', true, 'null']);
        const { code } = compile(`<template><p>{{ value }}</p></template>\n<script>\nlet a = 'x';\nlet b = 'y';\n${src}\n</script>\n`, 'pick.pdx');
        expect(code, 'the form expression, braces and commas whole').toContain('ctx.formValue?.(() => { const s = [a, b]; return s.join(","); });');
    });

    it('the descriptor carries the type the option names', () => {
        const { code } = compile('<template><p>{{ value }}</p></template>\n<script>\n@model value: string | string[] | null = null { attribute: string };\n</script>\n', 'pick.pdx');
        expect(code).toContain('value: prop(null, { type: String })');
    });

    it('the .d.ts declares the type as written', () => {
        const a = analyse('@model value: string | string[] | null = null { attribute: string };');
        const dts = generateDts({ tag: 'pdx-pick', props: a.props, events: a.events, slots: [] });
        expect(dts).toMatch(/value\??: string \| string\[\] \| null;/);
    });

    // CodeQL js/polynomial-redos: the trailing `;` was taken off with a backtracking regex. Written out,
    // a long run of whitespace is read in one pass; a quadratic reading of 100k characters would run
    // past the test's timeout. The time itself is not measured here (suite-hygiene.test.ts).
    it('reads a declaration with a long run of whitespace', () => {
        expect(readModelOptions('@model value: string = \'\'' + ' \t'.repeat(50_000) + 'x')).toBeNull();
        expect(readModelOptions(`@model value: string = ''${' \t'.repeat(50_000)}{ attribute: string }${' \t'.repeat(50_000)};`)?.options.attribute).toBe('string');
    });

    it('an attribute reading the option does not know is PDX_MODEL_ATTRIBUTE_UNKNOWN, an error', () => {
        const w = analyse('@model value: string = \'\' { attribute: date };').warnings.find(x => x.code === 'PDX_MODEL_ATTRIBUTE_UNKNOWN');
        expect(w?.severity).toBe('error');
        expect(w?.message).toContain("'date'");
    });
});

describe('PDX_MODEL_ATTRIBUTE_AMBIGUOUS', () => {
    it('a model whose type unites values the attribute reads differently, with no option, is warned', () => {
        for (const type of ['string | string[] | null', 'string | number', "'a' | 'b' | number[]", 'boolean | string']) {
            const w = analyse(`@model value: ${type} = null;`).warnings.find(x => x.code === 'PDX_MODEL_ATTRIBUTE_AMBIGUOUS');
            expect(w?.severity, type).toBe('warn');
            expect(w?.hint, type).toContain('{ attribute:');
        }
    });

    it('control: the option, a single kind with null, a literal union, or an object type raise nothing', () => {
        expect(codes('@model value: string | string[] | null = null { attribute: string };')).not.toContain('PDX_MODEL_ATTRIBUTE_AMBIGUOUS');
        expect(codes('@model value: string | null = null;')).not.toContain('PDX_MODEL_ATTRIBUTE_AMBIGUOUS');
        expect(codes("@model value: 'sm' | 'md' | 'lg' = 'md';")).not.toContain('PDX_MODEL_ATTRIBUTE_AMBIGUOUS');
        expect(codes('@model value: Date | null = null;')).not.toContain('PDX_MODEL_ATTRIBUTE_AMBIGUOUS');
        expect(codes('@prop value: string | number = 1;'), 'a @prop is out of scope (#753)').not.toContain('PDX_MODEL_ATTRIBUTE_AMBIGUOUS');
    });
});
