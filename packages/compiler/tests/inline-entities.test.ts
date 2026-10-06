// The inline path must decode HTML entities, because the template path does.
//
// The template path emits the markup into `html``` and core parses it with innerHTML, so the
// BROWSER decodes `&lt;`, `&amp;` and `&#64;`. The inline path builds the DOM itself —
// `createTextNode(...)` and `setAttribute(...)` — and if it hands them the raw source text, an
// entity stays on screen as an entity.
//
// A `<pre><code>` block showing PDX source escapes its `@for` as `&#64;for`, precisely so the
// compiler does not read it as a directive; undecoded, the page renders `&#64;for (items as item; …)`
// where every other build renders `@for`.
//
// The same divergence applies to a static attribute value, and for the same reason.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const emitted = (template: string, inlineBindings: boolean): string =>
    compile(`<template>${template}</template>\n<script setup>\nlet _x = $signal(0);\n</script>`,
        'e.pdx', [], undefined, { production: true, inlineBindings }).code;

describe('text a reader sees', () => {
    it('a numeric entity becomes its character', () => {
        // `&#64;` is how a source block writes `@` without the compiler reading a directive.
        expect(emitted('<pre><code>&#64;for (items as item) {</code></pre>', true))
            .toContain('@for (items as item) {');
    });

    it('the named ones too, in the order that matters', () => {
        // `&amp;lt;` must come out as the TEXT `&lt;`, not as `<`: decoding `&amp;` first and then
        // rescanning would turn an escaped entity into a tag, which is the classic double-decode.
        const code = emitted('<p>&lt;div&gt; &amp; &quot;q&quot; &#39;a&#39; &amp;lt;</p>', true);
        // JSON.stringify, because the module carries the text as a JS string literal and its quotes
        // are escaped there. Comparing the bare form matched nothing and reported the decoding as
        // broken when it was not.
        expect(code).toContain(JSON.stringify('<div> & "q" \'a\' &lt;'));
    });

    it('and a lone ampersand is left alone', () => {
        expect(emitted('<p>Tom & Jerry</p>', true)).toContain('Tom & Jerry');
    });
});

describe('a static attribute value', () => {
    it('is decoded as well', () => {
        expect(emitted('<p title="a &amp; b">x</p>', true)).toContain('"a & b"');
    });
});

describe('and the two paths agree', () => {
    // The template path is the reference: whatever the browser would do with innerHTML is what the
    // inline path has to produce. This is the assertion that keeps them from drifting again.
    const CASES = [
        '<pre><code>&#64;for (x as y) {</code></pre>',
        '<p>&lt;div&gt; &amp; &quot;q&quot;</p>',
        '<p title="a &amp; b">x</p>',
    ];

    for (const markup of CASES) {
        it(`${markup.slice(0, 40)}…`, () => {
            const inline = emitted(markup, true);
            const template = emitted(markup, false);
            // What the template path ships is the markup verbatim — the browser decodes it later.
            // So the comparison is: every entity the template path passes through, the inline path
            // has already resolved, and nothing is left encoded in the inline output.
            expect(inline, 'an entity survived into the inline output').not.toMatch(/&(?:#\d+|lt|gt|amp|quot|#39);/);
            expect(template, 'the template path stopped carrying the markup — re-read this test')
                .toMatch(/&(?:#\d+|lt|gt|amp|quot|#39);/);
        });
    }
});
