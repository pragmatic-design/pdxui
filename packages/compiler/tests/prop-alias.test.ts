// A `@prop` named after a reserved word (#1239). `pdx-label`'s public prop is `for`, as on a native
// <label>, and no script can read `for` as a name: `@prop for: string` compiled to code that did not
// parse, reported as the compiler's own fault (PDX_TS_UNSUPPORTED). It is PDX_PROP_NAME_RESERVED at
// the `@prop`, and the owner's form keeps the public name: `@prop for as htmlFor: string = '';` — the
// attribute and the element's property are `for`, the script and the template read `htmlFor`.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { generateDts } from '../src/compiler/dts-generator';

const file = (template: string, script: string) => `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
const LABEL = file('<label :for="htmlFor || null">{{ htmlFor }}</label>', "@prop for as htmlFor: string = '';\nfunction upper() { return htmlFor.toUpperCase(); }");

describe('@prop named after a reserved word', () => {
    it('is PDX_PROP_NAME_RESERVED at its line, an error, not a module that does not parse', () => {
        const r = compile(file('<p>x</p>', "let a = 1;\n@prop for: string = '';"), 'reserved.pdx');
        const w = r.warnings.find((x) => x.code === 'PDX_PROP_NAME_RESERVED');
        expect(w?.severity).toBe('error');
        expect(w?.line).toBe(4);
        expect(w?.hint).toContain('@prop for as');
        expect(r.warnings.map((x) => x.code)).not.toContain('PDX_TS_UNSUPPORTED');
    });

    it('the control: a name that is not reserved is no finding', () => {
        const r = compile(file('<p>{{ target }}</p>', "@prop target: string = '';"), 'plain.pdx');
        expect(r.warnings.map((x) => x.code)).not.toContain('PDX_PROP_NAME_RESERVED');
    });
});

describe('@prop for as htmlFor', () => {
    it('is the prop `for`, read as `htmlFor`', () => {
        const p = analyzeScript("@prop for as htmlFor: string = '';\n", 'label.pdx').props[0];
        expect({ name: p.name, publicName: p.publicName, tsType: p.tsType, default: p.default }).toEqual({ name: 'htmlFor', publicName: 'for', tsType: 'string', default: "''" });
    });

    it('compiles: the descriptor declares `for`, the setup reads it as `htmlFor`, the template too', () => {
        const r = compile(LABEL, 'label.pdx', [], undefined, { production: true });
        expect(r.warnings.filter((w) => w.severity === 'error')).toEqual([]);
        expect(r.code).toContain("for: prop('')");
        expect(r.code).toContain('const htmlFor = ctx.for;');
        expect(r.code).toMatch(/bindNativeProperty\(__el\d+, "for", "htmlFor", \(\)=>ctx\.htmlFor\(\) \|\| null(?:, __g)?\)/);
        expect(r.code).toMatch(/return \{[^}]*\bhtmlFor\b/);
        expect(() => new Function(r.code.replace(/^import .*$/gm, '')), 'the module parses').not.toThrow();
    });

    it('the .d.ts declares `for`', () => {
        const a = analyzeScript("@prop for as htmlFor: string = '';\n", 'label.pdx');
        expect(generateDts({ tag: 'pdx-label', props: a.props, events: a.events, slots: [] })).toMatch(/\n {2}for\?: string;/);
    });

    it('an alias on a @model is PDX_UNKNOWN_DECLARATION: a model is the component\'s own value', () => {
        const w = analyzeScript("@model for as htmlFor: string = '';\n", 'm.pdx').warnings.find((x) => x.code === 'PDX_UNKNOWN_DECLARATION');
        expect(w?.severity).toBe('error');
    });
});
