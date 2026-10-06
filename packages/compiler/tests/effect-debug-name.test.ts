// A development build names each $effect and $watch after the line it was written on, so the
// inspector's effects(), trace and subscribers say which one ran; a production build does not.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const filler = Array.from({ length: 9 }, (_v, k) => `const pad${k} = ${k};`).join('\n');
// Line 1 template, line 2 <script setup>, lines 3-11 filler, line 12 the $effect, line 13 the $watch.
const SOURCE = [
    '<template><p>{{ count }}</p></template>',
    '<script setup>',
    filler,
    '$effect(() => { console.log(count); });',
    '$watch(count, (v) => console.log(v));',
    'let count = $signal(0);',
    '</script>',
    '',
].join('\n');

describe('effect debug names', () => {
    it('a development build names the $effect a.pdx:12', () => {
        const { code } = compile(SOURCE, '/app/src/a.pdx');
        expect(code).toContain(`{ name: "a.pdx:12" }`);
    });

    it('and the $watch a.pdx:13', () => {
        const { code } = compile(SOURCE, '/app/src/a.pdx');
        expect(code).toContain(`{ name: "a.pdx:13" }`);
    });

    it('a $watch with its own options keeps them and gets the name', () => {
        const src = SOURCE.replace('$watch(count, (v) => console.log(v));', '$watch(count, (v) => console.log(v), { immediate: true });');
        const { code } = compile(src, '/app/src/a.pdx');
        expect(code).toContain(`{ ...({ immediate: true }), name: "a.pdx:13" }`);
    });

    it('a production build carries no name', () => {
        const { code } = compile(SOURCE, '/app/src/a.pdx', [], undefined, { production: true });
        expect(code).not.toContain('a.pdx:');
    });
});
