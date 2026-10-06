// A regex literal right after `return` (or `typeof`, `case`…) is a regex, not a division.
//
// Deciding "regex or division" from the previous character alone is not enough: after an
// identifier character, `/` is division, and `return` ends in one. Read that way,
// `return /^[\[{]/.test(v)` is a division, the `{` inside the character class counts as a block
// opener, and every top-level declaration after that function sits at depth 1 — out of the setup's
// returned object, so the page renders nothing: `ctx.ctlVal is not a function`.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { regexStartsAt } from '../src/compiler/tokenizer';

/** The names a setup hands its template: the object it returns. */
function returned(decl: string): string {
    const { code } = compile(`<template><p>{{ later() }}</p></template>
<script setup>
${decl}
function later() { return 'x'; }
</script>`, 'regex-after-keyword.pdx');
    return code.match(/\n\s*return \{([^}]*)\};?\n/)?.[1] ?? '';
}

describe('a declaration after a regex literal stays in the setup\'s returned names', () => {
    it('return /…{…/', () => {
        expect(returned('function b(v) { return /^[\\[{]/.test(v) ? 1 : 0; }')).toContain('later');
    });

    it('return /…}…/', () => {
        expect(returned('function c(v) { return /^[\\]}]/.test(v) ? 1 : 0; }')).toContain('later');
    });

    it('inside a nested arrow', () => {
        expect(returned('function d() { const f = (v) => { return /{/.test(v); }; return f; }')).toContain('later');
    });

    it('case and typeof are keywords too', () => {
        expect(returned('function e(v) { switch (true) { case /{/.test(v): return 1; default: return 0; } }')).toContain('later');
        expect(returned('function t() { const k = typeof /{/; return k; }')).toContain('later');
    });

    it('the controls: a regex assigned first, and no regex at all', () => {
        expect(returned('function f(v) { const r = /^[\\[{]/; return r.test(v); }')).toContain('later');
        expect(returned("function g(v) { return v.startsWith('['); }")).toContain('later');
    });
});

describe('regexStartsAt: regex or division', () => {
    const at = (code: string) => regexStartsAt(code, code.indexOf('/'));

    it('after an expression keyword, a regex', () => {
        for (const kw of ['return', 'typeof', 'case', 'throw', 'void', 'delete', 'in', 'of', 'new', 'else', 'do', 'yield', 'await', 'instanceof']) {
            expect(at(`${kw} /x/`), kw).toBe(true);
        }
    });

    it('after a value, a division — a property named like a keyword included', () => {
        expect(at('a / 2')).toBe(false);
        expect(at('f() / 2')).toBe(false);
        expect(at('xs[0] / 2')).toBe(false);
        expect(at('o.return / 2')).toBe(false);
        expect(at('o?.typeof / 2')).toBe(false);
        expect(at('returned / 2')).toBe(false);
    });

    it('after an operator or an opener, a regex', () => {
        expect(at('x = /a/')).toBe(true);
        expect(at('f(/a/)')).toBe(true);
        expect(at('/a/')).toBe(true);
    });
});
