// A $signal written inside an @for handler is not a loop invariant. Hoisted as
// `const __li_open = computed(() => ctx.open())`, the write `ctx.open.set(false)` would become
// `__li_open().set(false)` — `.set` called on the signal's VALUE: `true.set(false)`, a TypeError on
// every click, in production only. dev-build-parity.test.ts covers a `signal()` object's method
// and leaves a `$signal` out by design; an assignment to a $signal compiles to exactly that shape.
//
// The hoist runs on the inline path, every .pdx's render since #107; the cases run there (#236).
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const prod = (src: string) => compile(src, 'li-write.pdx', [], undefined, { production: true }).code;

describe('loop invariants never hoist a signal the loop writes', () => {
    it('an assignment in an @for handler stays a write on the signal', () => {
        const code = prod(`<template>@for (items as it; track it.href) { <a :href="it.href" @click="open = false">{{ it.label }}</a> }</template>
<script>
let open = $signal(true);
let items = $signal([{ href: '/a', label: 'A' }]);
</script>`);
        expect(code, `the write was rewritten onto the value:\n${code}`).not.toMatch(/__li\d*_open\(\)\.set/);
        // An assignment stores its value as it is: setRaw (#187).
        expect(code).toMatch(/ctx\.open\.setRaw\(false\)/);
    });

    it('the same for ++ and a compound assignment', () => {
        const code = prod(`<template>@for (items as it; track it) { <button @click="n++">{{ n }}</button><i @click="n += 2"></i> }</template>
<script>
let n = $signal(0);
let items = $signal([1]);
</script>`);
        expect(code).not.toMatch(/__li\d*_n\(\)\.set/);
    });

    it('the control: a signal only READ in the loop is still hoisted', () => {
        const code = prod(`<template>@for (items as it; track it) { <span :title="open">{{ it }}</span> }</template>
<script>
let open = $signal(true);
let items = $signal([1]);
</script>`);
        expect(code).toMatch(/const __li\d+_open=computed\(\(\)=>ctx\.open\(\)\)/);
    });
});
