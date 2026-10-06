// A second <script> or <template> block stops the compile, naming its line.
//
// A parser that takes the first <script> and stops compiles a second `<script setup>` to a module
// without it. With declarations in it, the only trace is an indirect PDX_UNDECLARED_REF; with only
// statements — an `onMount(…)` a migration tool appended — nothing at all, and the code never runs.
// A .pdx has one of each, so the second is a structural error, reported the way an unclosed block is.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { parseSFC } from '../src/parser/sfc';

describe('a second <script> block', () => {
    it('declarations in it: the compile stops, naming both lines', () => {
        const source = [
            '<template><p>{{ a }} {{ b }}</p></template>',
            '<script setup>let a = $signal(1);</script>',
            '<script setup>let b = $signal(2);</script>',
        ].join('\n');
        expect(() => compile(source, 'two-scripts.pdx')).toThrow(/PDX_DUPLICATE_SCRIPT.*line 3.*line 2/s);
    });

    it('only statements in it — the case nothing reported at all', () => {
        const source = [
            '<template><p>x</p></template>',
            '<script setup>',
            'let a = $signal(1);',
            '</script>',
            '<script setup>',
            "onMount(() => console.log('mounted'));",
            '</script>',
        ].join('\n');
        expect(() => compile(source, 'two-scripts.pdx')).toThrow(/PDX_DUPLICATE_SCRIPT/);
    });

    it('a self-closing external script, then an inline one', () => {
        expect(parseSFC('<template><p/></template>\n<script setup src="./a.ts" />\n<script setup>let b = 1;</script>').errors)
            .toEqual([expect.stringMatching(/PDX_DUPLICATE_SCRIPT/)]);
    });
});

describe('a second <template> block', () => {
    it('stops the compile, naming its line', () => {
        const source = '<template><p>a</p></template>\n<template><p>b</p></template>\n<script setup>let a = $signal(1);</script>';
        expect(() => compile(source, 'two-templates.pdx')).toThrow(/PDX_DUPLICATE_TEMPLATE.*line 2/s);
    });
});

describe('controls — one block of each is not reported', () => {
    it('the markup "<script>" inside a string of the script, and "<template>" in an html`` of the script', () => {
        const source = [
            '<template><p>{{ a }}</p></template>',
            '<script setup>',
            "let a = $signal('<script> and <template> as text');",
            'const t = html`<template><b></b></template>`;',
            '</script>',
            '<style scoped>p { color: red; }</style>',
        ].join('\n');
        expect(parseSFC(source).errors).toBeUndefined();
    });

    it('two <style> blocks stay legal', () => {
        const source = '<template><p>x</p></template>\n<script setup>let a = $signal(1);</script>\n<style scoped>p{}</style>\n<style>body{}</style>';
        expect(parseSFC(source).errors).toBeUndefined();
    });
});
