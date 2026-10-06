// An object shorthand of a prop, a $derived or a route param passes the VALUE, as a shorthand of a
// $signal does. Compiled to `{ productId, pin: __pin() }`, `register({ productId, pin })` with
// `@prop productId` and `$signal pin` hands the server the prop's signal FUNCTION as the product id,
// and the record is never written.

import { describe, it, expect } from 'vitest';
import { rewriteAst } from '../src/compiler/signal-rewrite-ast';
import { compile } from '../src/plugin';

const callable = (code: string, ...names: string[]) => rewriteAst(code, new Set(), new Set(names), 'f.pdx');

describe('rewriteAst — shorthand of a callable', () => {
    it('expands a callable shorthand to its value', () => {
        expect(callable('const o = { total };', 'total')).toBe('const o = { total: total() };');
        expect(callable('send({ a, b, c });', 'a', 'b', 'c')).toBe('send({ a: a(), b: b(), c: c() });');
    });

    it('a shadowing local is not a callable', () => {
        expect(callable('function f(total) { return { total }; }', 'total'))
            .toBe('function f(total) { return { total }; }');
    });

    it('a destructuring target is not a read', () => {
        expect(callable('({ total } = obj);', 'total')).toBe('({ total } = obj);');
        expect(callable('const { total } = obj;', 'total')).toBe('const { total } = obj;');
    });
});

describe('compile — shorthand of a prop, a derived and a route param', () => {
    it('every shorthand in a setup function passes the value', () => {
        const { code } = compile(`<template><button @click="send()">{{ n }}</button></template>
<script setup>
@page '/orders/:orderId';
@params { orderId: string };
@prop productId: string = '';
let n = $signal(0);
const total = $derived(n * 2);
function send() { return { productId, total, orderId, n }; }
</script>`, 'shorthand.pdx');
        const ret = code.slice(code.indexOf('return { productId'), code.indexOf('}', code.indexOf('return { productId')) + 1);
        expect(ret, `the returned object:\n${ret}`).toMatch(/productId: productId\(\)/);
        expect(ret).toMatch(/total: total\(\)/);
        expect(ret).toMatch(/orderId: orderId\(\)/);
        expect(ret).toMatch(/n: __n\(\)/); // the control: a $signal shorthand, as before
    });
});
