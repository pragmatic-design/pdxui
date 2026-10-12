// A rune's type argument is read whatever it contains (#275).
//
// The script analyzer read `$signal<…>(` with a regex that did not balance brackets: a type argument
// with a comma split the declaration in two (`let errs = $signal<Record<string;` / `let string>>({});`),
// one with parentheses or an arrow was not read as a rune at all, and in a `.pdx.ts` store either
// compiled with no diagnostic and shipped `$signal` in the JavaScript — a ReferenceError at run time.
// A plain `<script>` whose only rune had a type argument was not even put in the new mode.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

/** A type the rows below build on. */
const TYPES = 'type A = { y: number };';

const ROWS: { decl: string; name: string; call: RegExp }[] = [
    { decl: 'let errs = $signal<Record<string, string>>({});', name: 'errs', call: /\bsignal\(\{\}/ },
    { decl: 'let items = $signal<(A & { x: string })[]>([]);', name: 'items', call: /\bsignal\(\[\]/ },
    { decl: 'let onSave = $signal<() => void>(() => {});', name: 'onSave', call: /\bsignal\(\(\) => \{\}/ },
    { decl: 'let pair = $signal<[number, string]>([1, "a"]);', name: 'pair', call: /\bsignal\(\[1, "a"\]/ },
    { decl: 'const total = $derived<Record<string, number>>({ a: 1 });', name: 'total', call: /\bcomputed\(\(\) => \(?\{ a: 1 \}/ },
];

/** The emitted JavaScript holds no rune: one left there is a ReferenceError at run time. */
function noRuneLeft(code: string): void {
    expect(code, 'a rune reached the emitted module').not.toMatch(/\$(signal|derived|store)\b/);
}

const errorsOf = (warnings: { code: string; severity?: string }[]) => warnings.filter(w => w.severity === 'error');

describe('a rune with a type argument that has a comma, parentheses or an arrow', () => {
    for (const row of ROWS) {
        it(`<script setup>: ${row.decl}`, () => {
            const src = `<template><p>{{ ${row.name} }}</p></template>\n<script setup lang="ts">\n${TYPES}\n${row.decl}\n</script>`;
            const { code, warnings } = compile(src, 'rune.pdx');
            noRuneLeft(code);
            expect(code).toMatch(row.call);
            expect(warnings.map(w => w.code), 'the declaration produced a diagnostic').toEqual([]);
        });

        it(`.pdx.ts store: ${row.decl}`, () => {
            const src = `@store notes;\n${TYPES}\n${row.decl}\n`;
            const { code, warnings } = compile(src, 'notes.pdx.ts');
            noRuneLeft(code);
            expect(code).toMatch(row.call);
            expect(errorsOf(warnings)).toEqual([]);
            // The store returns the name, not a fragment of the type (`string`).
            expect(code).not.toMatch(/\bstring\b(?![^\n]*:)/);
        });
    }

    it('a plain <script> whose only rune has a type argument is in the new mode', () => {
        const src = '<template><p>{{ n }}</p></template>\n<script>\nlet n = $signal<number>(0);\n</script>';
        const { code, warnings } = compile(src, 'plain.pdx');
        noRuneLeft(code);
        expect(code).toMatch(/\bsignal\(0/);
        expect(warnings.map(w => w.code)).not.toContain('PDX_TEMPLATE_NAME_NOT_PROVIDED');
    });

    it('$store with a type argument that has a comma', () => {
        const src = '<template><p>{{ st.a }}</p></template>\n<script setup lang="ts">\nlet st = $store<Record<string, number>>({ a: 1 });\n</script>';
        const { code, warnings } = compile(src, 'store-rune.pdx');
        noRuneLeft(code);
        expect(code).toMatch(/\bstore\(\{ a: 1 \}/);
        expect(errorsOf(warnings)).toEqual([]);
    });

    it('a rune declaration that cannot be read is an error that quotes it, and no rune is emitted', () => {
        const src = '<template><p>x</p></template>\n<script setup lang="ts">\nlet x = $signal<Record<string, number>(1);\n</script>';
        const { code, warnings } = compile(src, 'broken.pdx');
        const err = warnings.find(w => w.code === 'PDX_UNKNOWN_DECLARATION');
        expect(err, `no PDX_UNKNOWN_DECLARATION; got ${warnings.map(w => w.code).join(', ')}`).toBeDefined();
        expect(err!.severity).toBe('error');
        expect(err!.message).toContain('let x = $signal<Record<string, number>(1);');
        noRuneLeft(code);
    });

    it('the same in a .pdx.ts store', () => {
        const { code, warnings } = compile('@store notes;\nlet x = $signal<Record<string, number>(1);\n', 'notes.pdx.ts');
        expect(warnings.map(w => w.code)).toContain('PDX_UNKNOWN_DECLARATION');
        noRuneLeft(code);
    });

    it('control — a simple type argument, as it always compiled', () => {
        const src = '<template><p>{{ n }}</p></template>\n<script setup lang="ts">\nlet n = $signal<number>(0), m = $signal(1);\nlet plain = 2;\n</script>';
        const { code, warnings } = compile(src, 'simple.pdx');
        noRuneLeft(code);
        expect(code).toMatch(/\bsignal\(0/);
        expect(code).toMatch(/\bsignal\(1/);
        expect(errorsOf(warnings)).toEqual([]);
    });
});
