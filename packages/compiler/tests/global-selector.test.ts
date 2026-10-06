// `:global()` is Vue's and Svelte's escape from a scoped style. It is not CSS: passed through, the
// browser drops the whole rule, silently. PDX scopes by an ANCESTOR attribute, so a plain
// descendant selector already reaches what a child component renders: the escape is not needed,
// and the compiler says so.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const sfc = (style: string, attrs = 'scoped') => `
<template><div class="list"></div></template>
<script setup>
let n = $signal(0);
</script>
<style ${attrs}>
${style}
</style>
`;

const codes = (source: string) => compile(source, 'list.pdx').warnings.map(w => w.code);

describe('PDX_GLOBAL_SELECTOR', () => {
    it('a :global() in a scoped style is reported, with the rewrite in the message', () => {
        const warnings = compile(sfc('.list :global(.row-invalid) { color: red; }'), 'list.pdx').warnings;
        const w = warnings.find(x => x.code === 'PDX_GLOBAL_SELECTOR');
        expect(w, 'the compiler said nothing about :global()').toBeDefined();
        expect(w!.message).toContain('.list .row-invalid');
        // Where it is, so `pdx check` and the editor can point at it: line 7 of the file.
        expect(w!.line).toBe(7);
    });

    it('and in a plain style too: the browser drops the rule there as well', () => {
        expect(codes(sfc('.list :global(.row) { color: red; }', ''))).toContain('PDX_GLOBAL_SELECTOR');
    });

    it('control — the same selector without :global() is not reported', () => {
        expect(codes(sfc('.list .row-invalid { color: red; }'))).not.toContain('PDX_GLOBAL_SELECTOR');
    });

    it('control — a :global() inside a comment is not reported', () => {
        expect(codes(sfc('/* not :global(.x) */ .list .row { color: red; }'))).not.toContain('PDX_GLOBAL_SELECTOR');
    });
});
