// `attach:name="value"` (#143): compiled to core's `attach(el, name, () => value)`. The name is read
// like any template identifier — the script, its imports — or is one of core's built-ins
// (`autofocus`, `trapFocus`, `clickOutside`), imported by the compiler. Any other is
// PDX_ATTACH_UNKNOWN. The runtime half is packages/core/tests/attach-compiled.test.ts.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const sfc = (template: string, script = 'let n = $signal(0);') => `<template>${template}</template>\n<script>\n${script}\n</script>`;
const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code);

describe('attach: — codegen', () => {
    it('a script function is called through attach, with a getter for the value', () => {
        const { code } = compile(sfc('<input attach:tip="label" />', "let label = $signal('x');\nfunction tip(el, v) {}"), 'a.pdx', [], undefined, {});
        expect(code).toMatch(/attach\(__el\d+,ctx\.tip,\(\)=>\(ctx\.label\(\)\)\);/);
        expect(code).toMatch(/import \{[^}]*\battach\b[^}]*\} from '@pdxui\/core'/);
    });

    it('no value: no getter', () => {
        const { code } = compile(sfc('<input attach:tip />', 'function tip(el) {}'), 'b.pdx', [], undefined, {});
        expect(code).toMatch(/attach\(__el\d+,ctx\.tip\);/);
    });

    it('a built-in is imported from core and used by its name', () => {
        const { code, warnings } = compile(sfc('<input attach:autofocus /><div attach:clickOutside="close"></div>', 'function close() {}'), 'c.pdx', [], undefined, {});
        expect(codes({ warnings })).not.toContain('PDX_ATTACH_UNKNOWN');
        expect(code).toMatch(/import \{[^}]*\bautofocus\b[^}]*\bclickOutside\b|import \{[^}]*\bclickOutside\b[^}]*\bautofocus\b/);
        expect(code).toMatch(/attach\(__el\d+,autofocus\);/);
    });

    it('control — the script declaring a built-in\'s name keeps its own', () => {
        const { code } = compile(sfc('<input attach:autofocus />', 'function autofocus(el) {}'), 'd.pdx', [], undefined, {});
        expect(code).toMatch(/attach\(__el\d+,ctx\.autofocus\);/);
    });
});

describe('PDX_ATTACH_UNKNOWN', () => {
    it('a name that is neither in scope nor a built-in is an error, positioned on its attribute', () => {
        const src = sfc('<p>x</p>\n<input attach:toltip="1" />');
        const w = compile(src, 'e.pdx', [], undefined, {}).warnings.find((x) => x.code === 'PDX_ATTACH_UNKNOWN');
        expect(w, 'an unknown attachment compiled without a word').toBeDefined();
        expect(w!.severity).toBe('error');
        expect(w!.message).toContain("'toltip'");
        expect(w!.line).toBe(2);
    });

    it('control — an imported name is in scope', () => {
        const src = sfc('<input attach:tooltip="1" />', "import { tooltip } from './tooltip';");
        expect(codes(compile(src, 'f.pdx', [], undefined, {}))).not.toContain('PDX_ATTACH_UNKNOWN');
    });
});
