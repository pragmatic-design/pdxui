// Regression tests for verified parser/analyzer bug fixes (string-aware scans).
// Each block locks a previously-broken behavior (red → green).

import { describe, it, expect } from 'vitest';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { rewriteAst } from '../src/compiler/signal-rewrite-ast';
import { parseTemplate } from '../src/parser/template';
import { compile } from '../src/plugin';
import { normalizeStatements } from '../src/compiler/script-analyzer-helpers';
import type { InterpolationNode, IfNode, LetNode, ForNode } from '../src/parser/template';

// ─── Fix 3: regex literal recognition in normalizeStatements ────────

describe('fix 3 — regex literal not split on inner semicolon', () => {
    it('keeps `/a;b/` intact when normalizing statements', () => {
        const out = normalizeStatements(`const re = /a;b/; x();`);
        expect(out).toContain('const re = /a;b/;');
        expect(out).not.toContain('/a;\nb/');
    });

    it('treats `/` after a value as division (not regex)', () => {
        const out = normalizeStatements(`const r = a / b; c();`);
        expect(out).toContain('const r = a / b;');
    });
});

// ─── Fix 7: @let terminating ; is string-aware ──────────────────────

describe('fix 7 — @let statement end ignores ; inside strings', () => {
    it('parses `@let s = \'a;b\';` without truncating at the inner ;', () => {
        const node = parseTemplate(`@let s = 'a;b'; <i>{{ s }}</i>`)[0] as LetNode;
        expect(node.type).toBe('let');
        expect(node.name).toBe('s');
        expect(node.expr).toBe("'a;b'");
    });
});

// ─── Fix 8: nested destructuring in @for ────────────────────────────

describe('fix 8 — @for nested destructuring binding', () => {
    it('handles `{ id, user: { name } }, i`', () => {
        const node = parseTemplate(
            `@for (rows as { id, user: { name } }, i; track id) { <b>{{ name }}</b> }`
        )[0] as ForNode;
        expect(node.item).toBe('{ id, user: { name } }');
        expect(node.index).toBe('i');
        expect(node.track).toBe('id');
    });
});

// ─── Fix 10: @title concatenation is dynamic ────────────────────────

describe('fix 10 — @title static only for a single string literal', () => {
    it('treats `\'A\' + x` as dynamic', () => {
        const a = analyzeScript(`@prop x: string = 'a';\n@title 'A' + x;`, 'x.pdx');
        expect(a.head.title).toEqual({ value: "'A' + x", isDynamic: true });
    });
    it('treats a lone string literal as static', () => {
        const a = analyzeScript(`@prop x: string = 'a';\n@title 'Static';`, 'x.pdx');
        expect(a.head.title).toEqual({ value: 'Static', isDynamic: false });
    });
});

// ─── Fix 11: @meta quotes keys only (URLs preserved) ────────────────

describe('fix 11 — @meta block preserves : inside values', () => {
    it('keeps a URL value intact and parses the object', () => {
        const a = analyzeScript(
            `@prop x: string = 'a';\n@meta { url: 'https://x.com/p', count: 3 };`,
            'x.pdx'
        );
        expect(a.route.meta).toEqual({ url: 'https://x.com/p', count: 3 });
    });
});

// ─── Fix 1: const/var signal detection ──────────────────────────────

describe('fix 1 — signal detection accepts const/var/let', () => {
    it('detects const $signal as a signal', () => {
        const a = analyzeScript(`const count = $signal(0);\ncount++;`, 'x.pdx');
        expect(a.mode).toBe('new');
        expect(a.signals.map(s => s.name)).toContain('count');
    });

    it('detects var $signal as a signal', () => {
        const a = analyzeScript(`var n = $signal(5);`, 'x.pdx');
        expect(a.signals.map(s => s.name)).toContain('n');
    });

    it('detects const $derived / const $store', () => {
        const a = analyzeScript(`const total = $derived(1 + 2);\nconst s = $store({ a: 1 });`, 'x.pdx');
        expect(a.deriveds.map(d => d.name)).toContain('total');
        expect(a.stores.map(s => s.name)).toContain('s');
    });
});

// ─── Fix 2: multi-declarator ────────────────────────────────────────

describe('fix 2 — multiple declarators on one statement', () => {
    it('splits `let a = $signal(0), b = $signal(1)` into two signals', () => {
        const a = analyzeScript(`let a = $signal(0), b = $signal(1);`, 'x.pdx');
        const names = a.signals.map(s => s.name);
        expect(names).toEqual(expect.arrayContaining(['a', 'b']));
        expect(a.signals.find(s => s.name === 'a')?.initialExpr).toBe('0');
        expect(a.signals.find(s => s.name === 'b')?.initialExpr).toBe('1');
    });

    it('extractCallBody finds the BALANCED close paren, not the last one', () => {
        // `a` must NOT swallow b's value via lastIndexOf(')').
        const a = analyzeScript(`let a = $signal(fn(1)), b = $signal(2);`, 'x.pdx');
        expect(a.signals.find(s => s.name === 'a')?.initialExpr).toBe('fn(1)');
        expect(a.signals.find(s => s.name === 'b')?.initialExpr).toBe('2');
    });
});

