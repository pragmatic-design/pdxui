// A $signal whose initial value reads a top-level local of the script.
//
// Such a signal cannot be declared before the body: the local it reads is declared there. Emitted
// after the WHOLE body, a top-level statement written after it, and reading it, would run in its
// temporal dead zone — `Cannot access '__theme' before initialization` at mount, naming an internal
// the author never wrote. Reading the late signal only from something lazy, a $derived or a
// function, does not show it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function at(code: string, needle: string): number {
    const i = code.indexOf(needle);
    expect(i, `not in the output: ${needle}`).toBeGreaterThan(-1);
    return i;
}

describe('a $signal that reads a script local', () => {
    it('is declared after the local and before the top-level statement that reads it', () => {
        const { code } = compile(`
<template><p>{{ theme }}</p></template>
<script setup>
const _params = new URLSearchParams('theme=dark');
let theme = $signal(_params.get('theme') || 'neutral');
apply(theme);
function apply(value) { document.documentElement.setAttribute('data-theme', value); }
</script>
`, 'late-signal.pdx');
        const local = at(code, 'const _params = new URLSearchParams');
        const declared = at(code, 'const __theme = signal(');
        const read = at(code, 'apply(__theme())');
        expect(declared, 'the signal is declared before the local it reads').toBeGreaterThan(local);
        expect(declared, 'the signal is declared after the statement that reads it').toBeLessThan(read);
    });

    it('a signal that reads another such signal comes after it, and both before their readers', () => {
        const { code } = compile(`
<template><p>{{ label }}</p></template>
<script setup>
const base = 10;
let count = $signal(base);
let label = $signal('n=' + count);
console.log(count, label);
</script>
`, 'late-chain.pdx');
        const local = at(code, 'const base = 10');
        const first = at(code, 'const __count = signal(');
        const second = at(code, 'const __label = signal(');
        const read = at(code, 'console.log(__count(), __label())');
        expect(first).toBeGreaterThan(local);
        expect(second, 'label reads count, so it is declared after it').toBeGreaterThan(first);
        expect(read, 'the read follows both declarations').toBeGreaterThan(second);
    });

    it('control — a signal from a literal is still declared before the body', () => {
        const { code } = compile(`
<template><p>{{ n }}</p></template>
<script setup>
const step = 2;
let n = $signal(0);
function bump() { n += step; }
</script>
`, 'early-signal.pdx');
        expect(at(code, 'const __n = signal(')).toBeLessThan(at(code, 'const step = 2'));
    });
});
