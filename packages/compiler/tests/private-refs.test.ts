// PDX_PRIVATE_REF — the template reads a name the script keeps to itself (#1016).
//
// A name that starts with `_` is private to the script: the setup does not return it
// (docs/language/script.md). `let _x = $signal(0)` is a declared name, so PDX_UNDECLARED_REF stayed
// silent, and the compiled template read `ctx._x()`, which failed at runtime with `ctx._x is not a
// function`. A reference app named its generated signals with a leading `_` and found out there.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const pdx = (template: string, script: string): string =>
    `<template>\n  ${template}\n</template>\n<script>\n${script}\n</script>\n`;

const codes = (src: string): string[] =>
    compile(src, 'x.pdx').warnings.filter((w) => w.code === 'PDX_PRIVATE_REF' || w.code === 'PDX_UNDECLARED_REF').map((w) => w.code);

const privateRefs = (src: string) => compile(src, 'x.pdx').warnings.filter((w) => w.code === 'PDX_PRIVATE_REF');

describe('PDX_PRIVATE_REF', () => {
    it('a template read of a _-prefixed signal is an error that names it', () => {
        const [w, ...rest] = privateRefs(pdx('<p>{{ _x }}</p>', 'let _x = $signal(0);'));
        expect(rest).toEqual([]);
        expect(w.severity).toBe('error');
        expect(w.message).toContain("'_x'");
        expect(w.message).toContain('private');
    });

    it('so does a handler, a derived and a plain const of the script', () => {
        expect(codes(pdx('<button @click="_go">go</button>', 'function _go() {}'))).toEqual(['PDX_PRIVATE_REF']);
        expect(codes(pdx('<p>{{ _twice }}</p>', 'let n = $signal(1);\nconst _twice = $derived(n * 2);'))).toEqual(['PDX_PRIVATE_REF']);
        expect(codes(pdx('<p>{{ _label }}</p>', "const _label = 'a';"))).toEqual(['PDX_PRIVATE_REF']);
    });

    it('proposes the name without its underscore', () => {
        const [w] = privateRefs(pdx('<p>{{ _x }}</p>', 'let _x = $signal(0);'));
        expect(w.hint).toContain('x');
        expect(w.suggestion).toBe('x');
    });

    it('the control: the same names without the underscore compile clean', () => {
        expect(codes(pdx('<p>{{ x }}</p>', 'let x = $signal(0);'))).toEqual([]);
        expect(codes(pdx('<button @click="go">go</button>', 'function go() {}'))).toEqual([]);
    });

    it('a name the template declares itself is the template\'s: a loop variable with an underscore', () => {
        expect(codes(pdx('@for (rows as _row; track _row.id) { <span>{{ _row.name }}</span> }', 'let rows = $signal([]);'))).toEqual([]);
    });

    it('a _-prefixed name the script never declares is still undeclared, not private', () => {
        expect(codes(pdx('<p>{{ _nowhere }}</p>', 'let x = $signal(0);'))).toEqual(['PDX_UNDECLARED_REF']);
    });
});