// ─── Fix 4: compound assignment operators ───────────────────────────

describe('fix 4 — extended compound assignment operators', () => {
    const sig = new Set(['c']);
    const rw = (code: string) => rewriteAst(code, sig, new Set(), 'x');

    it('||= short-circuits (only sets when falsy)', () => {
        expect(rw('c ||= 5')).toBe('(__c() || __c.set(5))');
    });
    it('&&= short-circuits', () => {
        expect(rw('c &&= 5')).toBe('(__c() && __c.set(5))');
    });
    it('??= short-circuits', () => {
        expect(rw('c ??= 5')).toBe('(__c() ?? __c.set(5))');
    });
    it('**= uses functional set', () => {
        expect(rw('c **= 2')).toBe('__c.set(__v => __v ** 2)');
    });
    it('bitwise &= |= ^= <<= >>= >>>= use functional set', () => {
        expect(rw('c &= 2')).toBe('__c.set(__v => __v & 2)');
        expect(rw('c |= 2')).toBe('__c.set(__v => __v | 2)');
        expect(rw('c ^= 2')).toBe('__c.set(__v => __v ^ 2)');
        expect(rw('c <<= 2')).toBe('__c.set(__v => __v << 2)');
        expect(rw('c >>= 2')).toBe('__c.set(__v => __v >> 2)');
        expect(rw('c >>>= 2')).toBe('__c.set(__v => __v >>> 2)');
    });
});

// ─── Fix 5: parenthesis balance is string-aware ─────────────────────

describe('fix 5 — directive parentheses ignore strings', () => {
    it('@if with a `)` inside a string literal', () => {
        const nodes = parseTemplate(`@if (name.includes(')')) { <b>x</b> }`);
        const ifNode = nodes[0] as IfNode;
        expect(ifNode.type).toBe('if');
        expect(ifNode.condition).toBe("name.includes(')')");
    });

    it('@show with a `)` inside a string literal', () => {
        const nodes = parseTemplate(`@show (label === ')') { <i>y</i> }`);
        expect((nodes[0] as { condition: string }).condition).toBe("label === ')'");
    });
});

// ─── Fix 6: interpolation close + pipe split are string/brace-aware ──

describe('fix 6 — interpolation }} and pipe split', () => {
    it('does not split on || (logical OR) or | inside strings', () => {
        const n = parseTemplate(`{{ obj.x || 'a|b' }}`)[0] as InterpolationNode;
        expect(n.expr).toBe("obj.x || 'a|b'");
        expect(n.pipes).toEqual([]);
    });

    it('finds the closing }} past a nested object literal', () => {
        const n = parseTemplate(`{{ {a:1}.a }}`)[0] as InterpolationNode;
        expect(n.expr).toBe('{a:1}.a');
    });

    it('still splits genuine pipe filters', () => {
        const n = parseTemplate(`{{ name | uppercase }}`)[0] as InterpolationNode;
        expect(n.expr).toBe('name');
        expect(n.pipes).toEqual(['uppercase']);
    });

    it('does not split | inside a pipe argument', () => {
        const n = parseTemplate(`{{ value | join('|') }}`)[0] as InterpolationNode;
        expect(n.expr).toBe('value');
        expect(n.pipes).toEqual(["join('|')"]);
    });
});

// ─── Fix 9: directives inside comments are not processed ─────────────

describe('fix 9 — directives in comments are ignored', () => {
    it('a @page inside a block comment does not create a route', () => {
        const a = analyzeScript(
            `let x = $signal(1);\n/* @page '/nope' */\nlet y = $signal(2);`,
            'x.pdx'
        );
        expect(a.route.page).toBeUndefined();
        expect(a.signals.map(s => s.name)).toEqual(expect.arrayContaining(['x', 'y']));
    });
});

// ─── Fix 13: PDX_NON_REACTIVE autofix wraps the initializer ──────────

describe('fix 13 — PDX_NON_REACTIVE fix is well-formed', () => {
    it('wraps the whole initializer in $signal(...) (balanced parens)', () => {
        // The fix is offset edits into the file, built from the declaration's position.
        const source = `<template><div>{{ counter }}</div></template>\n<script setup>\n@prop title: string = 'x';\nlet counter = Math.max(5, 1);\n</script>\n`;
        const w = compile(source, 'x.pdx').warnings.find(x => x.code === 'PDX_NON_REACTIVE');
        expect(w?.fix, 'PDX_NON_REACTIVE carries no fix').toBeDefined();
        // Applying the fix must produce valid, balanced source (not `$signal(5;`).
        let applied = source;
        for (const e of [...w!.fix!.edits].sort((x, y) => y.start - x.start)) {
            applied = applied.slice(0, e.start) + e.newText + applied.slice(e.end);
        }
        expect(applied.split('\n')[3]).toBe('let counter = $signal(Math.max(5, 1));');
    });
});
