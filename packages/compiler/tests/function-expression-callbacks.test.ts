// A callback written as `function() { … }` is rewritten like an arrow.
//
// Otherwise `$effect(function() { const x = count; })` compiles with PDX_REWRITE_FALLBACK — "unparseable
// fragment that names a signal" — and leaves `count` bare: the effect reads the getter, not the value,
// and never subscribes. The arrow form compiles clean.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const sfc = (script: string) => `<template><p>{{ label }}</p></template>\n<script setup>\n${script}\n</script>\n`;
const fallbacks = (code: ReturnType<typeof compile>) => code.warnings.filter(w => w.code === 'PDX_REWRITE_FALLBACK');

describe('a function-expression callback reads its signals like an arrow does', () => {
    const cases: [string, string][] = [
        ['$effect', '$effect(function() { const x = count; label = String(x); });'],
        ['$watch', '$watch(count, function(v) { const y = count + v; label = String(y); });'],
        ['onMount', 'onMount(function() { const z = count; label = String(z); });'],
    ];
    for (const [name, call] of cases) {
        it(`${name}(function () { … }) is rewritten, with no fallback`, () => {
            const out = compile(sfc(`let count = $signal(0);\nlet label = $signal('');\n${call}`), 'piece.pdx');
            expect(fallbacks(out), JSON.stringify(fallbacks(out))).toEqual([]);
            expect(out.code).toContain('= __count()');
            expect(out.code).toMatch(/__label\.set\(/);
        });
    }

    it('control — the arrow form compiles as it did', () => {
        const out = compile(sfc("let count = $signal(0);\nlet label = $signal('');\n$effect(() => { const x = count; label = String(x); });"), 'piece.pdx');
        expect(fallbacks(out)).toEqual([]);
        expect(out.code).toContain('= __count()');
    });
});
