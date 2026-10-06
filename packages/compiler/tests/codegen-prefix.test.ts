// Dedicated tests for codegen-prefix.ts — ctx. prefixing and signal call insertion.

import { describe, it, expect } from 'vitest';
import { prefixCtx, callSignals } from '../src/compiler/codegen-prefix';
import { createCompileContext } from '../src/compiler/compile-context';
import type { CompileContext } from '../src/compiler/compile-context';

function makeCtx(): CompileContext {
    return createCompileContext({ production: false });
}

describe('prefixCtx()', () => {
    it('prefixes bare identifiers', () => {
        const ctx = makeCtx();
        expect(prefixCtx('count', ctx)).toBe('ctx.count');
        expect(prefixCtx('label + name', ctx)).toBe('ctx.label + ctx.name');
    });

    it('does NOT prefix after dot (property access)', () => {
        const ctx = makeCtx();
        // 'item' is a skip-prefix name (common loop var), so item.name stays as-is
        expect(prefixCtx('item.name', ctx)).toBe('item.name');
        // 'obj' is NOT a skip-prefix, so obj gets prefixed, but .count stays
        expect(prefixCtx('obj.count', ctx)).toBe('ctx.obj.count');
    });

    it('does NOT prefix JS keywords', () => {
        const ctx = makeCtx();
        expect(prefixCtx('true', ctx)).toBe('true');
        expect(prefixCtx('null', ctx)).toBe('null');
        expect(prefixCtx('typeof x', ctx)).toBe('typeof ctx.x');
        expect(prefixCtx('new Date()', ctx)).toBe('new Date()');
    });

    it('does NOT prefix built-in globals', () => {
        const ctx = makeCtx();
        expect(prefixCtx('Math.round(x)', ctx)).toBe('Math.round(ctx.x)');
        expect(prefixCtx('JSON.stringify(data)', ctx)).toBe('JSON.stringify(ctx.data)');
        expect(prefixCtx('console.log(value)', ctx)).toBe('console.log(ctx.value)');
    });

    it('does NOT prefix browser globals (usable in template handlers)', () => {
        const ctx = makeCtx();
        // @click="alert('hi')" must compile to alert('hi'), not ctx.alert('hi')
        expect(prefixCtx("alert('hi')", ctx)).toBe("alert('hi')");
        expect(prefixCtx('fetch(url)', ctx)).toBe('fetch(ctx.url)');
        expect(prefixCtx('setTimeout(fn, 100)', ctx)).toBe('setTimeout(ctx.fn, 100)');
        expect(prefixCtx('localStorage.setItem(key, val)', ctx)).toBe('localStorage.setItem(ctx.key, ctx.val)');
    });

    it('does NOT prefix object keys', () => {
        const ctx = makeCtx();
        const result = prefixCtx('{ count: 5, name: x }', ctx);
        expect(result).toContain('count: 5');
        expect(result).toContain('name: ctx.x');
    });

    it('does NOT prefix arrow function params', () => {
        const ctx = makeCtx();
        const result = prefixCtx('(item) => item.name', ctx);
        expect(result).not.toContain('ctx.item');
    });

    it('does NOT prefix scope variables (@for loop vars)', () => {
        const ctx = makeCtx();
        ctx.scopeVars.add('item');
        expect(prefixCtx('item.name', ctx)).toBe('item.name');
        ctx.scopeVars.delete('item');
    });

    it('does NOT prefix i18n helpers', () => {
        const ctx = makeCtx();
        expect(prefixCtx('$t("hello")', ctx)).toBe('$t("hello")');
        expect(prefixCtx('$n(count)', ctx)).toBe('$n(ctx.count)');
    });

    it('handles string literals without prefixing', () => {
        const ctx = makeCtx();
        expect(prefixCtx('"hello world"', ctx)).toBe('"hello world"');
        expect(prefixCtx("'hello'", ctx)).toBe("'hello'");
    });

    it('already prefixed → passthrough', () => {
        const ctx = makeCtx();
        expect(prefixCtx('ctx.count', ctx)).toBe('ctx.count');
    });
});

describe('callSignals()', () => {
    it('adds () to ctx.name reads', () => {
        const ctx = makeCtx();
        expect(callSignals('ctx.count', ctx)).toBe('ctx.count()');
        expect(callSignals('ctx.name + ctx.label', ctx)).toBe('ctx.name() + ctx.label()');
    });

    it('does NOT double-add () if already called', () => {
        const ctx = makeCtx();
        expect(callSignals('ctx.count()', ctx)).toBe('ctx.count()');
    });

    it('skips non-signal names', () => {
        const ctx = makeCtx();
        ctx.nonSignalNames = new Set(['formRef', 'addItem']);
        expect(callSignals('ctx.formRef', ctx)).toBe('ctx.formRef');
        expect(callSignals('ctx.addItem', ctx)).toBe('ctx.addItem');
        expect(callSignals('ctx.count', ctx)).toBe('ctx.count()');
    });
});

// Spread, and declared names that collide with the common loop variables

describe('prefixCtx — spread', () => {
    it('prefixes the identifier after ... (spread)', () => {
        const ctx = makeCtx();
        expect(prefixCtx('[...items]', ctx)).toBe('[...ctx.items]');
        expect(prefixCtx('fn(...args)', ctx)).toBe('ctx.fn(...ctx.args)');
        expect(prefixCtx('{ ...rest }', ctx)).toBe('{ ...ctx.rest }');
    });

    it('does not prefix a real property access', () => {
        const ctx = makeCtx();
        expect(prefixCtx('obj.count', ctx)).toBe('ctx.obj.count');
    });
});

describe('prefixCtx — declared names vs common loop variables', () => {
    it('a declared signal called "error" is prefixed', () => {
        const ctx = makeCtx();
        ctx.declaredNames = new Set(['error', 'items']);
        expect(prefixCtx('error', ctx)).toBe('ctx.error');
        expect(prefixCtx('item', ctx)).toBe('item'); // not declared: it stays a loop variable
    });

    it('a real loop var in scope wins over the declared name', () => {
        const ctx = makeCtx();
        ctx.declaredNames = new Set(['item']);
        ctx.scopeVars.add('item'); // @for (item of ...)
        expect(prefixCtx('item.name', ctx)).toBe('item.name');
    });

    it('with no declaredNames the behaviour is unchanged', () => {
        const ctx = makeCtx();
        expect(prefixCtx('error', ctx)).toBe('error');
    });
});
