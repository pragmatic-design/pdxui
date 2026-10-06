// The whitespace between two tags is in a production build what it is in dev: one space.
//
// Dev renders the template through the browser's parser, which keeps a whitespace-only text node
// between two elements; the production build can drop it twice over — `minifyHTML` turning `>  <`
// into `><`, and the inline path emitting no node for whitespace-only text. Between two inline
// elements that is text the reader sees: a lockup `<span>PDX</span> <span>UI</span>` would read
// "PDX UI" in dev and "PDXUI" in production, and two inline-block buttons would lose the gap between
// them. One space is kept,
// whatever ran of it the source had: a run collapses to one, which renders the same.

import { describe, it, expect } from 'vitest';
import { minifyHTML } from '../src/compiler/minify';
import { generateInlineNodes } from '../src/compiler/codegen-template-inline';
import { parseTemplate } from '../src/parser/template';

interface FakeNode { tag?: string; data?: string; children: FakeNode[]; appendChild(c: FakeNode): FakeNode }
const node = (extra: Partial<FakeNode> = {}): FakeNode => {
    const n: FakeNode = { children: [], appendChild(c) { n.children.push(c); return c; }, ...extra };
    return n;
};
const document = {
    createDocumentFragment: () => node(),
    createElement: (tag: string) => node({ tag }),
    createTextNode: (data: string) => node({ data }),
};
const textOf = (n: FakeNode): string => (n.data ?? '') + n.children.map(textOf).join('');

/** Render static markup on the INLINE path, the production default, and read its text. */
function renderInline(markup: string): string {
    const iife = generateInlineNodes(parseTemplate(markup), new Set<string>());
    return textOf(new Function('document', `return ${iife};`)(document) as FakeNode);
}

describe('whitespace between two tags, in a build', () => {
    it('minify keeps one space between two inline elements', () => {
        expect(minifyHTML('<span>PDX</span> <span>UI</span>')).toBe('<span>PDX</span> <span>UI</span>');
    });

    it('minify collapses a run of it, newlines included, to that one space', () => {
        expect(minifyHTML('<b>a</b>\n    <i>b</i>')).toBe('<b>a</b> <i>b</i>');
    });

    it('the inline path renders it', () => {
        expect(renderInline('<p><span>PDX</span> <span>UI</span></p>')).toBe('PDX UI');
    });

    it('minify and the inline path together, as a build runs them', () => {
        expect(renderInline(minifyHTML('<p>\n  <b>a</b>\n  <i>b</i>\n</p>')).trim()).toBe('a b');
    });

    it('the control: text between tags was never the problem', () => {
        expect(renderInline('<p><b>a</b>, <i>b</i></p>')).toBe('a, b');
    });
});
