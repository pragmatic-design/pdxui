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
        expect(code).toContain('tags: { type: Array, default: () => ([]) }');
        expect(code).toContain('opts: { type: Object, default: () => ({ a: 1 }) }');
        expect(code).toMatch(/picked: \{ type: Array, default: \(\) => \(\['x'\]\)/);
    });

    it('control — a name, a primitive or a function default stays as written', () => {
        const code = descriptorOf("import { EMPTY } from './empty';\n@prop shared: string[] = EMPTY;\n@prop label: string = 'x';\n@prop n: number = 2;\n@prop on: boolean = false;");
        expect(code).toContain('shared: { type: Array, default: EMPTY }');
        expect(code).toContain("label: { type: String, default: 'x' }");
        expect(code).toContain('n: { type: Number, default: 2 }');
    });
});
