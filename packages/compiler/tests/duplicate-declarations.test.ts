// A name declared twice by runes is an error that names both lines.
//
// `const icon = $derived(…)` and then `let icon = $signal(null)` cannot both be honoured: the
// output declares `__icon` once, one of the two is dropped, and which one decides what the
// component does.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const sfc = (script: string) => `<template><p>{{ icon }}</p></template>\n<script setup>\n${script}\n</script>\n`;
const dups = (script: string) => compile(sfc(script), 'piece.pdx').warnings.filter(w => w.code === 'PDX_DUP_DECLARATION');

describe('PDX_DUP_DECLARATION', () => {
    it('$derived then $signal: an error naming both lines', () => {
        const ws = dups([
            'let dark = $signal(false);',
            "const icon = $derived(dark ? 'sun' : 'moon');",
            'let icon = $signal(null);',
        ].join('\n'));
        expect(ws, 'the second declaration was dropped in silence').toHaveLength(1);
        expect(ws[0].severity, 'the output cannot honour both: an error').toBe('error');
        expect(ws[0].message).toContain("'icon'");
        expect(ws[0].message).toMatch(/lines? 4\b/);
        expect(ws[0].message).toMatch(/\b5\b/);
        expect(ws[0].line).toBe(5);
    });

    it('two $signal', () => {
        expect(dups('let icon = $signal(1);\nlet icon = $signal(2);')).toHaveLength(1);
    });

    it('a @prop and a $signal of the same name', () => {
        const ws = dups("@prop icon: string = 'x';\nlet icon = $signal(null);");
        expect(ws).toHaveLength(1);
        expect(ws[0].message).toContain('@prop');
    });

    it('a $store and a $derived', () => {
        expect(dups('const icon = $store({ a: 1 });\nconst icon = $derived(2);')).toHaveLength(1);
    });

    // A rune and a plain declaration of one name clash too: the signal becomes `__name`, the clash
    // disappears from the module, and the duplicate key of the auto-return keeps the function — a
    // template then reads the function where it means the element.
    it('a $signal and a function of the same name', () => {
        const ws = dups([
            'let toggleSidebar = $signal(null);',
            'function toggleSidebar() {',
            '  if (toggleSidebar) toggleSidebar.open = false;',
            '}',
        ].join('\n'));
        expect(ws, 'the function silently replaced the signal').toHaveLength(1);
        expect(ws[0].severity).toBe('error');
        expect(ws[0].message).toContain("'toggleSidebar'");
        expect(ws[0].message).toContain('$signal on line 3');
        expect(ws[0].message).toContain('function on line 4');
        expect(ws[0].line).toBe(4);
    });

    it('two functions, a const and a function, a class and a let', () => {
        expect(dups('function f() {}\nfunction f() {}')).toHaveLength(1);
        expect(dups('const f = 1;\nfunction f() {}')).toHaveLength(1);
        expect(dups('class C {}\nlet C = 2;')).toHaveLength(1);
    });

    it('a name a destructuring declares, then a $derived', () => {
        expect(dups('const { a, b: icon } = { a: 1, b: 2 };\nconst icon2 = $derived(1);\nconst icon = $derived(2);')).toHaveLength(1);
    });

    it('control — one declaration of each name', () => {
        expect(dups("let dark = $signal(false);\nconst icon = $derived(dark ? 'sun' : 'moon');")).toEqual([]);
    });

    it('control — a plain local of the same name inside a function is another scope', () => {
        expect(dups("let icon = $signal('x');\nfunction f() { let icon = 2; return icon; }")).toEqual([]);
    });
});
