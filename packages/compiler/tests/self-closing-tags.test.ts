// A self-closing tag of a non-void element is expanded to an open + close pair.
//
// The HTML parser does not honour `/>` on a non-void element: `<pdx-autocomplete … />` put into
// html`` verbatim opens <pdx-autocomplete>, the next sibling becomes its child, and the component —
// rendering its own content — drops it. It is the form JSX and Vue write by habit; Vue and Svelte
// expand it, and so does the compiler. Void elements (<input />, <br />) keep their form.

// ⚠️ `inlineBindings: false` throughout, and it is not a workaround: it names the path this
// file measures. A production build takes the INLINE path, and that path applies the
// loop-invariant hoist too — the transform both paths share is asserted on both,
// in `loop-invariant-both-paths.test.ts`. What is the template path's own is the binding
// deduplication and the escaping of the tagged template, which is what the flag pins here.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { generateInlineNodes } from '../src/compiler/codegen-template-inline';
import { parseTemplate } from '../src/parser/template';

function render(template: string, opts: Parameters<typeof compile>[4] = {}): string {
    const source = `<template>\n${template}\n</template>\n<script setup>\n  let v = $signal('x');\n</script>`;
    const code = compile(source, 'self-closing.pdx', [], undefined, opts).code;
    return code.slice(code.indexOf('render:'));
}

describe('self-closing tags in a template', () => {
    for (const [mode, opts] of [['dev', {}], ['prod', { production: true, inlineBindings: false }]] as const) {
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

    it('inline build: the element after a self-closing component is its sibling, not its child', () => {
        type Node = { tagName: string; children: Node[] };
        class Stub implements Node {
            children: Node[] = [];
            constructor(public tagName: string) {}
            setAttribute(): void { /* the tree shape is what is measured */ }
            appendChild(c: Node): Node { this.children.push(c); return c; }
        }
        const iife = generateInlineNodes(parseTemplate('<div><pdx-x a="1" /><p>after</p></div>'), new Set());
        const document = {
            createDocumentFragment: () => new Stub('#fragment'),
            createElement: (t: string) => new Stub(t),
            createTextNode: (t: string) => ({ tagName: '#text', data: t, children: [] }),
        };
        const frag = new Function('document', 'effect', 'ctx', `return ${iife};`)(document, () => {}, {}) as Node;
        const div = frag.children.find((c) => c.tagName === 'div')!;
        expect(div.children.map((c) => c.tagName).filter((t) => t !== '#text')).toEqual(['pdx-x', 'p']);
    });

    it('a /> inside a quoted attribute value is not the end of the tag', () => {
        expect(render('<pdx-x title="a/>b" /><p>x</p>')).toContain('<pdx-x title="a/>b"></pdx-x><p>x</p>');
    });
});
