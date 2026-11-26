// Markup outside a .pdx's blocks stops the compile, naming its line (#1249).
//
// A .pdx with a <script> and its markup outside a <template> compiled to a module with no component, and
// said nothing: the page's tag never rendered. The scenario app `hello.pdx` was written that way when it
// was created (#409), and its 3.8 KB were held as "the floor every PDX app pays" for a month. Anything
// but whitespace and comments outside the <script>, <template> and <style> blocks is reported.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { parseSFC } from '../src/parser/sfc';

/** The five lines the hello scenario was written with. */
const HELLO = [
    '<script setup>',
    'let count = $signal(0);',
    '</script>',
    '',
    '<button @click="count++">Clicked {count} times</button>',
].join('\n');

describe('markup outside the blocks of a .pdx', () => {
    it('the hello scenario as it was written: the compile stops, naming line 5', () => {
        expect(() => compile(HELLO, 'hello.pdx')).toThrow(/PDX_MARKUP_OUTSIDE_TEMPLATE.*line 5.*<template>/s);
    });

    it('beside a <template> as well: the markup after it is named', () => {
        const source = '<template><p>a</p></template>\n<script>let a = $signal(1);</script>\n<p>b</p>';
        expect(() => compile(source, 'after.pdx')).toThrow(/PDX_MARKUP_OUTSIDE_TEMPLATE.*line 3/s);
    });

    it('before the first block too', () => {
        expect(parseSFC('<h1>title</h1>\n<template><p>a</p></template>').errors)
            .toEqual([expect.stringMatching(/PDX_MARKUP_OUTSIDE_TEMPLATE.*line 1/s)]);
    });
});

describe('controls — nothing outside the blocks is not reported', () => {
    it('the same component inside a <template> compiles to its component', () => {
        const source = [
            '<template>',
            '  <button @click="count++">Clicked {{ count }} times</button>',
            '</template>',
            '<script>',
            'let count = $signal(0);',
            '</script>',
        ].join('\n');
        const { code } = compile(source, 'hello.pdx');
        expect(code).toContain("'app-hello'");
    });

    it('a script-only .pdx, and a .pdx.ts module', () => {
        expect(() => compile('<script>\nlet count = $signal(0);\n</script>\n', 'counter.pdx')).not.toThrow();
        expect(() => compile('let count = $signal(0);\nexport function inc() { count++; }\n', 'counter.pdx.ts')).not.toThrow();
    });

    it('whitespace and comments between the blocks, and a <style>', () => {
        const source = [
            '<!-- The counter. -->',
            '<template><p>{{ a }}</p></template>',
            '',
            '<!-- Its state -->',
            '<script>let a = $signal(1);</script>',
            '<style scoped>p { color: red; }</style>',
            '<style>body { margin: 0; }</style>',
            '',
        ].join('\n');
        expect(parseSFC(source).errors).toBeUndefined();
    });

    it('an external script and template, self-closing', () => {
        expect(parseSFC('<template src="./t.html" />\n<script src="./s.ts" />\n').errors).toBeUndefined();
    });
});
