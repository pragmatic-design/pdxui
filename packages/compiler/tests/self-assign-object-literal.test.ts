// A self-referencing assignment to a $signal whose right-hand side is an object literal must compile
// to JavaScript that parses. Rewritten as `__closed.set(prev => { ...prev, [year]: v })`,
// `closed = { ...closed, [year]: v }` has its arrow body read as a BLOCK: the module throws
// `SyntaxError: Rest parameter must be last formal parameter` on load, and every component in it goes
// unregistered — a blank page, or a whole app down when main.js imports it.

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { rewriteAst } from '../src/compiler/signal-rewrite-ast';
import { compile } from '../src/plugin';

const ast = (code: string, ...signals: string[]) => rewriteAst(code, new Set(signals), new Set(), 'f.pdx');

function parseErrors(code: string): string[] {
    const sf = ts.createSourceFile('out.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const diags = (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
    return diags.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

describe('self-assignment with an object literal', () => {
    it('wraps an object-literal right-hand side, so the arrow returns it', () => {
        expect(ast('closed = { ...closed, [k]: v };', 'closed')).toBe('__closed.set(prev => ({ ...prev, [k]: v }));');
        expect(ast('o = { ...o };', 'o')).toBe('__o.set(prev => ({ ...prev }));');
    });

    it('an object literal behind `as const` is wrapped too', () => {
        expect(ast('o = { ...o, a: 1 } as const;', 'o')).toBe('__o.set(prev => ({ ...prev, a: 1 } as const));');
    });

    it('the controls: other right-hand sides compile as before', () => {
        expect(ast('n = n + 1;', 'n')).toBe('__n.set(prev => prev + 1);');
        expect(ast('a = [...a, x];', 'a')).toBe('__a.set(prev => [...prev, x]);');
        expect(ast('o = ({ ...o });', 'o')).toBe('__o.set(prev => ({ ...prev }));');
        expect(ast('o = { a: 1 };', 'o')).toBe('__o.set({ a: 1 });'); // not self-referencing: an argument, no arrow
    });

    it('the compiled module parses', () => {
        const { code } = compile(`<template><button @click="toggle('a')">{{ JSON.stringify(closed) }}</button></template>
<script setup>
let closed = $signal({});
function toggle(year) { closed = { ...closed, [year]: true }; }
</script>`, 'self-assign.pdx');
        expect(parseErrors(code), `the generated module does not parse:\n${code}`).toEqual([]);
    });
});
