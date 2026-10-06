// $derived rewrites and the AST fallback.

import { describe, it, expect, vi } from 'vitest';
import { generateDerivedDeclarations } from '../src/compiler/signal-rewrite';
import { rewriteAst } from '../src/compiler/signal-rewrite-ast';

describe('generateDerivedDeclarations — string-aware', () => {
    it('does not rewrite signal names inside strings', () => {
        const out = generateDerivedDeclarations(
            [{ name: 'label', expr: "'hello count world' + count" }],
            new Set(['count']),
        );
        expect(out).toContain("'hello count world'"); // the string is left intact
        expect(out).toContain('__count()');           // the real read is rewritten
    });

    it('does not rewrite inside template literals', () => {
        const out = generateDerivedDeclarations(
            [{ name: 'msg', expr: '`total count: ${count}`' }],
            new Set(['count']),
        );
        expect(out).toContain('total count:');
        expect(out).not.toContain('total __count()');
        expect(out).toContain('${__count()}');
    });
});

describe('rewriteAst — fallback with warning', () => {
    it('the fallback on unparseable code with mutations emits a warning', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const broken = 'count++; } else {'; // an unparseable fragment WITH a mutation
        const out = rewriteAst(broken, new Set(['count']), new Set(), 'test.pdx');
        expect(out).toBe(broken); // unchanged (fallback)
        expect(warn).toHaveBeenCalled(); // but NOT silently
        warn.mockRestore();
    });

    it('no warning for structural fragments that name none of them', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        rewriteAst('} else {', new Set(['count']), new Set(), 'test.pdx');
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});

// A $derived is wrapped in `() =>` unless it already IS an arrow function. Deciding that with
// `/^\(.*\)\s*=>/` cannot decide it: `.*` is greedy and crosses nested parentheses, so
// `(docs ?? []).filter((d) => d.k)` looks like an arrow and is passed to computed() NAKED —
// `computed(value)` instead of `computed(() => value)`. Nothing fails at compile time; at runtime
// `TypeError: fn is not a function`, thrown from recompute, with a stack pointing at whatever READS
// the computed.
describe('generateDerivedDeclarations — an expression is not an arrow just because it contains one', () => {
    const decl = (expr: string) => generateDerivedDeclarations([{ name: 'x', expr }], new Set(['docs']));

    it('wraps an expression that starts with a paren and contains an arrow', () => {
        expect(decl('(docs ?? []).filter((d) => d.k)')).toContain('computed(() =>');
    });

    it('wraps the other shapes that fooled the regex', () => {
        expect(decl('(docs ?? []).map((d) => d.kind)')).toContain('computed(() =>');
        expect(decl('(a, b) === (c) ? (x) => 1 : 2')).toContain('computed(() =>');
    });

    it('still passes a real arrow function straight through', () => {
        // The whole point of the branch: computed(() => …), never computed(() => () => …).
        expect(decl('() => __docs().length')).not.toContain('computed(() => () =>');
        expect(decl('(a) => a + 1')).not.toContain('computed(() => (a) =>');
        expect(decl('a => a + 1')).not.toContain('computed(() => a =>');
    });

    it('leaves the shapes that were always right alone', () => {
        expect(decl('(docs ?? []).length')).toContain('computed(() =>');
        expect(decl('docs.filter((d) => d.k)')).toContain('computed(() =>');
    });
});
