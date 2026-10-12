// A self-referencing assignment to a $signal whose right-hand side is an object literal must compile
// to JavaScript that parses. When it was rewritten as `__closed.set(prev => { ...prev, [year]: v })`,
// `closed = { ...closed, [year]: v }` had its arrow body read as a BLOCK: the module threw
// `SyntaxError: Rest parameter must be last formal parameter` on load, and every component in it went
// unregistered — a blank page, or a whole app down when main.js imported it.
//
// Since #187 an assignment stores its value (`setRaw`) and reads the signal on its right side with
// `peek()`, so there is no arrow to wrap: the literal is an argument. The guard stays.

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
    it('an object-literal right-hand side is an argument, not an arrow body', () => {
        expect(ast('closed = { ...closed, [k]: v };', 'closed')).toBe('__closed.setRaw({ ...__closed.peek(), [k]: v });');
        expect(ast('o = { ...o };', 'o')).toBe('__o.setRaw({ ...__o.peek() });');
    });

    it('an object literal behind `as const` too', () => {
        expect(ast('o = { ...o, a: 1 } as const;', 'o')).toBe('__o.setRaw({ ...__o.peek(), a: 1 } as const);');
    });

    it('the controls: other right-hand sides', () => {
        expect(ast('n = n + 1;', 'n')).toBe('__n.setRaw(__n.peek() + 1);');
        expect(ast('a = [...a, x];', 'a')).toBe('__a.setRaw([...__a.peek(), x]);');
        expect(ast('o = ({ ...o });', 'o')).toBe('__o.setRaw(({ ...__o.peek() }));');
        expect(ast('o = { a: 1 };', 'o')).toBe('__o.setRaw({ a: 1 });'); // not self-referencing
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
