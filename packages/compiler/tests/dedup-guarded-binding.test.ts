// The production build deduplicates a repeated reactive binding into one `computed` hoisted to the
// top of render. It must not hoist a binding that a control-flow branch guards: the computed then
// reads the expression for the component's whole life, including while the branch is closed.
// Hoisted, `@if (shown()) { <img :alt="shown().nome"> {{ shown().nome }} }` throws
// `Cannot read properties of null (reading 'nome')` on every close — production only, a clean
// console in dev.

// ⚠️ `inlineBindings: false` throughout, and it is not a workaround: it names the path this
// file measures. A production build takes the INLINE path, and that path applies the
// loop-invariant hoist too — the transform both paths share is asserted on both,
// in `loop-invariant-both-paths.test.ts`. What is the template path's own is the binding
// deduplication and the escaping of the tagged template, which is what the flag pins here.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const prod = (src: string) => compile(src, 'dedup-guard.pdx', [], undefined, { production: true, inlineBindings: false }).code;

describe('binding dedup respects control flow', () => {
    it('does not hoist a binding that only occurs inside an @if', () => {
        const code = prod(`<template>@if (shown()) { <p :title="shown().nome">{{ shown().nome }}</p> }</template>
<script setup>
let viewing = $signal(-1);
let photos = $signal([]);
const shown = $derived(viewing >= 0 ? photos[viewing] : null);
</script>`);
        expect(code, `a guarded binding was hoisted out of its branch:\n${code}`).not.toMatch(/computed\(\(\) => ctx\.shown\(\)\.nome\)/);
        expect(code).not.toContain('__bd_');
    });

    it('does not hoist a binding that only occurs inside an @for row', () => {
        const code = prod(`<template>@for (items as it; track it) { <span :title="sel().x">{{ sel().x }}</span> }</template>
<script setup>
let items = $signal([1]);
let sel = $signal({ x: 1 });
</script>`);
        expect(code).not.toContain('__bd_');
    });

    it('the control: two identical bindings outside any control flow are still deduplicated', () => {
        const code = prod(`<template><button :disabled="count > 0" :hidden="count > 0">Save</button></template>
<script setup>
let count = $signal(0);
</script>`);
        expect(code).toContain('__bd_0');
    });

    it('the control: a guarded copy does not stop two top-level copies from being deduplicated', () => {
        const code = prod(`<template><p :title="count > 0" :hidden="count > 0"></p>@if (on) { <i :title="count > 0"></i> }</template>
<script setup>
let count = $signal(0);
let on = $signal(true);
</script>`);
        expect(code).toContain('__bd_0');
    });
});
