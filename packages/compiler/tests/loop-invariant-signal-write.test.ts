// A $signal written inside an @for handler is not a loop invariant. Hoisted as
// `const __li_open = computed(() => ctx.open())`, the write `ctx.open.set(false)` would become
// `__li_open().set(false)` — `.set` called on the signal's VALUE: `true.set(false)`, a TypeError on
// every click, in production only. dev-build-parity.test.ts covers a `signal()` object's method
// and leaves a `$signal` out by design; an assignment to a $signal compiles to exactly that shape.

// ⚠️ BOTH paths, and that is the point: the inline path — what a production build actually does —
// applies the same hoist, through the same `extractLoopInvariants`, so the rule this file measures
// has to hold on both or the two disagree about what is safe to lift. Each case below runs twice.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

/** BOTH paths: the inline one applies the same hoist. */
const prod = (src: string, inlineBindings = false) =>
    compile(src, 'li-write.pdx', [], undefined, { production: true, inlineBindings }).code;

describe('loop invariants never hoist a signal the loop writes', () => {
    for (const inline of [false, true]) {
        it(`an assignment in an @for handler stays a .set() on the signal (inlineBindings: ${inline})`, () => {
            const code = prod(`<template>@for (items as it; track it.href) { <a :href="it.href" @click="open = false">{{ it.label }}</a> }</template>
<script setup>
let open = $signal(true);
let items = $signal([{ href: '/a', label: 'A' }]);
</script>`, inline);
            expect(code, `the write was rewritten onto the value:\n${code}`).not.toMatch(/__li_open\(\)\.set/);
            expect(code).toMatch(/ctx\.open\.set\(false\)/);
        });

        it(`the same for ++ and a compound assignment (inlineBindings: ${inline})`, () => {
            const code = prod(`<template>@for (items as it; track it) { <button @click="n++">{{ n }}</button><i @click="n += 2"></i> }</template>
<script setup>
let n = $signal(0);
let items = $signal([1]);
</script>`, inline);
            expect(code).not.toMatch(/__li_n\(\)\.set/);
        });
    }

    it('the control: a signal only READ in the loop is still hoisted', () => {
        const code = prod(`<template>@for (items as it; track it) { <span :title="open">{{ it }}</span> }</template>
<script setup>
let open = $signal(true);
let items = $signal([1]);
</script>`);
        expect(code).toContain('const __li_open = computed(() => ctx.open())');
    });
});
