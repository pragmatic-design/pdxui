// An array or object prop default is a factory, so each instance gets its own (#677).
//
// `@prop tags: string[] = [];` emitted `default: []`: one literal in the module's descriptor, so every
// instance started with the same array, and one that pushed into its own default changed the others'.
// Core calls a function default of an Array or Object prop once per instance (resolveDefault); the
// descriptor form is `prop(() => [])`.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const descriptorOf = (script: string) =>
    compile(`<template><p></p></template>\n<script>\n${script}\n</script>\n`, 'defaults.pdx').code;

describe('an array or object prop default', () => {
    it('a literal array or object is emitted as a factory', () => {
        const code = descriptorOf("@prop tags: string[] = [];\n@prop opts: { a: number } = { a: 1 };\n@model picked: string[] = ['x'] { form };");
        expect(code).toContain('tags: prop(() => ([]), { type: Array })');
        expect(code).toContain('opts: prop(() => ({ a: 1 }), { type: Object })');
        expect(code).toMatch(/picked: \{ \.\.\.prop\(\(\) => \(\['x'\]\), \{ type: Array \}\), form: wireFormModel \}/);
    });

    it('control — a name, a primitive or a function default stays as written', () => {
        const code = descriptorOf("import { EMPTY } from './empty';\n@prop shared: string[] = EMPTY;\n@prop label: string = 'x';\n@prop n: number = 2;\n@prop on: boolean = false;");
        expect(code).toContain('shared: prop(EMPTY, { type: Array })');
        expect(code).toContain("label: prop('x', { type: String })");
        expect(code).toContain('n: prop(2, { type: Number })');
    });
});
