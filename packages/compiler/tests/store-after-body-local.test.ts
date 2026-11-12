// A $store whose initial value reads a top-level local of the script (#1051).
//
// The store was always declared before the body, so a `const` above it in the script was still in its
// temporal dead zone: `Cannot access 'ME' before initialization` at setup. A $signal reading the same
// local was already placed after it (signal-after-body-local.test.ts); a store now takes that path.
// A `function` declaration is hoisted and never triggered it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function at(code: string, needle: string): number {
    const i = code.indexOf(needle);
    expect(i, `not in the output: ${needle}`).toBeGreaterThan(-1);
    return i;
}

describe('a $store that reads a script local', () => {
    it('is declared after the local and before the statement that reads it', () => {
        const { code } = compile(`
<template><p>{{ thread.comments[0].author }}</p></template>
<script>
const ME = 'You';
const thread = $store({ comments: [{ id: 1, author: ME, replies: [] }] });
console.log(thread.comments.length);
</script>
`, 'late-store.pdx');
        const local = at(code, "const ME = 'You'");
        const declared = at(code, 'const thread = store(');
        const read = at(code, 'console.log(thread.comments.length)');
        expect(declared, 'the store is declared after the local it reads').toBeGreaterThan(local);
        expect(declared, 'the store is declared before the statement that reads it').toBeLessThan(read);
    });

    it('a $derived and a $signal that read the late store come after it', () => {
        const { code } = compile(`
<template><p>{{ count }} {{ first }}</p></template>
<script>
const seed = ['a', 'b'];
let list = $store({ items: seed });
const count = $derived(list.items.length);
let first = $signal(list.items[0]);
</script>
`, 'late-store-readers.pdx');
        const store = at(code, 'let list = store(');
        expect(store).toBeGreaterThan(at(code, "const seed = ['a', 'b']"));
        expect(at(code, 'const __first = signal('), 'a signal reading the late store is declared after it').toBeGreaterThan(store);
        expect(at(code, 'const count = computed('), 'a derived reading the late store is declared after it').toBeGreaterThan(store);
    });

    it('a $derived the body reads is not hoisted above the late store it reads', () => {
        // The body reads `size` (inside a function), which would put it before the body; it reads
        // `list`, which waits for `seed`. Hoisted, `size()` would call into `list` in its dead zone.
        const { code } = compile(`
<template><p>{{ size }}</p></template>
<script>
const seed = ['a', 'b'];
let list = $store({ items: seed });
const size = $derived(list.items.length);
function report() { return size; }
</script>
`, 'late-store-derived.pdx');
        expect(at(code, 'const size = computed('), 'the derived is declared after the store it reads').toBeGreaterThan(at(code, 'let list = store('));
    });

    it('control — a store from a literal is still declared before the body', () => {
        const { code } = compile(`
<template><p>{{ state.n }}</p></template>
<script>
const step = 2;
const state = $store({ n: 0 });
function bump() { state.n += step; }
</script>
`, 'early-store.pdx');
        expect(at(code, 'const state = store(')).toBeLessThan(at(code, 'const step = 2'));
    });
});
