// A self-closing tag of a non-void element is expanded to an open + close pair.
//
// The HTML parser does not honour `/>` on a non-void element: `<pdx-autocomplete … />` put into
// html`` verbatim opens <pdx-autocomplete>, the next sibling becomes its child, and the component —
// rendering its own content — drops it. It is the form JSX and Vue write by habit; Vue and Svelte
// expand it, and so does the compiler. Void elements (<input />, <br />) keep their form.

// The first block measures the template generator, which expands the tag in its markup; since #107
// it writes only a scoped slot's body, so each case sits inside one. The second measures the tree
// the inline path — every other part of a .pdx's render — builds from the parsed template.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { generateInlineNodes } from '../src/compiler/codegen-template-inline';
import { parseTemplate } from '../src/parser/template';
import { withBlockCopies, stubStaticBlock } from './stub-block-copies';

/** The render of `template` placed in a scoped slot's body, the template generator's. */
function render(template: string, opts: Parameters<typeof compile>[4] = {}): string {
    const source = `<template>\n<pdx-list><slot name="item" let:row>${template}</slot></pdx-list>\n</template>\n<script setup>\n  let v = $signal('x');\n</script>`;
    const code = compile(source, 'self-closing.pdx', [], undefined, { ...opts }).code;
    return code.slice(code.indexOf('render:'));
}

type Node = { tagName: string; children: Node[] };
/** The tree the inline render builds for `template`, with every runtime call stubbed. */
function inlineTree(template: string): Node {
    class Stub implements Node {
        children: Node[] = [];
        constructor(public tagName: string) {}
        setAttribute(): void { /* the tree shape is what is measured */ }
        addEventListener(): void { /* idem */ }
        appendChild(c: Node): Node { this.children.push(c); return c; }
    }
    const iife = generateInlineNodes(parseTemplate(template), new Set());
    const document = withBlockCopies({
        createDocumentFragment: () => new Stub('#fragment'),
        createElement: (t: string) => new Stub(t),
        createTextNode: (t: string) => ({ tagName: '#text', data: t, children: [] }),
    }, (n) => (n instanceof Stub ? new Stub(n.tagName) : { ...n }));
    const noop = () => {};
    const id = (f: unknown) => f;
    return new Function('document', 'staticBlock', 'effect', 'ctx', 'assignBoundProperty', 'safeHandler', 'batchHandler', `return ${iife};`)(
        document, stubStaticBlock(document), noop, { v: () => 'x' }, noop, id, id) as Node;
}
const tags = (n: Node) => n.children.map((c) => c.tagName).filter((t) => t !== '#text');

describe('self-closing tags in a template', () => {
    for (const [mode, opts] of [['dev', {}], ['prod', { production: true }]] as const) {
        it(`${mode}: <pdx-x a="1" /> is <pdx-x a="1"></pdx-x>, and the next element stays its sibling`, () => {
            const out = render('<div><pdx-x a="1" /><p>after</p></div>', opts);
            expect(out).toContain('<pdx-x a="1"></pdx-x><p>after</p>');
            expect(out).not.toMatch(/<pdx-x[^>]*\/>/);
        });
    }

    it('a bound self-closing component closes after its rewritten attributes', () => {
        const out = render('<pdx-x :a="v" @pdx-change="v = $event.detail" /><span>next</span>');
        expect(out).toMatch(/<pdx-x :a=\$\{ctx\.v\} @pdx-change=\$\{[^}]*\}[^>]*><\/pdx-x><span>next<\/span>/);
    });

    it('a plain element too: <div class="gap" />', () => {
        expect(render('<div class="gap" /><p>x</p>')).toContain('<div class="gap"></div><p>x</p>');
    });

    it('void elements keep their form', () => {
        const out = render('<input type="text" /><br/><img src="a.png" />');
        expect(out).toContain('<input type="text" />');
        expect(out).toContain('<br/>');
        expect(out).toContain('<img src="a.png" />');
        expect(out).not.toContain('</input>');
        expect(out).not.toContain('</br>');
    });

    it('a /> inside a quoted attribute value is not the end of the tag', () => {
        expect(render('<pdx-x title="a/>b" /><p>x</p>')).toContain('<pdx-x title="a/>b"></pdx-x><p>x</p>');
    });
});

describe('self-closing tags — the inline render, every .pdx\'s', () => {
    it('the element after a self-closing component is its sibling, not its child', () => {
        const div = inlineTree('<div><pdx-x a="1" /><p>after</p></div>').children.find((c) => c.tagName === 'div')!;
        expect(tags(div)).toEqual(['pdx-x', 'p']);
    });

    it('a bound self-closing component, then its sibling', () => {
        const frag = inlineTree('<pdx-x :a="v" @pdx-change="v = $event.detail" /><span>next</span>');
        expect(tags(frag)).toEqual(['pdx-x', 'span']);
        expect(frag.children.find((c) => c.tagName === 'pdx-x')!.children).toEqual([]);
    });

    it('a plain element too: <div class="gap" />', () => {
        const frag = inlineTree('<div class="gap" /><p>x</p>');
        expect(tags(frag)).toEqual(['div', 'p']);
        expect(frag.children.find((c) => c.tagName === 'div')!.children).toEqual([]);
    });

    it('void elements stay empty and the next one is their sibling', () => {
        expect(tags(inlineTree('<input type="text" /><br/><img src="a.png" /><p>x</p>'))).toEqual(['input', 'br', 'img', 'p']);
    });

    it('a /> inside a quoted attribute value is not the end of the tag', () => {
        expect(tags(inlineTree('<pdx-x title="a/>b" /><p>x</p>'))).toEqual(['pdx-x', 'p']);
    });
});
