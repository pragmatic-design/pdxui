// Unit tests for the AST rewriter: signal mutations/reads, callable (prop/derived) reads, the
// bug-fixes over the old regex path, lexical scope, and the parse-error pass-through.

import { describe, it, expect } from 'vitest';
import { rewriteAst } from '../src/compiler/signal-rewrite-ast';

const ast = (code: string, ...signals: string[]) => rewriteAst(code, new Set(signals), new Set(), 'f.pdx');
const callable = (code: string, ...names: string[]) => rewriteAst(code, new Set(), new Set(names), 'f.pdx');

describe('rewriteAst — signal mutations + reads', () => {
    it('postfix / prefix ++ / --', () => {
        expect(ast('count++;', 'count')).toBe('__count.set(__v => __v + 1);');
        expect(ast('++count;', 'count')).toBe('__count.set(__v => __v + 1);');
        expect(ast('count--;', 'count')).toBe('__count.set(__v => __v - 1);');
        expect(ast('--count;', 'count')).toBe('__count.set(__v => __v - 1);');
    });
    it('compound assignment', () => {
        expect(ast('total += 5;', 'total')).toBe('__total.set(__v => __v + 5);');
        expect(ast('total *= n;', 'total')).toBe('__total.set(__v => __v * n);');
    });
    it('direct assignment', () => {
        expect(ast('count = 5;', 'count')).toBe('__count.set(5);');
        expect(ast('count = a + 1;', 'count')).toBe('__count.set(a + 1);');
    });
    it('self-reference', () => {
        expect(ast('items = items.filter(x => x.ok);', 'items'))
            .toBe('__items.set(prev => prev.filter(x => x.ok));');
        expect(ast('count = !count;', 'count')).toBe('__count.set(prev => !prev);');
    });
    it('bare read + spread + other signals in RHS', () => {
        expect(ast('const x = count + 1;', 'count')).toBe('const x = __count() + 1;');
        expect(ast('const a = [...items];', 'items')).toBe('const a = [...__items()];');
        expect(ast('count += other;', 'count', 'other')).toBe('__count.set(__v => __v + __other());');
    });
});

describe('rewriteAst — callable (prop / derived) reads', () => {
    it('appends () to a callable read', () => {
        expect(callable('const x = total + 1;', 'total')).toBe('const x = total() + 1;');
    });
    it('signals and callables together in one pass', () => {
        expect(rewriteAst('count += total;', new Set(['count']), new Set(['total']), 'f'))
            .toBe('__count.set(__v => __v + total());');
    });
    it('a callable used as a method/property is left alone', () => {
        expect(callable('const x = obj.total;', 'total')).toBe('const x = obj.total;');
    });
});

describe('rewriteAst — fixes the old regex bugs', () => {
    it('shorthand property expands instead of producing invalid { __count() }', () => {
        expect(ast('const o = { count };', 'count')).toBe('const o = { count: __count() };');
    });
    it('optional-chaining self-reference', () => {
        expect(ast('items = items?.map(x => x);', 'items'))
            .toBe('__items.set(prev => prev?.map(x => x));');
    });
    it('ternary value without a space before the colon', () => {
        expect(ast('const x = cond ? count: 0;', 'count')).toBe('const x = cond ? __count(): 0;');
    });
    it('identifier inside generic call arguments', () => {
        expect(ast('const x = foo<number>(count);', 'count')).toBe('const x = foo<number>(__count());');
    });
    it('multiline assignment RHS', () => {
        expect(ast('count =\n  a +\n  b;', 'count')).toBe('__count.set(a +\n  b);');
    });
    it('comment between operand and ++', () => {
        expect(ast('count /* x */ ++;', 'count')).toBe('__count.set(__v => __v + 1);');
    });
});

describe('rewriteAst — lexical scope', () => {
    it('a param shadowing a signal is left untouched', () => {
        expect(ast('arr.map(count => count + 1);', 'count')).toBe('arr.map(count => count + 1);');
    });
    it('a local declaration shadows a signal in its block', () => {
        expect(ast('function f() { let count = 1; return count; }', 'count'))
            .toBe('function f() { let count = 1; return count; }');
    });
    it('reads outside the shadowing scope are still rewritten', () => {
        expect(ast('arr.map(x => x + count);', 'count')).toBe('arr.map(x => x + __count());');
    });
});

describe('rewriteAst — robustness', () => {
    it('object key is not a read', () => {
        expect(ast('const o = { count: 5 };', 'count')).toBe('const o = { count: 5 };');
    });
    it('property access name is not a read', () => {
        expect(ast('const x = obj.count;', 'count')).toBe('const x = obj.count;');
    });
    it('an unparseable fragment is returned unchanged', () => {
        expect(ast('} else {', 'count')).toBe('} else {');
    });
    it('no names → unchanged', () => {
        expect(rewriteAst('count++;', new Set(), new Set(), 'f')).toBe('count++;');
    });
});
