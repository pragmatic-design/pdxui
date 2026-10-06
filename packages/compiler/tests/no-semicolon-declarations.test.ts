// A script written without semicolons.
//
// The analyser collects a declaration up to its `;`, or up to a balanced line — from the FIRST line
// too. A first line that is complete and has no `;` must not run on into the next one: otherwise
// `const a = f()` followed by `let b = $signal(a)` becomes one statement, and the rune reaches the
// module as it was written: `$signal is not defined` at mount. Every fixture and page in the
// repository ends its statements with `;`, so only this file exercises the case.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const setup = (script: string) => compile(`<template><p>x</p></template>\n<script setup>\n${script}\n</script>\n`, 'nosemi.pdx').code;

function before(code: string, a: string, b: string): void {
    const i = code.indexOf(a), j = code.indexOf(b);
    expect(i, `not in the output: ${a}`).toBeGreaterThan(-1);
    expect(j, `not in the output: ${b}`).toBeGreaterThan(-1);
    expect(i, `${a} comes after ${b}`).toBeLessThan(j);
}

describe('a script without semicolons', () => {
    it('a declaration, then a $signal: the rune is rewritten', () => {
        const code = setup([
            "const _params = new URLSearchParams('theme=dark')",
            "let theme = $signal(_params.get('theme') || 'neutral')",
            'apply(theme)',
            "function apply(value) { document.documentElement.setAttribute('data-theme', value) }",
        ].join('\n'));
        expect(code).not.toContain('$signal(');
        before(code, "const _params = new URLSearchParams('theme=dark')", 'const __theme = signal(');
        before(code, 'const __theme = signal(', 'apply(__theme())');
    });

    it('a declaration, then a $derived: the rune is rewritten', () => {
        const code = setup([
            'const base = 2',
            'let n = $signal(1)',
            'const doubled = $derived(n * base)',
        ].join('\n'));
        expect(code).not.toContain('$derived(');
        expect(code).not.toContain('$signal(');
        expect(code).toContain('const doubled = computed(');
    });

    it('a declaration ending in a comment, then a signal that reads it', () => {
        const code = setup([
            "const _params = new URLSearchParams('x=1') // the page's query",
            "let x = $signal(_params.get('x'))",
            'console.log(x)',
        ].join('\n'));
        expect(code).not.toContain('$signal(');
        expect(code).not.toContain('@pdx-late-signal');
        // The declaration follows the statement it reads; the comment is kept, on the next line.
        before(code, "const _params = new URLSearchParams('x=1')", 'const __x = signal(');
        expect(code).toContain("// the page's query");
        before(code, 'const __x = signal(', 'console.log(__x())');
    });

    it('control — a declaration that does go on keeps its lines together', () => {
        const code = setup([
            'const total =',
            '  1 +',
            '  2',
            "const label = 'n'",
            "  .toUpperCase()",
            'let n = $signal(total)',
            'console.log(label, n)',
        ].join('\n'));
        expect(code).not.toContain('$signal(');
        expect(code).toMatch(/const total =\s*\n\s*1 \+\s*\n\s*2/);
        expect(code).toMatch(/const label = 'n'\s*\n\s*\.toUpperCase\(\)/);
        expect(code).toContain('const __n = signal(');
    });
});
