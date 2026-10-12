// A trailing comma inside a multi-line $derived(…) compiles to the same computed (#208).
//
// The language skill warned that `$derived(\n  expr,\n)` «silently kills the reactivity» with
// PDX_REWRITE_FALLBACK; the issue that corrected it thought the module did not parse at all. Measured,
// neither: the comma is dropped and the derived reads its signal like any other. This keeps it so.

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { compile } from '../src/plugin';

function parseErrors(code: string): string[] {
    const sf = ts.createSourceFile('out.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const diags = (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
    return diags.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

describe('a trailing comma inside $derived', () => {
    const src = (body: string) => `<template><p>{{ total }}</p></template>\n<script setup>\nlet a = $signal(1);\n${body}\n</script>\n`;

    it('compiles to the computed it would without the comma, with no fallback', () => {
        const withComma = compile(src('const total = $derived(\n  a * 2,\n);'), 'd.pdx');
        const without = compile(src('const total = $derived(a * 2);'), 'd.pdx');
        expect(withComma.warnings.map((w) => w.code)).not.toContain('PDX_REWRITE_FALLBACK');
        expect(parseErrors(withComma.code)).toEqual([]);
        expect(withComma.code).toContain('const total = computed(() => __a() * 2,');
        expect(without.code).toContain('const total = computed(() => __a() * 2,');
    });
});
