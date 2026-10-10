// Copy and paste in pdx-rich-text: what is written to the clipboard, and what a paste becomes.
//
// The paste cleanup for Word and Google Docs ran as regular expressions over the HTML string, and
// the attribute escape replaced `"` before `&`, so a quote came out as `&amp;quot;` (#64, code
// scanning alerts #43, #53–#56). The cleanup now works on the parsed tree; these cases pin what it
// must keep doing.

import { describe, it, expect } from 'vitest';
import { parseClipboardHTML, serializeToClipboardHTML } from '../../src/rich-text/view/clipboard';
import { defaultSchema } from '../../src/rich-text/model/schema';
import { createNode } from '../../src/rich-text/model/node';
import type { DocNode } from '../../src/rich-text/model/types';

const paste = (html: string): DocNode[] => parseClipboardHTML(html, defaultSchema);

/** A node tree as `type(child, …)` / `"text"[marks]`: enough to compare shapes. */
function shape(nodes: readonly DocNode[]): string {
    return nodes.map((n) => {
        if (n.type === 'text') return JSON.stringify(n.text) + (n.marks.length ? `[${n.marks.map((m) => m.type).join(',')}]` : '');
        return `${n.type}(${shape(n.content)})`;
    }).join(', ');
}

describe('copy', () => {
    it('escapes an attribute value once: & first, then the quote', () => {
        const html = serializeToClipboardHTML([createNode('image', { src: 'a.png', alt: 'say "hi" & go' })]);
        expect(html).toContain('alt="say &quot;hi&quot; &amp; go"');
        expect(html, 'the quote was escaped twice').not.toContain('&amp;quot;');
    });
});

describe('paste from Word', () => {
    it('drops the Office namespace tags, the Mso classes and the mso- styles, and keeps the text', () => {
        const nodes = paste('<p class="MsoNormal" style="mso-margin-top-alt:auto;color:red">Hello<o:p></o:p></p>');
        expect(shape(nodes)).toBe('paragraph("Hello")');
    });

    it('turns its paragraph-shaped list items into list items', () => {
        const nodes = paste('<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">One</p>');
        expect(shape(nodes)).toBe('listItem(paragraph("One"))');
    });

    it('drops comments, styles and meta', () => {
        const nodes = paste('<meta charset="utf-8"><style>p { color: red }</style><!--[if gte mso 9]>x<![endif]--><p>a<!-- note -->b</p>');
        // One text node: the comment between them is gone, not a seam.
        expect(shape(nodes)).toBe('paragraph("ab")');
    });
});

describe('paste from Google Docs', () => {
    it('unwraps its font-weight:normal <b>, which is not bold, and drops its guid id', () => {
        const nodes = paste('<b style="font-weight:normal;" id="docs-internal-guid-1234"><p>Text</p></b>');
        expect(shape(nodes)).toBe('paragraph("Text")');
    });

    it('control — a real <b> stays bold', () => {
        expect(shape(paste('<p><b>Bold</b></p>'))).toBe('paragraph("Bold"[bold])');
    });
});

describe('paste of whitespace', () => {
    it('a space inside a paragraph is kept', () => {
        expect(shape(paste('<p><b>a</b> <i>b</i></p>'))).toBe('paragraph("a"[bold], " ", "b"[italic])');
    });
});

describe('paste of code', () => {
    it('keeps the indentation and the line breaks of a <pre>', () => {
        const nodes = paste('<pre><code class="language-ts">if (a) {\n    b();\n}</code></pre>');
        expect(nodes[0].type).toBe('codeBlock');
        expect(nodes[0].content[0].text).toBe('if (a) {\n    b();\n}');
    });
});

describe('paste of markup a regex filter misses', () => {
    it('a script tag with a space before its closing bracket leaves nothing behind', () => {
        expect(shape(paste('<p>a</p><script >alert(1)</script ><p>b</p>'))).toBe('paragraph("a"), paragraph("b")');
    });

    it('a style element with attributes leaves nothing behind', () => {
        expect(shape(paste('<style media="all">p{}</style ><p>x</p>'))).toBe('paragraph("x")');
    });
});
