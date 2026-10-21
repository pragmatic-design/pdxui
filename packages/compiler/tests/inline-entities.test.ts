// The inline path must decode HTML entities, as a browser parsing the same markup would.
//
// Markup parsed with innerHTML has `&lt;`, `&amp;` and `&#64;` decoded by the BROWSER. The inline path
// builds the DOM itself — `createTextNode(...)` and `setAttribute(...)` — and if it hands them the raw
// source text, an entity stays on screen as an entity.
//
// A `<pre><code>` block showing PDX source escapes its `@for` as `&#64;for`, precisely so the
// compiler does not read it as a directive; undecoded, the page renders `&#64;for (items as item; …)`
// where every other build renders `@for`.
//
// The same divergence applies to a static attribute value, and for the same reason.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { jsString } from '../src/compiler/js-literal';

/**
 * The render of `template`; with `inSlot`, inside a scoped slot's body, which is built inline too since #364.
 *
 * With DOM calls (#369): what is measured is the decoding into the static markup's text and values,
 * which both forms of the builder share. The HTML form writes them escaped again and the parser
 * decodes them: static-markup-html.test.ts holds the escaping, and responsive's
 * static-markup-parse.spec.ts the parse, in Chromium.
 */
const emitted = (template: string, inSlot = false): string =>
    compile(`<template>${inSlot ? `<pdx-list><slot name="item" let:row>${template}</slot></pdx-list>` : template}</template>\n<script>\nlet _x = $signal(0);\n</script>`,
        'e.pdx', [], undefined, { production: true, staticMarkup: false }).code;

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

describe('no entity is left encoded, in the render or a scoped slot body', () => {
    const CASES = [
        '<pre><code>&#64;for (x as y) {</code></pre>',
        '<p>&lt;div&gt; &amp; &quot;q&quot;</p>',
        '<p title="a &amp; b">x</p>',
    ];

    for (const markup of CASES) {
        it(`${markup.slice(0, 40)}…`, () => {
            // The control: the source carries entities, so nothing below passes on an empty case.
            expect(markup).toMatch(/&(?:#\d+|lt|gt|amp|quot|#39);/);
            expect(emitted(markup), 'an entity survived into the inline output').not.toMatch(/&(?:#\d+|lt|gt|amp|quot|#39);/);
            expect(emitted(markup, true), 'an entity survived into a scoped slot body').not.toMatch(/&(?:#\d+|lt|gt|amp|quot|#39);/);
        });
    }
});
