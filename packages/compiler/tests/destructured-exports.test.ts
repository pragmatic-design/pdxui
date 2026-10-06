// A top-level destructuring declaration hands its names to the template.
//
// The auto-return lists a top-level pattern — `const { openCreate, closeCreate } = list;` — as well as
// `const name = …`. Left out of the return, the template reads `ctx.openCreate`, gets `undefined`, and
// `safeHandler(undefined)` does nothing, with no warning and no console error.
//
// The runtime half — a destructured handler, compiled, mounted and clicked — is in
// packages/ui/tests/unit/destructured-handler-runtime.test.ts.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const sfc = (script: string) => `<template><div></div></template>\n<script setup>\n${script}\n</script>`;

/** The names in the setup's `return { … }`, as emitted. */
function returned(script: string): string[] {
    const { code } = compile(sfc(script), 'destructured.pdx');
    const line = code.split('\n').find(l => l.trim().startsWith('return {'));
    expect(line, 'no auto-return emitted').toBeDefined();
    return line!.trim().replace(/^return \{\s*/, '').replace(/\s*\};?$/, '')
        .split(',').map(e => e.trim().split(':')[0].trim()).filter(Boolean);
}

describe('top-level destructuring reaches the auto-return', () => {
    it('an object pattern: every name', () => {
        const names = returned('const list = { open() {}, close() {} };\nconst { open, close } = list;');
        expect(names).toEqual(expect.arrayContaining(['list', 'open', 'close']));
    });

    it('a renamed binding is returned under its local name, not the key', () => {
        const names = returned('const list = { open() {} };\nconst { open: show } = list;');
        expect(names).toContain('show');
        expect(names, 'the key is not a binding').not.toContain('open');
    });

    it('a default and a rest element', () => {
        const names = returned('const o = {};\nconst { size = 10, ...others } = o;');
        expect(names).toEqual(expect.arrayContaining(['size', 'others']));
    });

    it('a nested pattern: the leaves, not the keys', () => {
        const names = returned('const o = { a: { b: 1 } };\nconst { a: { b } } = o;');
        expect(names).toContain('b');
        expect(names).not.toContain('a');
    });

    it('an array pattern, with a hole and a rest', () => {
        const names = returned('const pair = [1, 2, 3];\nlet [first, , ...tail] = pair;');
        expect(names).toEqual(expect.arrayContaining(['first', 'tail']));
    });

    it('a pattern written over several lines', () => {
        const names = returned('const list = { open() {}, close() {} };\nconst {\n  open,\n  close,\n} = list;');
        expect(names).toEqual(expect.arrayContaining(['open', 'close']));
    });

    it('a name starting with _ stays private, as for any declaration', () => {
        const names = returned('const o = { a: 1, b: 2 };\nconst { a, b: _hidden } = o;');
        expect(names).toContain('a');
        expect(names).not.toContain('_hidden');
    });

    it('control — a destructuring inside a function body is not exported', () => {
        const names = returned('const o = { a: 1 };\nfunction read() {\n  const { a: inner } = o;\n  return inner;\n}');
        expect(names).toContain('read');
        expect(names).not.toContain('inner');
    });

    it('control — the plain declaration is unchanged', () => {
        expect(returned('const plain = 1;')).toEqual(['plain']);
    });
});
