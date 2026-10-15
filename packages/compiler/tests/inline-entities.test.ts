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
import { jsString } from '../src/compiler/js-literal';
import { templateGenerator } from './template-generator';

/** The render of `template`; with `inSlot`, inside a scoped slot's body, which is built inline too since #364. */
const emitted = (template: string, inSlot = false): string =>
    compile(`<template>${inSlot ? `<pdx-list><slot name="item" let:row>${template}</slot></pdx-list>` : template}</template>\n<script setup>\nlet _x = $signal(0);\n</script>`,
        'e.pdx', [], undefined, { production: true }).code;

describe('text a reader sees', () => {
    it('a numeric entity becomes its character', () => {
        // `&#64;` is how a source block writes `@` without the compiler reading a directive.
        expect(emitted('<pre><code>&#64;for (items as item) {</code></pre>'))
            .toContain('@for (items as item) {');
    });

    it('the named ones too, in the order that matters', () => {
        // `&amp;lt;` must come out as the TEXT `&lt;`, not as `<`: decoding `&amp;` first and then
        // rescanning would turn an escaped entity into a tag, which is the classic double-decode.
        const code = emitted('<p>&lt;div&gt; &amp; &quot;q&quot; &#39;a&#39; &amp;lt;</p>');
        // jsString, because the module carries the text as a JS string literal written by it: its
        // quotes are escaped there, and so are `<` and `>` (#69). Comparing the bare form matched
        // nothing and reported the decoding as broken when it was not.
        expect(code).toContain(jsString('<div> & "q" \'a\' &lt;'));
    });

    it('and a lone ampersand is left alone', () => {
        expect(emitted('<p>Tom & Jerry</p>')).toContain('Tom & Jerry');
    });
});

describe('a static attribute value', () => {
    it('is decoded as well', () => {
        expect(emitted('<p title="a &amp; b">x</p>')).toContain('"a & b"');
    });
});

describe('and the two generators agree', () => {
    // The template generator is the reference: whatever the browser would do with innerHTML is what
    // the inline path has to produce. It is called directly — no .pdx in the new mode reaches it since
    // #364, when a scoped slot's body moved to the inline path, which is measured here as well.
    const CASES = [
        '<pre><code>&#64;for (x as y) {</code></pre>',
        '<p>&lt;div&gt; &amp; &quot;q&quot;</p>',
        '<p title="a &amp; b">x</p>',
    ];

    for (const markup of CASES) {
        it(`${markup.slice(0, 40)}…`, () => {
            // What the template path ships is the markup verbatim — the browser decodes it later.
            // So the comparison is: every entity the template path passes through, the inline path
            // has already resolved, and nothing is left encoded in the inline output.
            expect(emitted(markup), 'an entity survived into the inline output').not.toMatch(/&(?:#\d+|lt|gt|amp|quot|#39);/);
            expect(emitted(markup, true), 'an entity survived into a scoped slot body').not.toMatch(/&(?:#\d+|lt|gt|amp|quot|#39);/);
            expect(templateGenerator(markup), 'the template path stopped carrying the markup — re-read this test')
                .toMatch(/&(?:#\d+|lt|gt|amp|quot|#39);/);
        });
    }
});
