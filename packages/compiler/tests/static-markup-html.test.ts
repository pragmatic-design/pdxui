// static-markup-html.ts (#369): when a block's static markup is written as an HTML string, and when
// it keeps one DOM call per node because the parser would not give back the same tree.
//
// The excluded cases are shared with the browser test that parses them in Chromium
// (packages/responsive/tests/integration/ui-components/static-markup-parse.spec.ts): this file holds
// the rule; that one shows each case marked 'differs' really parses into another tree, and that every
// block of the corpus written as HTML parses back exactly.

import { describe, it, expect } from 'vitest';
import { blockHtml, htmlLiteral } from '../src/compiler/static-markup-html';
import { EXCLUDED_CASES, el, text, anchor, comment, root } from './fixtures/static-markup-cases';

describe('a block written as HTML', () => {
    it('elements, attributes, text and anchors', () => {
        expect(blockHtml(root(text(' '), el('div', [el('p', [text('Hi '), anchor(), text('!')])], [['class', 'card'], ['hidden', '']]))))
            .toBe(' <div class="card" hidden><p>Hi <!---->!</p></div>');
    });

    it('escapes text and attribute values for HTML', () => {
        expect(blockHtml(root(el('p', [text('a < b & c > d')], [['title', 'say "hi" & <go>']]))))
            .toBe('<p title="say &quot;hi&quot; &amp; &lt;go>">a &lt; b &amp; c &gt; d</p>');
    });

    it('a void element has no closing tag; a self-closed custom element gets one', () => {
        expect(blockHtml(root(el('input', [], [['type', 'text']], { isVoid: true }), el('pdx-icon', [], [['name', 'x']], { isVoid: true }))))
            .toBe('<input type="text"><pdx-icon name="x"></pdx-icon>');
    });

    it('SVG whose names the parser gives back as written: lowercase, or the case it puts back', () => {
        expect(blockHtml(root(el('svg', [
            el('path', [], [['d', 'M0 0']], { svg: true, isVoid: true }),
            el('linearGradient', [], [['gradientUnits', 'x']], { svg: true }),
        ], [['viewBox', '0 0 1 1']], { svg: true }))))
            .toBe('<svg viewBox="0 0 1 1"><path d="M0 0"></path><linearGradient gradientUnits="x"></linearGradient></svg>');
    });

    it('a list inside a list item is kept', () => {
        expect(blockHtml(root(el('ul', [el('li', [el('ul', [el('li', [text('x')])])])])))).not.toBeNull();
    });

    it('a comment with text is kept', () => {
        expect(blockHtml(root(comment(' unknown directive @x ')))).toBe('<!-- unknown directive @x -->');
    });
});

describe('a block that keeps its DOM calls', () => {
    for (const c of EXCLUDED_CASES) {
        it(c.name, () => expect(blockHtml(c.tree)).toBeNull());
    }
});

describe('htmlLiteral', () => {
    it('writes a single-quoted literal with `<` as it is', () => {
        expect(htmlLiteral('<p class="a">it\'s</p>')).toBe(`'<p class="a">it\\'s</p>'`);
    });

    it('defuses </script and escapes what a literal cannot hold', () => {
        expect(htmlLiteral('a</script>b\\c\nd')).toBe(`'a<\\/script>b\\\\c\\nd'`);
    });
});
