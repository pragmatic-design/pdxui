// A $derived that reads a top-level local of the script.
//
// Such a derived cannot be declared before the body, where the other deriveds go: the local it reads
// is declared there. Emitted after the WHOLE body — and every later $derived with it, since the
// before-body group is a source prefix — a top-level `effect()` that reads it would run in its temporal
// dead zone: `Cannot access '_galleryKey' before initialization`. So it is declared right after the
// local it reads.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function at(code: string, needle: string): number {
    const i = code.indexOf(needle);
    expect(i, `not in the output: ${needle}`).toBeGreaterThan(-1);
    return i;
}

describe('a $derived that reads a script local', () => {
    it('is declared after the local and before the top-level effect() that reads it', () => {
        const { code } = compile(`
<template><p>{{ key }}</p></template>
<script setup>
@prop name: string = 'button';
const _PFX = '../demos/comp-';
const key = $derived(_PFX + name + '.pdx');
effect(() => { const k = key; console.log(k); });
</script>
`, 'late-derived.pdx');
        const local = at(code, "const _PFX = '../demos/comp-'");
        const declared = at(code, 'const key = computed(');
        const read = at(code, 'const k = key()');
        expect(declared, 'the derived is declared before the local it reads').toBeGreaterThan(local);
        expect(declared, 'the derived is declared after the effect that reads it').toBeLessThan(read);
    });

    it('a later $derived that reads no local is not dragged after the body with it', () => {
        const { code } = compile(`
<template><p>{{ key }} {{ twice }}</p></template>
<script setup>
let n = $signal(1);
const _PFX = 'comp-';
const key = $derived(_PFX + n);
const twice = $derived(n * 2);
effect(() => { console.log(twice); });
</script>
`, 'late-derived-suffix.pdx');
        const declared = at(code, 'const twice = computed(');
        const read = at(code, 'console.log(twice())');
        expect(declared, 'twice is declared before the effect that reads it').toBeLessThan(read);
    });

    it('a derived reading a late signal comes after that signal', () => {
        const { code } = compile(`
<template><p>{{ label }}</p></template>
<script setup>
const base = 10;
let count = $signal(base);
const label = $derived('n=' + count);
effect(() => console.log(label));
</script>
`, 'late-derived-signal.pdx');
        const signal = at(code, 'const __count = signal(');
        const derived = at(code, 'const label = computed(');
        const read = at(code, 'console.log(label())');
        expect(derived).toBeGreaterThan(signal);
        expect(derived).toBeLessThan(read);
    });

    it('the module runs: the effect reads the derived without a TDZ error', async () => {
        const { code } = compile(`
<template><p>{{ key }}</p></template>
<script setup>
const _PFX = 'comp-';
let n = $signal(1);
const key = $derived(_PFX + n);
effect(() => { window.__pdx828 = key; });
</script>
`, 'late-derived-run.pdx', [], undefined, { production: true });
        // The setup's own statements, in emission order: the effect must find `key` declared.
        const setup = code.slice(code.indexOf('setup(ctx) {') + 'setup(ctx) {'.length, code.indexOf('return {', code.indexOf('setup(ctx) {')));
        const run = new Function('signal', 'computed', 'effect', 'window', 'ctx', setup);
        const win: Record<string, unknown> = {};
        const computed = (fn: () => unknown) => fn;
        const signal = (v: unknown) => { const s = () => v; s.set = (x: unknown) => { v = x; }; return s; };
        const effect = (fn: () => void) => fn();
        expect(() => run(signal, computed, effect, win, { el: { setAttribute() {} } })).not.toThrow();
        expect(win.__pdx828, 'the effect read the derived\'s value').toBe('comp-1');
    });

    it('control — a derived that reads no local stays before the body', () => {
        const { code } = compile(`
<template><p>{{ twice }}</p></template>
<script setup>
let n = $signal(1);
const twice = $derived(n * 2);
const _local = 3;
effect(() => console.log(twice, _local));
</script>
`, 'early-derived.pdx');
        expect(at(code, 'const twice = computed(')).toBeLessThan(at(code, 'const _local = 3'));
    });
});
