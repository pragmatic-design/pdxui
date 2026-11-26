// `@expose get name` (#1423): a read-only property of the element that calls a function of the script
// when it is read. It is not reactive and creates nothing at mount, as a TypeScript component's
// `get name()` in `ctx.expose` — where a `$derived` costs a signal and a computed per instance.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/index';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { validate } from '../src/compiler/validate';
import { parseTemplate } from '../src/parser/template';
import { generateDts, exposedMembers } from '../src/compiler/dts-generator';

const SCRIPT = [
    'let view: { length: number } | null = null;',
    'function isEmpty(): boolean { return view ? view.length === 0 : true; }',
    'function editor() { return view; }',
    'function focus() {}',
    '@expose get isEmpty, editor;',
    '@expose focus;',
].join('\n');

const source = (script: string) => `<template><p></p></template>\n<script>\n${script}\n</script>`;

describe('@expose get', () => {
    it('emits a getter that calls the function, and no computed', () => {
        const { code } = compile(source(SCRIPT), 'C:/app/src/app-probe.pdx');
        expect(code).toContain('get isEmpty() { return isEmpty(); }');
        expect(code).toContain('get editor() { return editor(); }');
        // A plain `@expose` of a function still exposes the function.
        expect(code).toMatch(/ctx\.expose\(\{[^\n]*\bfocus\b(?! *\()/);
        expect(code).not.toContain('computed(');
    });

    it('the .d.ts declares the property readonly, with the return type the function writes', () => {
        const analysis = analyzeScript(SCRIPT, 'probe.pdx');
        const dts = generateDts({ tag: 'app-probe', props: analysis.props, events: analysis.events, slots: analysis.slots, exposed: exposedMembers(analysis) });
        expect(dts).toContain('  readonly isEmpty: boolean;\n');
        expect(dts).toContain('  readonly editor: unknown;\n');
        expect(dts).toContain('  focus(): unknown;\n');
    });

    it('a name that is not declared is still PDX_EXPOSE_UNDECLARED', () => {
        const analysis = analyzeScript('@expose get missing;', 'probe.pdx');
        const codes = validate(analysis, parseTemplate('<p></p>'), 'probe.pdx').map(w => w.code);
        expect(codes).toContain('PDX_EXPOSE_UNDECLARED');
    });

    it('a get on a name that is not a function is PDX_EXPOSE_GET_NOT_FUNCTION', () => {
        const analysis = analyzeScript('let count = $signal(0);\nconst limit = 3;\n@expose get count, limit;', 'probe.pdx');
        const found = validate(analysis, parseTemplate('<p>{{ count }}</p>'), 'probe.pdx')
            .filter(w => w.code === 'PDX_EXPOSE_GET_NOT_FUNCTION');
        expect(found.map(w => w.message)).toEqual([
            expect.stringContaining("'count'"),
            expect.stringContaining("'limit'"),
        ]);
        expect(found.every(w => w.severity === 'error')).toBe(true);
    });

    it('control: a get on a function raises no diagnostic', () => {
        const analysis = analyzeScript(SCRIPT, 'probe.pdx');
        const codes = validate(analysis, parseTemplate('<p></p>'), 'probe.pdx').map(w => w.code);
        expect(codes).not.toContain('PDX_EXPOSE_GET_NOT_FUNCTION');
        expect(codes).not.toContain('PDX_EXPOSE_UNDECLARED');
    });
});
