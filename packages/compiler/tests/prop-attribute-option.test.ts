// `@prop … { attribute: string }` (#1347): how a prop's attribute is read, apart from its type, as a
// `@model`'s is (#753). `pdx-masonry`'s `columns` is `number | 'auto'`: a union of kinds whose
// attributes are read differently, which compiled to an Object prop core reads no attribute for, and
// nothing said so. The runtime half is packages/ui/tests/unit/prop-attribute-runtime.test.ts.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { generateDts } from '../src/compiler/dts-generator';

const analyse = (line: string) => analyzeScript(`${line}\n`, 'grid.pdx');
const prop = (line: string) => analyse(line).props.find(p => p.name === 'columns')!;
const codes = (line: string) => analyse(line).warnings.map(w => w.code);

describe('@prop … { attribute }', () => {
    it('reads the attribute as the option says, and keeps the declared type as the type', () => {
        const p = prop("@prop columns: number | 'auto' = '3' { attribute: string };");
        expect({ tsType: p.tsType, runtimeType: p.runtimeType, default: p.default }).toEqual({ tsType: "number | 'auto'", runtimeType: 'String', default: "'3'" });
    });

    it('the descriptor carries the type the option names', () => {
        // A string default says String already, as the TypeScript version's `prop('3')`; a number
        // default is given the type.
        const emit = (decl: string) => compile(`<template><p>{{ columns }}</p></template>\n<script>\n${decl}\n</script>\n`, 'grid.pdx').code;
        expect(emit("@prop columns: number | 'auto' = '3' { attribute: string };")).toContain("columns: prop('3')\n");
        expect(emit("@prop columns: number | 'auto' = 3 { attribute: string };")).toContain('columns: prop(3, { type: String })');
        // The control: without the option it was an Object prop, which reads no attribute.
        expect(emit("@prop columns: number | 'auto' = '3';")).toContain("columns: prop('3', { type: Object })");
    });

    it('the .d.ts declares the type as written', () => {
        const a = analyse("@prop columns: number | 'auto' = '3' { attribute: string };");
        const dts = generateDts({ tag: 'pdx-grid', props: a.props, events: a.events, slots: [] });
        expect(dts).toMatch(/columns\??: number \| 'auto';/);
    });

    it('a reading the option does not know is PDX_MODEL_ATTRIBUTE_UNKNOWN, an error naming the @prop', () => {
        const w = analyse("@prop columns: number | 'auto' = '3' { attribute: date };").warnings.find(x => x.code === 'PDX_MODEL_ATTRIBUTE_UNKNOWN');
        expect(w?.severity).toBe('error');
        expect(w?.message).toContain("@prop 'columns'");
    });

    it('an object default written like an options block stays the default', () => {
        // `{ form }` is a model's option, not a prop's: on a prop it is the shorthand object it reads as.
        const p = prop('@prop columns: { form: boolean } = { form };');
        expect([p.default, p.runtimeType]).toEqual(['{ form }', 'Object']);
    });
});

describe('PDX_PROP_ATTRIBUTE_AMBIGUOUS', () => {
    it("fires on a union of kinds read differently, with no option, and suggests it", () => {
        const w = analyse("@prop columns: number | 'auto' = '3';").warnings.find(x => x.code === 'PDX_PROP_ATTRIBUTE_AMBIGUOUS');
        expect(w?.severity).toBe('warn');
        expect(w?.hint).toContain("@prop columns: number | 'auto' = '3' { attribute: string };");
    });

    it('is reported at the @prop\'s line', () => {
        const { warnings } = compile("<template><p>{{ columns }}</p></template>\n<script>\nlet a = 1;\n@prop columns: number | 'auto' = '3';\n</script>\n", 'grid.pdx');
        const w = warnings.find(x => x.code === 'PDX_PROP_ATTRIBUTE_AMBIGUOUS');
        expect(w?.line).toBe(4);
    });

    it('does not fire with the option, on a union of one kind, or with an object type', () => {
        expect(codes("@prop columns: number | 'auto' = '3' { attribute: string };")).not.toContain('PDX_PROP_ATTRIBUTE_AMBIGUOUS');
        expect(codes("@prop columns: 'sm' | 'md' = 'md';")).not.toContain('PDX_PROP_ATTRIBUTE_AMBIGUOUS');
        expect(codes('@prop columns: string | null = null;')).not.toContain('PDX_PROP_ATTRIBUTE_AMBIGUOUS');
        expect(codes('@prop columns: DataSource<T> | null = null;')).not.toContain('PDX_PROP_ATTRIBUTE_AMBIGUOUS');
    });
});
