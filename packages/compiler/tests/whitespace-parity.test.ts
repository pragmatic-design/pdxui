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
import { compile } from '../src/plugin';
import { createCompileContext } from '../src/compiler/compile-context';
import { withBlockCopies, stubStaticBlock } from './stub-block-copies';

interface FakeNode { tag?: string; data?: string; children: FakeNode[]; appendChild(c: FakeNode): FakeNode }
const node = (extra: Partial<FakeNode> = {}): FakeNode => {
    const n: FakeNode = { children: [], appendChild(c) { n.children.push(c); return c; }, ...extra };
    return n;
};
const document = withBlockCopies({
    createDocumentFragment: () => node(),
    createElement: (tag: string) => node({ tag }),
    createTextNode: (data: string) => node({ data }),
}, (n) => node({ tag: (n as FakeNode).tag, data: (n as FakeNode).data }));
const textOf = (n: FakeNode): string => (n.data ?? '') + n.children.map(textOf).join('');

/**
 * DOM calls, not the HTML form (#369): the stub cannot parse markup. The HTML form keeps the same
 * whitespace text, which responsive's static-markup-parse.spec.ts measures in Chromium.
 */
const domCalls = () => createCompileContext({ staticMarkup: false });

/** Render static markup on the INLINE path, the production default, and read its text. */
function renderInline(markup: string): string {
    const iife = generateInlineNodes(parseTemplate(markup), new Set<string>(), domCalls());
    return textOf(new Function('document', 'staticBlock', `return ${iife};`)(document, stubStaticBlock(document)) as FakeNode);
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

/** The rendered tree as markup, a text node written as its text in quotes: `tr[td["a"],td["b"]]`. */
const shape = (n: FakeNode): string =>
    n.tag ? `${n.tag}[${n.children.map(shape).join(',')}]` : JSON.stringify(n.data ?? '');

function renderTree(markup: string): string {
    const iife = generateInlineNodes(parseTemplate(markup), new Set<string>(), domCalls());
    const frag = new Function('document', 'staticBlock', `return ${iife};`)(document, stubStaticBlock(document)) as FakeNode;
    return frag.children.map(shape).join(',');
}

// CSS ignores whitespace-only text between table-internal boxes (CSS 2.1 §17.2.1, anonymous table
// objects), so a node there renders nothing and costs a node per gap, on every row (#111).
describe('whitespace inside a table is not emitted', () => {
    it('a <tr> with spaced <td>s has no text node between its cells', () => {
        expect(renderTree('<table><tbody> <tr> <td>a</td> <td>b</td> </tr> </tbody></table>'))
            .toBe('table[tbody[tr[td["a"],td["b"]]]]');
    });

    it('thead, tfoot and colgroup are table-internal too', () => {
        expect(renderTree('<table> <colgroup> <col> </colgroup> <thead> <tr> <th>h</th> </tr> </thead> <tfoot> </tfoot> </table>'))
            .toBe('table[colgroup[col[]],thead[tr[th["h"]]],tfoot[]]');
    });

    it('inside a cell the whitespace rule is unchanged: a cell is not table-internal', () => {
        expect(renderTree('<table><tr><td><b>a</b> <i>b</i></td></tr></table>'))
            .toBe('table[tr[td[b["a"]," ",i["b"]]]]');
    });

    it('a @for row inside <tbody>: the block takes the table context of where it is placed', () => {
        const src = '<template><table><tbody>\n  @for (rows as r; track r.id) {\n    <tr> <td>{{ r.id }}</td> </tr>\n  }\n</tbody></table></template>\n<script setup>\nlet rows = $signal([]);\n</script>\n';
        const { code } = compile(src, 'rows.pdx', [], undefined, { production: true });
        // Every whitespace text node of the module is gone: the row's builder writes none either.
        expect(code).not.toContain('__d.createTextNode(" ")');
    });

    it('the control: a <p> with spaced <b>s keeps its spaces', () => {
        expect(renderTree('<p> <b>a</b> <b>b</b> </p>')).toBe('p[" ",b["a"]," ",b["b"]," "]');
    });
});
