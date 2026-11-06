// Whitespace at the edges of an element or a block is not content (#907, the rule of Svelte 5).
//
// The space a source puts between `{` and the markup, or between a tag and its first child, used to
// be one text node per edge: four empty-looking nodes on a row like `<li> <b>x</b> </li>`, cloned,
// walked past and laid out on every row. It is dropped; between two nodes it stays, one space.
// `<pre>`, `<textarea>`, `@raw` text and `&nbsp;` keep what was written.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const build = (template: string) => compile(
    `<template>${template}</template>\n<script>\nlet on = $signal(true);\nlet rows = $signal([1]);\n</script>\n`,
    'edge.pdx', [], undefined, { production: true },
).code;

/** The HTML of every static block of a module, in order. */
const markups = (code: string) => [...code.matchAll(/staticMarkup\('((?:\\.|[^'])*)'\)/g)].map((m) => m[1]);

describe('whitespace at the edges', () => {
    it('is dropped inside an element, and the space between two children stays one', () => {
        expect(markups(build('<ul>\n  <li> <b>a</b>   <i>b</i> </li>\n</ul>'))).toEqual(['<ul><li><b>a</b> <i>b</i></li></ul>']);
    });

    it('is dropped from the text at an edge, not from inside it', () => {
        expect(markups(build('<p>\n  hello   world\n</p>'))).toEqual(['<p>hello   world</p>']);
    });

    it('is dropped at the edges of an @if branch and of a @for row', () => {
        const code = build('<div>@if (on) { <b>x</b> }</div><ul>@for (rows as r; track r) {\n  <li>{{ r }}</li>\n}</ul>');
        expect(markups(code)).toContain('<b>x</b>');
        expect(markups(code)).toContain('<li><!----></li>');
    });

    it('<pre> and <textarea> keep theirs', () => {
        const code = build('<pre>\n  a\n</pre><textarea> b </textarea>');
        // Built with DOM calls: the parser would drop the newline that opens a <pre>.
        expect(code).toContain('__el0.appendChild(__d.createTextNode("\\n  a\\n"))');
        expect(code).toContain('__el1.appendChild(__d.createTextNode(" b "))');
    });

    it('@raw text keeps its edges', () => {
        expect(markups(build('<p>@raw { a }</p>'))).toEqual(['<p> a </p>']);
    });

    it('an interpolated space at an edge is a binding, not markup: it stays', () => {
        const code = build("<p>{{ ' ' }}a</p>");
        expect(markups(code)).toEqual(['<p><!---->a</p>']);
        expect(code).toMatch(/bindInterpolation\(__t\d+,\(\)=>' '/);
    });

    it('&nbsp; is not whitespace: it stays at an edge', () => {
        expect(markups(build('<p>&nbsp;a&nbsp;</p>')).join('')).toMatch(/^<p>( |&nbsp;)a( |&nbsp;)<\/p>$/);
    });
});
